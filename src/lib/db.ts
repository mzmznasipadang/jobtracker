import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema";

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

export function getDb(): Database.Database {
  return (db ??= openDb(process.env.DB_PATH ?? "./data/jobtracker.db"));
}

export function resetDb(): void {
  db?.close();
  db = null;
}
