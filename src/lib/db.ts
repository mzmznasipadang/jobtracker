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
  if (db.pragma("user_version", { simple: true }) === 0) {
    db.transaction(() => {
      db.exec(SCHEMA);
      db.pragma("user_version = 1");
    })();
  }
  return db;
}

let db: Database.Database | null = null;
const accounts = new Map<number, Database.Database>();

export function getAccountDb(account: Account): Database.Database {
  const path = accountDbPath(account);
  let connection = accounts.get(account.id);
  if (!connection) { connection = openDb(path); accounts.set(account.id, connection); }
  return connection;
}

export function getDb(): Database.Database {
  return (db ??= openDb(process.env.DB_PATH ?? "./data/jobtracker.db"));
}

export function resetDb(): void {
  db?.close();
  db = null;
  for (const connection of accounts.values()) connection.close();
  accounts.clear();
}
