# SOVEREIGN DESK · roshpinacare-sys

Live-only sovereignty cockpit for the roshpinacare-sys fleet (Steem custody, SAOS-DEX, army ladder) — plus **Sovereign Bina**: a tiny char-level language model (~74.7K params, measured at runtime) that trains live in your browser on the fleet doctrine letter.

## Live sources, no claims

Every number on the dashboard is fetched live from its source (`api.steemit.com`, `saos-dex@main`, engine receipts). Failed sources are shown as failed. Nothing on this page is a claim.

## Sovereign Bina — what it is

An original implementation of the "model that trains in front of your eyes" concept, rebuilt for the sovereignty context:

| Bina concept | Fleet law |
| --- | --- |
| corpus (the letter) | the vault — survives every damage, never deleted |
| weights (the numbers) | the live tree — can be wiped and healed |
| damage slider | wipe simulation |
| heal button | B8 restore — additive from checkpoint / vault-birth, nothing deleted |
| freedom = 0 | fail-closed (always the safest next letter) |
| model/CSV download | receipts culture — a portable ledger of the state |
| everything local | custody law — nothing leaves the device |

Architecture: context window 8 chars → embedding (48) → tanh hidden (176) → softmax over the char set. Trained with SGD on next-char cross-entropy inside a Web Worker. Presets: the law letter, a niqqud-marked letter (the model learns niqqud from the text alone), and any custom text.

## Development lanes (FleetHQ issue #203)

GPU lane (WebGL/WebGPU) · autonomous experiments ledger (autoresearch-pattern) · second brain (DECISIONS + public receipts) · local chat over receipts (nanochat lane) · niqqud training.

## Ops

- Dev: `bun install && bun run dev`
- Lint: `bun run lint` (clean for `src/`)
- Secrets: none in this repo. `.env`, `*.secret`, `upload/`, `fleet*` are hard-ignored — key material never leaves the local box (custody law).
