import { config, assertCredentials } from "../src/lib/config";
import {
  cityDirections,
  latestPrices,
  monthMatrix,
  type RawRow,
} from "../src/lib/travelpayouts";
import { getReference } from "../src/lib/reference";
import { toDeal, type Deal } from "../src/lib/normalize";
import { getDb, upsertDeals, pruneStale, setMeta } from "../src/lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nextMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`  ! ${label}: ${(e as Error).message}`);
    return fallback;
  }
}

async function normalizeRows(rows: RawRow[], origin: string): Promise<Deal[]> {
  const ref = await getReference();
  const deals: Deal[] = [];
  for (const r of rows) {
    const deal = toDeal(r, config.currency, ref, origin);
    if (deal) deals.push(deal);
  }
  return deals;
}

/** Breadth pass: city-directions + paginated latest for an origin. */
async function breadth(origin: string): Promise<Deal[]> {
  const raw: RawRow[] = [];
  raw.push(...(await safe(`city-directions ${origin}`, () => cityDirections(origin), [])));
  for (let page = 1; page <= config.latestPages; page++) {
    const rows = await safe(`latest ${origin} p${page}`, () => latestPrices(origin, page), []);
    raw.push(...rows);
    if (rows.length === 0) break;
    await sleep(150);
  }
  return normalizeRows(raw, origin);
}

/** Pick the cheapest-per-destination, return the N cheapest destination codes. */
function topDestinations(deals: Deal[], n: number): string[] {
  const cheapest = new Map<string, number>();
  for (const d of deals) {
    const cur = cheapest.get(d.destination);
    if (cur === undefined || d.price < cur) cheapest.set(d.destination, d.price);
  }
  return [...cheapest.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([dest]) => dest);
}

function topDestinationsFromDb(origin: string, n: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT destination, MIN(price) AS p FROM deals WHERE origin = ?
       GROUP BY destination ORDER BY p ASC LIMIT ?`,
    )
    .all(origin, n) as unknown as { destination: string }[];
  return rows.map((r) => r.destination);
}

/** Depth pass: month-matrix across the next months for the given destinations. */
async function depth(origin: string, destinations: string[]): Promise<Deal[]> {
  const months = nextMonths(config.monthsAhead);
  const raw: RawRow[] = [];
  for (const dest of destinations) {
    for (const month of months) {
      const rows = await safe(
        `month-matrix ${origin}-${dest} ${month.slice(0, 7)}`,
        () => monthMatrix(origin, dest, month),
        [],
      );
      raw.push(...rows);
      await sleep(120);
    }
  }
  return normalizeRows(raw, origin);
}

export async function runFullScan(): Promise<void> {
  assertCredentials();
  const start = Date.now();
  console.log(`[scan] full scan starting — origins: ${config.origins.join(", ")}`);
  let total = 0;

  for (const origin of config.origins) {
    const breadthDeals = await breadth(origin);
    console.log(`[scan] ${origin}: ${breadthDeals.length} breadth deals`);
    total += upsertDeals(breadthDeals);

    const tops = topDestinations(breadthDeals, config.deepScanCount);
    const depthDeals = await depth(origin, tops);
    console.log(`[scan] ${origin}: ${depthDeals.length} depth deals across ${tops.length} dests`);
    total += upsertDeals(depthDeals);
  }

  const pruned = pruneStale();
  setMeta("last_full_scan", new Date().toISOString());
  console.log(
    `[scan] done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${total} rows written, ${pruned} stale pruned`,
  );
}

export async function runDeepScan(): Promise<void> {
  assertCredentials();
  console.log(`[scan] deep scan (top destinations) starting`);
  let total = 0;
  for (const origin of config.origins) {
    const tops = topDestinationsFromDb(origin, config.deepScanCount);
    if (tops.length === 0) {
      console.log(`[scan] ${origin}: no destinations in DB yet — run a full scan first`);
      continue;
    }
    const depthDeals = await depth(origin, tops);
    total += upsertDeals(depthDeals);
  }
  pruneStale();
  setMeta("last_deep_scan", new Date().toISOString());
  console.log(`[scan] deep scan done — ${total} rows written`);
}

// Run a full scan when invoked directly: `npm run scan:once`
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/scan.ts") || entry.endsWith("scanner/scan.ts")) {
  runFullScan()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
