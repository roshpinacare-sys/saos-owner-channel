#!/bin/bash
# [agent-z9/W4-C] COMMAND-CENTER RESURRECTION — מרכז-הפיקוד הריבוני (אתר-ה-owner)
# משחזר את האתר מ-git בלבד. המקור: command-center/ בתוך saos-owner-channel.
# GIT-FIRST LAW (owner 2026-10-17): "the sandbox may be wiped at any moment".
# האתר חי על /home/z/my-project — הסנדבוקס מספק בוילרידג' ברירת-מחדל; הסקריפט
# מעלה את המקורות האמיתיים מה-hub (overlay ללא מחיקות — לא נוגע ב-upload/).
#
#   usage:  PAT=$(cat pat.env | cut -d= -f2- | tr -d ' \r\n"') bash BOOTSTRAP-COMMAND-CENTER.sh
set -eu
PAT="${PAT:?export PAT=<token> first — no secrets in files here}"
BASE="${BASE:-/home/z/audit}"
PROJ="${PROJ:-/home/z/my-project}"
SRC="$BASE/saos-owner-channel/command-center"
AUTH="x-access-token:${PAT}@github.com"

echo "[command-center] 1/4 ensuring the hub home…"
if [ ! -d "$SRC" ]; then
  mkdir -p "$BASE"
  git clone -q "https://${AUTH}/roshpinacare-sys/saos-owner-channel.git" "$BASE/saos-owner-channel"
fi

echo "[command-center] 2/4 overlaying the webapp source onto $PROJ (no-delete — upload/ preserved)…"
command -v rsync >/dev/null 2>&1 || { echo "rsync missing — apt install rsync"; exit 1; }
rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.next' "$SRC/" "$PROJ/"

echo "[command-center] 3/4 PAT runtime file (ה-API של האתר קורא upload/pat.env)…"
mkdir -p "$PROJ/upload"
[ -f "$PROJ/upload/pat.env" ] || printf 'TOKEN=%s\n' "$PAT" > "$PROJ/upload/pat.env"

echo "[command-center] 4/4 installing deps…"
cd "$PROJ"
bun install >/dev/null 2>&1 && echo "bun install ok"

echo "[command-center] DONE — הפעלה: cd $PROJ && bun run dev (בסנדבוקס כבר רץ על :3000)"
echo "verify: curl -s localhost:3000/api/sovereign | head -c 160"
echo "האמת: המקור הוא תמיד ה-hub; הסנדבוקס הוא רק זמן-ריצה."
