import { config } from "./config";

function ddmm(date: string): string {
  // date is YYYY-MM-DD
  const [, m, d] = date.split("-");
  return `${d}${m}`;
}

/**
 * Build an Aviasales search deep link for a round trip. Lands on the live search,
 * which redirects to the real airline / OTA checkout. The `marker` makes it an
 * affiliate link. Per Travelpayouts rules, generate this on demand (on click) —
 * never pre-scrape agency URLs.
 *
 * Format: /search/{ORIGIN}{DDMM_out}{DEST}{DDMM_back}{passengers}
 * e.g. TLV -> BCN, 12 Aug -> 19 Aug, 1 pax => /search/TLV1208BCN19081
 */
export function buildAviasalesLink(opts: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  passengers?: number;
}): string {
  const pax = opts.passengers ?? 1;
  const slug = `${opts.origin}${ddmm(opts.departDate)}${opts.destination}${ddmm(
    opts.returnDate,
  )}${pax}`;
  const url = new URL(`https://www.aviasales.com/search/${slug}`);
  if (config.marker) url.searchParams.set("marker", config.marker);
  url.searchParams.set("currency", config.currency);
  return url.toString();
}
