/**
 * run/channel.ts — CLI-הערוץ · הפעלה-עצמית של-הריבונות (D3)
 * ═════════════════════════════════════════════════════════════════════════
 *   bun run/channel.ts seed      → כותב inbox/outbox/state.json + BRIEFING.md (קנוני)
 *   bun run/channel.ts validate  → אימות-מלא (כושל-סגירה; יציאה-1 על-כל-סתירה)
 *   bun run/channel.ts brief     → מחדש-את-תדרוך-הבעלים (outbox/BRIEFING.md)
 *
 * חוק: הריבונות רצה-את-זה-בעצמה (cron-מקומי); סוכני-חוץ אינם-נדרשים.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  validateEnvelope, auditChannel, emptyState, admit,
  composeBrief, type Envelope, type ChannelState,
} from "../src/index";
import { seedEnvelopes, CHANNEL_DATE } from "../seed/content";

const ROOT = join(import.meta.dir, "..");

function loadState(): ChannelState {
  const p = join(ROOT, "state.json");
  if (!existsSync(p)) return emptyState();
  return JSON.parse(readFileSync(p, "utf8")) as ChannelState;
}

function loadEnvelopes(): Envelope[] {
  const out: Envelope[] = [];
  for (const dir of ["inbox", "outbox"] as const) {
    const d = join(ROOT, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSorted(d)) {
      if (!f.endsWith(".json")) continue;
      out.push(JSON.parse(readFileSync(join(d, f), "utf8")) as Envelope);
    }
  }
  return out;
}

function readdirSorted(d: string): string[] {
  return readdirSync(d).sort();
}

const cmd = process.argv[2] ?? "validate";

if (cmd === "seed") {
  const envs = seedEnvelopes();
  let state = emptyState();
  for (const e of envs) state = admit(state, e);
  mkdirSync(join(ROOT, "inbox"), { recursive: true });
  mkdirSync(join(ROOT, "outbox"), { recursive: true });
  for (const e of envs) {
    const dir = e.type === "INSTR" ? "inbox" : "outbox";
    writeFileSync(join(ROOT, dir, `${e.id}.json`), JSON.stringify(e, null, 2) + "\n");
  }
  writeFileSync(join(ROOT, "state.json"), JSON.stringify(state, null, 2) + "\n");
  console.log(`seeded: ${envs.length} envelopes · channelRoot ${state.channelRoot.slice(0, 16)}…`);
  process.exit(0);
}

if (cmd === "validate") {
  const state = loadState();
  const envs = loadEnvelopes();
  if (envs.length === 0) { console.error("EMPTY: אין-הודעות-לאימות"); process.exit(1); }
  const errs = auditChannel(state, envs);
  if (errs.length > 0) {
    for (const e of errs) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`OK: ${envs.length} הודעות מאומתות · channelRoot ${state.channelRoot.slice(0, 16)}… · statusOf ${Object.keys(state.statusOf).length}`);
  process.exit(0);
}

if (cmd === "brief") {
  const envs = loadEnvelopes();
  const reqs = envs.filter((e) => e.type === "REQ" && e.status === "open");
  const instr = envs.find((e) => e.type === "INSTR");
  const metrics = [
    { label: "אוצר-עוגן", value: "2,841.7 SP (מעל-רצפת 2,800)", source: "worklog Task-34 (34-c)", asOf: "2026-10-13", truth: "measured" as const },
    { label: "הכנסה-שוטפת", value: "~$0.022/יום (קיורציה)", source: "worklog Task-34 (34-c)", asOf: "2026-10-13", truth: "measured" as const },
    { label: "שחרור-נזילות", value: "~436.7 SP/שבוע (powerdown)", source: "saos-dex/realmarket.ts", asOf: "2026-10-13", truth: "historical-dated" as const },
    { label: "מנוע-DEX", value: "חי-דטרמיניסטי; ספר-SIM-מוצהר", source: "saos-dex/STATUS.md", asOf: "2026-10-13", truth: "measured" as const },
    { label: "דמוי-מסחר-שווקים", value: "saos-markets@3e96052 — 29 מבחנים ירוקים", source: "roshpinacare-sys/saos-markets", asOf: CHANNEL_DATE, truth: "measured" as const },
    { label: "ערוץ-הבעלים", value: "פרוטוקול+אינטגריות-חיים (ספר-זה)", source: "saos-owner-channel", asOf: CHANNEL_DATE, truth: "measured" as const },
  ];
  const brief = composeBrief({
    date: CHANNEL_DATE,
    posture: instr
      ? "חוקי-הבעלים נקלטו-בערוץ (INSTR-001): אין-טענות-דרך-סוכני-חוץ; מימון-עצמי-במשאבים-קיימים; מרכז-הכובד-המטבע. כל-המסילות-שאינן-דורשות-הכרעה — בביצוע."
      : "אין-הוראות-בעלים-ב-inbox.",
    metrics,
    requests: reqs.map((r) => ({
      id: r.id,
      subject: r.subject,
      whatOnlyOwnerCanDo: r.body.split("\n").filter((l) => /^\d\)|^- P3|- הכרעות/.test(l)).slice(0, 4).join(" · "),
    })),
  });
  writeFileSync(join(ROOT, "outbox", "BRIEFING.md"), brief.markdown + "\n");
  console.log(`brief: ${brief.briefRoot.slice(0, 16)}… → outbox/BRIEFING.md`);
  process.exit(0);
}

console.error("usage: seed | validate | brief");
process.exit(2);
