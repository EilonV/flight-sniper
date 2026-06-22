import { getDb } from "./db";
import { config } from "./config";
import { buildAviasalesLink } from "./booking";
import { withBaggage, dealTier, discountPct, type DealTier } from "./pricing";

export interface DealRow {
  id: number;
  origin: string;
  destination: string;
  dest_city: string;
  dest_country: string;
  dest_country_code: string | null;
  region: string;
  depart_date: string;
  return_date: string;
  trip_days: number;
  price: number;
  currency: string;
  airline: string | null;
  flight_number: string | null;
  transfers: number | null;
  duration: number | null;
  found_at: string | null;
  expires_at: string | null;
  updated_at: string;
}

export interface DealView extends DealRow {
  displayPrice: number; // price incl. selected baggage estimate
  bookingUrl: string;
}

export interface DealGroup {
  destination: string;
  dest_city: string;
  dest_country: string;
  dest_country_code: string | null;
  region: string;
  tier: DealTier;
  discountPct: number | null;
  medianPrice: number | null;
  cheapest: DealView;
  deals: DealView[];
  count: number;
}

export interface DealFilters {
  origin?: string;
  minDays?: number;
  maxDays?: number;
  region?: string;
  months?: number[]; // departure month-of-year, 1-12
  departFrom?: string; // YYYY-MM-DD
  departTo?: string;
  directOnly?: boolean;
  checkedBag?: boolean;
  trolley?: boolean;
  sort?: "price" | "duration" | "depart" | "soon-cheap";
  altsPerDest?: number;
}

/** Per-destination median + sample count from recent price history (for hotness). */
function getStats(): Map<string, { median: number | null; samples: number }> {
  const rows = getDb()
    .prepare(
      `SELECT destination, price FROM price_history
       WHERE observed_at > datetime('now', '-30 day')`,
    )
    .all() as unknown as { destination: string; price: number }[];

  const byDest = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byDest.get(r.destination) ?? [];
    arr.push(r.price);
    byDest.set(r.destination, arr);
  }
  const out = new Map<string, { median: number | null; samples: number }>();
  for (const [dest, prices] of byDest) {
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    out.set(dest, { median, samples: prices.length });
  }
  return out;
}

function toView(row: DealRow, f: DealFilters): DealView {
  const displayPrice = withBaggage(row.price, {
    checkedBag: f.checkedBag,
    trolley: f.trolley,
  });
  return {
    ...row,
    displayPrice,
    bookingUrl: buildAviasalesLink({
      origin: row.origin,
      destination: row.destination,
      departDate: row.depart_date,
      returnDate: row.return_date,
    }),
  };
}

/** Fetch deals matching filters, grouped by destination and scored. */
export function getDealGroups(f: DealFilters): {
  groups: DealGroup[];
  totalDeals: number;
  lastUpdated: string | null;
} {
  const where: string[] = [];
  const params: (string | number)[] = [];

  // Floor at tomorrow ("from the next day onward").
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  where.push("depart_date >= ?");
  params.push(tomorrow.toISOString().slice(0, 10));

  if (f.origin) {
    where.push("origin = ?");
    params.push(f.origin.toUpperCase());
  }
  if (typeof f.minDays === "number") {
    where.push("trip_days >= ?");
    params.push(f.minDays);
  }
  if (typeof f.maxDays === "number") {
    where.push("trip_days <= ?");
    params.push(f.maxDays);
  }
  if (f.region) {
    where.push("region = ?");
    params.push(f.region);
  }
  if (f.months && f.months.length) {
    const ph = f.months.map(() => "?").join(",");
    where.push(`CAST(strftime('%m', depart_date) AS INTEGER) IN (${ph})`);
    params.push(...f.months);
  }
  if (f.departFrom) {
    where.push("depart_date >= ?");
    params.push(f.departFrom);
  }
  if (f.departTo) {
    where.push("depart_date <= ?");
    params.push(f.departTo);
  }
  if (f.directOnly) {
    where.push("transfers = 0");
  }

  const rows = getDb()
    .prepare(`SELECT * FROM deals WHERE ${where.join(" AND ")} ORDER BY price ASC`)
    .all(...params) as unknown as DealRow[];

  const stats = getStats();
  const altsPerDest = f.altsPerDest ?? Infinity;

  // Group by destination.
  const groupsMap = new Map<string, DealRow[]>();
  for (const r of rows) {
    const arr = groupsMap.get(r.destination) ?? [];
    arr.push(r);
    groupsMap.set(r.destination, arr);
  }

  const groups: DealGroup[] = [];
  for (const [dest, destRows] of groupsMap) {
    const stat = stats.get(dest) ?? { median: null, samples: 0 };
    const views = destRows.map((r) => toView(r, f));

    // Sort within the destination by the chosen criterion.
    sortViews(views, f.sort);
    const cheapest = [...views].sort((a, b) => a.displayPrice - b.displayPrice)[0];

    groups.push({
      destination: dest,
      dest_city: destRows[0].dest_city,
      dest_country: destRows[0].dest_country,
      dest_country_code: destRows[0].dest_country_code,
      region: destRows[0].region,
      tier: dealTier(cheapest.price, stat),
      discountPct: discountPct(cheapest.price, stat),
      medianPrice: stat.median,
      cheapest,
      deals: views.slice(0, altsPerDest),
      count: views.length,
    });
  }

  sortGroups(groups, f.sort);

  const lastUpdated =
    (getDb().prepare("SELECT MAX(updated_at) AS m FROM deals").get() as unknown as {
      m: string | null;
    })?.m ?? null;

  return { groups, totalDeals: rows.length, lastUpdated };
}

function sortViews(views: DealView[], sort: DealFilters["sort"]): void {
  if (sort === "depart") {
    views.sort((a, b) => a.depart_date.localeCompare(b.depart_date) || a.displayPrice - b.displayPrice);
  } else if (sort === "duration") {
    views.sort((a, b) => durationKey(a) - durationKey(b) || a.displayPrice - b.displayPrice);
  } else if (sort === "soon-cheap") {
    views.sort((a, b) => soonKey(a) - soonKey(b) || a.displayPrice - b.displayPrice);
  } else {
    views.sort((a, b) => a.displayPrice - b.displayPrice);
  }
}

function sortGroups(groups: DealGroup[], sort: DealFilters["sort"]): void {
  if (sort === "depart") {
    groups.sort(
      (a, b) =>
        a.cheapest.depart_date.localeCompare(b.cheapest.depart_date) ||
        a.cheapest.displayPrice - b.cheapest.displayPrice,
    );
  } else if (sort === "duration") {
    groups.sort(
      (a, b) => durationKey(a.cheapest) - durationKey(b.cheapest) || a.cheapest.displayPrice - b.cheapest.displayPrice,
    );
  } else if (sort === "soon-cheap") {
    groups.sort(
      (a, b) => soonKey(a.cheapest) - soonKey(b.cheapest) || a.cheapest.displayPrice - b.cheapest.displayPrice,
    );
  } else {
    groups.sort((a, b) => a.cheapest.displayPrice - b.cheapest.displayPrice);
  }
}

/** Whole weeks from now until departure. 0 = within a week, 1 = next week, … */
function soonKey(v: DealView): number {
  const days = Math.max(0, Math.floor((Date.parse(v.depart_date) - Date.now()) / 86_400_000));
  return Math.floor(days / 7);
}

/**
 * Sort key approximating trip length/effort. Uses real duration (minutes) when the
 * API provided it; otherwise falls back to number of stops (each stop ~ a big penalty).
 */
function durationKey(v: DealView): number {
  if (typeof v.duration === "number" && v.duration > 0) return v.duration;
  const stops = typeof v.transfers === "number" ? v.transfers : 3;
  return 100000 + stops * 1000; // unknown durations sort after known ones
}

export function getOrigins(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT origin FROM deals ORDER BY origin")
    .all() as unknown as { origin: string }[];
  return rows.map((r) => r.origin);
}

export function getRegions(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT region FROM deals WHERE region IS NOT NULL ORDER BY region")
    .all() as unknown as { region: string }[];
  return rows.map((r) => r.region);
}

export const baggageConfig = config.baggage;
