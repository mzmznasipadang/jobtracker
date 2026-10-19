import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";

describe("openDb", () => {
  it("creates all tables and sets user_version 1", () => {
    const db = openDb(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ["jobs", "tailored", "events", "emails", "kv"]) expect(tables).toContain(t);
    expect(db.pragma("user_version", { simple: true })).toBe(1);
  });

  it("rejects duplicate job urls", () => {
    const db = openDb(":memory:");
    const ins = db.prepare(
      "INSERT INTO jobs (url, source, company, title) VALUES ('u','other','c','t')",
    );
    ins.run();
    expect(() => ins.run()).toThrow(/UNIQUE/);
  });
});
