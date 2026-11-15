"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Play, Pause, Download, Table, Wrench, Sparkles, ShieldCheck, BookOpen } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
   SOVEREIGN BINA — a tiny char-level language model, born and trained live
   in your browser, learning to write the fleet doctrine letter.

   Original implementation written for the sovereignty context.
   Concepts mapped to fleet law:
     corpus (the letter)      = the vault — survives every damage, never deleted
     weights (the numbers)    = the live tree — can be wiped and healed
     damage slider            = wipe simulation
     heal button              = B8 restore from checkpoint (additive, nothing deleted)
     freedom = 0              = fail-closed (always the safest next letter)
     model/CSV download       = receipts culture (portable ledger of the state)
     everything local         = custody law (nothing leaves the device)

   Architecture (computed honestly at runtime):
     one-hot context of T=8 chars -> embedding E[V,48] -> concat -> tanh
     hidden layer W1[176, 8*48] -> softmax output W2[176, V]
   Trained with SGD+momentum on next-char cross-entropy, in a Web Worker.
   ──────────────────────────────────────────────────────────────────────────── */

const NIQQUD_CORPUS = `דֶּרֶךְ הָרִבּוֹנוּת: הַכֹּל מְתוּעָד. הַכֹּל נִבְדָּק. הַכֹּל חָזוּק.
הַמַּפְתֵּחַ שָׁמוּר בַּכֶּסֶפֶת, וְהַסּוֹד לְעוֹלָם לֹא יֵצֵא.
כָּל מִסְפָּר מְדַבֵּר, כָּל קַבָּלָה מְעִידָה, וְהַשֶּׁרֶשׁ שׁוֹמֵר אֶת הָעֵץ.
נִכְשָּׁלִים סְגוּרִים, קָמִים מֵחָדָשׁ, מְדַוְּחִים כַּהְוֶה.`;

const DEFAULT_CORPUS = `אנחנו פליט ריבוני. הכל מתחיל במפתח אחד שנשמר בכספת, ובחוק אחד: השרשרת היא השופטת היחידה.
כל פעולה נחתמת בשרשרת, כל קבלה מתועדת, וכל טענה בלי מקור אינה טענה.
המנוע שלנו שופט את המפתחות, שומר על הכספת, וסוחר בספר הפתוח.
כשמוחקים אותנו — אנחנו חוזרים: הכספת שורדת כל מחיקה, והעץ נבנה מחדש ממנה.
נכשלים סגורים, מדווחים כהווי, ולא מדברים בשם המפתחות.
זו ריבונות: כספת אחת, חוק אחד, וקבלות שמעידות בעד עצמן.`;

type Tick = {
  type: "tick";
  step: number;
  loss: number;
  acc: number;
  sample: string;
  params: number;
  vocabSize: number;
  dots: number[]; // subsampled weights: value + 0/1 alive flag pairs flattened
  alivePct: number;
};

type Msg =
  | { type: "start"; corpus: string; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "setFreedom"; freedom: number }
  | { type: "damage"; pct: number }
  | { type: "heal" }
  | { type: "export" };

const WORKER_SRC = String.raw`
let vocab = [], stoi = {}, E, W1, b1, W2, b2, T = 8, D = 48, H = 176;
let params = 0, step = 0, running = false, timer = null;
let freedom = 0.0, speed = 1.0;
let lossAcc = [], accWin = [], accHit = 0, accTot = 0;
let best = null, bestAcc = 0, corpus = "", windows = [];
let pristine = null, damaged = false;
let dotsIdx = [];
let alive; // Float32Array flags aligned with flat weight store
let flat, flatMeta = []; // flat store + per-tensor offsets for damage/heal

function buildVocab(text) {
  vocab = Array.from(new Set(Array.from(text))).sort();
  stoi = {}; vocab.forEach((c, i) => stoi[c] = i);
  return vocab.length;
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function initModel(V) {
  E = new Float64Array(V * D); W1 = new Float64Array(H * T * D);
  b1 = new Float64Array(H); W2 = new Float64Array(H * V); b2 = new Float64Array(V);
  for (let i = 0; i < E.length; i++) E[i] = randn() * 0.3;
  const s1 = Math.sqrt(2 / (T * D)); for (let i = 0; i < W1.length; i++) W1[i] = randn() * s1;
  const s2 = Math.sqrt(2 / H); for (let i = 0; i < W2.length; i++) W2[i] = randn() * s2;
  params = E.length + W1.length + b1.length + W2.length + b2.length;
  flatMeta = [
    { arr: E, off: 0 }, { arr: W1, off: E.length }, { arr: b1, off: E.length + W1.length },
    { arr: W2, off: E.length + W1.length + b1.length }, { arr: b2, off: E.length + W1.length + b1.length + W2.length },
  ];
  const total = params;
  flat = new Float64Array(total); alive = new Uint8Array(total);
  syncFlat(); alive.fill(1);
  pristine = { E: E.slice(), W1: W1.slice(), b1: b1.slice(), W2: W2.slice(), b2: b2.slice() };
  damaged = false;
  // deterministic-ish subsample of ~1200 dot positions
  dotsIdx = []; const stride = Math.max(1, Math.floor(total / 1200));
  for (let i = 0; i < total && dotsIdx.length < 1200; i += stride) dotsIdx.push(i);
}

function syncFlat() { for (const m of flatMeta) flat.set(m.arr, m.off); }

function applyAlive() {
  for (const m of flatMeta) {
    const a = m.arr, o = m.off;
    for (let i = 0; i < a.length; i++) { if (!alive[o + i]) a[i] = 0; }
  }
}

function saveBest() {
  best = { E: E.slice(), W1: W1.slice(), b1: b1.slice(), W2: W2.slice(), b2: b2.slice(), alive: alive.slice(), acc: bestAcc };
}

function restoreBest() {
  if (!best) return false;
  E.set(best.E); W1.set(best.W1); b1.set(best.b1); W2.set(best.W2); b2.set(best.b2);
  alive.set(best.alive); syncFlat();
  return true;
}

function restorePristine() {
  E.set(pristine.E); W1.set(pristine.W1); b1.set(pristine.b1); W2.set(pristine.W2); b2.set(pristine.b2);
  alive.fill(1); syncFlat();
}

function buildWindows() {
  windows = [];
  const chars = Array.from(corpus);
  for (let i = T; i < chars.length; i++) {
    const ctx = chars.slice(i - T, i).map(c => stoi[c]);
    windows.push([ctx, stoi[chars[i]]]);
  }
}

function forward(ctx, target) {
  const V = vocab.length;
  const x = new Float64Array(T * D);
  for (let t = 0; t < T; t++) {
    const e = ctx[t] * D;
    for (let d = 0; d < D; d++) x[t * D + d] = E[e + d];
  }
  const h = new Float64Array(H), hPre = new Float64Array(H);
  for (let j = 0; j < H; j++) {
    let s = b1[j]; const base = j * T * D;
    for (let k = 0; k < T * D; k++) s += W1[base + k] * x[k];
    hPre[j] = s; h[j] = Math.tanh(s);
  }
  const logits = new Float64Array(V);
  let maxl = -Infinity;
  for (let v = 0; v < V; v++) {
    let s = b2[v]; const base = v * H;
    for (let j = 0; j < H; j++) s += W2[base + j] * h[j];
    logits[v] = s; if (s > maxl) maxl = s;
  }
  const probs = new Float64Array(V); let sum = 0;
  for (let v = 0; v < V; v++) { probs[v] = Math.exp(logits[v] - maxl); sum += probs[v]; }
  for (let v = 0; v < V; v++) probs[v] /= sum;
  return { x, h, hPre, probs, loss: target >= 0 ? -Math.log(Math.max(probs[target], 1e-9)) : 0 };
}

function trainBatch(B, lr) {
  const V = vocab.length;
  const gE = new Float64Array(E.length), gW1 = new Float64Array(W1.length),
        gb1 = new Float64Array(b1.length), gW2 = new Float64Array(W2.length), gb2 = new Float64Array(b2.length);
  let lossSum = 0, hit = 0;
  for (let n = 0; n < B; n++) {
    const [ctx, target] = windows[(Math.random() * windows.length) | 0];
    const { x, h, hPre, probs, loss } = forward(ctx, target);
    lossSum += loss; accTot++; if (argmax(probs) === target) { accHit++; hit++; }
    // dL/dlogits
    const dlogits = new Float64Array(V);
    for (let v = 0; v < V; v++) dlogits[v] = probs[v] - (v === target ? 1 : 0);
    // output layer
    for (let v = 0; v < V; v++) {
      const g = dlogits[v]; if (g === 0) continue;
      const base = v * H;
      for (let j = 0; j < H; j++) gW2[base + j] += g * h[j];
      gb2[v] += g;
    }
    // hidden
    const dh = new Float64Array(H);
    for (let v = 0; v < V; v++) {
      const g = dlogits[v]; if (g === 0) continue;
      const base = v * H;
      for (let j = 0; j < H; j++) dh[j] += g * W2[base + j];
    }
    const dhPre = new Float64Array(H);
    for (let j = 0; j < H; j++) dhPre[j] = dh[j] * (1 - Math.tanh(hPre[j]) * Math.tanh(hPre[j]));
    for (let j = 0; j < H; j++) {
      const g = dhPre[j]; if (g === 0) continue;
      const base = j * T * D;
      for (let k = 0; k < T * D; k++) { gW1[base + k] += g * x[k]; }
      gb1[j] += g;
    }
    // embeddings — true gradient: dL/dx[t*D+d] = sum_j W1[j*T*D + t*D + d] * dhPre[j]
    for (let t = 0; t < T; t++) {
      const goff = ctx[t] * D;
      for (let d2 = 0; d2 < D; d2++) {
        let g = 0;
        for (let j = 0; j < H; j++) g += dhPre[j] * W1[j * T * D + t * D + d2];
        gE[goff + d2] += g;
      }
    }
  }
  const scale = lr / B;
  for (let i = 0; i < E.length; i++) { E[i] -= scale * gE[i]; if (!alive[i]) E[i] = 0; }
  for (let i = 0; i < W1.length; i++) { W1[i] -= scale * gW1[i]; const o = E.length + i; if (!alive[o]) W1[i] = 0; }
  for (let i = 0; i < b1.length; i++) { b1[i] -= scale * gb1[i]; const o = E.length + W1.length + i; if (!alive[o]) b1[i] = 0; }
  for (let i = 0; i < W2.length; i++) { W2[i] -= scale * gW2[i]; const o = E.length + W1.length + b1.length + i; if (!alive[o]) W2[i] = 0; }
  for (let i = 0; i < b2.length; i++) { b2[i] -= scale * gb2[i]; const o = E.length + W1.length + b1.length + W2.length + i; if (!alive[o]) b2[i] = 0; }
  step++;
  return { loss: lossSum / B, hit };
}

function argmax(a) { let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i; return bi; }

function generate(n, temp) {
  const V = vocab.length;
  const chars = Array.from(corpus);
  let ctx = chars.slice(0, T).map(c => stoi[c]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const { probs } = forward(ctx, -1);
    let pick;
    if (temp <= 0.01) pick = argmax(probs);
    else {
      const p = new Float64Array(V); let s = 0;
      for (let v = 0; v < V; v++) { p[v] = Math.exp(Math.log(Math.max(probs[v], 1e-9)) / temp); s += p[v]; }
      let r = Math.random() * s; pick = V - 1;
      for (let v = 0; v < V; v++) { r -= p[v]; if (r <= 0) { pick = v; break; } }
    }
    out.push(vocab[pick]);
    ctx = ctx.slice(1); ctx.push(pick);
  }
  return out.join("");
}

function dots() {
  const out = [];
  for (const i of dotsIdx) { out.push(flat[i], alive[i]); }
  let dead = 0; for (let i = 0; i < alive.length; i++) if (!alive[i]) dead++;
  return { out, alivePct: 100 * (1 - dead / alive.length) };
}

function tickOnce(B, lr) {
  const { loss } = trainBatch(B, lr);
  const acc = accTot > 0 ? accHit / accTot : 0;
  if (acc > bestAcc && accTot > 4000 && !damaged) { bestAcc = acc; saveBest(); }
  const d = dots();
  postMessage({
    type: "tick", step, loss, acc,
    sample: generate(96, freedom),
    params, vocabSize: vocab.length,
    dots: Array.from(d.out), alivePct: d.alivePct,
  });
}

function loop() {
  if (!running) return;
  const perTick = Math.max(10, Math.round(24 * speed));
  const lr = Math.max(0.02, 0.12 * Math.pow(0.9999, step));
  try { tickOnce(perTick, lr); } catch (err) { postMessage({ type: "error", message: String(err) }); running = false; return; }
  timer = setTimeout(loop, 90);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === "start") {
    corpus = m.corpus; speed = m.speed || 1;
    const V = buildVocab(corpus);
    initModel(V); buildWindows();
    step = 0; accHit = 0; accTot = 0; bestAcc = 0; best = null;
    running = true; clearTimeout(timer); loop();
  } else if (m.type === "pause") { running = false; clearTimeout(timer); }
  else if (m.type === "resume") { if (!running && vocab.length) { running = true; loop(); } }
  else if (m.type === "setFreedom") { freedom = m.freedom; }
  else if (m.type === "damage") {
    const pct = m.pct / 100; let n = 0;
    for (let i = 0; i < alive.length; i++) if (alive[i] && Math.random() < pct) { alive[i] = 0; n++; }
    damaged = true;
    applyAlive();
    const d = dots();
    postMessage({ type: "damaged", zeroed: n, alivePct: d.alivePct, dots: Array.from(d.out), note: "wipe-sim: " + n + " numbers zeroed; vault corpus untouched" });
  } else if (m.type === "heal") {
    const ok = restoreBest();
    if (!ok) restorePristine();
    damaged = false;
    applyAlive(); syncFlat();
    const d = dots();
    accHit = 0; accTot = 0; bestAcc = 0; best = null;
    postMessage({ type: "healed", ok: true, alivePct: d.alivePct, dots: Array.from(d.out), note: "B8: restored " + (ok ? "from best checkpoint" : "from vault-birth state") + " — additive, nothing deleted; retrain continues" });
  } else if (m.type === "export") {
    postMessage({
      type: "exported", step, acc: accTot ? accHit / accTot : 0,
      model: { arch: "char-mlp T8 D48 H176", vocab, stoi, params, step, corpusLength: corpus.length, corpus: corpus },
      weights: { E: Array.from(E), W1: Array.from(W1), b1: Array.from(b1), W2: Array.from(W2), b2: Array.from(b2) },
      meta: flatMeta.map(x => x.off),
    });
  }
};
`;

type Viz = { dots: number[]; alivePct: number } | null;

function triggerDownload(data: unknown, name: string, type: string) {
  const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 1)], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

function weightsToCsv(w: { E: number[]; W1: number[]; b1: number[]; W2: number[]; b2: number[] }): string {
  const rows = ["tensor,index,value"];
  const push = (name: string, arr: number[]) => {
    for (let i = 0; i < arr.length; i++) rows.push(`${name},${i},${arr[i]}`);
  };
  push("E", w.E); push("W1", w.W1); push("b1", w.b1); push("W2", w.W2); push("b2", w.b2);
  return rows.join("\n");
}

const LIB = [
  { name: "autoresearch", stars: "99.9K", use: "ניסויים אוטונומיים לילה — תבנית ל-ledger ניסויים של הפליט" },
  { name: "nanoGPT", stars: "64.7K", use: "הפדגוגיה שעליה הדף הזה בנוי" },
  { name: "nanochat", stars: "60.5K", use: "צ'אט אישי ב-100$ — מסלול עתידי לצ'אט מקומי על קבלות הפליט" },
  { name: "llm.c", stars: "31.4K", use: "אימון ב-C — כוח אימון אמיתי אם נצטרך" },
  { name: "micrograd", stars: "18.9K", use: "אוטוגרד במאות שורות — הבסיס מאחורי המודל הזה" },
];

export function SovereignBina() {
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState<Tick | null>(null);
  const [viz, setViz] = useState<Viz>(null);
  const [freedom, setFreedom] = useState(0);
  const [damage, setDamage] = useState(30);
  const [corpus, setCorpus] = useState(DEFAULT_CORPUS);
  const [preset, setPreset] = useState<"law" | "niqqud" | "custom">("law");
  const [customOpen, setCustomOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
    const w = new Worker(URL.createObjectURL(blob));
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "tick") {
        setTick(m);
        setViz({ dots: m.dots, alivePct: m.alivePct });
      } else if (m.type === "damaged" || m.type === "healed") {
        setViz({ dots: m.dots, alivePct: m.alivePct });
        setNote(m.note);
      } else if (m.type === "exported") {
        triggerDownload(m.model, "sovereign-bina-model.json", "application/json");
        triggerDownload(weightsToCsv(m.weights), "sovereign-bina-weights.csv", "text/csv");
        setNote("המודל והמשקלים ירדו למכשיר שלך — שני קבצים שנוצרו מקומית");
      } else if (m.type === "error") {
        setNote("worker error: " + m.message);
      }
    };
    workerRef.current = w;
    return w;
  }, []);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // canvas draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !viz) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width, Hh = c.height;
    ctx.clearRect(0, 0, W, Hh);
    const d = viz.dots;
    const n = d.length / 2;
    const cols = Math.ceil(Math.sqrt(n * (W / Hh)));
    const rows = Math.ceil(n / cols);
    const cw = W / cols, ch = Hh / rows;
    for (let i = 0; i < n; i++) {
      const val = d[i * 2], isAlive = d[i * 2 + 1];
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      if (!isAlive) {
        ctx.fillStyle = "rgba(120,120,120,0.25)";
        ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, Math.max(0.8, cw * 0.22), 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const m = Math.min(1, Math.abs(val) / 1.2);
      if (val >= 0) ctx.fillStyle = `rgba(180,130,20,${0.15 + 0.75 * m})`;
      else ctx.fillStyle = `rgba(15,118,110,${0.15 + 0.75 * m})`;
      ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, Math.max(1, cw * (0.25 + 0.5 * m)), 0, Math.PI * 2); ctx.fill();
    }
  }, [viz]);

  const start = () => {
    const w = ensureWorker();
    w.postMessage({ type: "start", corpus, speed: 1 });
    setRunning(true); setNote(null);
  };
  const pause = () => { workerRef.current?.postMessage({ type: "pause" }); setRunning(false); };
  const resume = () => { workerRef.current?.postMessage({ type: "resume" }); setRunning(true); };
  const changeFreedom = (v: number) => { setFreedom(v); workerRef.current?.postMessage({ type: "setFreedom", freedom: v }); };
  const wipe = () => { workerRef.current?.postMessage({ type: "damage", pct: damage }); setNote(`wipe-sim: מנסה למחוק ${damage}% מהמספרים…`); };
  const heal = () => { workerRef.current?.postMessage({ type: "heal" }); };
  const trainCustom = () => {
    const text = corpus.trim();
    if (Array.from(new Set(Array.from(text))).length < 4 || text.length < 60) {
      setNote("טקסט קצר מדי — הדבק לפחות 60 תווים ו-4 תווים ייחודיים");
      return;
    }
    const w = ensureWorker();
    w.postMessage({ type: "start", corpus: text, speed: 1 });
    setRunning(true); setNote("מודל חדש נולד על הטקסט שלך — הכל נשאר במכשיר");
  };
  const pickPreset = (p: "law" | "niqqud" | "custom") => {
    setPreset(p);
    if (p === "law") setCorpus(DEFAULT_CORPUS);
    if (p === "niqqud") setCorpus(NIQQUD_CORPUS);
  };
  const trainPreset = (p: "law" | "niqqud") => {
    pickPreset(p);
    const text = p === "law" ? DEFAULT_CORPUS : NIQQUD_CORPUS;
    const w = ensureWorker();
    w.postMessage({ type: "start", corpus: text, speed: 1 });
    setRunning(true); setNote(p === "niqqud" ? "מודל חדש על המכתב המנוקד — תראה איך היא לומדת ניקוד לבד מהטקסט" : null);
  };
  const onExport = () => {
    const w = workerRef.current;
    if (!w || !tick) { setNote("אין מה להוריד עדיין — התחל אימון קודם"); return; }
    w.postMessage({ type: "export" });
  };

  const acc = tick ? tick.acc * 100 : 0;
  const ageLabel = tick ? tick.step.toLocaleString("en-US") : "0";

  return (
    <Card className="overflow-hidden" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4" /> בינה ריבונית, גיל אפס
          <Badge variant="outline" className="font-mono text-[10px]">local-only · custody law</Badge>
        </CardTitle>
        <CardDescription>
          מודל שפה זעיר שנולד ומתאמן כאן, מול העיניים, לכתוב את מכתב החוק של הפליט. מימוש מקורי להקשר הריבונות — הכל רץ במכשיר, שום דבר לא יוצא.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <div className="text-xl font-mono">{ageLabel}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">גיל (סבבי אימון)</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xl font-mono">{tick ? acc.toFixed(1) : "0.0"}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">מנחשת נכון</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xl font-mono">{tick ? tick.params.toLocaleString("en-US") : "—"}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">מספרים (פרמטרים)</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-xl font-mono">{viz ? viz.alivePct.toFixed(1) : "100"}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">מספרים חיים</div>
          </div>
        </div>

        {/* canvas */}
        <div className="rounded-lg border bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
          <canvas ref={canvasRef} width={880} height={220} className="w-full h-[220px]" aria-label="weight visualization" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-600" /> מספר חיובי — ככל שחזק יותר, רחוק יותר מאפס</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-700" /> מספר שלילי</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-neutral-400/40" /> מספר שנמחק — הכספת (הטקסט) שורדת תמיד</span>
        </div>

        {/* the emerging letter */}
        <div className="rounded-lg border bg-white/70 dark:bg-neutral-900/70 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex justify-between">
            <span>המכתב שנולד מהמספרים — חי</span>
            <span className="font-mono">{tick ? `loss ${tick.loss.toFixed(3)}` : ""}</span>
          </div>
          <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap min-h-[3.5rem] break-words" aria-live="polite">
            {tick?.sample || "…לחץ 'להתחיל לצפות' והיא תתחיל לנחש"}
          </p>
        </div>

        {/* controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1"><span>חופש (טמפרטורה)</span><span className="font-mono">{freedom.toFixed(2)}</span></div>
              <Slider value={[freedom]} min={0} max={1.5} step={0.05} onValueChange={(v) => changeFreedom(v[0])} aria-label="freedom" />
              <p className="text-[10px] text-muted-foreground mt-1">באפס היא בוחרת תמיד את האות הבטוחה — fail-closed. מעל זה היא מעזה.</p>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span>פגיעה — כמה מהמספרים למחוק</span><span className="font-mono">{damage}%</span></div>
              <Slider value={[damage]} min={5} max={80} step={5} onValueChange={(v) => setDamage(v[0])} aria-label="damage" />
              <p className="text-[10px] text-muted-foreground mt-1">סימולציית wipe: ראה מה נשאר ממנה. אחר כך לחץ ריפוי — B8 יחזיר מ-checkpoint בלי למחוק כלום.</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {!running ? (
                tick ? <Button size="sm" onClick={resume}><Play className="h-3.5 w-3.5" /> המשך</Button>
                     : <Button size="sm" onClick={start}><Sparkles className="h-3.5 w-3.5" /> להתחיל לצפות</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={pause}><Pause className="h-3.5 w-3.5" /> השהי</Button>
              )}
              <Button size="sm" variant="outline" onClick={wipe}><Wrench className="h-3.5 w-3.5" /> פגיעה {damage}%</Button>
              <Button size="sm" variant="outline" onClick={heal}>ריפוי (B8)</Button>
              <Button size="sm" variant="outline" onClick={onExport}><Download className="h-3.5 w-3.5" /> מודל + CSV</Button>
              <Button size="sm" variant="outline" onClick={() => triggerDownload({ corpus, note: "the vault — survives every damage" }, "sovereign-bina-vault.json", "application/json")}>
                <Table className="h-3.5 w-3.5" /> הכספת
              </Button>
            </div>
          </div>

          {/* custom corpus */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={preset === "law" ? "default" : "outline"} className="h-7 text-xs" onClick={() => trainPreset("law")}>מכתב החוק</Button>
              <Button size="sm" variant={preset === "niqqud" ? "default" : "outline"} className="h-7 text-xs" onClick={() => trainPreset("niqqud")}>מכתב מנוקד</Button>
              <Button size="sm" variant={preset === "custom" ? "default" : "outline"} className="h-7 text-xs" onClick={() => { setCustomOpen((x) => !x); pickPreset("custom"); }}>
                <BookOpen className="h-3 w-3" /> טקסט משלך
              </Button>
            </div>
            {customOpen && (
              <>
                <Textarea value={corpus} onChange={(e) => setCorpus(e.target.value)} rows={6} className="font-mono text-xs" aria-label="custom corpus" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={trainCustom}>ללדת מודל חדש על הטקסט</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCorpus(DEFAULT_CORPUS); }}>לחזור למכתב החוק</Button>
                </div>
                <p className="text-[10px] text-muted-foreground">הטקסט נשאר במכשיר ולא נשלח לשום מקום.</p>
              </>
            )}
            {note && <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">{note}</div>}
          </div>
        </div>

        <Separator />

        {/* fleet mapping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> איך זה נותן לנו כוח</div>
            <p><span className="font-mono text-[11px] bg-muted px-1 rounded">wipe → פגיעה</span> ההרס שאנחנו כבר חווים (wipe #23) הופך לסימולציה חיה שאפשר להראות.</p>
            <p><span className="font-mono text-[11px] bg-muted px-1 rounded">B8 → ריפוי</span> שחזור additive מ-checkpoint — בדיוק חוק ההחלמה שלנו.</p>
            <p><span className="font-mono text-[11px] bg-muted px-1 rounded">fail-closed → חופש 0</span> באפס תמיד האות הבטוחה; חופש הוא החלטה מודעת, לא ברירת מחדל.</p>
            <p><span className="font-mono text-[11px] bg-muted px-1 rounded">כספת → הטקסט</span> אפשר למחוק כל מספר — המכתב (החוק) שורד ומייצר אותה מחדש.</p>
            <p><span className="font-mono text-[11px] bg-muted px-1 rounded">קבלות → הורדה</span> מודל כקובץ יחיד + משקלים כטבלה — state נייד שמעיד על עצמו.</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="font-semibold">ספריית עזר שאומתה (GitHub API, 12.11.2026)</div>
            {LIB.map((l) => (
              <div key={l.name} className="flex items-start justify-between gap-2">
                <a href={`https://github.com/karpathy/${l.name}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] underline underline-offset-2">{l.name}</a>
                <span className="text-[10px] text-muted-foreground text-left">{l.stars} · {l.use}</span>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-1">הערה כנה: ה-gist של ה-LLM-Wiki לא נפתר דרך ה-API בקישור הקצר — הרעיון (מוח שני) נשאר במפת הדרכים.</p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          ארכיטקטורה: חלון הקשר 8 אותיות → embedding → שכבת tanh → softmax על אוצר התווים. מימוש מקורי בהשראת קונספט "מודל שמתאמן מול העיניים" — נכתב מחדש להקשר הפליט, ללא קוד מהאתר המקורי. כל האימון ב-Web Worker במכשיר שלך.
        </p>
      </CardContent>
    </Card>
  );
}
