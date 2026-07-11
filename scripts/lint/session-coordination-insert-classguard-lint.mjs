#!/usr/bin/env node
/**
 * Raw session_coordination Insert Class-Guard Lint
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-3b)
 *
 * Scans scripts/ and lib/ for the raw `.from('session_coordination').insert(...)` pattern that
 * bypasses the canonical choke point (insertCoordinationRow() in lib/coordinator/dispatch.cjs).
 * Reuses the SAME detection logic as eslint-rules/no-raw-session-coordination-insert.js (via
 * ESLint's Linter API) so there is exactly one implementation of the pattern, not a second
 * grep/regex detector that could drift out of sync.
 *
 * lib/coordinator/dispatch.cjs itself (the choke point's own definition) and test/fixture files
 * (which legitimately seed rows directly for setup) are excluded from the scan.
 *
 * Modes (mirrors scripts/lint/schema-reference-lint.mjs's precedent — a pre-existing backlog
 * must never block a PR that didn't introduce it):
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main — the
 *       ~28-site existing phantom backlog (this SD deliberately converts only 2 flagship
 *       producers; the DB-level advisory trigger in database/migrations/
 *       20260702_session_coordination_insert_lint.sql already covers the rest regardless of
 *       conversion status) never blocks an unrelated PR.
 *   --all: advisory full sweep of scripts/ + lib/.
 *
 * Usage:
 *   node scripts/lint/session-coordination-insert-classguard-lint.mjs [--diff|--all] [--json] [--root <dir>]
 *   npm run lint:session-coordination-insert-classguard
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import rule from '../../eslint-rules/no-raw-session-coordination-insert.js';
// SD-LEO-INFRA-SESSION-COORDINATION-LANE-001 (clause a): a second, narrower class-guard
// sharing this driver's diff/all/exclusion machinery — flags target_session sourced from an
// echoed row field instead of a fresh identity-resolver call.
import echoedTargetRule from '../../eslint-rules/no-echoed-session-coordination-target.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCAN_DIRS = ['scripts', 'lib'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive', 'one-time', 'temp'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;
const EXCLUDE_PATHS = new Set(['lib/coordinator/dispatch.cjs']);
const EXCLUDE_DIR_PREFIXES = ['tests/'];

const RULE_ID = 'session-coordination-insert-classguard/no-raw-session-coordination-insert';
const ECHOED_TARGET_RULE_ID = 'session-coordination-insert-classguard/no-echoed-session-coordination-target';
const CLASSGUARD_RULE_IDS = new Set([RULE_ID, ECHOED_TARGET_RULE_ID]);

const FLAT_CONFIG = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      console: 'readonly', process: 'readonly', require: 'readonly', module: 'readonly',
      exports: 'readonly', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly',
      setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
    },
  },
  plugins: {
    'session-coordination-insert-classguard': {
      rules: {
        'no-raw-session-coordination-insert': rule,
        'no-echoed-session-coordination-target': echoedTargetRule,
      },
    },
  },
  rules: {
    [RULE_ID]: 'error',
    [ECHOED_TARGET_RULE_ID]: 'error',
  },
};

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIR_SEGMENTS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name)) && !EXCLUDE_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
}

function isExcluded(relPath) {
  if (EXCLUDE_PATHS.has(relPath)) return true;
  return EXCLUDE_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

/** Files changed vs the merge base (+ staged/working-tree, empty in CI) — --diff mode candidates. */
function candidateFilesDiff(repoRoot) {
  const base = process.env.SESSION_COORD_LINT_BASE || 'origin/main';
  const out = [
    execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git diff --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git diff --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
    execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000, cwd: repoRoot }),
  ].join('\n');
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
    .filter((f) => SCAN_EXTENSIONS.has(path.extname(f)))
    .filter((f) => f.split('/')[0] === 'scripts' || f.split('/')[0] === 'lib')
    .filter((f) => !EXCLUDE_FILE_RE.test(path.basename(f)))
    .filter((f) => !isExcluded(f))
    .map((f) => path.join(repoRoot, f));
}

function lintFile(linter, absPath) {
  const relPath = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
  let code;
  try {
    code = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return [{ filePath: relPath, line: 0, column: 0, message: `Could not read file: ${err.message}` }];
  }
  let messages;
  try {
    messages = linter.verify(code, FLAT_CONFIG, { filename: absPath });
  } catch (err) {
    return [{ filePath: relPath, line: 0, column: 0, message: `Parse error: ${err.message}` }];
  }
  return messages
    .filter((m) => CLASSGUARD_RULE_IDS.has(m.ruleId))
    .map((m) => ({ filePath: relPath, line: m.line, column: m.column, message: m.message }));
}

function candidateFilesAll(scanRoot) {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(scanRoot, dir), files);
  }
  return files.filter((f) => !isExcluded(path.relative(REPO_ROOT, f).split(path.sep).join('/')));
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const allMode = args.includes('--all');
  const rootIdx = args.indexOf('--root');
  const scanRoot = rootIdx !== -1 && args[rootIdx + 1] ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;

  let scanned;
  let mode = 'diff';
  if (allMode) {
    mode = 'all';
    scanned = candidateFilesAll(scanRoot);
  } else {
    try {
      scanned = candidateFilesDiff(scanRoot);
    } catch (e) {
      // Fail-soft: no diff base resolvable -> advisory full sweep instead of a false block.
      console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to --all (advisory)`);
      mode = 'all (degraded)';
      scanned = candidateFilesAll(scanRoot);
    }
  }

  const linter = new Linter({ cwd: scanRoot });
  const violations = scanned.flatMap((f) => lintFile(linter, f));
  // Only true diff mode blocks. Both explicit --all (advisory full sweep, per this file's own
  // docstring) and a degraded diff->all fallback (re-surfaces the pre-existing backlog, not new
  // drift introduced by this PR) must never fire a false block.
  const blocking = mode === 'diff';

  if (jsonMode) {
    console.log(JSON.stringify({ mode, scanned: scanned.length, violations, blocking }, null, 2));
  } else if (violations.length === 0) {
    console.log(`✅ session-coordination-insert-classguard-lint (${mode}): 0 violations across ${scanned.length} file(s) scanned`);
  } else if (!blocking) {
    console.warn(`⚠️  session-coordination-insert-classguard-lint (${mode}, advisory): ${violations.length} violation(s) across ${scanned.length} file(s) scanned — not blocking\n`);
    for (const v of violations) console.warn(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
  } else {
    console.error(`❌ session-coordination-insert-classguard-lint (${mode}): ${violations.length} violation(s) across ${scanned.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    }
    console.error('\nFix: route through insertCoordinationRow(supabase, row, opts) in lib/coordinator/dispatch.cjs.');
  }

  process.exit(violations.length > 0 && blocking ? 1 : 0);
}

main();
