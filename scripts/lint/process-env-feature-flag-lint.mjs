// process-env-feature-flag-lint.mjs — detect process.env FEATURE-FLAG reads that are not
// governed (registered in leo_feature_flags or listed in the allowlist with a reason).
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-4). Mirrors the structure of
// scripts/lint/metadata-flag-lint.mjs (pure extractors + allowlist + tree scan), but scoped
// to env-var feature flags. ADVISORY-FIRST: exit 0 by default; pass --enforce for exit 1.
//
// "Feature-flag-shaped" = an env name ending in _V<n> / _ENABLED / _FLAG / _TOGGLE /
// _REVIEW_EVERY, OR a process.env read compared on the same line to 'on'/'off'/'enabled'/
// 'disabled'. This deliberately ignores credentials/config (SUPABASE_URL, CLAUDE_SESSION_ID).
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const EXCLUDE = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive']);
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/process-env-feature-flag-allowlist.json');

const NAME_SHAPE = /_(V\d+|ENABLED|FLAG|TOGGLE|REVIEW_EVERY)$/;
const BOOLISH_NEAR = /===?\s*['"](on|off|enabled|disabled)['"]|['"](on|off|enabled|disabled)['"]\s*===?/;

// Strip // line and /* */ block comments so commented-out reads do not register.
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Extract feature-flag-shaped process.env reads from a source string.
export function extractEnvFlags(src) {
  const clean = stripComments(src);
  const found = new Set();
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  for (const line of clean.split('\n')) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const name = m[1];
      if (NAME_SHAPE.test(name) || BOOLISH_NEAR.test(line)) found.add(name);
    }
  }
  return found;
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${path}: ${e.message}`); }
  const entries = json.allow || json;
  // Each entry must carry a non-empty reason.
  for (const [k, v] of Object.entries(entries)) {
    if (!v || typeof v !== 'string' || !v.trim()) throw new Error(`Allowlist entry '${k}' must have a non-empty reason string`);
  }
  return entries;
}

export function scanTree(root = ROOT) {
  const hits = new Map(); // flagName -> Set(relPath)
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE.has(e)) continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXTS.has(extname(e))) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      for (const name of extractEnvFlags(src)) {
        if (!hits.has(name)) hits.set(name, new Set());
        hits.get(name).add(full.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, ''));
      }
    }
  };
  walk(root);
  return hits;
}

async function main() {
  const enforce = process.argv.includes('--enforce');
  const allow = loadAllowlist();
  const hits = scanTree();
  const ungoverned = [];
  for (const [name, files] of hits) {
    if (name in allow) continue;
    ungoverned.push({ name, files: [...files].slice(0, 5) });
  }
  console.log(`[ENV-FLAG-LINT] scanned tree; ${hits.size} feature-flag-shaped env read(s); ${ungoverned.length} ungoverned.`);
  if (ungoverned.length) {
    console.log('  Ungoverned process.env feature flags (register in leo_feature_flags or allowlist with a reason):');
    for (const u of ungoverned) console.log(`   • ${u.name} — ${u.files.join(', ')}`);
  } else {
    console.log('  All feature-flag-shaped env reads are governed (registered/allowlisted). 0 ungoverned.');
  }
  if (enforce && ungoverned.length) process.exitCode = 1;
}

if (process.argv[1] && /process-env-feature-flag-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
