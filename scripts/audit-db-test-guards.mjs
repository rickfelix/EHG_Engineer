#!/usr/bin/env node
/**
 * Audit: DB-test guard categorization for the vitest db/no-db project split.
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-3),
 * SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (runtime-aware signal + ratchet baseline + MISROUTED).
 *
 * Statically scans the files that belong to the default no-DB `unit` vitest
 * project (tests/** minus the DB-dir suites that live in the `db` project) and
 * fails if any test touches a live Supabase connection without a skip guard.
 * A guarded test self-skips when no credentials are present (HAS_REAL_DB false)
 * or fully mocks the supabase client module; an unguarded one would hang/fail
 * against the synthetic test.invalid.local sentinel.
 *
 * Detection is RUNTIME-AWARE (SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 FR-1):
 *   - // and block comments never count as a signal or a guard;
 *   - vi.mock / vi.doMock of '@supabase/supabase-js' (or any supabase client
 *     helper module) makes the file GUARDED — the live client is unreachable;
 *   - DB signal text that only appears inside string literals (e.g. an
 *     expect(...) asserting redaction of 'SUPABASE_SERVICE_ROLE_KEY=') is
 *     ignored — import/require module specifiers are the only strings that
 *     count, and only when they name a supabase client module.
 *
 * MISROUTED (FR-4): a unit-project file whose suites are wrapped in
 * describeDb/itDb belongs in the `db` project (rename to *.db.test.js) — the
 * unit tier has no real credentials, so those suites can never run there.
 *
 * Ratchet baseline (FR-2): the default run tolerates the grandfathered set in
 * tests/db-guards-baseline.json and fails ONLY on new files. --update-baseline
 * rewrites the file from the current flagged set but refuses to grow it
 * without --force-grow.
 *
 * Exit codes: 0 = clean (or --list), 1 = violations found, 2 = usage error.
 *
 * Usage:
 *   node scripts/audit-db-test-guards.mjs                    # CI/pre-commit: non-zero on NEW violations
 *   node scripts/audit-db-test-guards.mjs --list             # list ALL flagged files (exit 0)
 *   node scripts/audit-db-test-guards.mjs --json             # machine-readable report
 *   node scripts/audit-db-test-guards.mjs --staged           # pre-commit: only newly staged files
 *   node scripts/audit-db-test-guards.mjs --update-baseline  # rewrite tests/db-guards-baseline.json
 *   node scripts/audit-db-test-guards.mjs --update-baseline --force-grow  # allow the baseline to grow
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TESTS_ROOT = join(REPO_ROOT, 'tests');
export const BASELINE_REL_PATH = 'tests/db-guards-baseline.json';

// Directories whose suites live in the opt-in `db` project (excluded from the
// unit project) — keep in sync with DB_INCLUDE in vitest.config.js.
const DB_DIRS = new Set(['integration', 'database', 'db-invariants', 'migration-readiness']);
// Individual files routed to the db project regardless of directory.
const DB_FILE_NAMES = new Set(['smoke.test.js']);
// Directories never run by the unit project (e2e, etc.) — skip from the audit.
const SKIP_DIRS = new Set(['e2e', 'node_modules']);

// ---------------------------------------------------------------------------
// Source analysis — comment/string aware (cheap single-pass state machine).
// ---------------------------------------------------------------------------

/**
 * Single-pass scanner over JS source. Returns two parallel views (newlines and
 * offsets preserved in both):
 *   - code:          comments blanked to spaces, strings KEPT (so import
 *                    specifiers and vi.mock module names remain matchable);
 *   - codeNoStrings: comments AND string/template contents blanked to spaces
 *                    (so identifier/env-var signals can be matched without
 *                    false positives from assertion strings).
 * Template-literal interpolation (`${...}`) is treated as string content — a
 * deliberate cheap heuristic; DB clients constructed inside interpolations are
 * vanishingly rare in test files.
 * @param {string} src
 * @returns {{ code: string, codeNoStrings: string }}
 */
export function analyzeSource(src) {
  const code = [];
  const codeNoStrings = [];
  const N = src.length;
  // states: 0 normal, 1 line comment, 2 block comment, 3 'sq', 4 "dq", 5 `template`
  let state = 0;
  for (let i = 0; i < N; i++) {
    const c = src[i];
    const next = i + 1 < N ? src[i + 1] : '';
    if (state === 0) {
      if (c === '/' && next === '/') { state = 1; code.push(' ', ' '); codeNoStrings.push(' ', ' '); i++; continue; }
      if (c === '/' && next === '*') { state = 2; code.push(' ', ' '); codeNoStrings.push(' ', ' '); i++; continue; }
      if (c === "'") { state = 3; code.push(c); codeNoStrings.push(c); continue; }
      if (c === '"') { state = 4; code.push(c); codeNoStrings.push(c); continue; }
      if (c === '`') { state = 5; code.push(c); codeNoStrings.push(c); continue; }
      code.push(c); codeNoStrings.push(c); continue;
    }
    if (state === 1) { // line comment
      if (c === '\n') { state = 0; code.push(c); codeNoStrings.push(c); }
      else { code.push(' '); codeNoStrings.push(' '); }
      continue;
    }
    if (state === 2) { // block comment
      if (c === '*' && next === '/') { state = 0; code.push(' ', ' '); codeNoStrings.push(' ', ' '); i++; }
      else { const keep = c === '\n' ? c : ' '; code.push(keep); codeNoStrings.push(keep); }
      continue;
    }
    // string states (3/4/5)
    if (c === '\\') { // escape: consume next char too
      code.push(c, next); codeNoStrings.push(' ', ' ');
      i++;
      continue;
    }
    const terminator = state === 3 ? "'" : state === 4 ? '"' : '`';
    if (c === terminator) { state = 0; code.push(c); codeNoStrings.push(c); continue; }
    if (c === '\n') { code.push(c); codeNoStrings.push(c); if (state !== 5) state = 0; continue; }
    code.push(c); codeNoStrings.push(state === 5 ? ' ' : ' ');
  }
  return { code: code.join(''), codeNoStrings: codeNoStrings.join('') };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

// Identifier-level DB signal: client factory identifiers or direct env-var
// reads. Matched against codeNoStrings so comments and assertion strings
// (e.g. expect(out).not.toContain('SUPABASE_SERVICE_ROLE_KEY=')) never count.
export const DB_IMPORT_SIGNAL = /createSupabaseServiceClient|createSupabaseClient|getSupabaseClient|createDatabaseClient|createServiceClient\b|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL\b|SUPABASE_POOLER_URL/;

// A test is guarded if it self-skips when no real DB is configured. Matched
// against codeNoStrings — a guard mentioned only in a comment does not count.
export const GUARD_SIGNAL = /HAS_REAL_DB|describeDb|itDb|\.skipIf\s*\(|TEST_REQUIRES_DB/;

// vi.mock / vi.doMock of '@supabase/supabase-js' or any supabase client/helper
// module (specifier containing 'supabase') — the live client is unreachable.
export const SUPABASE_MOCK_SIGNAL = /\bvi\s*\.\s*(?:mock|doMock)\s*\(\s*(['"`])[^'"`]*supabase[^'"`]*\1/i;

// Import/require specifiers that name a real supabase client module.
export const DB_MODULE_SPECIFIER = /@supabase\/supabase-js|supabase[-_]?client|supabase[-_]?connection/i;

// describeDb/itDb actually CALLED (suite wrapped) — not a mere import/typeof.
export const MISROUTED_SIGNAL = /\b(?:describeDb|itDb)\s*(?:\.\s*\w+\s*)?\(/;

const IMPORT_SPECIFIER_RE = /(?:\bimport\b[^'"\n;]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)(['"])([^'"]+)\1/dg;

/**
 * Collect static import / dynamic import() / require() module specifiers.
 * The import SYNTAX is matched against codeNoStrings (so `import ... from`
 * text embedded inside a string fixture never counts), then the actual
 * specifier text is read back from the string-preserving `code` view at the
 * same offsets (analyzeSource keeps both views offset-aligned).
 * @param {string|{code:string,codeNoStrings:string}} source raw source or an analyzeSource() result
 * @returns {string[]}
 */
export function collectImportSpecifiers(source) {
  const { code, codeNoStrings } = typeof source === 'string' ? analyzeSource(source) : source;
  const out = [];
  for (const m of codeNoStrings.matchAll(IMPORT_SPECIFIER_RE)) {
    const [start, end] = m.indices[2];
    out.push(code.slice(start, end));
  }
  return out;
}

/**
 * Classify a unit-project test source. Pure predicate for testability.
 * @param {string} content test file source
 * @returns {'CLEAN'|'GUARDED'|'UNGUARDED'|'MISROUTED'}
 */
export function classifyTestSource(content) {
  const { code, codeNoStrings } = analyzeSource(content);

  // FR-4: suites wrapped in describeDb/itDb can never run in the unit tier
  // (no real credentials) — they belong in the db project.
  if (MISROUTED_SIGNAL.test(codeNoStrings)) return 'MISROUTED';

  // FR-1(b): a supabase-module mock makes the live client unreachable.
  if (SUPABASE_MOCK_SIGNAL.test(code)) return 'GUARDED';

  const identifierSignal = DB_IMPORT_SIGNAL.test(codeNoStrings);
  const importSignal = collectImportSpecifiers({ code, codeNoStrings }).some((s) => DB_MODULE_SPECIFIER.test(s));
  if (!identifierSignal && !importSignal) return 'CLEAN';

  if (GUARD_SIGNAL.test(codeNoStrings)) return 'GUARDED';
  return 'UNGUARDED';
}

/**
 * A unit-project test is a violation when it touches a live DB but is not
 * guarded to self-skip without credentials. Pure predicate for testability.
 * @param {string} content test file source
 * @returns {boolean}
 */
export function isUnguardedDbTest(content) {
  return classifyTestSource(content) === 'UNGUARDED';
}

/**
 * A unit-project file whose suites are wrapped in describeDb/itDb is misrouted
 * — it should be renamed *.db.test.js (db project). Pure predicate.
 * @param {string} content test file source
 * @returns {boolean}
 */
export function isMisroutedDbSuite(content) {
  return classifyTestSource(content) === 'MISROUTED';
}

/**
 * True when a repo-relative path is a test file that belongs to the no-DB `unit`
 * vitest project (so a DB guard is required). Files routed to the `db` project
 * (DB dirs, smoke, *.db.test.js) and non-unit dirs are exempt.
 * @param {string} relPath repo-relative, forward-slash path
 */
export function isUnitProjectTestPath(relPath) {
  const p = relPath.split(sep).join('/');
  if (!p.endsWith('.test.js') || p.endsWith('.spec.js') || p.endsWith('.db.test.js')) return false;
  if (!p.startsWith('tests/')) return false;
  const seg = p.split('/');
  const top = seg[1]; // tests/<top>/...
  if (DB_DIRS.has(top) || SKIP_DIRS.has(top)) return false;
  if (DB_FILE_NAMES.has(seg[seg.length - 1])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Ratchet baseline (FR-2)
// ---------------------------------------------------------------------------

/**
 * Pure ratchet semantics: flagged-set minus baseline.
 * @param {string[]} flagged current flagged repo-relative paths
 * @param {string[]} baseline tolerated repo-relative paths
 * @returns {{ newFlagged: string[], tolerated: string[], removed: string[] }}
 */
export function computeRatchet(flagged, baseline) {
  const base = new Set(baseline);
  const cur = new Set(flagged);
  return {
    newFlagged: flagged.filter((f) => !base.has(f)).sort(),
    tolerated: flagged.filter((f) => base.has(f)).sort(),
    removed: baseline.filter((b) => !cur.has(b)).sort(),
  };
}

/**
 * Pure update-baseline semantics: refuse to GROW the baseline without force.
 * @param {string[]} flagged current flagged set
 * @param {string[]} baseline existing baseline
 * @param {boolean} forceGrow
 * @returns {{ ok: boolean, next: string[], grew: boolean }}
 */
export function updateBaseline(flagged, baseline, forceGrow = false) {
  const next = [...new Set(flagged)].sort();
  const grew = next.length > baseline.length;
  if (grew && !forceGrow) return { ok: false, next, grew };
  return { ok: true, next, grew };
}

function readBaseline() {
  const abs = join(REPO_ROOT, BASELINE_REL_PATH);
  if (!existsSync(abs)) return [];
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[audit-db-test-guards] could not parse ${BASELINE_REL_PATH}: ${e.message}`);
    process.exitCode = 2;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function walk(dir, topLevelName = null) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Determine the tests/<topLevel> bucket for db/skip routing.
      const tl = topLevelName ?? entry.name;
      if (topLevelName === null && (DB_DIRS.has(entry.name) || SKIP_DIRS.has(entry.name))) {
        continue; // whole top-level dir routed to db project or never in unit
      }
      out.push(...walk(full, tl));
    } else if (entry.isFile() && entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js') && !entry.name.endsWith('.db.test.js')) {
      if (DB_FILE_NAMES.has(entry.name)) continue; // routed to db project
      out.push(full);
    }
  }
  return out;
}

function scanAll() {
  const files = walk(TESTS_ROOT);
  const flagged = [];
  const misrouted = [];
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(REPO_ROOT, file).split(sep).join('/');
    const cls = classifyTestSource(content);
    if (cls === 'UNGUARDED') flagged.push(rel);
    else if (cls === 'MISROUTED') misrouted.push(rel);
  }
  flagged.sort();
  misrouted.sort();
  return { scanned: files.length, flagged, misrouted };
}

/**
 * Staged-file gate (pre-commit): block only NEWLY staged unit-project test
 * files that touch a DB without a guard (or are misrouted describeDb suites).
 * This prevents regressions without forcing the grandfathered baseline files
 * to be wrapped.
 */
function runStaged() {
  let staged = [];
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    staged = out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`[audit-db-test-guards] --staged: could not read staged files: ${e.message}`);
    return; // fail-open: never block a commit on a git read error
  }

  const violations = [];
  const misrouted = [];
  for (const rel of staged) {
    if (!isUnitProjectTestPath(rel)) continue;
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    let content;
    try { content = readFileSync(abs, 'utf8'); } catch { continue; }
    const cls = classifyTestSource(content);
    const fwd = rel.split(sep).join('/');
    if (cls === 'UNGUARDED') violations.push(fwd);
    else if (cls === 'MISROUTED') misrouted.push(fwd);
  }

  if (violations.length === 0 && misrouted.length === 0) {
    console.log('[audit-db-test-guards] --staged: ✅ no new unguarded DB-touching unit tests');
    return;
  }
  if (violations.length > 0) {
    console.log(`[audit-db-test-guards] --staged: ❌ ${violations.length} staged unit test(s) touch a DB without a guard:`);
    for (const v of violations) console.log(`   ${v}`);
    console.log('\n   Mock the supabase client (vi.mock) if this is really a unit test,');
    console.log('   or move it to the db project (tests/integration|database|db-invariants or name it *.db.test.js).');
  }
  if (misrouted.length > 0) {
    console.log(`[audit-db-test-guards] --staged: ❌ MISROUTED — ${misrouted.length} staged describeDb suite(s) in unit-project paths:`);
    for (const m of misrouted) console.log(`   ${m}`);
    console.log('\n   describeDb suites can never run in the unit tier (no credentials).');
    console.log('   Rename the file to *.db.test.js (git mv) so it runs in the db project.');
  }
  process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const asJson = args.includes('--json');
  const doUpdateBaseline = args.includes('--update-baseline');
  const forceGrow = args.includes('--force-grow');

  if (args.includes('--staged')) {
    runStaged();
    return;
  }

  let scan;
  try {
    scan = scanAll();
  } catch (e) {
    console.error(`[audit-db-test-guards] failed to scan ${TESTS_ROOT}: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  const { scanned, flagged, misrouted } = scan;

  const baseline = readBaseline();
  if (baseline === null) return; // parse error already reported (exit 2)

  if (doUpdateBaseline) {
    const res = updateBaseline(flagged, baseline, forceGrow);
    if (!res.ok) {
      console.error(`[audit-db-test-guards] ❌ REFUSING to grow the baseline (${baseline.length} → ${res.next.length} files).`);
      console.error('   The ratchet only shrinks. New unguarded DB tests must be mocked or routed to the db project.');
      console.error('   If you REALLY mean to grandfather new files, re-run with --force-grow.');
      process.exitCode = 1;
      return;
    }
    writeFileSync(join(REPO_ROOT, BASELINE_REL_PATH), `${JSON.stringify(res.next, null, 2)}\n`);
    console.log(`[audit-db-test-guards] baseline updated: ${baseline.length} → ${res.next.length} file(s)${res.grew ? ' (GREW — --force-grow)' : ''}`);
    if (misrouted.length > 0) {
      console.log(`[audit-db-test-guards] ⚠️  ${misrouted.length} MISROUTED file(s) are NOT baselined — fix by renaming to *.db.test.js`);
      process.exitCode = 1;
    }
    return;
  }

  const { newFlagged, tolerated, removed } = computeRatchet(flagged, baseline);

  if (asJson) {
    console.log(JSON.stringify({
      scanned,
      flagged_count: flagged.length,
      flagged,
      misrouted_count: misrouted.length,
      misrouted,
      baseline_count: baseline.length,
      new_flagged: newFlagged,
      baseline_removable: removed,
    }, null, 2));
  } else {
    console.log(`[audit-db-test-guards] scanned ${scanned} unit-project test files`);
    if (listOnly) {
      if (flagged.length === 0 && misrouted.length === 0) {
        console.log('[audit-db-test-guards] ✅ no unguarded DB-touching tests in the unit project');
      } else {
        if (flagged.length > 0) {
          console.log(`[audit-db-test-guards] ${flagged.length} unguarded DB-touching unit test(s):`);
          for (const f of flagged) console.log(`   ${f}`);
        }
        for (const m of misrouted) console.log(`   MISROUTED ${m}`);
      }
    } else if (newFlagged.length === 0 && misrouted.length === 0) {
      console.log(`[audit-db-test-guards] ✅ baseline ${tolerated.length} tolerated, 0 new`);
      if (removed.length > 0) {
        console.log(`[audit-db-test-guards] ℹ️  ${removed.length} baseline file(s) no longer flagged — run --update-baseline to ratchet down:`);
        for (const r of removed) console.log(`   ${r}`);
      }
    } else {
      if (newFlagged.length > 0) {
        console.log(`[audit-db-test-guards] ❌ ${newFlagged.length} NEW unit test(s) touch a DB without a guard (baseline ${tolerated.length} tolerated):`);
        for (const f of newFlagged) console.log(`   ${f}`);
        console.log('\n   Fix: mock the supabase client (vi.mock) if this is really a unit test,');
        console.log('   or move the file into the db project (tests/integration|database|db-invariants or *.db.test.js).');
      }
      if (misrouted.length > 0) {
        console.log(`[audit-db-test-guards] ❌ MISROUTED — ${misrouted.length} describeDb suite(s) in unit-project paths:`);
        for (const m of misrouted) console.log(`   ${m}`);
        console.log('\n   describeDb suites can never run in the unit tier (no credentials).');
        console.log('   Rename the file to *.db.test.js (git mv) so it runs in the db project.');
      }
    }
  }

  if (!listOnly && (newFlagged.length > 0 || misrouted.length > 0)) {
    process.exitCode = 1;
  }
}

// Main-guard: only run the CLI when invoked directly, so importing the pure
// helpers for tests does not trigger a filesystem scan + process.exitCode.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
