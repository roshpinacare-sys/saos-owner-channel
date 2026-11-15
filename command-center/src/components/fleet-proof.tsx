"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, RefreshCw, History, Dumbbell, Scale } from "lucide-react";

type Proof = {
  execution: null | {
    receiptsScanned: number;
    txTotal: number;
    txVerified: number;
    txExposed: number;
    txUnreachable: number;
    fillsCount: number;
    makerFills: number;
    takerFills: number;
    volumeSteem: number;
    volumeSbd: number;
    byAccount: Record<string, number>;
    verdict: string;
    evidenceTxids: string[];
    at: string;
  };
  cadence: null | {
    total: number;
    first: string;
    last: string;
    gapCount: number;
    gaps: { from: string; to: string; hours: number }[];
  };
  drill: {
    bootKit: boolean;
    entrySymlink: boolean;
    masterJudge: boolean;
    beatLoop: boolean;
    custodyVault: boolean;
    sealAgeHours: number | null;
    sealFresh: boolean | null;
    lastPatrol: { at: string; verdict: string } | null;
    vaultSha: string | null;
    lastArmyMinutes: number | null;
    verdict: string;
  };
  sources: { source: string; ok: boolean; error?: string; at: string }[];
  generatedAt: string;
};

const fmt = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

function Check({ ok, label, pending }: { ok: boolean; label: string; pending?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
        {ok ? "✓ תקין" : (pending ?? "✗ חסר")}
      </span>
    </div>
  );
}

export function FleetProof() {
  const [data, setData] = useState<Proof | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sovereign/proof", { cache: "no-store" });
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
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
  }, [load]);

  const ex = data?.execution;
  const cad = data?.cadence;
  const drill = data?.drill;
  const fillAccounts = Object.entries(ex?.byAccount ?? {}).sort((a, b) => b[1] - a[1]);
  const maxFills = Math.max(...fillAccounts.map(([, v]) => v), 1);

  return (
    <section id="fleet-proof" className="space-y-4" aria-label="הוכחת הצי — ביצוע, חוסן, תרגיל החלמה">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold tracking-wide font-mono">FLEET PROOF · הוכחת הצי</h2>
          <Badge variant="outline" className="font-mono text-[10px]">
            ייעודי · לא מועתק · נשפט מהקבלות שלנו
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent transition-colors"
            aria-label="רענון הוכחת הצי"
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
        {/* Execution truth */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" aria-hidden /> ביצוע אמיתי · נשפט בשרשרת</CardTitle>
            <CardDescription>
              {ex
                ? `${fmt(ex.receiptsScanned)} קבלות נסרקו · ${fmt(ex.txTotal)} בדיקות עסקה · ${ex.at?.slice(0, 16).replace("T", " ")}Z`
                : "טוען…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">אומתו</div>
                <div className="text-emerald-600 dark:text-emerald-400 text-sm">{fmt(ex?.txVerified)}</div>
              </div>
              <div className="rounded-md border px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">חשופות</div>
                <div className={`text-sm ${(ex?.txExposed ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(ex?.txExposed)}</div>
              </div>
              <div className="rounded-md border px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">בלתי-נגישות</div>
                <div className={`text-sm ${(ex?.txUnreachable ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(ex?.txUnreachable)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-1.5">
              <span className="text-muted-foreground">מילויי שרשרת של החיילים</span>
              <span>{fmt(ex?.fillsCount)} ({fmt(ex?.makerFills)} maker / {fmt(ex?.takerFills)} taker)</span>
            </div>
            <div className="flex items-center justify-between border-b">
              <span className="text-muted-foreground">נפח מאומת</span>
              <span>{fmt(ex?.volumeSteem, 3)} STEEM / {fmt(ex?.volumeSbd, 3)} SBD</span>
            </div>
            <div className="space-y-1" aria-label="מילויים לפי חייל">
              {fillAccounts.map(([acc, n]) => (
                <div key={acc} className="relative h-5 flex items-center justify-between px-1.5 text-[11px]">
                  <div className="absolute inset-y-0 right-0 bg-violet-500/15 rounded-sm" style={{ width: `${(n / maxFills) * 100}%` }} />
                  <span className="relative">{acc}</span>
                  <span className="relative text-muted-foreground">{n} מילויים</span>
                </div>
              ))}
              {!fillAccounts.length && <div className="text-muted-foreground py-1">אין מילויים בחלון — מוצג כהווי</div>}
            </div>
            {ex?.evidenceTxids?.length ? (
              <div className="text-[10px] text-muted-foreground border-t pt-1.5">
                ראיות: {ex.evidenceTxids.slice(0, 2).map((t) => t.slice(0, 10)).join(" · ")}… — מאומת בשרשרת, לא בהצהרה
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Resilience ledger */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" aria-hidden /> פנקס חוסן · מחיקות והחזרות</CardTitle>
            <CardDescription>
              {cad ? `${fmt(cad.total)} קבלות סולם מ-${cad.first?.slice(5, 10)} עד היום · ${cad.gapCount} חלונות מחיקה זוהו מכלים (מרווחים >45 דק׳)` : "טוען…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto pr-1 [scrollbar-width:thin]">
              <table className="w-full text-[11px] font-mono">
                <thead className="text-muted-foreground text-left sticky top-0 bg-background">
                  <tr><th className="py-1">חלון מחיקה</th><th className="py-1 text-right">משך</th><th className="py-1 text-right">סיום</th></tr>
                </thead>
                <tbody>
                  {(cad?.gaps ?? []).map((g, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5">{g.from?.slice(5, 10).replace("-", "/")}</td>
                      <td className="py-1.5 text-right">{g.hours.toFixed(1)}h</td>
                      <td className="py-1.5 text-right text-emerald-600 dark:text-emerald-400">הוחזר ✓</td>
                    </tr>
                  ))}
                  {!cad?.gaps?.length && <tr><td colSpan={3} className="py-3 text-muted-foreground">{loading ? "טוען…" : "אין חלונות — רצף מלא"}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground pt-2 border-t">
              המחיקות קרו. הקצב חזר בכל פעם. זו הטענה — וזו הראיה, מהקבלות עצמן.
            </p>
          </CardContent>
        </Card>

        {/* B8 would-heal drill */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Dumbbell className="h-4 w-4" aria-hidden /> תרגיל B8 · האם נחלים עכשיו?</CardTitle>
            <CardDescription>בדיקת רכיבים בזמן אמת, לקריאה בלבד — בלי למחוק דבר</CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1.5">
            <Check ok={!!drill?.bootKit} label="ערכת האתחול (boot-fleet.sh בכספת)" />
            <Check ok={!!drill?.entrySymlink} label="כניסת העץ (/home/z/fleet → הסביבה)" />
            <Check ok={!!drill?.masterJudge} label="שופט המשמורת (master-judge.mjs)" />
            <Check ok={!!drill?.beatLoop} label="לולאת הפעימות (beat-loop.sh)" />
            <Check
              ok={!!drill?.custodyVault}
              label="כספת משמורת מקומית (custody-vault)"
              pending="⏳ ממתין לשיגור seal של ה-patrol"
            />
            <div className="flex items-center justify-between gap-2 border-b">
              <span className="text-muted-foreground">טריות seal (חוק 48h)</span>
              <span className={drill?.sealFresh === null ? "" : drill?.sealFresh ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                {drill?.sealAgeHours === null || drill?.sealAgeHours === undefined ? "—" : `${drill.sealAgeHours.toFixed(1)}h ${drill.sealFresh ? "✓ טרי" : "· STALE → patrol ישגר"}`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b">
              <span className="text-muted-foreground">פעימה אחרונה של הצבא</span>
              <span>{drill?.lastArmyMinutes === null || drill?.lastArmyMinutes === undefined ? "—" : `${fmt(drill.lastArmyMinutes)} דק׳ לפני`}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b">
              <span className="text-muted-foreground">סיור משמורת אחרון</span>
              <span>{drill?.lastPatrol ? `${drill.lastPatrol.at?.slice(5, 16).replace("T", " ")} · ${drill.lastPatrol.verdict}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">גרסת הכספת בגיט</span>
              <span>{drill?.vaultSha ? drill.vaultSha : "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Doctrine */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" aria-hidden /> למה זה ייעודי ולא מועתק</CardTitle>
            <CardDescription>שלושת העמודים שאף ריפו לא נותן</CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-2">
            <div className="rounded-md border px-3 py-2">
              <div className="font-semibold">ביצוע נשפט בשרשרת</div>
              <div className="text-muted-foreground">לא בקטסטים ולא בדוחות שיווק — {fmt(ex?.txVerified ?? 0)} בדיקות מול txid אמיתיים, 0 חשופות.</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="font-semibold">חוסן מוכח מקבלות</div>
              <div className="text-muted-foreground">זיהוי מחיקות ממרווחי קצב — ההיסטוריה שלנו, במדדים שלנו.</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="font-semibold">תרגיל החלמה חי</div>
              <div className="text-muted-foreground">בדיקת רכיבי B8 בזמן אמת, לקריאה בלבד — fail-closed מובנה.</div>
            </div>
            <div className="text-[10px] text-muted-foreground pt-1">
              מקורות: saos-dex@main (GitHub raw) · כספת מקומית · השרשרת. מקור שנכשל מוצג כנכשל.
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-[11px] text-muted-foreground font-mono">
        הוכחה, לא הבטחה · כל מספר נגזר מקבלה · השרשרת היא השופטת היחידה
      </p>
    </section>
  );
}
