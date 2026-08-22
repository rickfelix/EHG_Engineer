#!/usr/bin/env node
/**
 * scripts/one-off/* Missing Main-Guard Class Guard Lint
 * SD-FDBK-ENH-578-SCRIPTS-ONE-001
 *
 * Scans scripts/one-off/**\/*.{mjs,cjs} for an unconditional top-level main()/run() entrypoint
 * call with no recognized guard -- the exact shape that caused the 2026-08-21 incident
 * (importing scripts/one-off/backfill-solomon-ledger-decision-by.mjs for inspection executed
 * main() for real against live prod, mutating 1212 rows irreversibly). Reuses the SAME
 * detection logic as eslint-rules/require-main-guard-in-one-off.js (via ESLint's Linter API) so
 * there is exactly one implementation of the anti-pattern shape.
 *
 * Structurally modeled on scripts/lint/ismainmodule-classguard-lint.mjs: eslint-rules/*.js is
 * NOT wired into eslint.config.js flat config in this repo (see that file's own comment block)
 * -- enforcement is via this standalone driver loading the rule directly through ESLint's
 * Linter API, not through eslint.config.js registration.
 *
 * A reason-required allowlist (require-main-guard-in-one-off-allowlist.json) grandfathers
 * pre-existing unguarded files pending retrofit, without red-lining CI for the whole corpus.
 *
 * Usage:
 *   node scripts/lint/require-main-guard-in-one-off-lint.mjs [--json] [--root <dir>]
 *   npm run lint:main-guard-one-off
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import rule from '../../eslint-rules/require-main-guard-in-one-off.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.resolve(__dirname, 'require-main-guard-in-one-off-allowlist.json');

const SCAN_DIRS = ['scripts/one-off'];
const SCAN_EXTENSIONS = new Set(['.mjs', '.cjs']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive', '_deprecated'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.)/i;

const RULE_ID = 'require-main-guard-in-one-off/require-main-guard-in-one-off';

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
    'require-main-guard-in-one-off': { rules: { 'require-main-guard-in-one-off': rule } },
  },
  rules: {
    [RULE_ID]: 'error',
  },
};

/**
 * Load the grandfather allowlist. Every entry MUST carry a non-empty reason string -- throws
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
  let messages;
  try {
    messages = linter.verify(code, FLAT_CONFIG, { filename: absPath });
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
    console.log(`✅ require-main-guard-in-one-off-lint: 0 ungoverned violations across ${files.length} file(s) scanned (scripts/one-off/**/*.{mjs,cjs}); ${grandfathered.length} grandfathered.`);
  } else {
    console.error(`❌ require-main-guard-in-one-off-lint: ${violations.length} violation(s) across ${files.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath}:${v.line}:${v.column}  ${v.message}`);
    }
    console.error('\nFix: wrap the entrypoint call, e.g. if (isMainModule(import.meta.url)) { main().catch(...) } (from lib/utils/is-main-module.js).');
    console.error('Or, if this file is genuinely pending retrofit, add a reason-required entry to scripts/lint/require-main-guard-in-one-off-allowlist.json.');
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
