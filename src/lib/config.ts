import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader (no dependency). Next.js loads .env.local automatically for the
 * web app, but the standalone scanner (run via tsx) does not — so we parse it here.
 * Existing process.env values are never overridden.
 */
function loadEnvFile(file: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export const ROOT = process.cwd();
loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

export const config = {
  token: process.env.TP_TOKEN ?? "",
  marker: process.env.TP_MARKER ?? "",
  currency: (process.env.CURRENCY ?? "ils").toLowerCase(),
  origins: (process.env.ORIGINS ?? "TLV")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),

  // Paths
  dataDir: path.join(ROOT, "data"),
  dbPath: path.join(ROOT, "data", "deals.db"),

  // Scanner behaviour
  /** Number of top destinations to deep-scan (calendar / month-matrix) each pass. */
  deepScanCount: 35,
  /** How many months ahead to look when deep-scanning a destination. */
  monthsAhead: 8,
  /** Pages of /v2/prices/latest to pull (limit 1000 each). */
  latestPages: 3,
  /** Cron schedules. */
  fullScanCron: "0 * * * *", // top of every hour
  deepScanCron: "30 * * * *", // half past every hour (top destinations only)

  // Baggage surcharge estimates (₪, per direction — doubled for round trips).
  // Editable defaults; real baggage prices vary by airline & fare.
  baggage: {
    checkedBagPerLeg: 120,
    trolleyPerLeg: 60,
  },

  // Deal "hotness" thresholds (relative to a destination's historical median).
  hotness: {
    hotRatio: 0.7, // price <= 70% of median => HOT
    goodRatio: 0.85, // price <= 85% of median => GOOD
    minSamples: 3, // need at least this many history points to trust the median
    absoluteGoodCeiling: 450, // any round trip at/under this (₪) is at least GOOD
    absoluteHotCeiling: 250, // any round trip at/under this (₪) is HOT
  },
};

export function assertCredentials() {
  if (!config.token) {
    throw new Error(
      "TP_TOKEN is not set. Copy .env to .env.local and fill in your Travelpayouts API token.",
    );
  }
}
