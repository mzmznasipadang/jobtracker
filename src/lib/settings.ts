import { getActiveAccount, type Account } from "./accounts";
import { getAccountDb } from "./db";
import { Settings } from "./types";

type DeepPartial<T> = T extends object ? (T extends unknown[] ? T : { [K in keyof T]?: DeepPartial<T[K]> }) : T;

export function getKv<T = unknown>(account: Account, key: string): T | null {
  const row = getAccountDb(account).prepare("SELECT value_json FROM kv WHERE key = ?").get(key) as { value_json: string } | undefined;
  return row ? (JSON.parse(row.value_json) as T) : null;
}

export function setKv(account: Account, key: string, value: unknown): void {
  getAccountDb(account)
    .prepare("INSERT INTO kv (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json")
    .run(key, JSON.stringify(value));
}

export function getSettings(account: Account): Settings {
  const settings = Settings.parse(getKv(account, "settings") ?? {});
  if (getActiveAccount(account.id)?.role !== "owner") settings.publicPageEnabled = false;
  return settings;
}

// Plain objects merge recursively; arrays and scalars replace; undefined is skipped (keeps the saved value).
function merge(base: unknown, patch: unknown): unknown {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObj(base) || !isObj(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = merge(base[k], v);
  return out;
}

export function saveSettings(account: Account, patch: DeepPartial<Settings>): Settings {
  const current = getActiveAccount(account.id);
  if (!current) throw new Error("An active account is required");
  const next = Settings.parse(merge(getSettings(account), patch));
  if (current.role !== "owner") next.publicPageEnabled = false;
  setKv(account, "settings", next);
  return next;
}
