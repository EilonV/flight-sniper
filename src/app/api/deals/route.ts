import { NextResponse } from "next/server";
import {
  getDealGroups,
  getOrigins,
  getRegions,
  baggageConfig,
  type DealFilters,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const sortParam = searchParams.get("sort");
  const sort: DealFilters["sort"] =
    sortParam === "duration" || sortParam === "depart" || sortParam === "soon-cheap"
      ? sortParam
      : "price";

  const months = (searchParams.get("months") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => n >= 1 && n <= 12);

  const filters: DealFilters = {
    origin: searchParams.get("origin") ?? undefined,
    minDays: num(searchParams.get("minDays")),
    maxDays: num(searchParams.get("maxDays")),
    region: searchParams.get("region") ?? undefined,
    months: months.length ? months : undefined,
    departFrom: searchParams.get("departFrom") ?? undefined,
    departTo: searchParams.get("departTo") ?? undefined,
    directOnly: searchParams.get("direct") === "1",
    checkedBag: searchParams.get("bag") === "1",
    trolley: searchParams.get("trolley") === "1",
    sort,
  };

  try {
    const { groups, totalDeals, lastUpdated } = getDealGroups(filters);
    return NextResponse.json({
      groups,
      totalDeals,
      destinationCount: groups.length,
      lastUpdated,
      origins: getOrigins(),
      regions: getRegions(),
      baggage: baggageConfig,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, groups: [], totalDeals: 0, destinationCount: 0 },
      { status: 500 },
    );
  }
}
