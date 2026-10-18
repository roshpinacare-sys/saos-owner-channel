#!/bin/bash
# [agent-zai/W4-G] RECOVER-ALL — תחיית-האורגניזם כולו בפקודה-אחת.
# קודם לכן: שתי פקודות (BOOTSTRAP.sh + BOOTSTRAP-COMMAND-CENTER.sh) — עכשיו שרשרת
# אחת עם אימות-קצה: ליבה → אתר → dev-server → API 200.
#
#   usage:   PAT=<github-pat> bash RECOVER-ALL.sh          # תחייה מלאה
#   usage:   PAT=<github-pat> bash RECOVER-ALL.sh --check  # בדיקת-כשירות בלבד (אפס כתיבה)
#
# GIT-FIRST LAW (owner 2026-10-17): הענן קאנוני, הסנדבוקס אפמרלי.
# אפס-סודות בענן: ה-PAT חי רק במשתנה-סביבה / upload/pat.env ראנטיים — לעולם לא ב-git.
set -eu
PAT="${PAT:-${GITHUB_PAT:-}}"
MODE="${1:-run}"
if [ -z "$PAT" ]; then
  echo "FATAL: export PAT=<github-pat> קודם — אין סודות בקבצים כאן" >&2
  exit 2
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-/home/z/audit}"
PROJ="${PROJ:-/home/z/my-project}"
AUTH="x-access-token:${PAT}@github.com"
HUB="$BASE/saos-owner-channel"

echo "[recover-all] 0/5 בדיקת-כשירות…"
command -v git >/dev/null || { echo "FATAL: git missing"; exit 1; }
command -v curl >/dev/null || { echo "FATAL: curl missing"; exit 1; }
command -v bun  >/dev/null || { echo "FATAL: bun missing"; exit 1; }
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PAT" https://api.github.com/user)
[ "$HTTP" = "200" ] || { echo "FATAL: PAT rejected by GitHub (http $HTTP)"; exit 1; }
echo "[recover-all] PAT תקף · git/bun/curl זמינים"
if [ "$MODE" = "--check" ]; then echo "[recover-all] --check: כשירות-בלבד, לא נכתב דבר. OK"; exit 0; fi

echo "[recover-all] 1/5 ליבה: 3 ריפואים + dex-beat-service (BOOTSTRAP.sh)…"
PAT="$PAT" bash "$DIR/BOOTSTRAP.sh"

echo "[recover-all] 2/5 האתר: מרכז-הפיקוד על $PROJ (BOOTSTRAP-COMMAND-CENTER.sh)…"
PAT="$PAT" bash "$DIR/BOOTSTRAP-COMMAND-CENTER.sh"

echo "[recover-all] 3/5 dev-server על :3000…"
if curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  echo "[recover-all] כבר רץ — לא נוגעים (single-instance law)"
else
  ( cd "$PROJ" && nohup bun run dev >> "$PROJ/dev.log" 2>&1 & )
  echo "[recover-all] הופעל ברקע — לוג: $PROJ/dev.log"
  sleep 6
fi

echo "[recover-all] 4/5 אימות-קצה: /api/sovereign חייב להחזיר 200+JSON…"
OK=""
for i in $(seq 1 30); do
  BODY=$(curl -s --max-time 8 http://localhost:3000/api/sovereign || true)
  case "$BODY" in
    '{"at":*' ) OK=1; break ;;
  esac
  sleep 2
done
if [ -z "$OK" ]; then
  echo "WARN: /api/sovereign לא חזר 200 אחרי 60ש׳ — בדוק $PROJ/dev.log" >&2
  exit 1
fi
echo "[recover-all] 5/5 סיכום-אימות:"
git -C "$HUB" log --oneline -1 | sed 's/^/  hub:   /'
git -C "$BASE/saos-dex" log --oneline -1 | sed 's/^/  dex:   /'
git -C "$BASE/saos-runtime" log --oneline -1 | sed 's/^/  runtime: /'
[ -d "$BASE/FleetHQ/.git" ] && git -C "$BASE/FleetHQ" log --oneline -1 | sed 's/^/  fleet: /'
echo "$BODY" | head -c 160 | sed 's/^/  api: /'
echo
echo "RECOVERED ✓ — האורגניזם עמד מחדש. האמת: הענן הוא הבית; הסנדבוקס רק זמן-ריצה."
