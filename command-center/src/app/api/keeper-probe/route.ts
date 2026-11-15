import { NextResponse } from "next/server";

// T-37 dark-keeper law: the dev-keeper (:3044) probes /__keeper_probe to judge
// the cockpit alive. The underscore-prefixed path is unroutable in the app dir,
// so next.config rewrites it here. Honest 200 — no state, no secrets.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, probe: "keeper", at: new Date().toISOString() });
}
