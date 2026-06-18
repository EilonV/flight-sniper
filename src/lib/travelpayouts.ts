import { config } from "./config";

const BASE = "https://api.travelpayouts.com";

/** Generic raw row coming back from the various Data API endpoints. */
export interface RawRow {
  origin?: string;
  destination?: string;
  price?: number;
  value?: number;
  airline?: string;
  flight_number?: number | string;
  departure_at?: string;
  return_at?: string;
  depart_date?: string;
  return_date?: string;
  transfers?: number;
  number_of_changes?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  found_at?: string;
  expires_at?: string;
  [k: string]: unknown;
}

async function getJson<T>(url: URL): Promise<T> {
  url.searchParams.set("token", config.token);
  const res = await fetch(url, {
    headers: { "X-Access-Token": config.token, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Travelpayouts ${res.status} for ${url.pathname}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Cheapest round trip to every popular destination from `origin`, in one call.
 * Response is keyed by destination IATA code. Primary breadth source.
 */
export async function cityDirections(origin: string): Promise<RawRow[]> {
  const url = new URL(`${BASE}/v1/city-directions`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("currency", config.currency);
  const json = await getJson<{ success?: boolean; data?: Record<string, RawRow> }>(url);
  const data = json.data ?? {};
  return Object.entries(data).map(([dest, row]) => ({
    ...row,
    origin: row.origin ?? origin,
    destination: row.destination ?? dest,
  }));
}

/**
 * Cheapest prices from recent (~48h) searches, paginated. Round trips only.
 * More breadth + freshness across many destinations.
 */
export async function latestPrices(origin: string, page = 1): Promise<RawRow[]> {
  const url = new URL(`${BASE}/v2/prices/latest`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("one_way", "false");
  url.searchParams.set("period_type", "year");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "1000");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("show_to_affiliates", "true");
  const json = await getJson<{ success?: boolean; data?: RawRow[] }>(url);
  return (json.data ?? []).map((row) => ({ ...row, origin: row.origin ?? origin }));
}

/**
 * Cheapest price per departure day for a specific route. Response keyed by date.
 * Used to add depth (many date combos) for top destinations.
 */
export async function calendarPrices(origin: string, destination: string): Promise<RawRow[]> {
  const url = new URL(`${BASE}/v1/prices/calendar`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("calendar_type", "departure_date");
  const json = await getJson<{ success?: boolean; data?: Record<string, RawRow> }>(url);
  return Object.values(json.data ?? {}).map((row) => ({
    ...row,
    origin: row.origin ?? origin,
    destination: row.destination ?? destination,
  }));
}

/**
 * Cheapest prices grouped by day for a specific route in a given month.
 * `month` must be the first day of the month (YYYY-MM-01).
 */
export async function monthMatrix(
  origin: string,
  destination: string,
  month: string,
): Promise<RawRow[]> {
  const url = new URL(`${BASE}/v2/prices/month-matrix`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("month", month);
  url.searchParams.set("currency", config.currency);
  url.searchParams.set("show_to_affiliates", "true");
  const json = await getJson<{ success?: boolean; data?: RawRow[] }>(url);
  return (json.data ?? []).map((row) => ({
    ...row,
    origin: row.origin ?? origin,
    destination: row.destination ?? destination,
  }));
}

// ---- Reference data (no token required) ----

export interface CityRef {
  code: string;
  name: string;
  country_code: string;
}
export interface CountryRef {
  code: string;
  name: string;
}

export async function fetchCities(): Promise<CityRef[]> {
  const res = await fetch(`${BASE}/data/en/cities.json`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`cities.json ${res.status}`);
  return (await res.json()) as CityRef[];
}

export async function fetchCountries(): Promise<CountryRef[]> {
  const res = await fetch(`${BASE}/data/en/countries.json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`countries.json ${res.status}`);
  return (await res.json()) as CountryRef[];
}
