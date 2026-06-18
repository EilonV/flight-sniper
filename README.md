# ✈ Flight Sniper

Finds the **cheapest round-trip flights from Israel to anywhere**, summing both legs
(outbound + return, any dates — the lowest combination). Scans the Travelpayouts / Aviasales
Data API on a schedule, stores results in a local SQLite DB, and shows them on a fast board you
can sort and filter. Genuinely cheap fares are highlighted 🔥.

## Features

- **Cheapest round trip per destination**, price = both legs summed (any dates).
- **Grouped by region/country**, sorted by cheapest.
- **Sort** by Cheapest · Shortest (duration/stops) · Soonest departure.
- **Filters**: trip length (days), direct-only, region, and **estimated baggage / trolley**
  surcharge toggles (added to the displayed price, since the Data API doesn't return exact
  baggage — confirm on the booking page).
- **Reliable booking links** via Aviasales affiliate deep links (redirect to real airlines/OTAs).
- **Hotness highlighting**: each fare is scored against that destination's historical median and
  absolute price ceilings → 🔥 HOT / 💸 GOOD badges + color.
- **Auto-scan** every hour (full) + every 30 min (top destinations), or **Scan now** in the UI.

## Setup

1. **Get API credentials** (free):
   - Sign up at <https://www.travelpayouts.com> and join the **Aviasales** program.
   - Copy your **API token** and your **marker** (partner id).
2. **Configure env**: copy `.env.example` to `.env.local` and fill in `TP_TOKEN`, `TP_MARKER`
   (currency defaults to `ils`).
3. **Install**: `npm install` (already done if you cloned a populated dir).

> Requires **Node 24+** (uses the built-in `node:sqlite` — no native build step).

## Run

```powershell
# 1. Populate the database (one full scan)
npm run scan:once

# 2. Start the web app  ->  http://localhost:3000
npm run dev

# 3. (Optional) keep data fresh automatically — run in a second terminal.
#    Does an immediate full scan, then hourly full + 30-min top-up scans.
npm run scan:worker
```

You can also click **Scan now** in the UI to trigger a scan on demand.

To keep it scanning when your PC is on, leave `npm run scan:worker` running, or wire
`npm run scan:once` to **Windows Task Scheduler** on an hourly trigger.

## How it works

- `scanner/scan.ts` — breadth pass (`/v1/city-directions` + `/v2/prices/latest`) for coverage,
  then a depth pass (`/v2/prices/month-matrix`) over the top destinations for many date combos.
  Results are upserted into SQLite keeping the **lowest** price per route; every observed price is
  logged to `price_history` for the hotness baseline.
- `src/lib/*` — config/env, API client, normalization, booking-link builder, pricing/hotness,
  DB, and query/grouping logic.
- `src/app/api/deals` — filtered, sorted, grouped JSON for the board.
- `src/app/Board.tsx` — the UI.

## Configuration

Tune behaviour in `src/lib/config.ts`: scan frequency (`fullScanCron`/`deepScanCron`),
`deepScanCount`, `monthsAhead`, baggage estimates, and hotness thresholds.

## Notes & limitations

- Travelpayouts data is **cached** from real searches (~48h freshness), so a quoted price can
  occasionally be stale until you click through — it's a deals board, not a live booking engine.
- **Baggage** inclusion isn't returned by the Data API; the bag/trolley toggles add an editable
  *estimate*. Accurate baggage would need Amadeus (Flight Offers Price `include=bags`) or the
  real-time Aviasales Flights Search API — see the plan's "upgrade paths".
- Per Travelpayouts rules, booking links are generated on demand (on click), not pre-scraped.
