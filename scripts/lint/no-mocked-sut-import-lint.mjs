#!/usr/bin/env node
/**
 * Driver for eslint-rules/no-mocked-sut-import.js — SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 (FR-3).
 *
 * Same 3-part class-guard shape as scripts/lint/session-coordination-insert-classguard-lint.mjs,
 * with one inversion: this rule targets TEST files, so SCAN_DIRS is tests/ rather than scripts+lib.
 *
 * *** WARN-ONLY THIS INCREMENT, AND THAT IS A MEASURED DECISION, NOT TIMIDITY. ***
 * 334 of 3082 unit test files (~10.8%) mock a local module, and sampling showed most are ordinary
 * collaborator isolation. Blocking on day one would flag hundreds of correct files and the rule
 * would simply be disabled. Promotion is one env var away once the backlog is burned down:
 *   NO_MOCKED_SUT_IMPORT_MODE=block
 * Default is OFF, matching ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING / INVOCATION_PATH_PROOF_MODE.
 *
 * Modes: --diff (default, changed files only) | --all (full sweep) | --json.
 *
 * Usage:
 *   node scripts/lint/no-mocked-sut-import-lint.mjs           # changed test files
 *   node scripts/lint/no-mocked-sut-import-lint.mjs --all     # full sweep (baseline count)
 *   node scripts/lint/no-mocked-sut-import-lint.mjs --all --json
 */

import { Linter } from 'eslint';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rule from '../../eslint-rules/no-mocked-sut-import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCAN_DIRS = ['tests'];
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archived'];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?js$/i;

const RULE_ID = 'mocked-sut-import/no-mocked-sut-import';

const FLAT_CONFIG = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      console: 'readonly', process: 'readonly', require: 'readonly', module: 'readonly',
      exports: 'readonly', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly',
      setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
      vi: 'readonly', jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly',
      beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
    },
  },
  plugins: { 'mocked-sut-import': { rules: { 'no-mocked-sut-import': rule } } },
  rules: { [RULE_ID]: 'error' },
};

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (EXCLUDE_DIR_SEGMENTS.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (TEST_FILE_RE.test(e.name)) out.push(full);
  }
  return out;
}

function candidateFilesAll(root) {
  const out = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), out);
  return out;
}

function candidateFilesDiff(root) {
  const base = execSync('git merge-base HEAD origin/main', { cwd: root, encoding: 'utf8' }).trim();
  const names = execSync(`git diff --name-only ${base}...HEAD`, { cwd: root, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  return names
    .filter((n) => TEST_FILE_RE.test(n) && SCAN_DIRS.some((d) => n.startsWith(`${d}/`)))
    .map((n) => path.join(root, n))
    .filter((p) => fs.existsSync(p));
}

function lintFile(linter, filePath) {
  let code;
  try {
    code = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  let messages;
  try {
    messages = linter.verify(code, FLAT_CONFIG, { filename: filePath });
  } catch (e) {
    // A file this parser cannot read is NOT a violation — say so rather than silently dropping it,
    // because a silent drop is indistinguishable from a clean file.
    console.warn(`⚠️  skipped (parse): ${rel} — ${String(e.message).split('\n')[0]}`);
    return [];
  }
  return messages
    .filter((m) => m.ruleId === RULE_ID)
    .map((m) => ({ filePath: rel, line: m.line, column: m.column, message: m.message }));
}

function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const wantAll = argv.includes('--all');
  const scanRoot = REPO_ROOT;

  let mode = 'diff';
  let scanned;
  if (wantAll) {
    mode = 'all';
    scanned = candidateFilesAll(scanRoot);
  } else {
    try {
      scanned = candidateFilesDiff(scanRoot);
    } catch (e) {
      console.warn(`⚠️  diff base unavailable (${String(e.message).split('\n')[0]}) — falling back to --all (advisory)`);
      mode = 'all (degraded)';
      scanned = candidateFilesAll(scanRoot);
    }
  }

  const linter = new Linter({ cwd: scanRoot });
  const violations = scanned.flatMap((f) => lintFile(linter, f));

  // Promotion gate: blocking requires BOTH true diff mode AND an explicit opt-in. Default is
  // warn-only, so this can never fail a merge in this increment.
  const promoted = process.env.NO_MOCKED_SUT_IMPORT_MODE === 'block';
  const blocking = mode === 'diff' && promoted;

  if (jsonMode) {
    console.log(JSON.stringify({ mode, scanned: scanned.length, violations, blocking, promoted }, null, 2));
  } else if (violations.length === 0) {
    console.log(`✅ no-mocked-sut-import-lint (${mode}): 0 findings across ${scanned.length} test file(s)`);
  } else if (!blocking) {
    console.warn(`⚠️  no-mocked-sut-import-lint (${mode}, WARN-ONLY): ${violations.length} finding(s) across ${scanned.length} test file(s) — not blocking\n`);
    for (const v of violations) console.warn(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    console.warn('\nA suite that mocks its own subject is describing the stub. Drive the real module and mock only the IO boundary beneath it,');
    console.warn('or suppress with a reason: // eslint-disable-next-line no-mocked-sut-import -- <why the real contract is covered elsewhere>');
  } else {
    console.error(`❌ no-mocked-sut-import-lint (${mode}): ${violations.length} finding(s) across ${scanned.length} test file(s)\n`);
    for (const v of violations) console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
  }

  process.exit(violations.length > 0 && blocking ? 1 : 0);
}

main();
