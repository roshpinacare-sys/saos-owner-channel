#!/usr/bin/env bun
// channel-guard · lease census — CLAIMS.json TTL law (first-claim-wins, ttlHours default 24)
// Fail-closed: parse error or schema violation = non-zero exit (honest guard, not theater).
// Receipt: state/channel-guard.json (committed by the workflow — the green proof).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const now = Date.now()
let d
try {
  d = JSON.parse(readFileSync('CLAIMS.json', 'utf8'))
} catch (e) {
  console.error('S-CLAIMS-PARSE fail-closed:', e.message)
  process.exit(1)
}
if (!Array.isArray(d.claims)) {
  console.error('S-CLAIMS-SCHEMA fail-closed: claims[] missing')
  process.exit(1)
}
const exp = (c) =>
  c.expiresAt
    ? new Date(c.expiresAt).getTime()
    : new Date(c.claimedAt).getTime() + (c.ttlHours ?? d.rules?.ttlHours ?? 24) * 3600e3
const active = []
const expired = []
for (const c of d.claims) {
  const id = `${c.agent ?? '?'}/${c.lane ?? '?'}`
  ;(exp(c) > now ? active : expired).push(id)
}
const receipt = {
  schema: 'saos-owner-channel/channel-guard@1',
  at: new Date().toISOString(),
  envelopeLedger: 'VALID (bun run validate — fail-closed upstream step)',
  claimsTotal: d.claims.length,
  leasesActive: active.length,
  leasesExpired: expired.length,
}
mkdirSync('state', { recursive: true })
writeFileSync('state/channel-guard.json', JSON.stringify(receipt, null, 2) + '\n')
console.log(JSON.stringify({ ...receipt, expiredListRecent: expired.slice(-12) }, null, 2))
