/**
 * index.ts — ה-API הפומבי של-ערוץ-הבעלים
 * ═════════════════════════════════════════════════════════════════════════
 * החוזה: הבעלים כותב-ב-inbox (ישירות או-דרך-סופר-מסומן); הריבונות
 * מאמתת/מגיבה-ב-outbox; הפנקס אוכף-מחזור-חיים-משפטי; האינטגריות כושלת-
 * סגירה. אפס-תלות-ריצה; אפס-float; אפס-Date.now (התאריך הוא-הצהרה-קנונית).
 */
export {
  validateEnvelope, sealEnvelope, reseal, computeRoot,
  type Envelope, type EnvelopeUnsigned, type MsgType, type MsgFrom,
  type Priority, type Status, type Ref, type TruthLabel, type Verdict,
} from "./envelope";
export {
  auditState, computeChannelRoot, register, transition, LEGAL_TRANSITIONS,
  type ChannelState, type StateVerdict,
} from "./ledger";
export { composeBrief, type BriefInput, type Brief, type Metric, type RequestItem } from "./brief";
export { buildFundingREQ, type FundingRequest, type FundingItem } from "./funding";
export { canonicalJson, sha256hex } from "./integrity";

import {
  validateEnvelope, type Envelope, type Status,
} from "./envelope";
import {
  auditState, computeChannelRoot, register, type ChannelState,
} from "./ledger";

/** אימות-ספרייה: מעטפות+פנקס במכה-אחת (כושל-סגירה — מחזיר-את-רשימת-הכישלונות) */
export function auditChannel(
  state: ChannelState, envelopes: readonly Envelope[],
): string[] {
  const errs: string[] = [];
  for (const e of envelopes) {
    const v = validateEnvelope(e);
    if (!v.ok) errs.push(`${e && typeof e === "object" && "id" in e ? String((e as { id: unknown }).id) : "?"}: ${v.rule} ${v.detail}`);
  }
  const s = auditState(state, envelopes.filter((e) => {
    const v = validateEnvelope(e);
    return v.ok;
  }));
  if (!s.ok) errs.push(`state: ${s.rule} ${s.detail}`);
  return errs;
}

/** בניית-מצב-גנזיס ריק (קנוני — ה-root מחושב-על-המצב-ללא-השדה-עצמו) */
export function emptyState(): ChannelState {
  const rest = {
    channelVersion: 1 as const,
    inbox: [] as string[],
    outbox: [] as string[],
    statusOf: {} as Record<string, Status>,
    rootsOf: {} as Record<string, string>,
  };
  return { ...rest, channelRoot: computeChannelRoot(rest) };
}

/** קליטת-הודעה-לערוץ: אימות + רישום (זורק-על-הפרה — כושל-סגירה) */
export function admit(state: ChannelState, e: Envelope): ChannelState {
  const v = validateEnvelope(e);
  if (!v.ok) throw new Error(`admit: ${v.rule} ${v.detail}`);
  return register(state, e);
}
