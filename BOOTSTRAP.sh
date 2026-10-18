#!/bin/bash
# [agent-zai/W1.4] SAOS RESURRECTION — rebuild the whole sovereignty stack from
# git alone. GIT-FIRST LAW (owner 2026-10-17): "the sandbox may be wiped at any
# moment — work according to git, not the sandbox." Run this in any fresh
# sandbox with the PAT and the organism stands back up.
#
#   usage:  PAT=$(cat pat.env | cut -d= -f2- | tr -d ' \r\n"') bash BOOTSTRAP.sh
set -eu
PAT="${PAT:?export PAT=<token> first — no secrets in files here}"
BASE="${BASE:-/home/z/audit}"
PROJ="${PROJ:-/home/z/my-project}"
AUTH="x-access-token:${PAT}@github.com"

echo "[bootstrap] 1/5 cloning the homes (the only truth)…"
mkdir -p "$BASE"
# [W4-G] FleetHQ נוסף — נמדד בתחייה 2026-10-18: משחזר-הליבה השאיר את מפקדת-הצי מחוץ-לשחזור
for r in saos-owner-channel saos-dex saos-runtime FleetHQ; do
  [ -d "$BASE/$r/.git" ] || git clone -q "https://${AUTH}/roshpinacare-sys/$r.git" "$BASE/$r"
done

echo "[bootstrap] 2/5 dex chain home ready — last beats:"
git -C "$BASE/saos-dex" log --oneline -3

echo "[bootstrap] 3/5 deploying the git-resident pacer (keeper+loop live in the chain repo)…"
chmod +x "$BASE/saos-dex/deploy/dex-beat-keeper.sh" "$BASE/saos-dex/deploy/dex-beat-loop.sh"

echo "[bootstrap] 4/5 installing the dex-beat mini-service (port 3044, hourly :53)…"
mkdir -p "$PROJ/mini-services/dex-beat-service"
cp "$BASE/saos-dex/deploy/dex-beat-service/index.ts" "$PROJ/mini-services/dex-beat-service/index.ts"
cp "$BASE/saos-dex/deploy/dex-beat-service/package.json" "$PROJ/mini-services/dex-beat-service/package.json"
if ! curl -s --max-time 2 "http://127.0.0.1:3044/health" >/dev/null 2>&1; then
  ( cd "$PROJ/mini-services/dex-beat-service" && nohup bun run dev >> /tmp/dex-beat-service.out 2>&1 & )
  sleep 3
fi
# [W1.6] the dev script is flock-guarded (cross-process single-instance law,
# measured 23:18Z: three parallel schedulers, a deleted-file zombie kept the
# port and served /health with OLD code) — a redundant start above now loses
# the flock instantly instead of arming a second clock.
curl -s --max-time 3 "http://127.0.0.1:3044/health" && echo

echo "[bootstrap] 5/5 cloud sovereignty (saos-runtime workflows) is ALREADY alive — verify:"
git -C "$BASE/saos-runtime" log --oneline -1
echo "[bootstrap] NOTE: the dex cloud twin is saos-runtime/.github/workflows/dex-beat.yml"
echo "[bootstrap] DONE — the loop owns itself again. Verify: curl 127.0.0.1:3044/health"
