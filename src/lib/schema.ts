// Kept as a TS string (not a .sql file) so it loads the same under Next and tsx.
export const SCHEMA = `
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  status_locked INTEGER NOT NULL DEFAULT 0,
  busy TEXT,
  busy_error TEXT,
  company TEXT NOT NULL,
  company_domain TEXT,
  title TEXT NOT NULL,
  location TEXT,
  work_mode TEXT,
  employment_type TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT,
  salary_period TEXT,
  requirements TEXT NOT NULL DEFAULT '[]',
  nice_to_have TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  apply_method TEXT NOT NULL DEFAULT 'site',
  apply_email TEXT,
  apply_url TEXT,
  recruiter_email TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  raw_text TEXT,
  extract_error TEXT,
  match_score REAL,
  match_json TEXT,
  salary_fit TEXT,
  scam_risk TEXT,
  scam_json TEXT,
  follow_up_due INTEGER NOT NULL DEFAULT 0,
  applied_at TEXT,
  first_response_at TEXT,
  reached_interview INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE tailored (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  cv_json TEXT NOT NULL,
  cover_letter TEXT,
  answers_json TEXT,
  pdf BLOB,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (job_id, version)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kind TEXT NOT NULL CHECK (kind IN ('status','email','note','check','tailor')),
  data_json TEXT
);
CREATE INDEX events_job_idx ON events(job_id);

CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  from_addr TEXT,
  original_from TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TEXT,
  classification TEXT CHECK (classification IN ('rejection','interview','offer','auto_ack','other')),
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL
);
CREATE INDEX emails_job_idx ON emails(job_id);

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
`;
