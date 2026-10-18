// /api/alerts — מקלט-ההתראות-של-מרכז-הפיקוד (W10 · הצעת-ההמשך-מ-REVIEW-W7, מאושר-על-ידי-הבעלים)
// ═══════════════════════════════════════════════════════════════════════════════════════
// מקבל-POST-מהמנועים (ראשון: saos-dex db-scope-guard) ומשמר-ledger-מקומי-כנה.
// כנות-מלאה: המקלט **לא מאומת** — המנוע-אינו-מחזיק-סוד-משותף (חוק-אפס-הסודות-בענן),
// ולכן: צורה-מחמירה, מדידת-קצב, דדופיקציה, תקרת-ledger, והצגה-המסומנת-"לא-מאומת".
// fail-open: שגיאת-ledger מחזירה 503 אך-השולח-מתוכנת-להתעלם (ההתראה-אף-פעם-לא-קריטית).
import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, readFile, stat, truncate, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const LEDGER = resolve(process.cwd(), "db", "alerts.jsonl");
const LEDGER_MAX_BYTES = 1_000_000;
const DEDUPE_MS = 60_000;
const RATE_LIMIT = 10; // POST/דק'/IP
const RATE_WINDOW_MS = 60_000;
const lastSeen = new Map<string, number>();
const postTimes = new Map<string, number[]>();

type AlertEvent = {
  event_type: string;
  at: string;
  service_id: string;
  url_hint: string;
};

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1] ?? "proxied";
    return "proxied";
  }
  return req.headers.get("x-real-ip") ?? "local";
}

// צורה-מחמירה: אפס-קבלת-שדות-זרים/ערכים-עקומים — מה-שלא-מתאים-נזרק-ב-400
function parseAlert(body: unknown): AlertEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const { event_type, at, service_id, url_hint } = b;
  if (typeof event_type !== "string" || event_type.length === 0 || event_type.length > 64) return null;
  if (typeof at !== "string" || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
  if (typeof service_id !== "string" || service_id.length === 0 || service_id.length > 32) return null;
  if (typeof url_hint !== "string" || !/^[0-9a-f]{12}$/.test(url_hint)) return null;
  return { event_type, at: new Date(at).toISOString(), service_id, url_hint };
}

function rateLimited(ip: string, now: number): boolean {
  const times = (postTimes.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    postTimes.set(ip, times);
    return true;
  }
  times.push(now);
  postTimes.set(ip, times);
  if (postTimes.size > 5_000) {
    const oldest = postTimes.keys().next().value;
    if (oldest !== undefined) postTimes.delete(oldest);
  }
  return false;
}

function deduped(ev: AlertEvent, now: number): boolean {
  const key = `${ev.event_type}|${ev.service_id}|${ev.url_hint}`;
  const prev = lastSeen.get(key);
  if (prev !== undefined && now - prev < DEDUPE_MS) return true;
  lastSeen.set(key, now);
  if (lastSeen.size > 1_000) {
    const oldest = lastSeen.keys().next().value;
    if (oldest !== undefined) lastSeen.delete(oldest);
  }
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIp(req);
  const now = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const ev = parseAlert(body);
  if (!ev) {
    return NextResponse.json({ ok: false, error: "shape rejected: {event_type≤64, at ISO≤40, service_id≤32, url_hint 12-hex} — כל-שדה-זר נדחה" }, { status: 400 });
  }
  if (rateLimited(ip, now)) {
    return NextResponse.json({ ok: false, error: "rate-limited: 10 POST/min per IP" }, { status: 429 });
  }
  if (deduped(ev, now)) {
    return new NextResponse(null, { status: 204 }); // כבר-נרשם-בדקה-האחרונה — הצלחה-שקטה
  }

  try {
    await mkdir(resolve(process.cwd(), "db"), { recursive: true });
    try {
      const st = await stat(LEDGER);
      if (st.size > LEDGER_MAX_BYTES) {
        const tail = await readFile(LEDGER, "utf8");
        const lines = tail.trim().split("\n").slice(-100);
        await truncate(LEDGER, 0);
        if (lines.length > 0) await writeFile(LEDGER, lines.join("\n") + "\n", "utf8");
      }
    } catch {
      // הקובץ-טרם-קיים — ה-append-ייצור-אותו
    }
    await appendFile(LEDGER, JSON.stringify({ ...ev, received_at: new Date().toISOString(), from_ip_hint: ip.slice(0, 3) + "…" }) + "\n", "utf8");
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ ok: false, error: "ledger write failed (fail-open — השולח-ימשיך)" }, { status: 503 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const raw = await readFile(LEDGER, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const recent = lines.slice(-20).map((l) => {
      try {
        return JSON.parse(l) as AlertEvent & { received_at: string };
      } catch {
        return { event_type: "(unparseable line)", at: "", service_id: "", url_hint: "" };
      }
    });
    return NextResponse.json({ ok: true, count: lines.length, recent });
  } catch {
    return NextResponse.json({ ok: true, count: 0, recent: [] }); // שקט-הוא-מצב-לגיטימי
  }
}
