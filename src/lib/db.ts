import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import type { Deal } from "./normalize";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      dest_city TEXT,
      dest_country TEXT,
      dest_country_code TEXT,
      region TEXT,
      depart_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      trip_days INTEGER NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      airline TEXT,
      flight_number TEXT,
      transfers INTEGER,
      duration INTEGER,
      found_at TEXT,
      expires_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (origin, destination, depart_date, return_date)
    );
    CREATE INDEX IF NOT EXISTS idx_deals_dest ON deals (destination);
    CREATE INDEX IF NOT EXISTS idx_deals_price ON deals (price);
    CREATE INDEX IF NOT EXISTS idx_deals_depart ON deals (depart_date);

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      price REAL NOT NULL,
      observed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hist_dest ON price_history (destination);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  return db;
}

/**
 * Upsert deals, keeping the lowest price for each (origin,dest,depart,return).
 * Also records every observed price into price_history for the "hotness" baseline.
 * Returns the number of rows written.
 */
export function upsertDeals(deals: Deal[]): number {
  if (deals.length === 0) return 0;
  const d = getDb();
  const now = new Date().toISOString();

  const upsert = d.prepare(`
    INSERT INTO deals (
      origin, destination, dest_city, dest_country, dest_country_code, region,
      depart_date, return_date, trip_days, price, currency, airline,
      flight_number, transfers, duration, found_at, expires_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT (origin, destination, depart_date, return_date) DO UPDATE SET
      price = MIN(deals.price, excluded.price),
      dest_city = excluded.dest_city,
      dest_country = excluded.dest_country,
      dest_country_code = excluded.dest_country_code,
      region = excluded.region,
      trip_days = excluded.trip_days,
      airline = COALESCE(excluded.airline, deals.airline),
      flight_number = COALESCE(excluded.flight_number, deals.flight_number),
      transfers = COALESCE(excluded.transfers, deals.transfers),
      duration = COALESCE(excluded.duration, deals.duration),
      found_at = COALESCE(excluded.found_at, deals.found_at),
      expires_at = COALESCE(excluded.expires_at, deals.expires_at),
      updated_at = excluded.updated_at
  `);
  const hist = d.prepare(
    `INSERT INTO price_history (origin, destination, price, observed_at) VALUES (?, ?, ?, ?)`,
  );

  const tx = d.prepare("BEGIN");
  const commit = d.prepare("COMMIT");
  const rollback = d.prepare("ROLLBACK");
  tx.run();
  try {
    for (const x of deals) {
      upsert.run(
        x.origin, x.destination, x.dest_city, x.dest_country, x.dest_country_code, x.region,
        x.depart_date, x.return_date, x.trip_days, x.price, x.currency, x.airline,
        x.flight_number, x.transfers, x.duration, x.found_at, x.expires_at, now,
      );
      hist.run(x.origin, x.destination, x.price, now);
    }
    commit.run();
  } catch (e) {
    rollback.run();
    throw e;
  }
  return deals.length;
}

/** Remove deals whose departure date is in the past. */
export function pruneStale(): number {
  const d = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const res = d.prepare("DELETE FROM deals WHERE depart_date < ?").run(today);
  return Number(res.changes ?? 0);
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as unknown as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
