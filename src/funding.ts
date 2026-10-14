/**
 * funding.ts — בנאי-בקשות-מימון-עצמי · חוק-הבעלים: "היא משיגה את המימון
 * בכוחות עצמה עם מה שיש"
 * ═════════════════════════════════════════════════════════════════════════
 * המבנה הכן של-כל-בקשת-מימון:
 *   has        — מה-יש-לריבונות (מדוד-מתוארך; אפס-מספרים-מצוירים)
 *   selfPlan   — מה-הריבונות עושה-עם-זה בעצמה (מסילות-ביצוע, לא-כוונות-רפות)
 *   onlyOwner  — מה-אי-אפשר-בלי-הבעלים (מפתחות-פרטיים/הכרעות-בלתי-הפיכות/
 *                הון-חוץ) — זו-הרשימה-היחידה-שמותר-לה-לפנות-אל-הבעלים
 *
 * אפס-float: כל-כמות היא-מחרוזת-קנונית-עם-יחידה (מדוד-כמו-שהוא).
 */
import type { Ref } from "./envelope";
import { sealEnvelope, type Envelope, type EnvelopeUnsigned } from "./envelope";

export interface FundingItem extends Ref {
  /** הערך-כמו-שנמדד (מחרוזת-עם-יחידה; אין-המרות-שלא-נמדדו) */
  value: string;
}

export interface FundingRequest {
  id: string;
  date: string;
  subject: string;
  has: FundingItem[];
  selfPlan: string[];
  onlyOwner: Array<{ need: string; whyOnlyOwner: string }>;
  /** אמת-מדידה: איפה כל-מספר נמדד */
  bodyNote: string;
}

/** הרכבת-מעטפת-REQ-מימון-מהמבנה (חתומה; status=open) */
export function buildFundingREQ(fr: FundingRequest): Envelope {
  if (!/^REQ-\d{4}-\d{2}-\d{2}-\d{3}$/.test(fr.id)) {
    throw new Error(`funding: id נדרה REQ-YYYY-MM-DD-NNN (${fr.id.slice(0, 16)})`);
  }
  if (fr.onlyOwner.length === 0) {
    throw new Error("funding: אסור-לפנות-לבעלים-בלי-דבר-שרק-הבעלים-יכול");
  }
  const lines: string[] = [];
  lines.push("מה-יש (מדוד):");
  for (const h of fr.has) {
    lines.push(`- ${h.label}: ${h.value} [${h.truth}] (${h.source}, ${h.asOf})`);
  }
  lines.push("");
  lines.push("תוכנית-עצמית (ביצוע-במשאבים-הקיימים):");
  for (const s of fr.selfPlan) lines.push(`- ${s}`);
  lines.push("");
  lines.push("רק-הבעלים-יכול:");
  for (const o of fr.onlyOwner) lines.push(`- ${o.need} — ${o.whyOnlyOwner}`);
  lines.push("");
  lines.push(fr.bodyNote);

  const unsigned: EnvelopeUnsigned = {
    id: fr.id,
    type: "REQ",
    from: "sovereignty",
    date: fr.date,
    priority: "high",
    subject: fr.subject,
    body: lines.join("\n"),
    refs: [...fr.has, ...fr.selfPlan.map((s, i) => ({
      label: `selfPlan[${i + 1}]`,
      source: "saos-owner-channel/selfPlan",
      asOf: fr.date,
      truth: "unavailable" as const,
    }))].map((r) => ({ label: r.label, source: r.source, asOf: r.asOf, truth: r.truth })),
    status: "open",
  };
  return sealEnvelope(unsigned);
}
