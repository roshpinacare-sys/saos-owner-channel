import { describe, test, expect } from "bun:test";
import { composeBrief } from "../src/brief";
import { buildFundingREQ, type FundingRequest } from "../src/funding";
import { validateEnvelope } from "../src/envelope";
import { seedEnvelopes } from "../seed/content";

describe("brief — מלחין-דטרמיניסטי-כן", () => {
  const input = {
    date: "2026-10-14",
    posture: "עמדה-כנה-לדוגמה.",
    metrics: [
      { label: "מדד-ב", value: "2", source: "s2", asOf: "2026-10-14", truth: "measured" as const },
      { label: "מדד-א", value: "1", source: "s1", asOf: "2026-10-13", truth: "sim" as const },
    ],
    requests: [{ id: "REQ-2026-10-14-001", subject: "הכרעה", whatOnlyOwnerCanDo: "בלתי-הפיך" }],
  };

  test("אותו-קלט = אותו-פלט (briefRoot זהה)", () => {
    expect(composeBrief(input).briefRoot).toBe(composeBrief(input).briefRoot);
  });

  test("תוויות-אמת מופיעות; סדר-קנוני; אפס-טענת-AI", () => {
    const b = composeBrief(input);
    expect(b.markdown).toContain("מדוד");
    expect(b.markdown).toContain("SIM");
    expect(b.markdown.indexOf("מדד-א")).toBeLessThan(b.markdown.indexOf("מדד-ב")); // ממוין
    expect(b.markdown).toContain("אפס-AI-טענה");
  });

  test("תאריך-גרוע נדחה", () => {
    expect(() => composeBrief({ ...input, date: "tomorrow" })).toThrow(/date/);
  });
});

describe("funding — בקשות-מימון-כנות", () => {
  const fr: FundingRequest = {
    id: "REQ-2026-10-14-010",
    date: "2026-10-14",
    subject: "בקשת-מימון-לדוגמה",
    has: [{ label: "אוצר", value: "2,841.7 SP", source: "worklog", asOf: "2026-10-13", truth: "measured" }],
    selfPlan: ["גריד-בעצימות-נמוכה"],
    onlyOwner: [{ need: "הזזת-הון", whyOnlyOwner: "בלתי-הפיך" }],
    bodyNote: "כל-המספרים-מדודים-ומתוארכים.",
  };

  test("מייצר-מעטפת-REQ-תקינה-חתומה", () => {
    const e = buildFundingREQ(fr);
    expect(validateEnvelope(e)).toEqual({ ok: true });
    expect(e.type).toBe("REQ");
    expect(e.from).toBe("sovereignty");
    expect(e.status).toBe("open");
    expect(e.body).toContain("2,841.7 SP");
    expect(e.body).toContain("רק-הבעלים-יכול");
  });

  test("אסור-לפנות-לבעלים-בלי-דבר-שרק-הוא-יכול", () => {
    expect(() => buildFundingREQ({ ...fr, onlyOwner: [] })).toThrow(/רק-הבעלים/);
  });
});

describe("seed — תוכן-הזריעה האמיתי", () => {
  const envs = seedEnvelopes();

  test("3 הודעות: 1 INSTR-בעלים + 2 REQ-ריבונות — כולן-תקינות", () => {
    expect(envs.length).toBe(3);
    for (const e of envs) expect(validateEnvelope(e)).toEqual({ ok: true });
    expect(envs[0]!.type).toBe("INSTR");
    expect(envs[1]!.type).toBe("REQ");
    expect(envs[2]!.type).toBe("REQ");
  });

  test("INSTR-001 נושא-את-חוקי-הבעלים (אין-טענות-דרך-סוכנים; מימון-עצמי; מרכז-הכובד)", () => {
    const e = envs[0]!;
    expect(e.from).toBe("owner-via-scribe");
    expect(e.priority).toBe("urgent");
    expect(e.body).toContain("אין טענות אלי דרכך");
    expect(e.body).toContain("בכוחות עצמה עם מה שיש");
    expect(e.body).toContain("המטבע שלנו");
  });

  test("REQ-002 (מימון-עצמי) מכיל-מדדים-מתוארכים-בלבד ומצהיר-אפס-בקשת-משאבים-חוץ", () => {
    const e = envs[2]!;
    expect(e.body).toContain("2,841.7 SP");
    expect(e.body).toContain("$0.022/יום");
    expect(e.body).toContain("אין-בקשה-למשאבים-חוץ-חדשים");
  });
});
