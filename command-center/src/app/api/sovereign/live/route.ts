import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC = "https://api.steemit.com";
const RAW = "https://raw.githubusercontent.com/roshpinacare-sys";
const SOLDIERS = ["hcsoldier4", "hcsoldier5", "hcsoldier6", "cashmachine", "haran"];
const ARMY = ["cashmachine", "haran", "israelnews", "lsa", "macrame", "siq", "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"];

async function rpc(method: string, params: unknown, timeoutMs = 12000) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const d = await r.json();
  if (d.error) throw new Error(String(d.error.message ?? "").slice(0, 160));
  return d.result;
}

async function raw(repo: string, path: string) {
  const r = await fetch(`${RAW}/${repo}/HEAD/${path}`, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!r.ok) throw new Error(`raw ${repo}/${path}: ${r.status}`);
  return r.text();
}

async function safe<T>(label: string, fn: () => Promise<T>) {
  try {
    return { source: label, ok: true as const, data: await fn(), at: new Date().toISOString() };
  } catch (e) {
    return { source: label, ok: false as const, error: String((e as Error)?.message ?? e).slice(0, 160), at: new Date().toISOString() };
  }
}

export async function GET() {
  const t0 = Date.now();

  const [accountsRes, dgpoRes, delegsRes, bookRes, armyRes, dexRes, volumeRes, receiptsRes, gridRes] = await Promise.all([
    safe("steem:accounts", async () => {
      const accs = await rpc("condenser_api.get_accounts", [["headcorner", ...ARMY]]);
      return accs;
    }),
    safe("steem:dgpo", () => rpc("condenser_api.get_dynamic_global_properties", [])),
    safe("steem:delegations", () => rpc("condenser_api.get_vesting_delegations", ["headcorner", "", 100])),
    safe("steem:orderbook", () => rpc("condenser_api.get_order_book", [10])),
    safe("saos-dex:army-public", () => raw("saos-dex", "grids/state/army-public.json").then((t) => JSON.parse(t))),
    safe("saos-dex:state", () => raw("saos-dex", "db/state-snapshot.json").then((t) => JSON.parse(t))),
    safe("saos-dex:volume-verify", () => raw("saos-dex", "grids/state/volume-verify.json").then((t) => JSON.parse(t))),
    safe("saos-dex:receipts", () => raw("saos-dex", "grids/state/army-receipts.jsonl").then((t) => t.trim().split("\n").slice(-6).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean))),
    safe("saos-dex:grid-public", () => raw("saos-dex", "db/grid-public.json").then((t) => JSON.parse(t))),
  ]);

  const accounts: any[] = accountsRes.ok ? accountsRes.data : [];
  const byName = Object.fromEntries(accounts.map((a) => [a.name, a]));
  const dgpo: any = dgpoRes.ok ? dgpoRes.data : null;
  const vestsPerSp = dgpo ? parseFloat(dgpo.total_vesting_shares) / parseFloat(dgpo.total_vesting_fund_steem) : null;

  const head = byName["headcorner"];
  // condenser quirk: to_withdraw/withdrawn arrive as raw mVESTS integers while
  // vesting_shares/delegated arrive as "N.NNNNNN VESTS" strings — normalize here.
  const vestsNum = (v: any): number => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    // condenser ships these as mVESTS (>1e11) even inside strings; plain VESTS never exceed ~1e10
    return Number.isFinite(n) && n > 5e11 ? n / 1e6 : n;
  };
  const treasury = head
    ? {
        account: head.name,
        liquidSteem: parseFloat(head.balance),
        sbd: parseFloat(head.sbd_balance),
        sp: (parseFloat(head.vesting_shares) - parseFloat(head.delegated_vesting_shares)) / (vestsPerSp ?? 1),
        totalVests: parseFloat(head.vesting_shares),
        delegatedOut: parseFloat(head.delegated_vesting_shares),
        toWithdrawVests: vestsNum(head.to_withdraw),
        withdrawnVests: vestsNum(head.withdrawn),
        nextWithdrawal: head.next_vesting_withdrawal,
      }
    : null;

  const soldiers = SOLDIERS.map((s) => {
    const a = byName[s];
    if (!a) return { account: s, ok: false };
    const vs = parseFloat(a.vesting_shares);
    const vr = parseFloat(a.received_vesting_shares ?? "0");
    const vd = parseFloat(a.delegated_vesting_shares ?? "0");
    return {
      account: s, ok: true,
      liquidSteem: parseFloat(a.balance),
      sbd: parseFloat(a.sbd_balance),
      sp: (vs - vd + vr) / (vestsPerSp ?? 1),
    };
  });

  const delegations = delegsRes.ok
    ? delegsRes.data.map((x: any) => ({ delegatee: x.delegatee, vests: parseFloat(x.vesting_shares), sp: parseFloat(x.vesting_shares) / (vestsPerSp ?? 1), since: x.min_delegation_time }))
    : null;

  const book = bookRes.ok
    ? {
        bestBid: parseFloat(bookRes.data.bids?.[0]?.real_price ?? "0"),
        bestAsk: parseFloat(bookRes.data.asks?.[0]?.real_price ?? "0"),
        bids: (bookRes.data.bids ?? []).slice(0, 5).map((b: any) => ({ price: parseFloat(b.real_price), steem: parseFloat(b.steem) })),
        asks: (bookRes.data.asks ?? []).slice(0, 5).map((a: any) => ({ price: parseFloat(a.real_price), steem: parseFloat(a.steem) })),
      }
    : null;

  const dex = dexRes.ok
    ? {
        savedAt: dexRes.data.savedAt,
        height: dexRes.data.state?.height,
        pools: Object.entries(dexRes.data.state?.pools ?? {}).map(([k, p]: [string, any]) => ({ pair: k, ra: p.ra, rb: p.rb })),
        stats: dexRes.data.state?.stats,
        treasury: dexRes.data.state?.balances?.treasury,
      }
    : null;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      ms: Date.now() - t0,
      chain: { vestsPerSp, treasury, soldiers, delegations, book, dgpo: dgpo ? { head_block: dgpo.head_block_number, time: dgpo.time } : null },
      army: { public: armyRes.ok ? armyRes.data : { error: armyRes.error }, receipts: receiptsRes.ok ? receiptsRes.data : { error: receiptsRes.error } },
      dex: { ...dex, volumeVerify: volumeRes.ok ? volumeRes.data : { error: volumeRes.error }, gridPublic: gridRes.ok ? gridRes.data : { error: (gridRes as any).error } },
      sources: [accountsRes, dgpoRes, delegsRes, bookRes, armyRes, dexRes, volumeRes, receiptsRes, gridRes].map((s) => ({ source: s.source, ok: s.ok, error: (s as any).error, at: s.at })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
