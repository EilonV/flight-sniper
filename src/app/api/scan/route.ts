import { NextResponse } from "next/server";
import { runFullScan } from "../../../../scanner/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full scan can take a while (many API calls); allow up to 5 min.
export const maxDuration = 300;

let scanning = false;

/** Manual "scan now" trigger. */
export async function POST() {
  if (scanning) {
    return NextResponse.json({ ok: false, message: "A scan is already running." }, { status: 409 });
  }
  scanning = true;
  try {
    await runFullScan();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    scanning = false;
  }
}
