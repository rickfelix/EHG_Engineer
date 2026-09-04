// directory-only-worktree-key-lint.mjs — FR-5b of SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001.
//
// Flags a hook file that captures a .worktrees/<segment> path component AS a candidate SD/QF
// key (a capturing group immediately following the literal `.worktrees` in a regex) without
// going through the sanctioned branch-first precedence chain (deriveWorktreeKey /
// worktree-claim-decision.cjs). A directory name is stale the moment a slot-free reuse checks
// out a different branch inside the same tree -- see PAT-CLMMULTI-002 -- so a NEW hook that
// derives a claim-relevant key from a directory segment alone would reintroduce the exact
// false-block class this SD retires.
//
// Deliberately narrow (a capturing group directly after `.worktrees`, not merely "mentions
// .worktrees somewhere near a paren") so it does NOT flag legitimate .worktrees-adjacent code
// that never treats a directory segment as a key: scripts/hooks/set-activity-state.cjs's
// resolveMainRepoRoot captures the PREFIX before `.worktrees` (a paren group BEFORE the
// literal, not after it) to find the main checkout root; scripts/hooks/concurrent-session-worktree.cjs
// CONSTRUCTS a `.worktrees/sd/<key>` path from an already-known key (path.join, no regex
// capture at all) -- neither is a directory-segment-as-key extraction.
//
// Mirrors scripts/lint/fleet-liveness-select-lint.mjs's structure (pure extractor + reason-
// required allowlist + tree scan). ADVISORY-FIRST: exit 0 by default; pass --enforce for exit 1.
//
// KNOWN LIMITATION: this is a source-text heuristic, not a data-flow analysis. It cannot tell
// whether a captured segment actually FLOWS into a claim/block decision -- it flags the SHAPE
// (a capturing group directly after `.worktrees`) and relies on the reason-required allowlist
// for adjudicated false positives (e.g. WORKTREE_PATH_RE itself, the sanctioned fallback
// source). A capture-and-key pattern spelled without `[^` or a backslash (e.g. a differently
// written character class) would not match LOOKS_LIKE_REGEX_CONTENT and could go undetected --
// narrowing further risks missing real regressions, so this tradeoff is accepted deliberately
// rather than silently.
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SCAN_DIR = 'scripts/hooks';
const SCAN_EXTS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.worktrees', '__tests__']);
const ALLOWLIST_PATH = resolve(ROOT, 'scripts/lint/directory-only-worktree-key-allowlist.json');

// A capturing group immediately following the literal `.worktrees` inside a regex source —
// the shape of WORKTREE_PATH_RE (`.worktrees[/\\]([^/\\]+)`), the exact anti-pattern this
// guards against: extracting a directory segment as if it were a validated key.
const WORKTREE_CAPTURE_RE = /\.worktrees[^\n]{0,20}\([^)\n]*\)/g;
// A real regex capture group for a path segment is built from a negated character class
// and/or an escaped separator (`[^/\\]+`, `[/\\]`) — neither shape occurs in English prose
// or in a template-literal interpolation like `${verdict.reason}` (which contains a bare
// `$`, not a regex escape). Requiring `[^` or a backslash is what separates a genuine
// `([^/\\]+)` from "(including via ...)" or a `${...}` interpolation sitting nearby.
const LOOKS_LIKE_REGEX_CONTENT = /\[\^|\\\\/;

/**
 * Strip // line and block comments so a doc-comment's prose parentheticals never register,
 * PRESERVING line count (mirrors scripts/lint/fleet-liveness-select-lint.mjs's stripComments).
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

/**
 * Find `.worktrees/<capture>` regex shapes in source. Pure + string-only so it is
 * unit-testable without touching the filesystem.
 * @param {string} src
 * @returns {Array<{line:number, snippet:string}>}
 */
export function findDirectoryOnlyWorktreeCaptures(src) {
  const clean = stripComments(src);
  const findings = [];
  let m;
  WORKTREE_CAPTURE_RE.lastIndex = 0;
  while ((m = WORKTREE_CAPTURE_RE.exec(clean)) !== null) {
    if (!LOOKS_LIKE_REGEX_CONTENT.test(m[0])) continue;
    const line = clean.slice(0, m.index).split('\n').length;
    findings.push({ line, snippet: m[0].replace(/\s+/g, ' ').slice(0, 120) });
  }
  return findings;
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${path}: ${e.message}`); }
  const entries = json.allow || json;
  for (const [k, v] of Object.entries(entries)) {
    if (!v || typeof v !== 'string' || !v.trim()) throw new Error(`Allowlist entry '${k}' must have a non-empty reason string`);
  }
  return entries;
}

const relOf = (full, root) => full.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');

/** @param {string} [root] scan root; defaults to the real repo root (module-relative), never cwd. */
export function scanTree(root = ROOT) {
  const hits = [];
  const scanRoot = join(root, SCAN_DIR);
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e)) continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXTS.has(extname(e))) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      for (const f of findDirectoryOnlyWorktreeCaptures(src)) {
        hits.push({ file: relOf(full, root), ...f });
      }
    }
  };
  walk(scanRoot);
  return hits;
}

async function main() {
  const args = process.argv.slice(2);
  const enforce = args.includes('--enforce');
  // --root <dir>: point the scan at an arbitrary directory instead of this repo (used by
  // scripts/lint/control-seed-test-lint.mjs's fixture trial to prove this control fires on a
  // planted defect without touching the real tree).
  const rootIdx = args.indexOf('--root');
  const scanRoot = rootIdx !== -1 && args[rootIdx + 1] ? resolve(args[rootIdx + 1]) : ROOT;
  const allow = loadAllowlist();
  const hits = scanTree(scanRoot);
  const ungoverned = hits.filter((h) => !(`${h.file}:${h.line}` in allow) && !(h.file in allow));
  console.log(`[DIRECTORY-ONLY-WORKTREE-KEY-LINT] scanned ${SCAN_DIR}; ${hits.length} .worktrees/<capture> shape(s); ${ungoverned.length} ungoverned.`);
  if (ungoverned.length) {
    console.log('  Directory-segment-as-key captures outside the sanctioned derivation site (route through scripts/hooks/worktree-claim-decision.cjs::deriveWorktreeKey, or allowlist "<file>:<line>" with a reason):');
    for (const u of ungoverned) console.log(`   • ${u.file}:${u.line} ${u.snippet}`);
  } else {
    console.log('  All .worktrees/<capture> shapes are the sanctioned derivation site or allowlisted. 0 ungoverned.');
  }
  if (enforce && ungoverned.length) process.exitCode = 1;
}

if (process.argv[1] && /directory-only-worktree-key-lint\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
