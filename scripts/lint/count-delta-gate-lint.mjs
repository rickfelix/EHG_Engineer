#!/usr/bin/env node
/**
 * Count-Delta Gate Assertion Lint
 * SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 FR-4 / FR-5
 *
 * Scans scripts/ci/**, scripts/hooks/**, scripts/modules/** for the proven, recurring
 * false-positive class: a gate flagging on a raw failure-COUNT delta (e.g. "failures rose
 * 105 -> 107") rather than an identity-set diff of WHICH tests/files changed. Reuses the SAME
 * detection logic as eslint-rules/no-count-delta-gate-assertion.js (via ESLint's Linter API) so
 * there is exactly one implementation of the anti-pattern shape, not a second grep/regex
 * detector that could drift out of sync.
 *
 * Usage:
 *   node scripts/lint/count-delta-gate-lint.mjs [--json] [--root <dir>]
 *   npm run lint:count-delta-gate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import typescriptParser from '@typescript-eslint/parser';
import rule from '../../eslint-rules/no-count-delta-gate-assertion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCAN_DIRS = ['scripts/ci', 'scripts/hooks', 'scripts/modules'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;

const RULE_ID = 'count-delta-gate/no-count-delta-gate-assertion';

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
    'count-delta-gate': { rules: { 'no-count-delta-gate-assertion': rule } },
  },
  rules: {
    [RULE_ID]: 'error',
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

function lintFile(linter, absPath) {
  const relPath = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
  let code;
  try {
    code = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return [{ filePath: relPath, line: 0, column: 0, message: `Could not read file: ${err.message}` }];
  }
  const isTypeScript = path.extname(absPath) === '.ts' || path.extname(absPath) === '.tsx';
  const config = {
    ...FLAT_CONFIG,
    languageOptions: {
      ...FLAT_CONFIG.languageOptions,
      ...(isTypeScript ? { parser: typescriptParser } : {}),
    },
  };
  let messages;
  try {
    messages = linter.verify(code, config, { filename: absPath });
  } catch (err) {
    return [{ filePath: relPath, line: 0, column: 0, message: `Parse error: ${err.message}` }];
  }
  return messages
    .filter((m) => m.ruleId === RULE_ID)
    .map((m) => ({ filePath: relPath, line: m.line, column: m.column, message: m.message }));
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const scanRoot = rootIdx !== -1 && args[rootIdx + 1] ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(scanRoot, dir), files);
  }

  // Flat-config ESLint requires an explicit cwd to resolve absolute filenames passed to
  // verify() — see the sibling realtime-subscribe-teardown-recursion-lint.mjs for the empirical
  // basis of this requirement.
  const linter = new Linter({ cwd: scanRoot });
  const violations = files.flatMap((f) => lintFile(linter, f));

  if (jsonMode) {
    console.log(JSON.stringify({ scanned: files.length, violations }, null, 2));
  } else if (violations.length === 0) {
    console.log(`✅ count-delta-gate-lint: 0 violations across ${files.length} file(s) scanned (scripts/ci/**, scripts/hooks/**, scripts/modules/**)`);
  } else {
    console.error(`❌ count-delta-gate-lint: ${violations.length} violation(s) across ${files.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    }
    console.error('\nFix: use lib/gates/identity-diff-gate.cjs computeIdentityRegression(currentIds, priorFailingIds) — a SET diff of failing identities, not a raw count comparison.');
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
