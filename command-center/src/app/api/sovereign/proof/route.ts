import { NextResponse } from "next/server";
import { lstatSync, existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAW = "https://raw.githubusercontent.com/roshpinacare-sys";
const FLEET = "/home/z/my-project/fleet";
const VAULT_HOME = "/home/z/my-project/fleet-restore/vault-home";
const VAULT_REPO = "/home/z/my-project/fleet-restore/vault-repo";

/**
 * FLEET PROOF — purpose-built, not copied.
 *
 * Three pillars no repo provides:
 *  1. Execution truth: our own engine's fills, chain-verified (volume-verify)
 *  2. Resilience ledger: wipe windows machine-detected from ladder-receipt cadence gaps
 *  3. B8 would-heal drill: live read-only check of every recovery ingredient
 * Fail-closed: a failed source is reported as failed, never guessed.
 */
async function raw(repo: string, path: string) {
  const r = await fetch(`${RAW}/${repo}/HEAD/${path}`, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!r.ok) throw new Error(`raw ${repo}/${path}: ${r.status}`);
  return r.text();
}

async function safe<T>(label: string, fn: () => Promise<T> | T) {
  try {
    return { source: label, ok: true as const, data: await fn(), at: new Date().toISOString() };
  } catch (e) {
    return { source: label, ok: false as const, error: String((e as Error)?.message ?? e).slice(0, 160), at: new Date().toISOString() };
  }
}

/** Pillar 2: wipe windows = cadence gaps > 45 min in the ladder receipts. */
function cadenceGaps(lines: string[]) {
  type P = { at: string; d: Date };
  const pts: P[] = [];
  for (const l of lines) {
    try {
      const at = JSON.parse(l).at;
      const d = new Date(at);
      if (!Number.isNaN(d.getTime())) pts.push({ at, d });
    } catch {
      /* skip malformed line — honest, counted nowhere */
    }
  }
  pts.sort((a, b) => a.d.getTime() - b.d.getTime());
  const gaps: { from: string; to: string; hours: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const h = (pts[i].d.getTime() - pts[i - 1].d.getTime()) / 3_600_000;
    if (h > 0.75) gaps.push({ from: pts[i - 1].at, to: pts[i].at, hours: h });
  }
  return {
    total: pts.length,
    first: pts[0]?.at ?? null,
    last: pts[pts.length - 1]?.at ?? null,
    gapCount: gaps.length,
    gaps: gaps.slice(-14),
  };
}

/** Pillar 3 helpers — local, read-only. */
function fileExists(p: string) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function newestSealAgeHours(): { age: number | null; fresh: boolean | null } {
  try {
    const out = execSync(
      `git -C ${VAULT_REPO} ls-tree -r HEAD --name-only | grep -E 'CROWN-RECOVERY-[0-9TZ]+\\.enc' | sort | tail -1`,
      { encoding: "utf8", timeout: 8000 }
    ).trim();
    const m = out.match(/CROWN-RECOVERY-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (!m) return { age: null, fresh: null };
    const sealed = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const age = (Date.now() - sealed) / 3_600_000;
    return { age, fresh: age <= 48 };
  } catch {
    return { age: null, fresh: null };
  }
}

function lastPatrol(): { at: string; verdict: string } | null {
  try {
    const p = `${VAULT_HOME}/receipts/custody-patrol.jsonl`;
    if (!existsSync(p)) return null;
    const lines = readFileSync(p, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const j = JSON.parse(lines[i]);
        if (j?.at) return { at: j.at, verdict: String(j.verdict ?? j.status ?? "recorded") };
      } catch {
        /* keep walking back */
      }
    }
    return null;
  } catch {
    return null;
  }
}

function vaultSha(): string | null {
  try {
    return execSync(`git -C ${VAULT_HOME} rev-parse --short=9 HEAD`, { encoding: "utf8", timeout: 8000 }).trim();
  } catch {
    return null;
  }
}

export async function GET() {
  const t0 = Date.now();

  const [execRes, cadRes] = await Promise.all([
    safe("saos-dex:volume-verify", async () => {
      const j = JSON.parse(await raw("saos-dex", "grids/state/volume-verify.json"));
      return {
        receiptsScanned: j.receiptsScanned ?? 0,
        txTotal: j.txChecks?.total ?? 0,
        txVerified: j.txChecks?.verified ?? 0,
        txExposed: j.txChecks?.exposed ?? 0,
        txUnreachable: j.txChecks?.unreachable ?? 0,
        fillsCount: j.chainFills?.count ?? 0,
        makerFills: j.chainFills?.makerFills ?? 0,
        takerFills: j.chainFills?.takerFills ?? 0,
        volumeSteem: j.chainFills?.volumeSteem ?? 0,
        volumeSbd: j.chainFills?.volumeSbd ?? 0,
        byAccount: j.chainFills?.byAccount ?? {},
        verdict: j.verdict ?? "UNKNOWN",
        evidenceTxids: (j.evidence ?? []).slice(0, 3).map((e: { txid?: string }) => String(e.txid ?? "")),
        at: j.at ?? null,
      };
    }),
    safe("saos-dex:army-cadence", async () => {
      const t = await raw("saos-dex", "grids/state/army-receipts.jsonl");
      return cadenceGaps(t.trim().split("\n").filter(Boolean));
    }),
  ]);

  // Pillar 3 — B8 would-heal drill (local read-only)
  const drill = (() => {
    const bootKit = fileExists(`${VAULT_HOME}/fleet-boot/boot-fleet.sh`);
    let entrySymlink = false;
    try {
      entrySymlink = lstatSync("/home/z/fleet").isSymbolicLink();
    } catch {
      entrySymlink = false;
    }
    const masterJudge = fileExists(`${FLEET}/steem/mini-services/saos-engine/master-judge.mjs`);
    const beatLoop = fileExists(`${FLEET}/saos-dex/beat-loop.sh`);
    const custodyVault = fileExists(`${FLEET}/steem/.secrets/custody-vault`);
    const seal = newestSealAgeHours();
    const lastArmy = (cadRes.ok ? (cadRes.data as ReturnType<typeof cadenceGaps>).last : null) ?? null;
    const lastArmyMinutes = lastArmy ? (Date.now() - Date.parse(lastArmy)) / 60_000 : null;
    const armed = bootKit && entrySymlink && masterJudge && beatLoop;
    return {
      bootKit,
      entrySymlink,
      masterJudge,
      beatLoop,
      custodyVault,
      sealAgeHours: seal.age,
      sealFresh: seal.fresh,
      lastPatrol: lastPatrol(),
      vaultSha: vaultSha(),
      lastArmyMinutes: lastArmyMinutes !== null && Number.isFinite(lastArmyMinutes) ? Math.round(lastArmyMinutes) : null,
      verdict: armed ? "ARMED" : "DEGRADED",
    };
  })();

  return NextResponse.json(
    {
      execution: execRes.ok ? execRes.data : null,
      cadence: cadRes.ok ? cadRes.data : null,
      drill,
      sources: [execRes, cadRes].map((s) => ({ source: s.source, ok: s.ok, ...(s.ok ? {} : { error: s.error }), at: s.at })),
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - t0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
