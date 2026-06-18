import type { RawRow } from "./travelpayouts";
import type { Reference } from "./reference";

export interface Deal {
  origin: string;
  destination: string;
  dest_city: string;
  dest_country: string;
  dest_country_code: string | null;
  region: string;
  depart_date: string; // YYYY-MM-DD
  return_date: string; // YYYY-MM-DD
  trip_days: number;
  price: number;
  currency: string;
  airline: string | null;
  flight_number: string | null;
  transfers: number | null;
  duration: number | null; // total minutes, when provided
  found_at: string | null;
  expires_at: string | null;
}

function dateOnly(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 10) return null;
  return v.slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Map a raw API row to a normalized round-trip Deal, enriched with destination
 * metadata. Returns null for rows that aren't usable round trips.
 */
export function toDeal(
  raw: RawRow,
  currency: string,
  ref: Reference,
  fallbackOrigin: string,
): Deal | null {
  const origin = (raw.origin ?? fallbackOrigin)?.toUpperCase();
  const destination = raw.destination?.toUpperCase();
  if (!origin || !destination) return null;

  const price = typeof raw.price === "number" ? raw.price : raw.value;
  if (typeof price !== "number" || price <= 0) return null;

  const depart_date = dateOnly(raw.depart_date ?? raw.departure_at);
  const return_date = dateOnly(raw.return_date ?? raw.return_at);
  // Round trips only — we need both legs to sum the price.
  if (!depart_date || !return_date) return null;
  if (Date.parse(return_date) < Date.parse(depart_date)) return null;

  const transfers =
    typeof raw.transfers === "number"
      ? raw.transfers
      : typeof raw.number_of_changes === "number"
        ? raw.number_of_changes
        : null;

  let duration: number | null = null;
  if (typeof raw.duration === "number") duration = raw.duration;
  else if (typeof raw.duration_to === "number" || typeof raw.duration_back === "number")
    duration = (raw.duration_to ?? 0) + (raw.duration_back ?? 0) || null;

  const countryCode = ref.countryCode(destination);

  return {
    origin,
    destination,
    dest_city: ref.cityName(destination),
    dest_country: ref.countryName(countryCode ?? ""),
    dest_country_code: countryCode,
    region: ref.region(destination),
    depart_date,
    return_date,
    trip_days: daysBetween(depart_date, return_date),
    price: Math.round(price),
    currency,
    airline: raw.airline ?? null,
    flight_number: raw.flight_number != null ? String(raw.flight_number) : null,
    transfers,
    duration,
    found_at: typeof raw.found_at === "string" ? raw.found_at : null,
    expires_at: typeof raw.expires_at === "string" ? raw.expires_at : null,
  };
}
