import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: "0001_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    name: "0002_tokens",
    sql: `
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        access_expires_at INTEGER NOT NULL,
        scope TEXT,
        health_user_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: "0003_health_data",
    sql: `
      CREATE TABLE IF NOT EXISTS daily_metrics (
        date TEXT PRIMARY KEY,
        resting_hr REAL,
        steps INTEGER,
        calories REAL,
        active_minutes REAL,
        floors REAL,
        sleep_minutes INTEGER,
        sleep_efficiency REAL
      );
      CREATE TABLE IF NOT EXISTS hr_hourly (
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        hr_min REAL,
        hr_avg REAL,
        hr_max REAL,
        PRIMARY KEY (date, hour)
      );
      CREATE TABLE IF NOT EXISTS sleep_logs (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        minutes_asleep INTEGER,
        minutes_awake INTEGER,
        minutes_in_sleep_period INTEGER,
        minutes_to_fall_asleep INTEGER,
        efficiency REAL,
        deep_minutes INTEGER,
        rem_minutes INTEGER,
        light_minutes INTEGER,
        awake_minutes INTEGER,
        raw_json TEXT
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        type TEXT,
        raw_json TEXT
      );
    `,
  },
  {
    name: "0004_ai",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ai_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL CHECK (period IN ('daily','weekly')),
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        model TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

export type AppDatabase = Database.Database;

export function openDatabase(dataDir: string): AppDatabase {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const appliedRows = db.prepare("SELECT name FROM migrations").all() as { name: string }[];
  const applied = new Set(appliedRows.map((row) => row.name));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO migrations (name) VALUES (?)").run(migration.name);
    });
    run();
    console.log(`applied migration ${migration.name}`);
  }
}

export function getSetting(db: AppDatabase, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: AppDatabase, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}
