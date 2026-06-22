"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ---- Types (mirror of the API response; kept local so no server-only code leaks in) ----
type Tier = "hot" | "good" | "normal";

interface DealView {
  destination: string;
  origin: string;
  depart_date: string;
  return_date: string;
  trip_days: number;
  price: number;
  displayPrice: number;
  currency: string;
  airline: string | null;
  transfers: number | null;
  duration: number | null;
  bookingUrl: string;
}
interface DealGroup {
  destination: string;
  dest_city: string;
  dest_country: string;
  dest_country_code: string | null;
  region: string;
  tier: Tier;
  discountPct: number | null;
  medianPrice: number | null;
  cheapest: DealView;
  deals: DealView[];
  count: number;
}
interface ApiResponse {
  groups: DealGroup[];
  totalDeals: number;
  destinationCount: number;
  lastUpdated: string | null;
  origins: string[];
  regions: string[];
  baggage: { checkedBagPerLeg: number; trolleyPerLeg: number };
  error?: string;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function flag(code: string | null): string {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (code.toUpperCase().charCodeAt(0) - 65),
    A + (code.toUpperCase().charCodeAt(1) - 65),
  );
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
function fmtDuration(min: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function stopsLabel(t: number | null): string {
  if (t === null) return "stops n/a";
  if (t === 0) return "direct";
  return `${t} stop${t > 1 ? "s" : ""}`;
}

export default function Board() {
  const [sort, setSort] = useState<"price" | "duration" | "depart" | "soon-cheap">("price");
  const [origin, setOrigin] = useState("");
  const [region, setRegion] = useState("");
  const [months, setMonths] = useState<number[]>([]);
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [direct, setDirect] = useState(false);
  const [bag, setBag] = useState(false);
  const [trolley, setTrolley] = useState(false);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("sort", sort);
    if (origin) p.set("origin", origin);
    if (region) p.set("region", region);
    if (months.length) p.set("months", months.join(","));
    if (minDays) p.set("minDays", minDays);
    if (maxDays) p.set("maxDays", maxDays);
    if (direct) p.set("direct", "1");
    if (bag) p.set("bag", "1");
    if (trolley) p.set("trolley", "1");
    return p.toString();
  }, [sort, origin, region, months, minDays, maxDays, direct, bag, trolley]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals?${query}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function scanNow() {
    setScanning(true);
    try {
      await fetch("/api/scan", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }

  const toggleMonth = (m: number) =>
    setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const cur = (n: number) => n.toLocaleString();

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">
            <span className="spark">✈</span> Flight Sniper
          </h1>
          <div className="subtitle">
            Cheapest round trips from Israel — both legs summed.{" "}
            {data?.lastUpdated
              ? `Updated ${new Date(data.lastUpdated).toLocaleString()}`
              : "No data yet — run a scan."}
            {data ? ` · ${data.destinationCount} destinations · ${data.totalDeals} fares` : ""}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={scanNow} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </div>

      <div className="controls">
        <div className="control">
          <label>Sort by</label>
          <div className="seg">
            <button className={sort === "price" ? "active" : ""} onClick={() => setSort("price")}>
              Cheapest
            </button>
            <button
              className={sort === "duration" ? "active" : ""}
              onClick={() => setSort("duration")}
            >
              Shortest
            </button>
            <button className={sort === "depart" ? "active" : ""} onClick={() => setSort("depart")}>
              Soonest
            </button>
            <button
              className={sort === "soon-cheap" ? "active" : ""}
              onClick={() => setSort("soon-cheap")}
            >
              Soonest &amp; cheap
            </button>
          </div>
        </div>

        {(data?.origins.length ?? 0) > 1 && (
          <div className="control">
            <label>From</label>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">All origins</option>
              {data?.origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="control">
          <label>Region</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {data?.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="control">
          <label>
            Departure month
            {months.length > 0 && (
              <button className="link-clear" onClick={() => setMonths([])}>
                Clear
              </button>
            )}
          </label>
          <div className="months">
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              return (
                <button
                  key={m}
                  className={months.includes(m) ? "active" : ""}
                  onClick={() => toggleMonth(m)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="control">
          <label>Trip length (days)</label>
          <div className="days-row">
            <input
              type="number"
              min={0}
              placeholder="min"
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
            />
            <span style={{ color: "var(--muted)" }}>–</span>
            <input
              type="number"
              min={0}
              placeholder="max"
              value={maxDays}
              onChange={(e) => setMaxDays(e.target.value)}
            />
          </div>
        </div>

        <div className="control">
          <label>Options</label>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label className="toggle">
              <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
              Direct only
            </label>
            <label className="toggle">
              <input type="checkbox" checked={bag} onChange={(e) => setBag(e.target.checked)} />
              + Checked bag
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={trolley}
                onChange={(e) => setTrolley(e.target.checked)}
              />
              + Trolley
            </label>
          </div>
        </div>
      </div>

      {(bag || trolley) && data && (
        <div className="note">
          Prices include an <strong>estimated</strong> baggage surcharge (checked bag ≈{" "}
          {data.baggage.checkedBagPerLeg}/leg, trolley ≈ {data.baggage.trolleyPerLeg}/leg). Confirm
          exact baggage fees on the booking page.
        </div>
      )}

      {loading && !data ? (
        <div className="spinner">Loading deals…</div>
      ) : data?.error ? (
        <div className="empty">Error: {data.error}</div>
      ) : (data?.groups.length ?? 0) === 0 ? (
        <div className="empty">
          No deals match these filters yet. Try clearing filters or click <b>Scan now</b>.
        </div>
      ) : (
        <div className="grid">
          {data?.groups.map((g) => (
            <DestinationCard key={g.destination} g={g} cur={cur} />
          ))}
        </div>
      )}
    </>
  );
}

function DestinationCard({ g, cur }: { g: DealGroup; cur: (n: number) => string }) {
  const c = g.cheapest;
  return (
    <details className={`card group ${g.tier}`} open>
      <summary className="card-summary">
        <div className="card-top">
          <div>
            <div className="dest">
              <span className="flag">{flag(g.dest_country_code)}</span>
              {g.dest_city}
              <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>
                {g.destination}
              </span>
            </div>
            <div className="dest-country">{g.dest_country}</div>
          </div>
          {g.tier === "hot" && <span className="badge hot">🔥 HOT</span>}
          {g.tier === "good" && <span className="badge good">💸 GOOD</span>}
        </div>

        <div className="price">
          from {cur(c.displayPrice)}
          <span className="cur">{c.currency.toUpperCase()}</span>
        </div>
        {g.discountPct ? <div className="discount">{g.discountPct}% below typical</div> : null}
        <div className="group-count">
          {g.count} flight{g.count > 1 ? "s" : ""}
        </div>
      </summary>

      <div className="group-flights">
        {g.deals.map((d, i) => {
          const dur = fmtDuration(d.duration);
          return (
            <div className="alt" key={i}>
              <span>
                {fmtDate(d.depart_date)} → {fmtDate(d.return_date)} · {d.trip_days}d ·{" "}
                {stopsLabel(d.transfers)}
                {dur ? ` · ${dur}` : ""}
                {d.airline ? ` · ${d.airline}` : ""}
              </span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <b>
                  {cur(d.displayPrice)} {d.currency.toUpperCase()}
                </b>
                <a href={d.bookingUrl} target="_blank" rel="noopener noreferrer">
                  Book
                </a>
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
