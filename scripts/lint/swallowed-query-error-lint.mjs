// swallowed-query-error-lint.mjs — flag PostgREST calls whose destructure binds only `data` and
// discards `error`, IN GATE / EXECUTOR CODE. SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 (FR-4).
// Mirrors the structure of scripts/lint/fleet-liveness-select-lint.mjs (pure extractors +
// reason-required allowlist + tree scan). ADVISORY-FIRST: exit 0 by default; --enforce for exit 1.
//
// WHY: PostgREST rejects the WHOLE query on an unknown column, so `data` comes back null forever
// and a caller that never inspects `error` reports a plausible benign reason for having done
// nothing. Zero rows is a legal answer, so the failure is INDISTINGUISHABLE from a real empty
// result — no local check can catch it, which is why this is a lint plus a wrapper rather than a
// convention. Live instance: a gate whose PRD lookup failed reached its "no command configured —
// advisory pass" branch, so a broken query MADE THE GATE PASS.
//
// SCOPED TO GATE/EXECUTOR PATHS ON PURPOSE. The repo-wide population is ~3000 call sites; a lint
// that reported all of them would be noise people learn to scroll past, and a rule nobody reads is
// worth less than no rule. These are the paths where a silent null becomes a wrong GATE VERDICT.
// Widen the scope only alongside the capacity to actually convert what it finds.
//
// A call is SAFE (not flagged) when ANY of:
//   • the destructure binds `error` (or renames it: `error: fooErr`) — the caller can see faults;
//   • it routes through the canonical wrapper (lib/db/safe-query.mjs safeQuery/safeCount), which
//     throws on error and treats a null count on an explicit count request as a failure;
//   • it routes through lib/db/fetch-all-paginated.mjs fetchAllPaginated(), which already throws.
// Anything else is a latent silent no-op. Fix it (route through safeQuery, or bind error) or
// allowlist it with a REASON — a boolean-style silence is exactly what this SD exists to prevent.
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive']);
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/swallowed-query-error-allowlist.json');

// Gate/executor paths only — see the scoping note above.
const SCAN_PREFIXES = [
  'scripts/modules/handoff',
  'lib/gates',
  'scripts/modules/claim-health',
  'lib/claim',
  'lib/oversight',
];

// A destructure that binds ONLY data (optionally renamed) and no `error`.
const DATA_ONLY = /const\s*\{\s*data(?:\s*:\s*[A-Za-z0-9_$]+)?\s*\}\s*=\s*await/;
// A destructure binding only `count` is the same defect in the count-probe shape.
const COUNT_ONLY = /const\s*\{\s*count(?:\s*:\s*[A-Za-z0-9_$]+)?\s*\}\s*=\s*await/;
// The tell that the awaited chain is actually PostgREST rather than axios/fetch/a local helper.
const POSTGREST = /\.from\s*\(|\.rpc\s*\(/;
// Already-safe routings.
const SAFE_CALL = /safeQuery\s*\(|safeCount\s*\(|fetchAllPaginated\s*\(/;

/**
 * Strip // line and block comments so commented-out queries do not register, PRESERVING line
 * count so reported line numbers match the source (allowlist keys are "<file>:<line>").
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

/**
 * Extract swallowed-error call sites from one file's source.
 * Pure and exported so the extractor is unit-testable without touching the filesystem.
 * @param {string} src
 * @param {string} file repo-relative path, for the returned records
 * @returns {Array<{file:string,line:number,kind:'data'|'count',snippet:string}>}
 */
export function extractSwallowedQueries(src, file = '<memory>') {
  const lines = stripComments(src).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isData = DATA_ONLY.test(line);
    const isCount = !isData && COUNT_ONLY.test(line);
    if (!isData && !isCount) continue;
    // The awaited chain can span lines; look ahead for the PostgREST tell and for a safe routing.
    const chain = lines.slice(i, i + 6).join('\n');
    if (!POSTGREST.test(chain)) continue;   // not a PostgREST call — axios, a local helper, etc.
    if (SAFE_CALL.test(chain)) continue;    // already routed through a throwing wrapper
    hits.push({ file, line: i + 1, kind: isData ? 'data' : 'count', snippet: line.trim().slice(0, 110) });
  }
  return hits;
}

/** Load the reason-required allowlist. Throws if any entry lacks a non-empty reason. */
export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
  const allow = raw.allow || {};
  for (const [key, reason] of Object.entries(allow)) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      // The whole point of the allowlist: a silence you cannot explain is the reflexive kind.
      throw new Error(`swallowed-query-error-allowlist: entry "${key}" has no reason. Every exemption MUST state why.`);
    }
  }
  return allow;
}

/** Walk the scoped subtrees and collect hits. */
export function scanTree(root = ROOT, prefixes = SCAN_PREFIXES) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (EXCLUDE.has(name)) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXTS.has(extname(name))) continue;
      const rel = full.slice(root.length + 1).replace(/\\/g, '/');
      if (/\.test\.|\/tests?\//.test(rel)) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      hits.push(...extractSwallowedQueries(src, rel));
    }
  };
  for (const p of prefixes) walk(join(root, p));
  return hits;
}

async function main() {
  const enforce = process.argv.includes('--enforce');
  const allow = loadAllowlist();
  const hits = scanTree();
  const ungoverned = hits.filter((h) => !(`${h.file}:${h.line}` in allow) && !(h.file in allow));
  console.log(`[SWALLOWED-QUERY-LINT] scanned gate/executor paths; ${hits.length} data-only PostgREST destructure(s); ${ungoverned.length} ungoverned.`);
  if (ungoverned.length) {
    console.log('  A rejected query here returns null, which is indistinguishable from an empty result.');
    console.log('  Route through lib/db/safe-query.mjs (safeQuery/safeCount), bind `error`, or allowlist "<file>:<line>" WITH a reason:');
    // Print a SAMPLE, not the whole population. This SD converts the verdict-critical sites and
    // tracks the rest as a migration; a 200-line wall every run is the kind of output people
    // learn to scroll past, and a rule nobody reads is worth less than no rule. The COUNT above
    // is the gauge — it is what should move.
    const SAMPLE = process.argv.includes('--list') ? ungoverned.length : 15;
    for (const u of ungoverned.slice(0, SAMPLE)) console.log(`   • ${u.file}:${u.line} [${u.kind}-only] ${u.snippet}`);
    if (ungoverned.length > SAMPLE) {
      console.log(`   … and ${ungoverned.length - SAMPLE} more (--list to show all).`);
    }
  } else {
    console.log('  All gate/executor PostgREST reads bind `error`, route through a throwing wrapper, or are allowlisted. 0 ungoverned.');
  }
  if (enforce && ungoverned.length) process.exitCode = 1;
}

if (process.argv[1] && /swallowed-query-error-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
