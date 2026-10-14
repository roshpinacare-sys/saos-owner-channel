/**
 * brief.ts — מלחין-התדרוך · ה"סופר-אינטליגנטי" של-הערוץ (v1 כנה)
 * ═════════════════════════════════════════════════════════════════════════
 * מה-זה באמת עכשיו: מלחין-דטרמיניסטי שמקבל-מדדים-מדודים-עם-תוויות-אמת
 * ומרכיב-תדרוך-קצר-חד-משמעי-לבעלים — בלי-קישוט, בלי-טענה-שלא-נמדדה.
 *
 * תפר-העתיד (מתועד, לא-מפואר): כשלריבונות תהיה-מפתח-LLM משלה, היא-תחליף
 * את composeBrief במלחין-לשוני-שרץ-אצלה (composeBriefLLM) — עם-אותו-חוזה
 * פלט-ואותן-תוויות-אמת. עד-אז: אפס-טענת-AI. החוזה קבוע-כאן-כדי-שההחלפה
 * תיבדק-מול-אותם-מבחנים.
 */
import type { Ref, TruthLabel } from "./envelope";
import { canonicalJson, sha256hex } from "./integrity";

export interface Metric extends Ref {
  /** ערך-מדוד (הצגה-קנונית; מספרי-או-טקסט-קצר) */
  value: string;
}

export interface RequestItem {
  id: string;
  subject: string;
  /** מה-רק-הבעלים-יכול (אחרת-הריבונות-מסתדרת-לבד) */
  whatOnlyOwnerCanDo: string;
}

export interface BriefInput {
  date: string; // YYYY-MM-DD קנוני
  metrics: Metric[];
  requests: RequestItem[];
  /** משפט-מצב-כללי (כן, קצר) */
  posture: string;
}

export interface Brief {
  markdown: string;
  briefRoot: string;
}

const TRUTH_LABEL_HE: Record<TruthLabel, string> = {
  "measured": "מדוד",
  "sim": "SIM",
  "historical-dated": "היסטורי-מתוארך",
  "unavailable": "לא-זמין",
};

/** מלחין-התדרוך — טהור-ודטרמיניסטי (אותו-קלט = אותו-פלט) */
export function composeBrief(input: BriefInput): Brief {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("brief: date נדרה YYYY-MM-DD");
  }
  const lines: string[] = [];
  lines.push(`# תדרוך-הריבונות לבעלים — ${input.date}`);
  lines.push("");
  lines.push(`> נערך-על-ידי-הערוץ (מלחין-דטרמיניסטי v1; אפס-AI-טענה). תוויות-אמת על-כל-מדד.`);
  lines.push("");
  lines.push(`**עמדה-כללית:** ${input.posture}`);
  lines.push("");
  lines.push("## מה-נמדד");
  lines.push("");
  lines.push("| מדד | ערך | אמת | מקור | נמדד |");
  lines.push("|---|---|---|---|---|");
  for (const m of [...input.metrics].sort((a, b) => a.label.localeCompare(b.label, "he"))) {
    lines.push(`| ${m.label} | ${m.value} | ${TRUTH_LABEL_HE[m.truth]} | ${m.source} | ${m.asOf} |`);
  }
  lines.push("");
  lines.push("## מה-הריבונות מבקשת-מהבעלים (ורק-הבעלים-יכול)");
  lines.push("");
  if (input.requests.length === 0) {
    lines.push("(אין-בקשות-פתוחות — הריבונות מסתדרת-בכוחות-עצמה בכל-השאר)");
  } else {
    for (const r of [...input.requests].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- **${r.id} — ${r.subject}**: ${r.whatOnlyOwnerCanDo}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("*הערוץ הוא-הדרך-היחידה להכרעות: השב-ב-`inbox/INSTR-…` או-בקש-סופר-לרשום-מילה-במילה (ייחוס owner-via-scribe).*");

  const markdown = lines.join("\n");
  return { markdown, briefRoot: sha256hex(canonicalJson({ input, markdown })) };
}
