import { describe, test, expect } from "bun:test";
import {
  validateEnvelope, sealEnvelope, computeRoot,
  type EnvelopeUnsigned,
} from "../src/envelope";

const good: EnvelopeUnsigned = {
  id: "INSTR-2026-10-14-001",
  type: "INSTR",
  from: "owner",
  date: "2026-10-14",
  priority: "urgent",
  subject: "הוראת-בעלים-לדוגמה",
  body: "גוף-ההודעה עם-תוכן-אמיתי.",
  refs: [{ label: "מקור", source: "worklog", asOf: "2026-10-14", truth: "measured" }],
  status: "open",
};

describe("envelope — כושל-סגירה", () => {
  test("מעטפה-תקינה עוברת; root מתאים", () => {
    const e = sealEnvelope(good);
    expect(validateEnvelope(e)).toEqual({ ok: true });
  });

  test("זהות-כיוון: INSTR מהריבונות נדחה; REQ מהבעלים נדחה", () => {
    expect(validateEnvelope(sealEnvelope({ ...good, from: "sovereignty" }))).toMatchObject({ ok: false, rule: "E-DIR" });
    expect(validateEnvelope(sealEnvelope({ ...good, id: "REQ-2026-10-14-001", type: "REQ", from: "owner" }))).toMatchObject({ ok: false, rule: "E-DIR" });
  });

  test("scribe רשאי-רק-INSTR (ייחוס-גלוי); REQ-מסופר נדחה-בכלל-כיוון", () => {
    expect(validateEnvelope(sealEnvelope({ ...good, from: "owner-via-scribe" }))).toEqual({ ok: true });
    expect(validateEnvelope(sealEnvelope({ ...good, id: "REQ-2026-10-14-009", type: "REQ", from: "owner-via-scribe" }))).toMatchObject({ ok: false });
  });

  test("שינוי-שקט נתפס (root-mismatch)", () => {
    const e = sealEnvelope(good);
    const tampered = { ...e, body: "גוף-שהוחלף-בשקט" };
    expect(validateEnvelope(tampered)).toMatchObject({ ok: false, rule: "E-ROOT-MISMATCH" });
  });

  test("שדות-גרועים נדחים", () => {
    expect(validateEnvelope(sealEnvelope({ ...good, id: "XXX" }))).toMatchObject({ ok: false, rule: "E-ID" });
    expect(validateEnvelope(sealEnvelope({ ...good, type: "SPAM" as never }))).toMatchObject({ ok: false, rule: "E-TYPE" });
    expect(validateEnvelope(sealEnvelope({ ...good, date: "14-10-2026" }))).toMatchObject({ ok: false, rule: "E-DATE" });
    expect(validateEnvelope(sealEnvelope({ ...good, priority: "MAYBE" as never }))).toMatchObject({ ok: false, rule: "E-PRI" });
    expect(validateEnvelope(sealEnvelope({ ...good, subject: "x" }))).toMatchObject({ ok: false, rule: "E-SUBJ" });
    expect(validateEnvelope(sealEnvelope({ ...good, body: "" }))).toMatchObject({ ok: false, rule: "E-BODY" });
    expect(validateEnvelope(sealEnvelope({ ...good, refs: [{ label: "a", source: "b", asOf: "bad", truth: "measured" }] }))).toMatchObject({ ok: false, rule: "E-REF-date" });
    expect(validateEnvelope(sealEnvelope({ ...good, status: "zombie" as never }))).toMatchObject({ ok: false, rule: "E-STATUS" });
  });

  test("computeRoot דטרמיניסטי (סדר-מפתחות-לא-משנה)", () => {
    expect(computeRoot(good)).toBe(computeRoot({ ...good } as EnvelopeUnsigned));
  });
});
