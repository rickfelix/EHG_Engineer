#!/usr/bin/env node
/**
 * Realtime removeChannel/unsubscribe-in-subscribe-callback Recursion Lint
 * SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001 FR-1 / FR-3
 *
 * Scans lib/** + server/** for the proven, recurring crash class: calling
 * <ref>.removeChannel(...) or <ref>.unsubscribe() synchronously from inside the
 * callback passed to a .subscribe(...) call. Reuses the SAME detection logic as
 * eslint-rules/no-realtime-teardown-in-subscribe-callback.js (via ESLint's
 * Linter API) so there is exactly one implementation of the anti-pattern shape,
 * not a second grep/regex detector that could drift out of sync.
 *
 * Usage:
 *   node scripts/lint/realtime-subscribe-teardown-recursion-lint.mjs [--json] [--root <dir>]
 *   npm run lint:realtime-teardown
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import typescriptParser from '@typescript-eslint/parser';
import rule from '../../eslint-rules/no-realtime-teardown-in-subscribe-callback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCAN_DIRS = ['lib', 'server'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;

const RULE_ID = 'realtime-teardown/no-realtime-teardown-in-subscribe-callback';

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
    'realtime-teardown': { rules: { 'no-realtime-teardown-in-subscribe-callback': rule } },
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

  // Flat-config ESLint requires an explicit cwd to resolve absolute filenames
  // passed to verify() — without it, config resolution either throws
  // ("Resolved a relative path without a current working directory") or
  // silently no-ops with "No matching configuration found", both observed
  // empirically while validating this script against a scratch fixture root.
  const linter = new Linter({ cwd: scanRoot });
  const violations = files.flatMap((f) => lintFile(linter, f));

  if (jsonMode) {
    console.log(JSON.stringify({ scanned: files.length, violations }, null, 2));
  } else if (violations.length === 0) {
    console.log(`✅ realtime-subscribe-teardown-recursion-lint: 0 violations across ${files.length} file(s) scanned (lib/**, server/**)`);
  } else {
    console.error(`❌ realtime-subscribe-teardown-recursion-lint: ${violations.length} violation(s) across ${files.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    }
    console.error('\nFix: null the local channel reference inside the .subscribe() callback; defer removeChannel()/unsubscribe() to a separate cleanup path OUTSIDE the callback.');
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
