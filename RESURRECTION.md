# תחייה מהגיט — חוק הבית (W1.4, 2026-10-17)

**חוק-הבעלים:** הסנדבוקס עלול להימחק בכל רגע. עובדים לפי **הגיט**, לא לפי הסנדבוקס.
זה אומת בפועל: `/home/z/audit/` נמחק ב-10-17 (~05:10Z→10:22Z) ואיתו כל הקלונים
והסקריפטים — **רק מה שהיה בגיט שרד** (הענן המשיך לפעום לבד: ביטים 09:06→10:01Z).

## תחייה בפקודה אחת (סנדבוקס חדש או סוכן חדש)

```bash
export PAT=$(cut -d= -f2- pat.env | tr -d ' \r\n"')
PAT="$PAT" bash /home/z/audit/saos-owner-channel/BOOTSTRAP.sh   # או אחרי clone של ה-hub
```

ה-BOOTSTRAP מקים: קלונים (hub/dex/runtime) ← ה-pacer-גיט-תושב ← ה-mini-service
(פורט 3044) ← אימות-health. שאר האורגניזם חי בענן ומרים את עצמו.

## מה חי איפה (אחרי W1.4)

| רכיב | הבית | עצמאות-מסנדבוקס |
|---|---|---|
| הריבונות (money beat) | `saos-runtime` workflow `sovereign-runtime.yml` | **מלאה** — pulse-עצמי ~20-25 דק', ללא סנדבוקס |
| ה-bus (directives) | `saos-runtime` workflow `directive-now.yml` | מלאה |
| ה-DEX (ביטים :53) | `saos-dex` `deploy/` + `saos-runtime` workflow `dex-beat.yml` | **מלאה אחרי W1.4** — תאום-ענן ל-pacer המקומי |
| ה-pacer המקומי | `saos-dex/deploy/dex-beat-keeper.sh` + `dex-beat-loop.sh` + `deploy/dex-beat-service/` | גיט-תושב; הסנדבוקס רק מריץ |
| ה-hub (claims/סנכרון) | `saos-owner-channel` (CLAIMS.json, COORDINATION.md) | גיט |
| מצב-השרשרת (אמת) | `saos-dex` `db/state-snapshot.json` + tape בקומיטים | גיט |
| worklog | `/home/z/my-project/worklog.md` (מקומי) + תמצית ב-hub | חלקי — התמצית בגיט |

## הכללים שנשמרים תמיד
1. אין גע בכספות/מפתחות/טוקנים/רוטציות בלי אישור-בעלים מפורש.
2. lease לפני כסף (CLAIMS.json), ראיות-קודם-לכל, ענפים + FF בלבד.
3. עברית מול הבעלים. אין שקרים, אין סימולציות — הכל אמיתי.
