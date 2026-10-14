import { describe, test, expect } from "bun:test";
import { emptyState, admit } from "../src/index";
import { transition, auditState, computeChannelRoot, type ChannelState } from "../src/ledger";
import { sealEnvelope, reseal, type Envelope, type EnvelopeUnsigned, type Status } from "../src/envelope";

function mk(id: string, type: "INSTR" | "REQ", status: Status = "open"): Envelope {
  const u: EnvelopeUnsigned = {
    id, type,
    from: type === "INSTR" ? "owner" : "sovereignty",
    date: "2026-10-14", priority: "normal",
    subject: "נושא-בדיקה-תקני", body: "גוף-בדיקה-תקני-ואמיתי.",
    refs: [], status,
  };
  return sealEnvelope(u);
}

describe("ledger — מחזור-חיים-משפטי", () => {
  test("גנזיס-ריק קנוני-ועקבי (root ללא-הפניה-עצמית)", () => {
    const s = emptyState();
    expect(auditState(s, [])).toEqual({ ok: true });
    const { channelRoot: _drop, ...rest } = s;
    expect(s.channelRoot).toBe(computeChannelRoot(rest));
  });

  test("רישום + מעברים חוקיים open→ack→doing→done (מעטפה-מאוטמת-מחדש-בכל-מעבר)", () => {
    let s = emptyState();
    const req = mk("REQ-2026-10-14-001", "REQ");
    const instr = mk("INSTR-2026-10-14-001", "INSTR");
    s = admit(s, req);
    s = admit(s, instr);
    expect(s.inbox).toEqual(["INSTR-2026-10-14-001"]);
    expect(s.outbox).toEqual(["REQ-2026-10-14-001"]);

    let cur = req;
    for (const to of ["ack", "doing", "done"] as const) {
      const r = transition(s, cur, to);
      s = r.state;
      cur = r.envelope;
    }
    expect(cur.status).toBe("done");
    expect(auditState(s, [cur, instr])).toEqual({ ok: true });
  });

  test("מעברים-לא-חוקיים נזרקים (open→done; ack→done; done→open)", () => {
    let s: ChannelState = emptyState();
    const e = mk("REQ-2026-10-14-002", "REQ");
    s = admit(s, e);
    expect(() => transition(s, e, "done")).toThrow(/לא-חוקי/); // open→done אסור
    const r1 = transition(s, e, "ack");
    expect(() => transition(r1.state, r1.envelope, "done")).toThrow(/לא-חוקי/); // ack→done אסור (חייב-doing)
    const r2 = transition(r1.state, r1.envelope, "doing");
    const r3 = transition(r2.state, r2.envelope, "done");
    expect(() => transition(r3.state, r3.envelope, "open")).toThrow(/לא-חוקי/); // תחייה אסורה
  });

  test("id כפול נזרק; הודעה-יתומה-מחוץ-לפנקס נתפסת (S-ORPHAN-ENV)", () => {
    let s = emptyState();
    const e = mk("REQ-2026-10-14-003", "REQ");
    s = admit(s, e);
    expect(() => admit(s, e)).toThrow(/קיים-כבר/);
    // הודעה-יתומה: קיימת-בקבצים-אך-לא-בפנקס — אפס-הודעה-רפה
    const res = auditState(s, [e, mk("REQ-2026-10-14-004", "REQ")]);
    expect(res).toMatchObject({ ok: false, rule: "S-ORPHAN-ENV" });
  });

  test("שני-סוגי-זיוף נתפסים: תוכן-שונה-עם-root-ישן (S-ENV-ROOT) ומעטפה-עקבית-שסוטה-מהפנקס (S-TAMPER)", () => {
    let s = emptyState();
    const e = mk("REQ-2026-10-14-005", "REQ");
    s = admit(s, e);
    // זיוף-1: תוכן-שהוחלף-בשקט עם-root-המקור
    const forged: Envelope = { ...e, body: "שונה-בשקט" };
    expect(auditState(s, [forged])).toMatchObject({ ok: false, rule: "S-ENV-ROOT" });
    // זיוף-2: מעטפה-מאוטמת-היטב אך שסוטה-מהרישום-בפנקס
    const hacked = reseal(e, { subject: "נושא-זיוף-עקבי" });
    expect(auditState(s, [hacked])).toMatchObject({ ok: false, rule: "S-TAMPER" });
  });
});
