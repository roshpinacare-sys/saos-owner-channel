import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC = "https://api.steemit.com";

/**
 * SOVEREIGN OVERNIGHT LANE — dry-run by law.
 *
 * Engineering of the viral "overnight trading terminal" post at sovereign level:
 * real chain fills (SBD/STEEM internal market, 24h), deterministic passive-grid
 * replay under a hard-coded law, morning report where every number has a receipt
 * behind it. No keys, no orders, no claims — fail-closed.
 */
const LAW = {
  mode: "DRY-RUN",
  venue: "steem:internal-market SBD/STEEM",
  baseBudgetSbd: 100,
  orderSizeSbd: 5,
  gridStepPct: 0.006,
  maxOpenOrders: 6,
  dailyLossCapSbd: 8,
  feeBps: 0,
} as const;

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

async function safe<T>(label: string, fn: () => Promise<T>) {
  try {
    return { source: label, ok: true as const, data: await fn(), at: new Date().toISOString() };
  } catch (e) {
    return { source: label, ok: false as const, error: String((e as Error)?.message ?? e).slice(0, 160), at: new Date().toISOString() };
  }
}

type Fill = { date: string; price: number; sbd: number; steem: number };

/** Parse a condenser fill: one side pays SBD, the other STEEM. Price = SBD per STEEM. */
function parseFill(f: { current_pays: string; open_pays: string; date: string }): Fill | null {
  const num = (s: string) => parseFloat(s.split(" ")[0] ?? "");
  const cp = f.current_pays ?? "";
  const op = f.open_pays ?? "";
  const sbd = cp.endsWith("SBD") ? num(cp) : op.endsWith("SBD") ? num(op) : NaN;
  const steem = cp.endsWith("STEEM") ? num(cp) : op.endsWith("STEEM") ? num(op) : NaN;
  if (!Number.isFinite(sbd) || !Number.isFinite(steem) || steem <= 0) return null;
  return { date: f.date, price: sbd / steem, sbd, steem };
}

/**
 * Deterministic passive-grid replay over real fills.
 * Maker approximation: buys fill when a trade prints at/below the next grid
 * level; a lot closes when a trade prints at/above entry*(1+step).
 * Every action and every law-refusal is a receipt.
 */
function simulate(fills: Fill[]) {
  const receipts: {
    id: string; kind: "OPEN" | "CLOSE" | "BLOCKED" | "HALT";
    price: number; steem: number; sbd: number; ts: string; note?: string;
  }[] = [];

  let cash = LAW.baseBudgetSbd;
  const lots: { entry: number; steem: number; cost: number; ts: string }[] = [];
  let nextBuyLevel = fills.length ? fills[0].price : 0;
  let realized = 0;
  let closed = 0;
  let wins = 0;
  let blocked = 0;
  let halted = false;
  let equityPeak = LAW.baseBudgetSbd;
  let maxDrawdown = 0;
  let seq = 0;
  const rid = (k: string) => `${k}-${String(++seq).padStart(4, "0")}`;

  for (const f of fills) {
    // mark-to-market equity for drawdown tracking
    const eq = cash + lots.reduce((s, l) => s + l.steem * f.price, 0);
    if (eq > equityPeak) equityPeak = eq;
    const dd = equityPeak - eq;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // loss-cap: fail-closed halt, no new exposure beyond this point
    const totalPnl = realized + lots.reduce((s, l) => s + l.steem * f.price - l.cost, 0);
    if (!halted && totalPnl <= -LAW.dailyLossCapSbd) {
      halted = true;
      receipts.push({ id: rid("HALT"), kind: "HALT", price: f.price, steem: 0, sbd: 0, ts: f.date, note: "בלם הפסד — החוק עצר הכל" });
    }

    // closes first (risk off before risk on)
    for (let i = lots.length - 1; i >= 0; i--) {
      const l = lots[i];
      if (f.price >= l.entry * (1 + LAW.gridStepPct)) {
        const proceeds = l.steem * f.price;
        const pnl = proceeds - l.cost;
        realized += pnl;
        closed += 1;
        if (pnl > 0) wins += 1;
        cash += proceeds;
        lots.splice(i, 1);
        receipts.push({ id: rid("CLOSE"), kind: "CLOSE", price: f.price, steem: l.steem, sbd: proceeds, ts: f.date, note: `pnl ${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} SBD` });
      }
    }

    // buys: only when a real fill printed at/below the level (taker would have gone through us)
    if (f.price <= nextBuyLevel) {
      const canOpen = !halted && lots.length < LAW.maxOpenOrders && cash >= LAW.orderSizeSbd;
      if (canOpen) {
        const steem = LAW.orderSizeSbd / f.price;
        lots.push({ entry: f.price, steem, cost: LAW.orderSizeSbd, ts: f.date });
        cash -= LAW.orderSizeSbd;
        nextBuyLevel = nextBuyLevel * (1 - LAW.gridStepPct);
        receipts.push({ id: rid("OPEN"), kind: "OPEN", price: f.price, steem, sbd: LAW.orderSizeSbd, ts: f.date });
      } else {
        blocked += 1;
        receipts.push({
          id: rid("BLOCKED"), kind: "BLOCKED", price: f.price, steem: 0, sbd: 0, ts: f.date,
          note: halted ? "נחסם: בלם הפסד" : lots.length >= LAW.maxOpenOrders ? "נחסם: תקרת פוזיציות" : "נחסם: תקרת הון",
        });
      }
    }
  }

  const markPrice = fills.length ? fills[fills.length - 1].price : null;
  const openSteem = lots.reduce((s, l) => s + l.steem, 0);
  const openCost = lots.reduce((s, l) => s + l.cost, 0);
  const unrealized = markPrice !== null ? openSteem * markPrice - openCost : 0;

  return {
    closedCount: closed,
    realizedSbd: realized,
    winRate: closed ? wins / closed : 0,
    openCount: lots.length,
    openSteem,
    openCostSbd: openCost,
    markPrice,
    unrealizedSbd: unrealized,
    feesSbd: 0, // on-chain internal market fills carry no venue fee — honest zero
    blockedCount: blocked,
    halted,
    maxDrawdownSbd: maxDrawdown,
    receiptsCount: receipts.length,
    receipts: receipts.slice(-120),
  };
}

export async function GET() {
  const t0 = Date.now();
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 19);

  const [tickerRes, bookRes, fillsRes] = await Promise.all([
    safe("steem:ticker", () => rpc("condenser_api.get_ticker", [])),
    safe("steem:orderbook", () => rpc("condenser_api.get_order_book", [20])),
    safe("steem:trade-history-24h", () => rpc("condenser_api.get_trade_history", [iso(start), iso(end), 1000])),
  ]);

  const t: any = tickerRes.ok ? tickerRes.data : null;
  const b: any = bookRes.ok ? bookRes.data : null;

  const ticker = t
    ? {
        latest: parseFloat(t.latest),
        highestBid: parseFloat(t.highest_bid),
        lowestAsk: parseFloat(t.lowest_ask),
        percentChange: parseFloat(t.percent_change),
        sbdVolume: parseFloat(String(t.sbd_volume ?? "0").replace(" SBD", "")),
        steemVolume: parseFloat(String(t.steem_volume ?? "0").replace(" STEEM", "")),
      }
    : null;

  const mapLevel = (x: any) => ({ price: parseFloat(x.real_price), sbd: x.sbd / 1000, steem: x.steem / 1000 });
  const book = b
    ? {
        bids: (b.bids ?? []).map(mapLevel),
        asks: (b.asks ?? []).map(mapLevel),
      }
    : null;

  const rawFills: any[] = fillsRes.ok ? fillsRes.data : [];
  const fills = rawFills
    .map(parseFill)
    .filter((x): x is Fill => x !== null)
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date));

  const report = fills.length ? simulate(fills) : null;

  return NextResponse.json(
    {
      law: LAW,
      sources: [tickerRes, bookRes, fillsRes].map((s) => ({ source: s.source, ok: s.ok, ...(s.ok ? {} : { error: s.error }), at: s.at })),
      ticker,
      book,
      fills: {
        count: fills.length,
        from: fills.length ? fills[0].date : null,
        to: fills.length ? fills[fills.length - 1].date : null,
      },
      report: report ?? {
        closedCount: 0, realizedSbd: 0, winRate: 0, openCount: 0, openSteem: 0, openCostSbd: 0,
        markPrice: null, unrealizedSbd: 0, feesSbd: 0, blockedCount: 0, halted: false,
        maxDrawdownSbd: 0, receiptsCount: 0, receipts: [],
      },
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - t0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
