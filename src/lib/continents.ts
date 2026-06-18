/**
 * ISO country code -> region, for grouping the board. Compact source-of-truth grouped
 * by region; inverted into a lookup at module load. Unknown codes fall back to "Other".
 */
const REGION_COUNTRIES: Record<string, string[]> = {
  "Middle East": [
    "IL", "AE", "QA", "SA", "JO", "BH", "KW", "OM", "LB", "TR", "CY", "IQ", "IR", "YE",
  ],
  Europe: [
    "GB", "IE", "FR", "ES", "PT", "IT", "DE", "NL", "BE", "LU", "CH", "AT", "DK", "SE",
    "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA",
    "ME", "MK", "AL", "XK", "EE", "LV", "LT", "UA", "BY", "MD", "MT", "MC", "AD", "SM",
    "VA", "LI", "GE", "AM", "AZ", "RU",
  ],
  Asia: [
    "TH", "VN", "KH", "LA", "MM", "MY", "SG", "ID", "PH", "IN", "LK", "NP", "BD", "PK",
    "MV", "CN", "HK", "MO", "TW", "JP", "KR", "MN", "KZ", "UZ", "KG", "TJ", "TM", "BT",
    "BN",
  ],
  Africa: [
    "EG", "MA", "TN", "DZ", "LY", "ZA", "KE", "TZ", "ET", "NG", "GH", "SN", "CI", "CM",
    "UG", "RW", "MU", "SC", "MG", "ZW", "ZM", "BW", "NA", "MZ", "AO", "SD", "GM", "CV",
  ],
  "North America": [
    "US", "CA", "MX", "CU", "DO", "JM", "BS", "PR", "CR", "PA", "GT", "HN", "SV", "NI",
    "BZ", "TT", "BB", "AW", "KY", "HT",
  ],
  "South America": [
    "BR", "AR", "CL", "PE", "CO", "EC", "BO", "PY", "UY", "VE", "GY", "SR",
  ],
  Oceania: ["AU", "NZ", "FJ", "PF", "PG", "NC", "WS", "TO", "VU", "GU"],
};

const COUNTRY_TO_REGION: Record<string, string> = {};
for (const [region, codes] of Object.entries(REGION_COUNTRIES)) {
  for (const code of codes) COUNTRY_TO_REGION[code] = region;
}

export function regionForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "Other";
  return COUNTRY_TO_REGION[countryCode.toUpperCase()] ?? "Other";
}

export const REGION_ORDER = [
  "Middle East",
  "Europe",
  "Africa",
  "Asia",
  "North America",
  "South America",
  "Oceania",
  "Other",
];
