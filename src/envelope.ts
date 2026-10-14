/**
 * envelope.ts — מעטפת-ההודעה של-ערוץ-הבעלים · כושל-סגירה
 * ═════════════════════════════════════════════════════════════════════════
 * חוק-היסוד של-הבעלים (2026-10-14): "אין טענות אלי דרכך... הריבונות היא
 * המפעיל... תזהו את עצמכם" — כל-הודעה בערוץ נושאת-זהות-שולח מפורשת:
 *
 *   INSTR — הוראת-בעלים→ריבונות     (from: owner | owner-via-scribe)
 *   REQ   — בקשת-ריבונות→בעלים      (from: sovereignty בלבד)
 *   REP   — דוח-ריבונות→בעלים      (from: sovereignty בלבד)
 *
 * "owner-via-scribe" = הבעלים השמיע-דברים-וסוכן-חוץ רשם-מילה-במילה —
 * הייחוס-הכן-המלא מסומן-בכל-הודעה-כזו (אפס-התחזות-לדיבור-ישיר).
 * אפס-תאריכי-מערכת: התאריך הוא-הצהרה-קנונית בתוך-ההודעה (מכוון — דטרמיניזם).
 */
import { canonicalJson, sha256hex } from "./integrity";

export type MsgType = "INSTR" | "REQ" | "REP";
export type MsgFrom = "owner" | "owner-via-scribe" | "sovereignty";
export type Priority = "urgent" | "high" | "normal";
export type Status = "open" | "ack" | "doing" | "done" | "rejected" | "expired";
export type TruthLabel = "measured" | "sim" | "historical-dated" | "unavailable";

export interface Ref {
  /** מה-המקור (עברית קצרה) */
  label: string;
  /** איפה נמדד (ספר/נתיב/כלי) */
  source: string;
  /** מתי נמדד (YYYY-MM-DD) */
  asOf: string;
  /** תווית-אמת */
  truth: TruthLabel;
}

export interface Envelope {
  id: string;
  type: MsgType;
  from: MsgFrom;
  date: string; // YYYY-MM-DD — הצהרה-קנונית
  priority: Priority;
  subject: string;
  body: string;
  refs: Ref[];
  status: Status;
  /** sha256 של-המעטפת-הקנונית-ללא-השדה-root (גילוי-שינוי) */
  root: string;
}

const ID_RE = /^(INSTR|REQ|REP)-\d{4}-\d{2}-\d{2}-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUBJECT_MIN = 3, SUBJECT_MAX = 160;
const BODY_MIN = 3, BODY_MAX = 8_000;
const REFS_MAX = 24;

/** מעטפת-בלי-root (לחישוב/אימות) */
export type EnvelopeUnsigned = Omit<Envelope, "root">;

export function computeRoot(e: EnvelopeUnsigned): string {
  return sha256hex(canonicalJson(e));
}

export type Verdict =
  | { ok: true }
  | { ok: false; rule: string; detail: string };

/** אימות-מעטפה מלא — כושל-סגירה (אפס-שתיקה) */
export function validateEnvelope(e: unknown): Verdict {
  const bad = (rule: string, detail: string): Verdict => ({ ok: false, rule, detail });
  if (typeof e !== "object" || e === null) return bad("E-SHAPE", "מעטפת-חייבת-אובייקט");
  const m = e as Record<string, unknown>;

  if (typeof m.id !== "string" || !ID_RE.test(m.id)) return bad("E-ID", `id: ${String(m.id).slice(0, 24)}`);
  const type = m.type;
  if (type !== "INSTR" && type !== "REQ" && type !== "REP") return bad("E-TYPE", String(type).slice(0, 16));

  const from = m.from;
  if (from !== "owner" && from !== "owner-via-scribe" && from !== "sovereignty") {
    return bad("E-FROM", String(from).slice(0, 24));
  }
  // זהות-כיוון: INSTR מהבעלים; REQ/REP מהריבונות-בלבד (חוק-הערוץ)
  if (type === "INSTR" && from === "sovereignty") return bad("E-DIR", "INSTR לא יוצא מהריבונות");
  if ((type === "REQ" || type === "REP") && from !== "sovereignty") {
    return bad("E-DIR", `${type} יוצא רק מהריבונות (from=${String(from)})`);
  }
  // scribe מסמן-רק-דברי-בעלים
  if (from === "owner-via-scribe" && type !== "INSTR") return bad("E-Scribe", "scribe רושם-רק-INSTR");

  if (typeof m.date !== "string" || !DATE_RE.test(m.date)) return bad("E-DATE", String(m.date).slice(0, 16));
  if (m.priority !== "urgent" && m.priority !== "high" && m.priority !== "normal") return bad("E-PRI", String(m.priority).slice(0, 12));
  if (typeof m.subject !== "string" || m.subject.length < SUBJECT_MIN || m.subject.length > SUBJECT_MAX) return bad("E-SUBJ", `subject ${String(m.subject).length}`);
  if (typeof m.body !== "string" || m.body.length < BODY_MIN || m.body.length > BODY_MAX) return bad("E-BODY", `body ${String(m.body).length}`);

  if (!Array.isArray(m.refs) || m.refs.length > REFS_MAX) return bad("E-REFS", `refs ${Array.isArray(m.refs) ? m.refs.length : typeof m.refs}`);
  for (const r of m.refs) {
    const rr = r as Record<string, unknown>;
    if (typeof rr.label !== "string" || rr.label.length < 1) return bad("E-REF-label", String(rr.label).slice(0, 16));
    if (typeof rr.source !== "string" || rr.source.length < 1) return bad("E-REF-source", String(rr.source).slice(0, 16));
    if (typeof rr.asOf !== "string" || !DATE_RE.test(rr.asOf)) return bad("E-REF-date", String(rr.asOf).slice(0, 16));
    if (rr.truth !== "measured" && rr.truth !== "sim" && rr.truth !== "historical-dated" && rr.truth !== "unavailable") {
      return bad("E-REF-truth", String(rr.truth).slice(0, 24));
    }
  }

  const st = m.status;
  if (st !== "open" && st !== "ack" && st !== "doing" && st !== "done" && st !== "rejected" && st !== "expired") {
    return bad("E-STATUS", String(st).slice(0, 12));
  }
  if (typeof m.root !== "string" || !/^[0-9a-f]{64}$/.test(m.root)) return bad("E-ROOT-SHAPE", String(m.root).slice(0, 16));

  // גילוי-שינוי: root חייב-להתאים-לתוכן
  const { root, ...rest } = m as unknown as Envelope;
  const recomputed = computeRoot(rest as EnvelopeUnsigned);
  if (recomputed !== root) return bad("E-ROOT-MISMATCH", `expected ${recomputed.slice(0, 12)}… got ${root.slice(0, 12)}…`);

  return { ok: true };
}

/** יצירת-מעטפה-חתומה (root מחושב-אוטומטית) */
export function sealEnvelope(e: EnvelopeUnsigned): Envelope {
  return { ...e, root: computeRoot(e) };
}

/** איטום-מחדש: שינוי-שדות-עם-חישוב-root-מחדש (למעברי-מחזור-חיים) */
export function reseal(e: Envelope, patch: Partial<Omit<Envelope, "root">>): Envelope {
  const { root: _drop, ...unsigned } = e;
  return sealEnvelope({ ...unsigned, ...patch });
}
