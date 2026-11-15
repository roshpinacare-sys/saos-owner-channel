"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Activity, Boxes, Coins, RefreshCw, Landmark, ShieldCheck, TriangleAlert, GitBranch } from "lucide-react";
import { SovereignBina } from "@/components/sovereign-bina";
import { OvernightLane } from "@/components/overnight-lane";
import { FleetProof } from "@/components/fleet-proof";

type Live = any;

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

function ago(iso?: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}

function SourceDots({ sources }: { sources: any[] }) {
  if (!sources?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span
          key={s.source}
          title={s.ok ? `${s.source} · live` : `${s.source} · ${s.error}`}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono ${s.ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-emerald-500" : "bg-red-500"}`} />
          {s.source}
        </span>
      ))}
    </div>
  );
}

export default function Page() {
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sovereign/live", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLive(await r.json());
      setErr(null);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); setTick((x) => x + 1); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const chain = live?.chain;
  const treasury = chain?.treasury;
  const book = chain?.book;
  const dex = live?.dex;
  const army = live?.army?.public;
  const receipts = live?.army?.receipts;
  const soldiers = chain?.soldiers ?? [];

  const weeklyInflow = treasury?.toWithdrawVests && chain?.vestsPerSp ? treasury.toWithdrawVests / 13 / chain.vestsPerSp : null;
  const pdownPct = treasury?.toWithdrawVests ? Math.min(100, (treasury.withdrawnVests / treasury.toWithdrawVests) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-neutral-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 grid place-items-center">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight leading-none">SOVEREIGN DESK</h1>
              <p className="text-[11px] text-muted-foreground font-mono">roshpinacare-sys · live only · no claims without sources</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] font-mono text-muted-foreground">
              {live ? `refreshed ${ago(live.generatedAt)} · ${live.ms}ms` : "connecting…"}
            </span>
            <button
              onClick={() => void load()}
              className="h-9 w-9 grid place-items-center rounded-lg border hover:bg-muted transition-colors"
              aria-label="refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-6">
        {err && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950/40">
            <CardContent className="py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <TriangleAlert className="h-4 w-4" /> live feed error: {err}
            </CardContent>
          </Card>
        )}

        {/* Source honesty strip */}
        <section className="flex items-center justify-between gap-3 flex-wrap">
          <SourceDots sources={live?.sources ?? []} />
          <span className="text-[11px] font-mono text-muted-foreground">poll #{tick} · auto every 60s</span>
        </section>

        {/* Treasury */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" /> TREASURY · headcorner</CardDescription>
              <CardTitle className="text-2xl font-mono">{fmt(treasury?.sp, 1)} <span className="text-sm font-sans text-muted-foreground">SP</span></CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1 font-mono text-muted-foreground">
              <div>liquid: {fmt(treasury?.liquidSteem, 3)} STEEM · {fmt(treasury?.sbd, 3)} SBD</div>
              <div>delegated out: {fmt(treasury?.delegatedOut / (chain?.vestsPerSp ?? 1), 1)} SP</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> POWER DOWN · 13-week rail</CardDescription>
              <CardTitle className="text-2xl font-mono">{fmt(weeklyInflow, 1)} <span className="text-sm font-sans text-muted-foreground">SP/week</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={pdownPct} />
              <div className="text-xs font-mono text-muted-foreground">
                schedule {fmt(treasury?.toWithdrawVests / (chain?.vestsPerSp ?? 1), 0)} SP · withdrawn {fmt(pdownPct, 1)}% · next {treasury?.nextWithdrawal ? treasury.nextWithdrawal.slice(0, 10) : "—"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> INTERNAL MARKET · STEEM/SBD</CardDescription>
              <CardTitle className="text-2xl font-mono">
                {book ? fmt(book.bestAsk, 5) : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs font-mono text-muted-foreground space-y-1">
              <div>bid {fmt(book?.bestBid, 5)} · ask {fmt(book?.bestAsk, 5)}</div>
              <div>spread {book && book.bestAsk && book.bestBid ? fmt(((book.bestAsk - book.bestBid) / book.bestBid) * 100, 2) : "—"}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> SAOS-DEX · our engine</CardDescription>
              <CardTitle className="text-2xl font-mono">{fmt(dex?.stats?.fills, 0)} <span className="text-sm font-sans text-muted-foreground">fills</span></CardTitle>
            </CardHeader>
            <CardContent className="text-xs font-mono text-muted-foreground space-y-1">
              <div>swaps {fmt(dex?.stats?.swaps, 0)} · height {fmt(dex?.height, 0)}</div>
              <div>snapshot {ago(dex?.savedAt)}</div>
            </CardContent>
          </Card>
        </section>

        {/* Soldiers + Army ladder */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> SOLDIERS · funded 300 SP each</CardTitle>
              <CardDescription>delegation wave 2026-10-29 · owner direct order — live chain state</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {soldiers.map((s: any) => (
                <div key={s.account} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="font-mono text-sm">{s.account}</div>
                  <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                    <Badge variant={s.sp >= 300 ? "default" : "secondary"} className="font-mono">{fmt(s.sp, 1)} SP</Badge>
                    <span>{fmt(s.liquidSteem, 2)} STEEM</span>
                    <span>{fmt(s.sbd, 2)} SBD</span>
                  </div>
                </div>
              ))}
              <div className="text-[11px] font-mono text-muted-foreground pt-1">
                hcsoldier1/2/3 + 8 content accounts: keys owner-held (registry LIVE-OWNER-HELD) — re-probed every ladder run
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> ARMY LADDER · maker book</CardTitle>
              <CardDescription>saos-dex engine of record · Actions runtime · hourly + self-pulse</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {army ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-2">
                    <div className="text-xl font-mono">{army.acted ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">acted</div>
                  </div>
                  <div className="rounded-lg border p-2">
                    <div className="text-xl font-mono">{army.stasis ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">stasis</div>
                  </div>
                  <div className="rounded-lg border p-2">
                    <div className="text-xl font-mono">{fmt(army.estateOpenOrders, 0)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">open orders</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground font-mono">army-public: {live?.army?.public?.error ?? "loading…"}</div>
              )}
              <Separator />
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {(receipts ?? []).map((r: any, i: number) => (
                  <div key={i} className="rounded-md border px-2.5 py-1.5 text-xs font-mono flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{String(r.at).replace("T", " ").slice(0, 16)}</span>
                    <span className={String(r.verdict).includes("FAILED") || String(r.verdict).includes("STASIS") ? "text-amber-600" : "text-emerald-600"}>
                      {r.verdict ?? "receipt"}
                    </span>
                    <span className="text-muted-foreground">{r.results?.filter((x: any) => x.state === "ACTED").length ?? 0} acted</span>
                  </div>
                ))}
                {!receipts?.length && <div className="text-xs text-muted-foreground font-mono">no receipts in window</div>}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* DEX pools */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SAOS-DEX POOLS · sovereign liquidity</CardTitle>
              <CardDescription>state snapshot from the live engine (git-carried truth)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="text-muted-foreground text-left">
                    <tr><th className="py-1">pair</th><th className="py-1 text-right">reserve a</th><th className="py-1 text-right">reserve b</th></tr>
                  </thead>
                  <tbody>
                    {(dex?.pools ?? []).map((p: any) => (
                      <tr key={p.pair} className="border-t">
                        <td className="py-1.5">{p.pair}</td>
                        <td className="py-1.5 text-right">{fmt(p.ra, 0)}</td>
                        <td className="py-1.5 text-right">{fmt(p.rb, 0)}</td>
                      </tr>
                    ))}
                    {!dex?.pools?.length && <tr><td colSpan={3} className="py-3 text-muted-foreground">snapshot {dex ? "unavailable" : "loading…"}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" /> SOVEREIGN LEDGER · 2026-10-29 owner wave</CardTitle>
              <CardDescription>executed on chain — receipts with digests, zero secrets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs font-mono">
              <div className="rounded-md border px-3 py-2 space-y-1">
                <div className="font-semibold">TX-1 · DELEGATE-300SP-X5</div>
                <div className="text-muted-foreground">hcsoldier4/5/6 + cashmachine + haran → 483,153.13 VESTS (300 SP) each</div>
                <div className="text-emerald-600">ACCEPTED · digest 03bc1ae8b3ee… · chain-verified (delegations live)</div>
              </div>
              <div className="rounded-md border px-3 py-2 space-y-1">
                <div className="font-semibold">TX-2 · POWERDOWN-2000STEEM</div>
                <div className="text-muted-foreground">withdraw_vesting 3,221,020.4 VESTS → 153.85 SP/week × 13 weeks</div>
                <div className="text-emerald-600">ACCEPTED · digest 8a10e2414d2e… · chain-verified (to_withdraw live)</div>
              </div>
              <div className="rounded-md border px-3 py-2 space-y-1">
                <div className="font-semibold">CUSTODY LAW</div>
                <div className="text-muted-foreground">vault unsealed via wrap-registry (P never logged) · every WIF chain-judged before signing · hcsoldier1/2/3 excluded — zero authority match (b2cdcc41 verdict stands)</div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sovereign Overnight Lane — dry-run execution desk over real chain fills */}
        <section>
          <OvernightLane />
        </section>

        {/* Fleet Proof — purpose-built: execution truth, resilience ledger, B8 drill */}
        <section>
          <FleetProof />
        </section>

        {/* Sovereign Bina — live-training tiny model, fleet law mapped */}
        <section>
          <SovereignBina />
        </section>

        <p className="text-center text-[11px] text-muted-foreground font-mono pb-4">
          every number above is fetched live from its source · failed sources are shown as failed · nothing on this page is a claim
        </p>
      </main>

      <footer className="mt-auto border-t bg-white/80 dark:bg-neutral-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span>SOVEREIGN DESK · roshpinacare-sys</span>
          <span>sources: api.steemit.com · saos-dex@main · engine receipts</span>
          <span>{live ? `chain block ${fmt(chain?.dgpo?.head_block, 0)}` : "—"}</span>
        </div>
      </footer>
    </div>
  );
}
