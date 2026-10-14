/**
 * ledger.ts — פנקס-הערוץ · מחזור-חיים-משפטי-בלבד
 * ═════════════════════════════════════════════════════════════════════════
 * מעברי-מצב חוקיים (הכל-אחר = נדחה):
 *   open   → ack | rejected | expired
 *   ack    → doing | rejected
 *   doing  → done | rejected
 *   done/rejected/expired = סופיים (אפס-תחייה-שקטה)
 *
 * הפנקס אוכף: אין-הודעה-כפולה (id ייחודי), אין-הודעה-רפה (כל-id קיים-גם-בקובץ),
 * ואין-סדר-שרשרת-שנשבר — channelRoot מחושב-על-המצב-הקנוני-המלא.
 */
import { canonicalJson, sha256hex } from "./integrity";
import { reseal, computeRoot, type Envelope, type Status } from "./envelope";

export const LEGAL_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = Object.freeze({
  open: ["ack", "rejected", "expired"],
  ack: ["doing", "rejected"],
  doing: ["done", "rejected"],
  done: [],
  rejected: [],
  expired: [],
});

export interface ChannelState {
  channelVersion: 1;
  /** סדר-הופעה-קנוני (id ממוין) */
  inbox: string[];
  outbox: string[];
  /** מצב-חיים פר-הודעה */
  statusOf: Record<string, Status>;
  /** שורשי-ההודעות לפי-id (גילוי-שינוי-ברמת-הערוץ) */
  rootsOf: Record<string, string>;
  /** root מעל-כל-המצב (ללא-השדה עצמו) */
  channelRoot: string;
}

export type StateVerdict =
  | { ok: true }
  | { ok: false; rule: string; detail: string };

export function computeChannelRoot(s: Omit<ChannelState, "channelRoot">): string {
  return sha256hex(canonicalJson(s));
}

/** אימות-מצב-ערוץ מלא מול-ההודעות-הגלויות */
export function auditState(
  state: ChannelState,
  envelopes: readonly Envelope[],
): StateVerdict {
  const bad = (rule: string, detail: string): StateVerdict => ({ ok: false, rule, detail });

  const byId = new Map(envelopes.map((e) => [e.id, e]));
  const listed = [...state.inbox, ...state.outbox];
  if (new Set(listed).size !== listed.length) return bad("S-DUP", "id כפול בפנקס");

  for (const id of listed) {
    const e = byId.get(id);
    if (!e) return bad("S-MISSING", `הודעה-חסרה בפנקס: ${id}`);
    if (state.rootsOf[id] !== e.root) return bad("S-TAMPER", `שורש-שונה: ${id}`);
    const declared = state.statusOf[id];
    if (declared !== e.status) return bad("S-STATUS", `מצב-לא-תואם: ${id} (${declared} מול ${e.status})`);
  }
  // הודעות-יתומות: קיימות-בקבצים-אך-לא-בפנקס (אפס-הודעה-רפה)
  for (const e of envelopes) {
    if (!listed.includes(e.id)) return bad("S-ORPHAN-ENV", `הודעה-מחוץ-לפנקס: ${e.id}`);
  }
  // אימות-תוכן-מול-root (הגנה-בעומק: לא-סומך-על-המאמת-שלמעלה)
  for (const e of envelopes) {
    const { root, ...rest } = e;
    if (computeRoot(rest) !== root) return bad("S-ENV-ROOT", `תוכן-לא-תואם-root: ${e.id}`);
  }
  for (const [id, root] of Object.entries(state.rootsOf)) {
    if (!listed.includes(id)) return bad("S-ORPHAN", `שורש-יתום: ${id}`);
    if (root.length !== 64) return bad("S-ROOT-SHAPE", id);
  }

  const { channelRoot, ...rest } = state;
  if (computeChannelRoot(rest) !== channelRoot) return bad("S-CHANNEL-ROOT", "channelRoot לא מתאים למצב");
  return { ok: true };
}

/** מעבר-מצב — רק-דרך-המפה-המשפטית; מאטים-מחדש-את-המעטפה (status+root
 *  מתעדכנים-יחד — אפס-פער-בין-פנקס-להודעה) ומעדכנים-rootsOf בהתאם. */
export function transition(
  state: ChannelState, e: Envelope, to: Status,
): { state: ChannelState; envelope: Envelope } {
  const cur = state.statusOf[e.id];
  if (!cur) throw new Error(`ledger: הודעה-לא-רשומה ${e.id}`);
  if (!LEGAL_TRANSITIONS[cur].includes(to)) {
    throw new Error(`ledger: מעבר-לא-חוקי ${cur}→${to} (${e.id})`);
  }
  const nextEnv = reseal(e, { status: to });
  const { channelRoot: _drop, ...rest } = state;
  const next: Omit<ChannelState, "channelRoot"> = {
    ...rest,
    statusOf: { ...state.statusOf, [e.id]: to },
    rootsOf: { ...state.rootsOf, [e.id]: nextEnv.root },
  };
  return { state: { ...next, channelRoot: computeChannelRoot(next) }, envelope: nextEnv };
}

/** רישום-הודעה-חדשה בפנקס (id ייחודי נאכף) */
export function register(state: ChannelState, e: Envelope): ChannelState {
  if (state.statusOf[e.id]) throw new Error(`ledger: id קיים-כבר ${e.id}`);
  const side = e.type === "INSTR" ? "inbox" : "outbox";
  const { channelRoot: _drop, ...rest } = state;
  const next: Omit<ChannelState, "channelRoot"> = {
    ...rest,
    inbox: side === "inbox" ? [...state.inbox, e.id].sort() : state.inbox,
    outbox: side === "outbox" ? [...state.outbox, e.id].sort() : state.outbox,
    statusOf: { ...state.statusOf, [e.id]: e.status },
    rootsOf: { ...state.rootsOf, [e.id]: e.root },
  };
  return { ...next, channelRoot: computeChannelRoot(next) };
}
