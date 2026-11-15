"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Moon, Scale, BookOpen, ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";

type Receipt = {
  id: string;
  kind: "OPEN" | "CLOSE" | "BLOCKED" | "HALT";
  price: number;
  steem: number;
  sbd: number;
  ts: string;
  note?: string;
};

type Overnight = {
  law: {
    mode: string;
    venue: string;
    baseBudgetSbd: number;
    orderSizeSbd: number;
    gridStepPct: number;
    maxOpenOrders: number;
    dailyLossCapSbd: number;
    feeBps: number;
  };
  sources: { source: string; ok: boolean; error?: string; at: string }[];
  ticker: null | {
    latest: number;
    highestBid: number;
    lowestAsk: number;
    percentChange: number;
    sbdVolume: number;
    steemVolume: number;
  };
  book: null | { bids: { price: number; sbd: number; steem: number }[]; asks: { price: number; sbd: number; steem: number }[] };
  fills: { count: number; from: string | null; to: string | null };
  report: {
    closedCount: number;
    realizedSbd: number;
    winRate: number;
    openCount: number;
    openSteem: number;
    openCostSbd: number;
    markPrice: number | null;
    unrealizedSbd: number;
    feesSbd: number;
    blockedCount: number;
    halted: boolean;
    maxDrawdownSbd: number;
    receiptsCount: number;
    receipts: Receipt[];
  };
};

const MAP: [string, string, string][] = [
  ["cryptofeed", "נתיב חי מהשרשרת (route live)", "https://github.com/bmoscon/cryptofeed"],
  ["ccxt", "מתאם RPC יחיד — חתימה אחת בלבד", "https://github.com/ccxt/ccxt"],
  ["freqtrade", "dry-run בחוק · fail-closed", "https://github.com/freqtrade/freqtrade"],
  ["vectorbt", "סריקת רשת דטרמיניסטית", "https://github.com/polakowo/vectorbt"],
  ["ta-lib", "אינדיקטורים local-only", "https://github.com/TA-Lib/ta-lib-python"],
  ["skfolio", "משקולות אוצר (owner-decided)", "https://github.com/skfolio/skfolio"],
  ["quantstats", "דוח הבוקר הזה — עם קבלה מאחורי כל מספר", "https://github.com/ranaroussi/quantstats"],
  ["duckdb", "פנקס ביצוע ניתן לשאילתה", "https://github.com/duckdb/duckdb"],
  ["apscheduler", "צי ה-cron שלנו (8 משמרות)", "https://github.com/agronholm/apscheduler"],
  ["lightweight-charts", "עומק ספר local (בלי CDN)", "https://github.com/tradingview/lightweight-charts"],
];

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

const sgn = (n: number, d = 3) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

function DepthBar({ side, rows }: { side: "bid" | "ask"; rows: { price: number; sbd: number; steem: number }[] }) {
  const max = Math.max(...rows.map((r) => r.sbd), 1);
  return (
    <div className="space-y-1" aria-label={`${side === "bid" ? "ביקוש" : "היצע"} — 5 שורות עליונות`}>
      {rows.map((r, i) => (
        <div key={i} className="relative h-5 flex items-center justify-between px-1.5 text-[11px] font-mono">
          <div
            className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-emerald-500/15" : "bg-red-500/15"}`}
            style={{ width: `${(r.sbd / max) * 100}%` }}
          />
          <span className="relative">{fmt(r.price, 5)}</span>
          <span className="relative text-muted-foreground">{fmt(r.sbd, 1)} SBD</span>
        </div>
      ))}
      {!rows.length && <div className="text-[11px] text-muted-foreground font-mono py-1">—</div>}
    </div>
  );
}

export function OvernightLane() {
  const [data, setData] = useState<Overnight | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sovereign/overnight", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setErr(null);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const law = data?.law;
  const rep = data?.report;
  const spreadBps =
    data?.ticker && data.ticker.lowestAsk > 0 && data.ticker.highestBid > 0
      ? ((data.ticker.lowestAsk - data.ticker.highestBid) / data.ticker.latest) * 10_000
      : null;
  const pnlColor = (rep?.realizedSbd ?? 0) + (rep?.unrealizedSbd ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";

  return (
    <section id="overnight-lane" className="space-y-4" aria-label="נתיב הלילה הריבוני — dry-run">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold tracking-wide font-mono">SOVEREIGN OVERNIGHT LANE · dry-run by law</h2>
          <Badge variant="outline" className="font-mono text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
            {law?.mode ?? "DRY-RUN"} · אף הזמנה לא נשלחת
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span>{data?.fills.count ?? 0} מילויים אמיתיים · 24h</span>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent transition-colors"
            aria-label="רענון נתיב הלילה"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden /> refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-600 dark:text-red-400">
          מקור נכשל (מוצג כנכשל): {err}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Law card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" aria-hidden /> חוק הלילה · מושל סיכונים</CardTitle>
            <CardDescription>מוגדר בקוד, לא בפרומפט — מנוע אחד מציע, הבעלים חותם</CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1.5">
            {[
              ["מצב", `${law?.mode ?? "—"} · fail-closed`],
              ["זירה", law?.venue ?? "—"],
              ["תקרת הון", `${fmt(law?.baseBudgetSbd, 0)} SBD`],
              ["גודל פקודה", `${fmt(law?.orderSizeSbd, 0)} SBD לכל רמה`],
              ["צעד רשת", `${((law?.gridStepPct ?? 0) * 100).toFixed(1)}%`],
              ["מקסימום פוזיציות פתוחות", `${law?.maxOpenOrders ?? "—"}`],
              ["בלם הפסד יומי", `${fmt(law?.dailyLossCapSbd, 0)} SBD → עצירה מלאה`],
              ["עמלת זירה", `${law?.feeBps ?? 0} bps — מילויים on-chain ללא עמלת בורסה`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right">{v}</span>
              </div>
            ))}
            <div className="pt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden /> מפתחות אף פעם לא בדסק · השרשרת היא השופטת היחידה
            </div>
          </CardContent>
        </Card>

        {/* Live book */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" aria-hidden /> הספר הפתוח · חי מהשרשרת</CardTitle>
            <CardDescription>
              {data?.ticker
                ? `אחרון ${fmt(data.ticker.latest, 5)} · spread ${fmt(spreadBps, 1)} bps · נפח 24h ${fmt(data.ticker.sbdVolume, 0)} SBD / ${fmt(data.ticker.steemVolume, 0)} STEEM`
                : "טוען…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground mb-1">ASKS (היצע)</div>
              <DepthBar side="ask" rows={data?.book?.asks?.slice(0, 5) ?? []} />
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground mb-1">BIDS (ביקוש)</div>
              <DepthBar side="bid" rows={data?.book?.bids?.slice(0, 5) ?? []} />
            </div>
          </CardContent>
        </Card>

        {/* Morning report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Moon className="h-4 w-4" aria-hidden /> דוח הבוקר · כל מספר עם ראיה</CardTitle>
            <CardDescription>
              {rep ? `${rep.receiptsCount} קבלות · סימולציה דטרמיניסטית על מילויים אמיתיים` : "טוען…"}
              {rep?.halted ? " · הושהה על ידי החוק (בלם הפסד)" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1.5">
            {[
              ["רווח סגור (realized)", `${sgn(rep?.realizedSbd ?? 0)} SBD מ-${rep?.closedCount ?? 0} עסקאות`],
              ["פתוח (mark-to-market)", `${sgn(rep?.unrealizedSbd ?? 0)} SBD · ${fmt(rep?.openSteem, 2)} STEEM ב-${fmt(rep?.markPrice, 5)}`],
              ["עמלות", `${fmt(rep?.feesSbd, 3)} SBD (on-chain, 0 bps)`],
              ["נכשלו / נחסמו על ידי החוק", `${rep?.blockedCount ?? 0}`],
              ["אחוז הצלחה", `${fmt((rep?.winRate ?? 0) * 100, 1)}%`],
              ["שיא שפיעה (drawdown)", `${fmt(rep?.maxDrawdownSbd, 3)} SBD`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className={`text-right ${k.startsWith("רווח") ? pnlColor : ""}`}>{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Receipts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" aria-hidden /> קבלות ביצוע</CardTitle>
            <CardDescription>כל מילוי מדומה מתועד — כותרת בלי ראיה אינה טענה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-y-auto pr-1 [scrollbar-width:thin]">
              <table className="w-full text-[11px] font-mono">
                <thead className="text-muted-foreground text-left sticky top-0 bg-background">
                  <tr><th className="py-1">סוג</th><th className="py-1 text-right">מחיר</th><th className="py-1 text-right">STEEM</th><th className="py-1 text-right">SBD</th><th className="py-1 text-right">זמן</th></tr>
                </thead>
                <tbody>
                  {(data?.report?.receipts ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5">
                        <span
                          className={`rounded px-1 py-0.5 text-[10px] ${
                            r.kind === "OPEN" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : r.kind === "CLOSE" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {r.kind}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">{fmt(r.price, 5)}</td>
                      <td className="py-1.5 text-right">{fmt(r.steem, 2)}</td>
                      <td className="py-1.5 text-right">{fmt(r.sbd, 2)}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{r.ts?.slice(5, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                  {!data?.report?.receipts?.length && (
                    <tr><td colSpan={5} className="py-3 text-muted-foreground">{loading ? "טוען…" : "אין מילויים בחלון — מוצג כהווי"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 10 building blocks → sovereign mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">עשרת אבני הבניין → ההנדסה הריבונית</CardTitle>
          <CardDescription>כל ריפו אומת מול GitHub API · הגרסה שלנו: local-only, קבלות, fail-closed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] font-mono">
            {MAP.map(([repo, ours, url]) => (
              <div key={repo} className="flex items-baseline justify-between gap-2 border-b last:border-0">
                <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-primary transition-colors">{repo}</a>
                <span className="text-right text-muted-foreground">{ours}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground font-mono">
        dry-run בלבד · מילויים אמיתיים מהשרשרת, הזמנות מדומות · אף מפתח לא נוגע · השרשרת היא השופטת היחידה
      </p>
    </section>
  );
}
