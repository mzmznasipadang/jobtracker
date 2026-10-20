import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
export type Account = {
    id: number;
    email: string;
    role: "owner" | "member";
};
type Row = Account & {
    active: number;
    google_sub: string | null;
};
let registry: Database.Database | null = null;
export const normalizeEmail = (email: string) => z.email().max(254).parse(email.trim().toLowerCase());
const ownerEmail = () => normalizeEmail(process.env.OWNER_GOOGLE_EMAIL || "");
const ownerPath = () => process.env.DB_PATH || "./data/jobtracker.db";
export function getRegistry(): Database.Database {
    if (registry)
        return registry;
    const email = ownerEmail();
    const path = ownerPath() === ":memory:" ? ":memory:" : join(dirname(resolve(ownerPath())), "accounts.db");
    if (path !== ":memory:") {
        if (resolve(ownerPath()) === path)
            throw new Error("DB_PATH must not be accounts.db");
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    const db = new Database(path);
    try {
        db.pragma("busy_timeout = 5000");
        db.pragma("foreign_keys = ON");
        if (path !== ":memory:") {
            chmodSync(path, 0o600);
            db.pragma("journal_mode = WAL");
        }
        db.transaction(() => {
            const version = db.pragma("user_version", { simple: true }) as number;
            if (version > 3)
                throw new Error("Unsupported account registry version");
            if (version === 0) {
                db.exec(`
          CREATE TABLE accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            google_sub TEXT UNIQUE,
            role TEXT NOT NULL CHECK (role IN ('owner','member')),
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          );
          CREATE UNIQUE INDEX one_owner ON accounts(role) WHERE role='owner';
          CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            expires_at INTEGER NOT NULL
          );
          CREATE INDEX sessions_account ON sessions(account_id);
          CREATE TABLE oauth_states (
            state_hash TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL
          );
          PRAGMA user_version = 1;
        `);
            }
            if (version < 2) {
                db.exec(`
          CREATE TABLE cv_skills (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL COLLATE NOCASE UNIQUE, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
          CREATE TABLE ai_config (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL CHECK(provider IN ('anthropic','openai')), model TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
            primary_skill_id INTEGER NOT NULL REFERENCES cv_skills(id) ON DELETE RESTRICT,
            additional_skill_id INTEGER REFERENCES cv_skills(id) ON DELETE RESTRICT,
            CHECK(primary_skill_id != additional_skill_id));
          PRAGMA user_version = 2;
        `);
            }
            if (version < 3)
                db.exec(`
        CREATE TABLE ai_usage_policies(scope TEXT PRIMARY KEY,allowance INTEGER,paused INTEGER NOT NULL DEFAULT 0,inherit_default INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL);
        CREATE TABLE ai_model_pricing(provider TEXT NOT NULL,model TEXT NOT NULL,rates_json TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(provider,model));
        CREATE TABLE ai_usage(id TEXT PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES accounts(id),month TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,operation TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,usage_json TEXT,rates_json TEXT,cost_usd REAL);
        CREATE INDEX ai_usage_account_month ON ai_usage(account_id,month,state);
        PRAGMA user_version=3;
      `);
            const owner = db.prepare("SELECT email FROM accounts WHERE role='owner'").get() as {
                email: string;
            } | undefined;
            if (owner && owner.email !== email)
                throw new Error("OWNER_GOOGLE_EMAIL differs from the existing owner");
            if (!owner)
                db.prepare("INSERT INTO accounts (email,role) VALUES (?, 'owner')").run(email);
        }).immediate();
        registry = db;
        return db;
    }
    catch (e) {
        db.close();
        throw e;
    }
}
const identity = (row: Row): Account => ({ id: row.id, email: row.email, role: row.role });
export function getOwnerAccount(): Account {
    return identity(getRegistry().prepare("SELECT * FROM accounts WHERE role='owner' AND active=1").get() as Row);
}
export function getActiveAccount(id: number): Account | null {
    if (!Number.isSafeInteger(id) || id < 1)
        return null;
    const row = getRegistry().prepare("SELECT * FROM accounts WHERE id=? AND active=1").get(id) as Row | undefined;
    return row ? identity(row) : null;
}
export function listActiveAccounts(): Account[] {
    return (getRegistry().prepare("SELECT * FROM accounts WHERE active=1 AND (role='owner' OR google_sub IS NOT NULL) ORDER BY id").all() as Row[]).map(identity);
}
export function listAccounts(): (Account & {
    active: boolean;
    claimed: boolean;
})[] {
    return (getRegistry().prepare("SELECT * FROM accounts ORDER BY id").all() as Row[])
        .map(row => ({ ...identity(row), active: !!row.active, claimed: row.google_sub !== null }));
}
export function approveEmail(email: string): void {
    getRegistry().prepare("INSERT INTO accounts (email,role) VALUES (?, 'member') ON CONFLICT(email) DO UPDATE SET active=1").run(normalizeEmail(email));
}
export function revokeAccount(id: number): void {
    if (!Number.isSafeInteger(id) || id < 1)
        throw new Error("Invalid account");
    const db = getRegistry();
    db.transaction(() => {
        const row = db.prepare("SELECT role FROM accounts WHERE id=?").get(id) as {
            role: string;
        } | undefined;
        if (!row || row.role === "owner")
            throw new Error("Cannot revoke this account");
        db.prepare("UPDATE accounts SET active=0 WHERE id=?").run(id);
        db.prepare("DELETE FROM sessions WHERE account_id=?").run(id);
    })();
}
export function claimGoogleAccount(input: {
    sub: string;
    email: string;
    emailVerified: boolean;
}): Account {
    if (!input.emailVerified || !input.sub || input.sub.length > 255)
        throw new Error("Account is not approved");
    const email = normalizeEmail(input.email);
    const db = getRegistry();
    return db.transaction(() => {
        const row = db.prepare("SELECT * FROM accounts WHERE email=? AND active=1").get(email) as Row | undefined;
        const subject = db.prepare("SELECT id FROM accounts WHERE google_sub=?").get(input.sub) as {
            id: number;
        } | undefined;
        if (!row || (row.google_sub !== null && row.google_sub !== input.sub) || (subject && subject.id !== row.id))
            throw new Error("Account is not approved");
        if (row.google_sub === null)
            db.prepare("UPDATE accounts SET google_sub=? WHERE id=?").run(input.sub, row.id);
        return identity(row);
    })();
}
export function accountDbPath(account: Account): string {
    const current = account && getActiveAccount(account.id);
    if (!current)
        throw new Error("An active account is required");
    if (ownerPath() === ":memory:")
        return ":memory:";
    return current.role === "owner" ? resolve(ownerPath()) : join(dirname(resolve(ownerPath())), "users", `${current.id}.db`);
}
export function resetAccounts(): void { registry?.close(); registry = null; }
export function listMaintenanceAccounts(): Account[] { return (getRegistry().prepare("SELECT * FROM accounts").all() as Row[]).map(identity); }
