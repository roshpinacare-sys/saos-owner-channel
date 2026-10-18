// sovereign.ts — שכבת-נתונים חיה למרכז-הפיקוד הריבוני (server-only)
// כל-הנתונים אמיתיים מה-git (roshpinacare-sys) — אפס מוקים. כשל = מתווגן בכנות.

export type Panel<T> = { ok: boolean; data: T | null; error?: string; at: string }

const GH = "https://api.github.com"
const ORG = "roshpinacare-sys"

function pat(): string {
  try {
    const raw = readPatFile()
    const m = raw.match(/=(.+)/)
    return (m ? m[1] : raw).replace(/[\r\n"'\s]/g, "")
  } catch {
    return ""
  }
}

function readPatFile(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("fs").readFileSync("/home/z/my-project/upload/pat.env", "utf8")
}

async function fetchT(url: string, opts: RequestInit = {}, ms = 9000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" })
  } finally {
    clearTimeout(t)
  }
}

// קובץ גולמי מ-main (ריפו ציבורי) — עם fallback ל-contents-API מאומת (ריפו פרטי)
export async function rawFile(repo: string, path: string, branch = "main"): Promise<unknown> {
  const tok = pat()
  const r = await fetchT(`https://raw.githubusercontent.com/${ORG}/${repo}/${branch}/${path}`)
  if (r.ok) return JSON.parse(await r.text())
  // fallback: contents API (עבור ריפואים פרטיים)
  const api = await fetchT(
    `${GH}/repos/${ORG}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" } },
  )
  if (!api.ok) throw new Error(`raw ${repo}/${path} → ${r.status}/${api.status}`)
  const j = (await api.json()) as { content?: string; encoding?: string }
  if (j.encoding === "base64" && j.content) {
    return JSON.parse(Buffer.from(j.content, "base64").toString("utf8"))
  }
  throw new Error(`raw ${repo}/${path}: unexpected encoding`)
}

export async function rawText(repo: string, path: string, branch = "main"): Promise<string> {
  const tok = pat()
  const r = await fetchT(`https://raw.githubusercontent.com/${ORG}/${repo}/${branch}/${path}`)
  if (r.ok) return await r.text()
  const api = await fetchT(
    `${GH}/repos/${ORG}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" } },
  )
  if (!api.ok) throw new Error(`rawText ${repo}/${path} → ${r.status}/${api.status}`)
  const j = (await api.json()) as { content?: string; encoding?: string }
  if (j.encoding === "base64" && j.content) return Buffer.from(j.content, "base64").toString("utf8")
  throw new Error(`rawText ${repo}/${path}: unexpected`)
}

export async function ghApi<T>(path: string): Promise<T> {
  const tok = pat()
  const r = await fetchT(`${GH}${path}`, {
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" },
  })
  if (!r.ok) throw new Error(`ghApi ${path} → ${r.status}`)
  return (await r.json()) as T
}

// —— צורות ( defensive ) ——
export type Snapshot = {
  version: number
  savedAt: string
  state: {
    height: number
    balances: Record<string, Record<string, number>>
    credits: Record<string, number>
    feeMeter?: number
    pools?: Record<string, { base?: string; quote?: string; rBase?: number; rQuote?: number; k?: number; feeBps?: number } | Record<string, number>>
    stats?: Record<string, unknown>
    treasuryProfit?: number
    treasuryProfitEver?: number
    gasUsed?: number
    journal?: unknown[]
  }
}

export type ArmyPublic = {
  schema: string
  at: string
  roster: number
  acted: number
  stasis: number
  halted: number
  estateOpenOrders: number
  estateLockedSteem: number
  estateCapSteem: number
  verdict: string
  mid?: number
}

export type VolumeVerify = {
  schema: string
  at: string
  verdict: string
  txChecks: { total: number; verified: number; exposed: number; unreachable: number }
  chainFills: { count: number; makerFills: number; takerFills: number; volumeSteem: number; volumeSbd: number; byAccount: Record<string, number> }
}

export type Klines = { version: number; savedAt: number; pairs: Record<string, Array<{ t: number; o: number; h: number; l: number; c: number; vMu: number; qMu: number; n: number }>> }

export type MakerStats = { recs: Record<string, { fills: number; volMu: number; lastAt: number; lastH: number }> }

export type WorkflowRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  html_url: string
  run_attempt: number
}

export type GhCommit = {
  sha: string
  html_url: string
  commit: { message: string; author: { name?: string; date: string } }
}

export type FeedItem = { repo: string; sha: string; msg: string; at: string | null; url: string }

// יומן-הריבונות: ה-commit-ים הם הקבלות — קיר אחד מ-4-הריפואים
export async function repoCommits(repo: string, perPage = 8): Promise<FeedItem[]> {
  const arr = await ghApi<GhCommit[]>(`/repos/${ORG}/${repo}/commits?per_page=${perPage}`)
  return arr.map((c) => ({
    repo,
    sha: c.sha.slice(0, 7),
    msg: (c.commit.message ?? "").split("\n")[0].slice(0, 160),
    at: c.commit.author?.date ?? null,
    url: c.html_url,
  }))
}

// —— סיכום-איברים (אורגנים) ——
export const ORGAN_NAMES = [
  "dex-beat",
  "sovereign-runtime",
  "sovereign-pulse",
  "grid-watchdog",
  "army-ladder",
  "arb-grid",
  "treasury-ladder",
  "fleet-fuel",
  "sovereign-evolution",
  "escrow-payroll",
  "fee-engine",
  "self-memory",
  "system-map",
  "directive-now",
] as const

// קצבים נמדדים (W1.5/W2): beat 39–46 דק' → fresh 4500s; ladders שעתיים;
// sovereign-pulse = 4+4 פעימות/יום (crons :17/:47) → fresh 6.5h; sovereign-runtime = הקצב של חצי-שעה
export const ORGAN_FRESHNESS_SEC: Record<string, number> = {
  "dex-beat": 4500,
  "sovereign-runtime": 4500,
  "sovereign-pulse": 23400,
  "grid-watchdog": 5400,
  "army-ladder": 7200,
  "arb-grid": 7200,
  "treasury-ladder": 25200,
  "fleet-fuel": 7200,
  "sovereign-evolution": 93600,
  "escrow-payroll": 93600,
  "fee-engine": 93600,
  "self-memory": 93600,
  "system-map": 93600,
  "directive-now": 93600,
}
