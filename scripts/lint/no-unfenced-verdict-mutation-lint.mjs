#!/usr/bin/env node
/**
 * Driver for eslint-rules/no-unfenced-verdict-mutation.js — SD-LEO-INFRA-WRITER-SUB-AGENT-001 (FR-4/FR-7).
 *
 * THIS FILE IS THE REQUIREMENT, NOT PLUMBING. The class-guard this SD originally intended to copy
 * (eslint-rules/no-process-cwd-in-sub-agents.js, from SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-4) shipped
 * with 82 passing unit tests and HAS NEVER INSPECTED A REAL FILE. Verified four ways during PLAN:
 *   1. `npx eslint --print-config lib/sub-agents/resolve-repo.js` resolves 8 rules, ZERO custom.
 *   2. eslint.config.js registers exactly one local plugin, and it is not that one.
 *   3. lib/sub-agents/.eslintrc.json is eslintrc format, which ESLint 9 IGNORES under flat config —
 *      its own `_comment` claiming it activates the rule is simply false.
 *   4. Linting the tree reports "Definition for rule ... was not found" at the two source sites that
 *      already carry escape-hatch pragmas: the pragmas are DANGLING.
 * No driver, no workflow, no package script; bare `npm run lint` runs in no workflow and
 * .husky/pre-commit invokes eslint with `|| true`.
 *
 * A correct rule that nothing runs is indistinguishable from no rule, and it ships GREEN. That is
 * the same shape as the defect this SD fixes — a guard whose failure is silent — so reachability is
 * asserted here rather than assumed. Shape copied from scripts/lint/no-mocked-sut-import-lint.mjs,
 * which is one of 18 lint drivers in this repo that DO reach the tree.
 *
 * MODE: blocking by default over a MEASURED-CLEAN scope. Unlike the mocked-SUT driver (which found
 * a 334-file backlog and had to ship warn-only), the converted tree is clean, so there is no backlog
 * to burn down and no reason to default to advisory. Set VERDICT_MUTATION_MODE=warn to downgrade.
 *
 * Usage:
 *   node scripts/lint/no-unfenced-verdict-mutation-lint.mjs            # changed files
 *   node scripts/lint/no-unfenced-verdict-mutation-lint.mjs --all      # full sweep
 *   node scripts/lint/no-unfenced-verdict-mutation-lint.mjs --all --json
 */

import { Linter } from 'eslint';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rule from '../../eslint-rules/no-unfenced-verdict-mutation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The evidence path. Scoped deliberately: a repo-wide sweep would flag unrelated `verdict` fields. */
const SCAN_DIRS = ['lib/sub-agents', 'lib/sub-agent-executor', 'scripts/modules/orchestrator',
  'scripts/modules/phase-subagent-orchestrator', 'scripts/modules/handoff'];
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archived'];
const SOURCE_FILE_RE = /\.[cm]?js$/i;

const RULE_ID = 'verdict-chain/no-unfenced-verdict-mutation';

/** Shapes the predicate knowingly does NOT catch. Printed every run so the gap stays visible. */
const KNOWN_MISSED = [
  'spread-rebuild: `return { ...results, verdict: X }` creates a new object, so nothing is overwritten (live at lib/fleet/spawn-control.js:1419)',
  'helper-indirected: `applyX(results)` where the overwrite happens in another file — single-file AST cannot follow it',
  'read-modify-write whose condition tests something OTHER than .verdict (e.g. lib/sub-agents/performance.js:239)'
];

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
  plugins: { 'verdict-chain': { rules: { 'no-unfenced-verdict-mutation': rule } } },
  rules: { [RULE_ID]: 'error' },
};

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (EXCLUDE_DIR_SEGMENTS.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (SOURCE_FILE_RE.test(e.name)) out.push(full);
  }
  return out;
}

function candidateFilesAll(root) {
  const out = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), out);
  return out;
}

function candidateFilesDiff(root) {
  // execFileSync, not execSync: no shell features are needed, so no shell is involved.
  const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim();
  const names = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  return names
    .filter((n) => SOURCE_FILE_RE.test(n) && SCAN_DIRS.some((d) => n.startsWith(`${d}/`)))
    .map((n) => path.join(root, n))
    .filter((p) => fs.existsSync(p));
}

/**
 * A disable comment without a `-- <reason>` is itself a finding. Silent exemption is how a fence
 * becomes decorative, which is the failure mode this whole SD is about.
 */
function bareDisables(code, relPath) {
  const out = [];
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('no-unfenced-verdict-mutation')) return;
    if (!/eslint-disable/.test(line)) return;
    if (!/--\s*\S/.test(line)) {
      out.push({ filePath: relPath, line: i + 1, column: 1, message: 'eslint-disable for no-unfenced-verdict-mutation without a "-- <reason>". The reason is mandatory.' });
    }
  });
  return out;
}

function lintFile(linter, filePath) {
  let code;
  try { code = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  let messages;
  try {
    messages = linter.verify(code, FLAT_CONFIG, { filename: filePath });
  } catch (e) {
    // A file the parser cannot read is NOT a clean file — say so, because a silent drop and a pass
    // look identical downstream.
    console.warn(`⚠️  skipped (parse): ${rel} — ${String(e.message).split('\n')[0]}`);
    return [];
  }
  const findings = messages
    .filter((m) => m.ruleId === RULE_ID)
    .map((m) => ({ filePath: rel, line: m.line, column: m.column, message: m.message }));
  return findings.concat(bareDisables(code, rel));
}

function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const wantAll = argv.includes('--all');
  const blocking = (process.env.VERDICT_MUTATION_MODE || 'block').toLowerCase() !== 'warn';

  let mode = 'diff';
  let scanned;
  if (wantAll) {
    mode = 'all';
    scanned = candidateFilesAll(REPO_ROOT);
  } else {
    try {
      scanned = candidateFilesDiff(REPO_ROOT);
    } catch (e) {
      console.warn(`⚠️  diff base unavailable (${String(e.message).split('\n')[0]}) — falling back to --all`);
      mode = 'all (degraded)';
      scanned = candidateFilesAll(REPO_ROOT);
    }
  }

  const linter = new Linter({ configType: 'flat' });
  const findings = scanned.flatMap((f) => lintFile(linter, f));

  if (jsonMode) {
    console.log(JSON.stringify({ mode, scanned: scanned.length, findings, known_missed: KNOWN_MISSED }, null, 2));
  } else {
    console.log(`[verdict-mutation-lint] mode=${mode} scanned=${scanned.length} findings=${findings.length} enforcement=${blocking ? 'BLOCK' : 'warn'}`);
    for (const f of findings) console.log(`  ${f.filePath}:${f.line}:${f.column} — ${f.message}`);
    // NO SILENT CAPS: the shapes this predicate cannot see are printed every run, so "0 findings"
    // is never mistaken for "0 mutators".
    console.log('[verdict-mutation-lint] KNOWN-MISSED shapes (not covered by this predicate):');
    for (const k of KNOWN_MISSED) console.log(`  - ${k}`);
  }

  if (findings.length > 0 && blocking) process.exit(1);
  process.exit(0);
}

main();
