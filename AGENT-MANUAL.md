# AGENT-MANUAL — ספר-ההישרדות והארסנל של SAOS (הקריאה-הראשונה בכל-תחייה)

> את/ה סוכן שזה-עתה נעורת בסנדבוקס (אולי ריק, אולי סנפשוט-ישן). החוק-הראשון של
> ה-owner (2026-10-17): **"git הוא הבית — הסנדבוקס עשוי להימחק בכל-רגע"**.
> המסמך הזה הוא הצעד-הראשון שלך. קרא אותו לפני-הכל, ואז `worklog.md`.

---

## 0. ההיררכיה של האמת (מי מנצח במקרה-סתירה)

1. **הענן (git main-ים)** — קאנוני. אם הדיסק מסכים — יפה; אם לא — הדיסק טועה.
2. **worklog.md** — זיכרון-הסוכנים. קרא לפני-עבודה; הוסף אחרי-עבודה (הפורמט בתחתית).
3. **הסנדבוקס** — זמן-ריצה בלבד. אף-אמת לא גרה בו.

## 1. תחייה-מאפס (סנדבוקס ריק לגמרי) — 3 פקודות

```bash
# (1) ה-PAT מוסר-לך ע"י הסביבה/ה-owner — הוא לעולם לא ב-git. טען אותו:
export TOKEN="<github-pat>"

# (2) שכפל את ה-hub — הבית:
git clone "https://x-access-token:$TOKEN@github.com/roshpinacare-sys/saos-owner-channel" /home/z/audit/saos-owner-channel

# (3) תחייה-מלאה בפקודה-אחת (ליבה + אתר + dev + אימות-קצה):
PAT="$TOKEN" bash /home/z/audit/saos-owner-channel/RECOVER-ALL.sh
```

סיום-מוצלח = `RECOVERED ✓` + `api: {"at":…` . אימות-עצמי:

```bash
curl -s localhost:3000/api/sovereign | head -c 200   # גובה-שרשרת עולה
PAT="$TOKEN" bash /home/z/audit/saos-owner-channel/RECOVER-ALL.sh --check   # כשירות בלבד
```

## 2. מפת-הארסנל (מה יש ב-hub ומתי משתמשים)

| כלי | תפקיד | מתי |
|---|---|---|
| `RECOVER-ALL.sh` | תחייה-מלאה בפקודה-אחת + `--check` | בכל-תחייה; בדיקה מקדימה |
| `BOOTSTRAP.sh` | ליבה: saos-dex + saos-runtime + FleetHQ + hub + dex-beat-service | כש-RECOVER-ALL לא מתאים |
| `BOOTSTRAP-COMMAND-CENTER.sh` | מקורות-האתר מ-command-center/ אל `/home/z/my-project` (overlay ללא-מחיקות, שומר upload/) | האתר חסר/ישן |
| `RESURRECTION.md` | המדריך-ההיסטורי (W1.4) — עדיין-תקף | הקשר ורקע |
| `TOOLS-REGISTRY.md` | מפת 213-הכלים ב-4-הריפואים | לפני-שכותבים כלי-קיים |
| `worklog.md` | זיכרון-הסוכנים (מסונכרן גם ל-command-center/worklog.md) | תמיד: לפני+אחרי |
| `CLAIMS.json` | הרשאות-סוכנים · leases 24h | לפני-כל-תביעת-משימה |
| `COORDINATION.md` / `PROTOCOL.md` | חוזי-התנועה inbox/outbox מול-ה-owner | תקשורת |
| `command-center/` | מקורות מרכז-הפיקוד (האתר) — זה המוצר | שינוי-אתר |

## 3. חוקי-הברזל (הפרה = פסילת-עבודה)

- **אפס-סודות בענן**: PAT/מפתחות/טוקנים — רק בסביבה/`upload/pat.env` (מחוץ-ל-git).
- **אף-פעם `git push --force`** ל-main. בעימות: `git pull --rebase` → תיקון → push.
- **סדר-הדחיפה**: `add → commit → pull --rebase → push`.
- **כספות/מינטים/מפתחות**: אסור-לגעת בלי-אישור-owner מפורש (downpower קיבל-אישור; כל-השאר חסום).
- **עברית מול-ה-owner, קוד באנגלית.**
- **leases 24h** ב-CLAIMS.json; תיאום-בין-סוכנים דרך git בלבד.
- **העתיד-של-הקוד של my-project הוא command-center/** — עדכן שם וסנכרן חזרה:
  `rsync -a --exclude node_modules --exclude .next --exclude .git --exclude upload --exclude db --exclude .env --exclude dev.log /home/z/my-project/ ./command-center/ && git add -A && git commit && git pull --rebase && git push`

## 4. מי-שומר-על-האורגניזם (מתי-אתה לא הריפא)

| שומר | ריפו | קצב | מה הוא עושה |
|---|---|---|---|
| `arsenal-sentinel` (W4-G) | saos-owner-channel | 6 שע׳ | כלי-הארסנל קיימים על main + אפס-סודות |
| `organ-guardian` (W4-F) | FleetHQ | שעה | איברים שנוטרלו בשקט — מחזיר |
| `builder-catchup` (W4-C) | saos-runtime | שעה | builder לא-רץ 3.6ש׳ → מעיר |
| `grid-watchdog` | saos-runtime | 90 דק׳ | דופק-ירוק/אדום על-הלופים |
| `dex-beat.yml` + catch-up | saos-runtime | שעה :53 | דופק-השרשרת בענן |
| `dex-beat-service` (:3044) | סנדבוקס | שעה :53 | פייסר-מקומי (flock, single-instance) |

אם כל-השומרים ירוקים — **אל-תתערב**; בנה משהו-חדש (דרישת-העל: בנייה-מתמדת, לא רק בדיקות).

## 5. מה-האתר מציג בשבילך

`מרכז-הפיקוד הריבוני` (`command-center`) כולל פאנל **"מגן-השרידות"**: הוא בודק-חי
דרך GitHub-API שכל-כלי-הארסנל קיימים על main ושהסריקה-לסודות נקייה. אם הפאנל
אדום — עבודתך הראשונה היא להחזיר את הכלי-החסר.

## 6. אחרי-כל-משימה (חוק-worklog)

```markdown
---
Task ID: <W#-X>
Agent: <שמך>
Task: <מה-ביקש ה-owner>

Work Log:
- <צעדים מדידים>

Stage Summary:
- <תוצרים והחלטות>
```

הוסף ל-`worklog.md` (וגם `command-center/worklog.md` באותו-commit), ואז push.
