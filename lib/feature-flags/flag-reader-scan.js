/**
 * flag-reader-scan.js — QF-20260721-951.
 *
 * Decide whether a feature flag is LOAD-BEARING by checking for LIVE READERS in the source
 * tree, not just its registry STATE. The flag-governance digest previously recommended KILL
 * for a disabled/aging flag from state alone; that false-KILL'd COORD_DETECTORS_V2 +
 * SURFACE_INERT_WORKER_V1 (both read by real runtime code) and fenced a whole SD. This encodes,
 * as a reusable predicate, the by-hand discrimination Charlie did (grep 9c0ee842):
 *
 *   COUNT as a live reader = a non-comment reference in real runtime code (lib/**, and
 *                            production/fleet scripts) — code that actually gates behavior.
 *   EXCLUDE (NOT a reader) = *.test.* / *.spec.* / __tests__, one-time backfill/migration/seed
 *                            scripts, the feature-flag machinery itself (registry / evaluator /
 *                            governance / index), and comment-only mentions.
 *
 * FAIL-SAFE DIRECTION: on ambiguity the caller defaults to KEEP, never KILL — a false-KEEP is
 * harmless cruft; a false-KILL strands live callers (the bug that caused the fence). So this
 * scanner errs toward reporting a reader when unsure (file-level substring, not AST precision).
 */
import fs from 'node:fs';
import path from 'node:path';

// Real runtime source roots. A flag referenced (in code, not a comment) under one of these
// gates behavior. Tests, docs, migrations, node_modules and worktrees are never scanned.
const SOURCE_DIRS = ['lib', 'scripts', 'src', 'api', 'app', 'server'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'tests', '__tests__', 'docs', 'coverage', 'dist', 'build']);

// A file whose repo-relative PATH matches this MENTIONS flag keys without being a
// behavior-gating reader: tests, one-time backfill/migration/seed tooling, and the
// feature-flag machinery itself (which enumerates keys by definition, not as a reader).
const EXCLUDE_FILE_RE = /(?:\.(?:test|spec)\.|(?:^|\/)(?:backfill|migration|migrate|seed)|feature-flags\/(?:registry|evaluator|governance-review|index)|flag-governance-review|flag-reader-scan)/i;

const CODE_FILE_RE = /\.(?:m?js|cjs|ts|tsx)$/;

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (e.isFile() && CODE_FILE_RE.test(e.name)) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

// Strip block + line comments so a flag key mentioned ONLY in a comment does NOT count as a
// reader (a commented-out reference is, by definition, not a live reader). The `[^:]` guard
// leaves `://` in URLs alone; we only care whether the flag key survives in the code portion.
export function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Build a predicate over a set of flag keys: does this flag have >=1 live reader?
 * One tree-walk; short-circuits once every key is found.
 * @param {string} repoRoot absolute repo root
 * @param {string[]} flagKeys flag keys to resolve
 * @returns {(flagKey:string)=>boolean}
 */
export function buildLiveReaderIndex(repoRoot, flagKeys = []) {
  const keys = [...new Set((flagKeys || []).filter((k) => typeof k === 'string' && k.length >= 3))];
  const found = new Set();
  if (!keys.length) return () => false;
  const files = [];
  for (const d of SOURCE_DIRS) walk(path.join(repoRoot, d), files);
  for (const file of files) {
    if (found.size === keys.length) break;
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    if (EXCLUDE_FILE_RE.test(rel)) continue;
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const remaining = keys.filter((k) => !found.has(k));
    if (!remaining.some((k) => src.includes(k))) continue; // cheap pre-filter before comment strip
    const code = stripComments(src);
    for (const k of remaining) if (code.includes(k)) found.add(k);
  }
  return (flagKey) => found.has(flagKey);
}
