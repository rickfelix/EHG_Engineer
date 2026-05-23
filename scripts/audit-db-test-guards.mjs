#!/usr/bin/env node
/**
 * Audit: DB-test guard categorization for the vitest db/no-db project split.
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-3).
 *
 * Statically scans the files that belong to the default no-DB `unit` vitest
 * project (tests/** minus the DB-dir suites that live in the `db` project) and
 * fails if any test touches a live Supabase connection without a skip guard.
 * A guarded test self-skips when no credentials are present (HAS_REAL_DB false),
 * keeping the default `npm test` run fast and green; an unguarded one would
 * hang/fail against the synthetic test.invalid.local sentinel.
 *
 * Exit codes: 0 = clean (or --list), 1 = violations found, 2 = usage error.
 *
 * Usage:
 *   node scripts/audit-db-test-guards.mjs            # CI/pre-commit: non-zero on violations
 *   node scripts/audit-db-test-guards.mjs --list     # just list flagged files (exit 0)
 *   node scripts/audit-db-test-guards.mjs --json      # machine-readable report
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TESTS_ROOT = join(REPO_ROOT, 'tests');

// Directories whose suites live in the opt-in `db` project (excluded from the
// unit project) — keep in sync with DB_INCLUDE in vitest.config.js.
const DB_DIRS = new Set(['integration', 'database', 'db-invariants', 'migration-readiness']);
// Individual files routed to the db project regardless of directory.
const DB_FILE_NAMES = new Set(['smoke.test.js']);
// Directories never run by the unit project (e2e, etc.) — skip from the audit.
const SKIP_DIRS = new Set(['e2e', 'node_modules']);

// A test "touches a live DB" if it imports a Supabase/PG client or reads the
// connection env vars directly.
export const DB_IMPORT_SIGNAL = /@supabase\/supabase-js|createSupabaseServiceClient|createSupabaseClient|getSupabaseClient|createDatabaseClient|createServiceClient\b|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL\b|SUPABASE_POOLER_URL/;
// A test is guarded if it self-skips when no real DB is configured.
export const GUARD_SIGNAL = /HAS_REAL_DB|describeDb|itDb|\.skipIf\s*\(|TEST_REQUIRES_DB/;

/**
 * A unit-project test is a violation when it touches a live DB but is not
 * guarded to self-skip without credentials. Pure predicate for testability.
 * @param {string} content test file source
 * @returns {boolean}
 */
export function isUnguardedDbTest(content) {
  return DB_IMPORT_SIGNAL.test(content) && !GUARD_SIGNAL.test(content);
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
    } else if (entry.isFile() && entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js')) {
      if (DB_FILE_NAMES.has(entry.name)) continue; // routed to db project
      out.push(full);
    }
  }
  return out;
}

/**
 * Staged-file gate (pre-commit): block only NEWLY staged unit-project test
 * files that touch a DB without a guard. This prevents regressions without
 * forcing the ~74 grandfathered pure-logic client-importers to be wrapped.
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
  for (const rel of staged) {
    if (!isUnitProjectTestPath(rel)) continue;
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    let content;
    try { content = readFileSync(abs, 'utf8'); } catch { continue; }
    if (isUnguardedDbTest(content)) violations.push(rel.split(sep).join('/'));
  }

  if (violations.length === 0) {
    console.log('[audit-db-test-guards] --staged: ✅ no new unguarded DB-touching unit tests');
    return;
  }
  console.log(`[audit-db-test-guards] --staged: ❌ ${violations.length} staged unit test(s) touch a DB without a guard:`);
  for (const v of violations) console.log(`   ${v}`);
  console.log('\n   Wrap the suite in describeDb (import { describeDb } from tests/helpers/db-available.js)');
  console.log('   or move it to the db project (tests/integration|database|db-invariants or name it *.db.test.js).');
  process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const asJson = args.includes('--json');

  if (args.includes('--staged')) {
    runStaged();
    return;
  }

  let files = [];
  try {
    files = walk(TESTS_ROOT);
  } catch (e) {
    console.error(`[audit-db-test-guards] failed to scan ${TESTS_ROOT}: ${e.message}`);
    process.exitCode = 2;
    return;
  }

  const flagged = [];
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (isUnguardedDbTest(content)) {
      flagged.push(relative(REPO_ROOT, file).split(sep).join('/'));
    }
  }
  flagged.sort();

  if (asJson) {
    console.log(JSON.stringify({ scanned: files.length, flagged_count: flagged.length, flagged }, null, 2));
  } else {
    console.log(`[audit-db-test-guards] scanned ${files.length} unit-project test files`);
    if (flagged.length === 0) {
      console.log('[audit-db-test-guards] ✅ no unguarded DB-touching tests in the unit project');
    } else {
      console.log(`[audit-db-test-guards] ❌ ${flagged.length} unit test(s) touch a DB without a describeDb/HAS_REAL_DB guard:`);
      for (const f of flagged) console.log(`   ${f}`);
      console.log('\n   Fix: wrap the suite in describeDb (import from tests/helpers/db-available.js)');
      console.log('   or move the file into the db project (tests/integration|database|db-invariants or *.db.test.js).');
    }
  }

  if (!listOnly && flagged.length > 0) {
    process.exitCode = 1;
  }
}

// Main-guard: only run the CLI when invoked directly, so importing the pure
// helpers for tests does not trigger a filesystem scan + process.exitCode.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
