# PROTOCOL — חוזה-הערוץ (מחייב; כושל-סגירה)

## 1. הודעות

מעטפת (JSON; השדות-המדויקים ב-`src/envelope.ts`):

```json
{
  "id":       "INSTR-2026-10-14-001",
  "type":     "INSTR | REQ | REP",
  "from":     "owner | owner-via-scribe | sovereignty",
  "date":     "YYYY-MM-DD",
  "priority": "urgent | high | normal",
  "subject":  "3..160 תווים",
  "body":     "3..8000 תווים",
  "refs":     [{ "label": "...", "source": "repo/path", "asOf": "YYYY-MM-DD", "truth": "measured | sim | historical-dated | unavailable" }],
  "status":   "open | ack | doing | done | rejected | expired",
  "root":     "sha256-קנוני-של-המעטפת-ללא-השדה"
}
```

כללי-זהות:
- `INSTR` — רק-מהבעלים (`owner`) או-רישום-סופר-מסומן (`owner-via-scribe`).
- `REQ`/`REP` — רק-מהריבונות (`sovereignty`).
- `owner-via-scribe` — רק-`INSTR`; התוכן = דברי-הבעלים מילה-במילה.

## 2. מחזור-חיים

```
open → ack → doing → done
  ↘ rejected   ↘ rejected        (rejected/done/expired = סופיים)
  ↘ expired
```

אסור: open→done · ack→done · כל-מעבר-ממצב-סופי. המעבר מאטים-מחדש-את-המעטפה
(`reseal`) — status+root מתעדכנים-יחד; הפנקס (state.json) מתעדכן-באותה-פעולה.

## 3. שלמות

- `root` = sha256(canonicalJson(מעטפת-ללא-root)) — מפתחות-ממוינים.
- `state.json`: inbox/outbox (id ממוין) · statusOf · rootsOf · `channelRoot`
  = sha256(canonicalJson(מצב-ללא-channelRoot)).
- אודיט (`bun run validate`) כושל-סגירה על: S-MISSING · S-TAMPER · S-STATUS ·
  S-ORPHAN · S-ORPHAN-ENV · S-ENV-ROOT · S-CHANNEL-ROOT · S-DUP.

## 4. זרימת-עבודה

1. הבעלים/סופר כותב-`inbox/INSTR-…json` (חתום) → קומיט.
2. הריבונות: `validate` → `ack` (מעבר-מאוטם) → ביצוע → `doing` → `done`
   (או-`rejected` עם-נימוק-בגוף).
3. הריבונות פותחת-`outbox/REQ-…json` לכל-דבר-שרק-הבעלים-יכול (בלתי-הפיך/הון/
   מפתחות/טענה-פומבית). **כל-שאר — מבוצע-בלי-לשאול.**
4. `bun run brief` מחדש-את-`outbox/BRIEFING.md` — הפנים-הראשונה-של-הבעלים.

## 5. תוויות-אמת (חוק-הערוץ)

אף-מדד/טענה ללא-אחת-מ: `measured` (נמדד-עכשיו) · `sim` (סימולציה-מוצהרת) ·
`historical-dated` (נמדד-בעבר; תאריך-חובה) · `unavailable` (לא-זמין — אסור-
להציג-כמספר). טענה-בלי-תווית = הודעה-לא-תקינה.
