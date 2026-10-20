import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema";
import { accountDbPath, type Account } from "./accounts";

export function openDb(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000"); // web app and worker share the file
  db.transaction(() => {
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version > 3) throw new Error("Unsupported account data version");
    if (version === 0) db.exec(SCHEMA);
    if (version < 2) {
      db.exec(`CREATE TABLE generation_metadata (
        job_id INTEGER NOT NULL, version INTEGER NOT NULL, data_json TEXT NOT NULL,
        PRIMARY KEY(job_id,version), FOREIGN KEY(job_id,version) REFERENCES tailored(job_id,version) ON DELETE CASCADE
      ); PRAGMA user_version = 2;`);
    }
    if (version < 3) db.exec(`
      ALTER TABLE jobs ADD COLUMN details_edited_at TEXT;
      ALTER TABLE jobs ADD COLUMN busy_token TEXT;
      ALTER TABLE jobs ADD COLUMN archived_at TEXT;
      ALTER TABLE jobs ADD COLUMN purge_after TEXT;
      CREATE INDEX jobs_purge_idx ON jobs(purge_after);
      CREATE TABLE tailor_drafts (
        id TEXT PRIMARY KEY, job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      ALTER TABLE tailored ADD COLUMN draft_id TEXT;
      ALTER TABLE tailored ADD COLUMN draft_revision INTEGER;
      CREATE UNIQUE INDEX tailored_draft_revision ON tailored(draft_id,draft_revision) WHERE draft_id IS NOT NULL;
      PRAGMA user_version = 3;
    `);
  }).immediate();
  return db;
}

const accounts = new Map<number, Database.Database>();

export function getAccountDb(account: Account): Database.Database {
  const path = accountDbPath(account);
  let connection = accounts.get(account.id);
  if (!connection) { connection = openDb(path); accounts.set(account.id, connection); }
  return connection;
}

export function resetDb(): void {
  for (const connection of accounts.values()) connection.close();
  accounts.clear();
}
