#!/usr/bin/env node
/**
 * wall-clock-test-lint — SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001, piece (d) of the coordinator's
 * QF-20260912-364 rewrite (pieces (b)/(d) shipped separately in this SD; piece (a) shipped in
 * SD-LEO-FIX-SECOND-WALL-CLOCK-001).
 *
 * THE RULE: a test file that calls one of TIME_SENSITIVE_ENTRY_POINTS but never mentions a
 * fake-clock token anywhere in its own source is exercising a real-clock code path — the exact
 * class of gap SD-LEO-FIX-SECOND-WALL-CLOCK-001 already had to fix once (a clock-skew sweep whose
 * own reporting silently read a cancelled run as a clean pass). This is a FILE-level predicate,
 * not a per-line one: the call site and the fake-clock setup (`vi.useFakeTimers()`, a `now:`
 * option, etc.) are commonly on different lines of the same file.
 *
 * MEASURED against current main (2026-09-13), not the ticket's as-authored text: the ticket named
 * `reconcileSentRows`, which does not exist anywhere in this codebase — the real exported entry
 * point is `reconcileOutboundSms` (lib/chairman/sms-outbound-worker.js, also its default export).
 * `retryOrAlert` in that same file is module-PRIVATE (never exported), so no test can import or
 * call it directly — every test file that exercises it does so through `reconcileOutboundSms`,
 * which already carries the `now:` requirement below, so omitting it from the entry-point list
 * loses no real coverage. Corrected here rather than encoded verbatim (a name that never matches
 * would silently ship a piece of this tool as dead code).
 *
 * DIFF MODE (default, mirrors shell-injection-argv-lint.mjs / schema-reference-lint.mjs):
 * scoped to files touched in `mergeBase..HEAD`. A file already violating at the merge base is
 * PRE-EXISTING (reported, never blocking); a newly-introduced violation (a new file, or an
 * existing file that lost its fake-clock token, or gained a new time-sensitive call with none)
 * sets the exit code. --all is a whole-tree census (diagnostic only, never the CI entry point) —
 * used to measure the tool's own real baseline population rather than assume a number.
 *
 * Escape hatch: a `wall-clock-test-lint-disable-file` comment anywhere in the file. Advisory-first
 * by design (SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 LEAD risk assessment): a static scan cannot see an
 * indirect mocking path, so day one ships as --diff (reported, not yet wired to a blocking CI
 * step) — promoting it to a required check is a separate, later decision.
 *
 * ENTRY-POINT DETECTION (prospective TESTING review, 2026-09-13): only counts a name as
 * "referenced" when immediately followed by `(` — a real call, not `name: stub` (dependency
 * injection / vi.mock() factory keys, measured false-positive on 2 of 11 baseline files: a
 * `vi.mock(...) => ({ resolveChairmanZone: vi.fn(...) })` factory and a `resolveChairmanZone:
 * zoneStub` injected option never call the real function from the test file's own source).
 * FAKE_CLOCK_TOKEN_RE also recognizes a literal `new Date('...'|"..."|`...`|<digits>)` anywhere in
 * the file — the measured pattern for tests that pin dates via positional literals rather than a
 * `now:` option key (all four entry points take `now` positionally; only reconcileOutboundSms is
 * ever called with a `{ now }` options object in this codebase).
 *
 * KNOWN LIMITATION, stated rather than assumed: this is a coarse, comment-blind, whole-file
 * substring scan — a bare comment mentioning an entry point can clear a real violation, and a
 * comment mentioning a fake-clock token cannot. Acceptable because the tool ships advisory-only
 * (see the pragma escape hatch above); tightened only if it starts gating a real CI job.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHardenedGitRunner, VALID_BASE_REF } from '../../lib/git/hardened-runner.cjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRAGMA = 'wall-clock-test-lint-disable-file';

export const TIME_SENSITIVE_ENTRY_POINTS = Object.freeze([
  'reconcileOutboundSms',
  'isInQuietHours',
  'resolveChairmanZone',
  'smsQuietWindowReleaseIso',
]);

// Requires a trailing `(` — an actual call — so `name: stub` (DI / vi.mock() factory keys) is
// never counted as a reference (see the KNOWN LIMITATION note above for what this still misses).
const ENTRY_POINT_RE = new RegExp(`\\b(?:${TIME_SENSITIVE_ENTRY_POINTS.join('|')})\\s*\\(`);
const FAKE_CLOCK_TOKEN_RE = /\bnow\s*:|DAY_NOW|FAKE_NOW|useFakeTimers\b|new\s+Date\s*\(\s*['"`\d]/;
export const TEST_FILE_RE = /\.test\.(?:m|c)?jsx?$/;
const SKIP_DIR = /(?:^|\/)(?:node_modules|\.worktrees|archive|one-off|_deprecated|archived-[\w-]+)(?:\/|$)/;
const DIFF_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Pure: does this test file's source reference a time-sensitive entry point with no fake-clock
 * token anywhere in the same file? The pragma always wins (an explicit, greppable opt-out).
 * @param {string} source
 * @returns {boolean}
 */
export function isViolation(source) {
  const text = String(source || '');
  if (text.includes(PRAGMA)) return false;
  return ENTRY_POINT_RE.test(text) && !FAKE_CLOCK_TOKEN_RE.test(text);
}

// SCOPE NOTE (prospective TESTING review, 2026-09-13): --all walks ONLY tests/*.test.js —
// narrower than --diff mode's TEST_FILE_RE, which matches any touched path. 472 tracked
// *.test.js files live outside tests/ (lib/**, __tests__/**) and are invisible to --all; neither
// mode sees .test.ts/.spec.js/.spec.ts (66+26 tracked under tests/ alone). No current match for
// the 4 entry points was found outside this scope at measurement time — latent, not present, but
// the census below is a tests/*.test.js count, not a repo-wide one.
/** --all mode: whole-tree census of test files under `tests/`. Diagnostic only. */
function collectAllTestFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
      if (SKIP_DIR.test(rel + (e.isDirectory() ? '/' : ''))) continue;
      if (e.isDirectory()) { walk(full); continue; }
      if (TEST_FILE_RE.test(e.name)) out.push(rel);
    }
  };
  walk(path.join(REPO_ROOT, 'tests'));
  return out;
}

/**
 * Parse `git diff --name-status -M` output into a Map of newPath -> oldPath for renames (R
 * entries). Without this, a renamed file's merge-base lookup reads the NEW path — which never
 * existed at the merge base — and a pre-existing violation misreads as newly introduced
 * (prospective TESTING finding, 2026-09-13). Mirrors shell-injection-argv-lint.mjs's parseRenameMap.
 */
export function parseRenameMap(nameStatus) {
  const renames = new Map();
  for (const line of String(nameStatus || '').split('\n')) {
    const parts = line.split('\t');
    if (parts.length >= 3 && /^R\d*$/.test(parts[0])) renames.set(parts[2].trim(), parts[1].trim());
  }
  return renames;
}

/**
 * Diff-mode file list: test files touched (added/copied/modified/renamed) in mergeBase..HEAD.
 * @returns {{mergeBase: string, files: string[], renames: Map<string,string>}}
 */
export function collectDiffTestFiles(baseRef, run) {
  if (!VALID_BASE_REF.test(baseRef)) throw new Error(`invalid base ref ${JSON.stringify(baseRef)}`);
  const mergeBase = String(run(['merge-base', baseRef, 'HEAD'])).trim();
  if (!mergeBase) throw new Error(`merge-base ${baseRef}..HEAD resolved empty (shallow clone?)`);
  const nameStatus = String(run(['diff', '--name-status', '-M', '--diff-filter=ACMR', `${mergeBase}..HEAD`], { maxBuffer: DIFF_MAX_BUFFER }));
  const files = nameStatus.split('\n')
    .map((line) => line.split('\t').pop())
    .filter(Boolean)
    .map((f) => f.trim())
    .filter((f) => TEST_FILE_RE.test(f) && !SKIP_DIR.test(f));
  return { mergeBase, files: [...new Set(files)], renames: parseRenameMap(nameStatus) };
}

/** The merge-base blob's own content (at its OLD path if renamed), or null when absent there. */
export function readAtMergeBase(run, mergeBase, file, renames = new Map()) {
  const oldPath = renames.get(file) || file;
  const r = run(['show', `${mergeBase}:${oldPath}`], { result: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: DIFF_MAX_BUFFER });
  if (!r || r.status !== 0) return null;
  return String(r.stdout || '');
}

export function readCurrent(file) {
  try { return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'); } catch { return null; }
}

/**
 * The whole diff-mode verdict, side-effect free (unit tests inject `run` and `readCurrentFile`).
 * @returns {{mode:string, mergeBase:string|null, scanned:number, newViolations:string[], preExisting:string[], degradedReason?:string}}
 */
export function runDiffMode(baseRef, { run, readCurrentFile = readCurrent }) {
  let collected;
  try {
    collected = collectDiffTestFiles(baseRef, run);
  } catch (e) {
    return { mode: 'diff (degraded)', mergeBase: null, scanned: 0, newViolations: [], preExisting: [], degradedReason: String(e.message).split('\n')[0] };
  }
  const { mergeBase, files, renames } = collected;
  const newViolations = [];
  const preExisting = [];
  for (const file of files) {
    const current = readCurrentFile(file);
    if (current === null || !isViolation(current)) continue; // deleted, unreadable, or clean now
    const before = readAtMergeBase(run, mergeBase, file, renames);
    if (before !== null && isViolation(before)) preExisting.push(file);
    else newViolations.push(file);
  }
  return { mode: 'diff', mergeBase, scanned: files.length, newViolations, preExisting };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const wantAll = argv.includes('--all');

  if (wantAll) {
    const files = collectAllTestFiles();
    const violating = files.filter((f) => { const src = readCurrent(f); return src !== null && isViolation(src); });
    if (asJson) {
      console.log(JSON.stringify({ mode: 'all', scanned: files.length, violations: violating }, null, 2));
    } else {
      for (const f of violating) console.error(`  ${f}`);
      console.log(`${violating.length === 0 ? '✅' : '❌'} wall-clock-test-lint (all, tests/*.test.js only): ${files.length} test file(s) scanned, ${violating.length} violation(s) — this is the measured baseline census, diagnostic only`);
    }
    process.exit(violating.length === 0 ? 0 : 1);
  }

  const baseRef = process.env.WALL_CLOCK_TEST_LINT_BASE || 'origin/main';
  if (typeof baseRef !== 'string' || !VALID_BASE_REF.test(baseRef)) {
    console.error(`❌ wall-clock-test-lint: HOSTILE_BASE_REF — refusing WALL_CLOCK_TEST_LINT_BASE=${JSON.stringify(baseRef)} (must match ${VALID_BASE_REF}); not degrading, not scanning`);
    process.exit(2);
  }

  const run = makeHardenedGitRunner(REPO_ROOT);
  const result = runDiffMode(baseRef, { run });
  const { mode, mergeBase, scanned, newViolations, preExisting } = result;
  if (result.degradedReason) {
    console.warn(`⚠️  diff base unavailable (${result.degradedReason}) — nothing scanned (advisory; NOT falling back to --all, which is diagnostic-only)`);
  }
  if (asJson) {
    console.log(JSON.stringify({ mode, scanned, merge_base: mergeBase, newViolations, preExisting }, null, 2));
  } else {
    for (const f of preExisting) console.error(`  pre-existing  ${f}  (present at merge base ${mergeBase.slice(0, 8)} — reported, not blocking)`);
    for (const f of newViolations) console.error(`  ${f}  calls a time-sensitive entry point (${TIME_SENSITIVE_ENTRY_POINTS.join('|')}) with no now:/DAY_NOW/FAKE_NOW/useFakeTimers token anywhere in the file`);
    const verdict = newViolations.length === 0 ? '✅' : '❌';
    console.log(`${verdict} wall-clock-test-lint (${mode}): ${scanned} test file(s) touched, ${newViolations.length} new violation(s), ${preExisting.length} pre-existing (reported, not blocking)`);
  }
  process.exit(newViolations.length === 0 ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
