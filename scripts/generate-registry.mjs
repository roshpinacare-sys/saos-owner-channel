#!/usr/bin/env node
// generate-registry.mjs — רישום-הכלים חוצה-הריפואים (usability of everything)
// סורק את ארבעת הריפואים ומפיק TOOLS-REGISTRY.md + tools-registry.json ב-hub.
// חוקים: אפס-סודות (שמות+נתיבים+ייעוד בלבד) · מקור האמת: git ls-files + כותרות-קוד.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const BASE = "/home/z/audit";
const REPOS = [
  { name: "saos-dex", role: "ה-DEX החי · engines · keeper · army · builder", dirs: ["scripts", "deploy", "grids", "markets", "ops", "harness", "broadcasts", "audit-package", "mini-services"] },
  { name: "saos-runtime", role: "הענן · האיברים האוטונומיים (workflows)", dirs: [".github/workflows", "scripts", "engine"] },
  { name: "saos-owner-channel", role: "ה-hub · חוזים · תיאום-סוכנים · תחייה", dirs: ["scripts", "seed", "run", "src", "tests"] },
  { name: "FleetHQ", role: "מפקדת-הצי · office digest · כלי-ניתוח", dirs: ["agents", "broadcast", "scripts", "tools"] },
];

function sh(c, cwd) { return execSync(c, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim(); }
function purposeOf(abs) {
  try {
    const lines = readFileSync(abs, "utf8").split("\n").slice(0, 30);
    for (const l of lines) {
      const m = l.match(/^\s*(?:\/\/|#|\/\*)\s*(.+?)\s*(?:\*\/)?$/);
      if (m && !/^\s*(eslint|@ts|import|from|name:|on:|uses:|runs-on)/.test(m[1])) return m[1].trim().slice(0, 100);
    }
  } catch {}
  return null;
}

const registry = { schema: "SAOS-TOOLS-REGISTRY/1", generatedAt: new Date().toISOString(), repos: [] };
let total = 0;
for (const r of REPOS) {
  const dir = path.join(BASE, r.name);
  if (!existsSync(dir)) continue;
  const entries = [];
  for (const d of r.dirs) {
    let files = [];
    try { files = sh(`git ls-files '${d}/*'`, dir).split("\n").filter(Boolean); } catch { continue; }
    for (const f of files) {
      if (!/\.(mjs|sh|ts|yml)$/.test(f)) continue;
      if (f.endsWith(".yml") && !d.includes("workflows")) continue;
      const p = purposeOf(path.join(dir, f)) || "—";
      entries.push({ path: f, purpose: p, kind: f.endsWith(".yml") ? "workflow" : f.endsWith(".sh") ? "script" : "code" });
    }
  }
  total += entries.length;
  registry.repos.push({ repo: r.name, role: r.role, tools: entries.length, entries });
}

const md = [
  `# רישום-הכלים של הריבונות (TOOLS-REGISTRY)`,
  ``,
  `> נוצר ב-${registry.generatedAt} · **${total} כלים** בארבעת הריפואים · ל-9 סוכני-הסנדבוקס: זו המפה שלכם.`,
  ``,
  ...registry.repos.map((r) => [
    `## ${r.repo} — ${r.role} (${r.tools})`,
    ``,
    `| נתיב | סוג | ייעוד |`,
    `|---|---|---|`,
    ...r.entries.map((e) => `| \`${r.repo}/${e.path}\` | ${e.kind} | ${e.purpose} |`),
    ``,
  ].join("\n")),
].join("\n");

const hub = path.join(BASE, "saos-owner-channel");
writeFileSync(path.join(hub, "TOOLS-REGISTRY.md"), md);
writeFileSync(path.join(hub, "tools-registry.json"), JSON.stringify(registry, null, 1) + "\n");
console.log(`registry: ${total} tools across ${registry.repos.length} repos`);
