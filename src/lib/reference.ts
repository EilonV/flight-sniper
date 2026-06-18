import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { regionForCountry } from "./continents";
import { fetchCities, fetchCountries, type CityRef, type CountryRef } from "./travelpayouts";

const CITIES_CACHE = path.join(config.dataDir, "cities.json");
const COUNTRIES_CACHE = path.join(config.dataDir, "countries.json");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // refresh weekly

function isFresh(file: string): boolean {
  try {
    return Date.now() - fs.statSync(file).mtimeMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function loadCached<T>(file: string, fetcher: () => Promise<T[]>): Promise<T[]> {
  if (isFresh(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T[];
    } catch {
      /* fall through to refetch */
    }
  }
  const data = await fetcher();
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

export interface Reference {
  cityName(code: string): string;
  countryCode(cityCode: string): string | null;
  countryName(code: string): string;
  region(cityCode: string): string;
}

let cached: Reference | null = null;

/** Build (and cache for the process) the reference lookups. */
export async function getReference(): Promise<Reference> {
  if (cached) return cached;

  const [cities, countries] = await Promise.all([
    loadCached<CityRef>(CITIES_CACHE, fetchCities),
    loadCached<CountryRef>(COUNTRIES_CACHE, fetchCountries),
  ]);

  const cityByCode = new Map<string, CityRef>();
  for (const c of cities) if (c.code) cityByCode.set(c.code.toUpperCase(), c);

  const countryNameByCode = new Map<string, string>();
  for (const c of countries) if (c.code) countryNameByCode.set(c.code.toUpperCase(), c.name);

  cached = {
    cityName(code) {
      return cityByCode.get(code?.toUpperCase())?.name ?? code;
    },
    countryCode(cityCode) {
      return cityByCode.get(cityCode?.toUpperCase())?.country_code?.toUpperCase() ?? null;
    },
    countryName(code) {
      if (!code) return "Unknown";
      return countryNameByCode.get(code.toUpperCase()) ?? code;
    },
    region(cityCode) {
      const cc = cityByCode.get(cityCode?.toUpperCase())?.country_code;
      return regionForCountry(cc);
    },
  };
  return cached;
}
