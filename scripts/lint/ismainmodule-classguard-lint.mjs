#!/usr/bin/env node
/**
 * isMainModule Raw-Pattern Class Guard Lint
 * SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-B
 *
 * Scans scripts/** for the proven, recurring false-negative class: the raw, Windows-broken
 * direct-execution guard `import.meta.url === `file://${process.argv[1]}`` (argv[1] is a
 * backslash path on Windows; import.meta.url is a proper file:// URL — they never match, so
 * every instance silently no-ops the guard on Windows). Reuses the SAME detection logic as
 * eslint-rules/no-raw-ismainmodule-comparison.js (via ESLint's Linter API) so there is exactly
 * one implementation of the anti-pattern shape, not a second grep/regex detector that could
 * drift out of sync.
 *
 * scripts/archive/** is NEVER scanned — it holds ~140 dead one-time/archived instances that are
 * explicitly out of scope (per the parent SD and sibling child -A, which convert only confirmed-
 * live sites). A reason-required allowlist (ismainmodule-classguard-allowlist.json) grandfathers
 * the 21 confirmed-live files still pending conversion by sibling child -A, so this guard is
 * genuinely blocking for any NEW/reintroduced instance without red-lining CI on pre-existing,
 * already-tracked debt that belongs to a different child SD.
 *
 * Usage:
 *   node scripts/lint/ismainmodule-classguard-lint.mjs [--json] [--root <dir>]
 *   npm run lint:ismainmodule-classguard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import typescriptParser from '@typescript-eslint/parser';
import rule from '../../eslint-rules/no-raw-ismainmodule-comparison.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.resolve(__dirname, 'ismainmodule-classguard-allowlist.json');

const SCAN_DIRS = ['scripts'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.|\.d\.ts$|\.min\.js$)/i;

const RULE_ID = 'ismainmodule-classguard/no-raw-ismainmodule-comparison';

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
    'ismainmodule-classguard': { rules: { 'no-raw-ismainmodule-comparison': rule } },
  },
  rules: {
    [RULE_ID]: 'error',
  },
};

/**
 * Load the grandfather allowlist. Every entry MUST carry a non-empty reason string — throws
 * loud on any malformed entry rather than silently accepting it. Missing file -> empty allowlist
 * (fail-open on absence, not on malformed content).
 * @param {string} [allowlistPath]
 * @returns {Record<string, string>}
 */
export function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  let raw;
  try { raw = fs.readFileSync(allowlistPath, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${allowlistPath}: ${e.message}`); }
  const entries = json.allow || json;
  for (const [file, reason] of Object.entries(entries)) {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new Error(`Allowlist entry '${file}' must have a non-empty reason string`);
    }
  }
  return entries;
}

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

  const allow = loadAllowlist();

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(scanRoot, dir), files);
  }

  const linter = new Linter({ cwd: scanRoot });
  const hits = files.flatMap((f) => lintFile(linter, f));
  const violations = hits.filter((h) => !(h.filePath in allow));
  const grandfathered = hits.filter((h) => h.filePath in allow);

  if (jsonMode) {
    console.log(JSON.stringify({ scanned: files.length, violations, grandfathered: grandfathered.length }, null, 2));
  } else if (violations.length === 0) {
    console.log(`✅ ismainmodule-classguard-lint: 0 ungoverned violations across ${files.length} file(s) scanned (scripts/**, excluding scripts/archive/**); ${grandfathered.length} grandfathered.`);
  } else {
    console.error(`❌ ismainmodule-classguard-lint: ${violations.length} violation(s) across ${files.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    }
    console.error('\nFix: use isMainModule(import.meta.url) from lib/utils/is-main-module.js instead of the raw comparison.');
    console.error('Or, if this file is genuinely pending sibling-SD conversion, add a reason-required entry to scripts/lint/ismainmodule-classguard-allowlist.json.');
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
