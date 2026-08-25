#!/usr/bin/env node
/**
 * release_sd Raw-Call Class Guard Lint
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-4)
 *
 * Scans scripts/**\/*.{mjs,cjs,js} and lib/**\/*.{mjs,cjs,js} (whole-corpus, not diff-scoped)
 * for a raw `<obj>.rpc('release_sd', ...)` call site -- the exact shape behind QF-20260726-593:
 * release_sd is SESSION-scoped, not SD-scoped, so an un-guarded caller can silently drop an
 * unrelated live claim. Uses the SAME detection logic as
 * eslint-rules/require-release-sd-wrapper.js (via ESLint's Linter API), structurally modeled
 * on scripts/lint/require-main-guard-in-one-off-lint.mjs.
 *
 * ALLOWLIST SHAPE DIFFERS DELIBERATELY from that sibling control. A file-keyed boolean
 * allowlist (`{ "path": "reason" }`) would blind this lint to a NEW raw call added to a file
 * that already has one legacy entry -- several files in this corpus mix already-wrapped and
 * still-raw call sites. Entries here are COUNT-ANCHORED instead:
 *   { "path/to/file.js": { "reason": "...", "expected": N } }
 * A file's hits are ungoverned (violation) if it has no allowlist entry at all; if it HAS an
 * entry, only an observed count EXCEEDING `expected` is a violation -- fewer hits than expected
 * (i.e. a site was fixed) passes silently rather than forcing an allowlist edit in lockstep with
 * every fix.
 *
 * STRUCTURAL EXEMPTION (not allowlist): lib/fleet/best-effort-release.mjs's own internal call is
 * the one sanctioned implementation of the wrapper this lint enforces everyone else use -- it is
 * excluded from the scan outright, not merely allowlisted, so it can never accumulate an
 * expected-count entry that would silently absorb a second, unrelated raw call added to that
 * same file later.
 *
 * Usage:
 *   node scripts/lint/require-release-sd-wrapper-lint.mjs [--json] [--root <dir>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Linter } from 'eslint';
import rule from '../../eslint-rules/require-release-sd-wrapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.resolve(__dirname, 'require-release-sd-wrapper-allowlist.json');

const SCAN_DIRS = ['scripts', 'lib'];
const SCAN_EXTENSIONS = new Set(['.mjs', '.cjs', '.js']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive', '_deprecated'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.)/i;

// The one sanctioned implementation site -- structurally exempt, never allowlisted.
const STRUCTURAL_EXEMPT_FILES = new Set(['lib/fleet/best-effort-release.mjs']);

const RULE_ID = 'require-release-sd-wrapper/require-release-sd-wrapper';

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
    'require-release-sd-wrapper': { rules: { 'require-release-sd-wrapper': rule } },
  },
  rules: {
    [RULE_ID]: 'error',
  },
};

/**
 * Load the count-anchored allowlist. Every entry MUST carry a non-empty reason string and a
 * non-negative integer `expected` -- throws loud on any malformed entry rather than silently
 * accepting it. Missing file -> empty allowlist (fail-open on absence, not on malformed content).
 * @param {string} [allowlistPath]
 * @returns {Record<string, {reason: string, expected: number}>}
 */
export function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  let raw;
  try { raw = fs.readFileSync(allowlistPath, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${allowlistPath}: ${e.message}`); }
  const entries = json.allow || json;
  for (const [file, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Allowlist entry '${file}' must be an object with {reason, expected}`);
    }
    if (!entry.reason || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`Allowlist entry '${file}' must have a non-empty reason string`);
    }
    if (!Number.isInteger(entry.expected) || entry.expected < 0) {
      throw new Error(`Allowlist entry '${file}' must have a non-negative integer 'expected' count`);
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

function lintFile(linter, absPath, relPath) {
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

/**
 * Evaluate hits (grouped by file, already exempt-filtered) against the count-anchored allowlist.
 * @returns {{ violations: object[], governed: object[] }}
 */
export function evaluateHits(hitsByFile, allow) {
  const violations = [];
  const governed = [];
  for (const [filePath, hits] of hitsByFile.entries()) {
    const entry = allow[filePath];
    if (!entry) {
      violations.push({ filePath, hits, reason: 'no allowlist entry' });
      continue;
    }
    if (hits.length > entry.expected) {
      violations.push({
        filePath,
        hits,
        reason: `expected ${entry.expected}, found ${hits.length} (${entry.reason})`,
      });
    } else {
      governed.push({ filePath, hits, entry });
    }
  }
  return { violations, governed };
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const scanRoot = rootIdx !== -1 && args[rootIdx + 1] ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;
  // SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (TESTING finding, EXEC-TO-PLAN): without this flag,
  // --root only redirects the SCAN, not the allowlist -- a test proving count-anchor behavior
  // would otherwise have to mutate the real, version-controlled allowlist JSON in place.
  const allowlistIdx = args.indexOf('--allowlist');
  const allowlistPath = allowlistIdx !== -1 && args[allowlistIdx + 1] ? path.resolve(args[allowlistIdx + 1]) : ALLOWLIST_PATH;

  const allow = loadAllowlist(allowlistPath);

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(scanRoot, dir), files);
  }

  const linter = new Linter({ cwd: scanRoot });
  const hitsByFile = new Map();
  for (const f of files) {
    const relPath = path.relative(scanRoot, f).split(path.sep).join('/');
    if (STRUCTURAL_EXEMPT_FILES.has(relPath)) continue;
    const hits = lintFile(linter, f, relPath);
    if (hits.length > 0) hitsByFile.set(relPath, hits);
  }

  const { violations, governed } = evaluateHits(hitsByFile, allow);
  const totalGovernedHits = governed.reduce((n, g) => n + g.hits.length, 0);

  if (jsonMode) {
    console.log(JSON.stringify({ scanned: files.length, violations, governed: governed.length, totalGovernedHits }, null, 2));
  } else if (violations.length === 0) {
    console.log(
      `✅ require-release-sd-wrapper-lint: 0 ungoverned violations across ${files.length} file(s) scanned (scripts/**, lib/**); ${totalGovernedHits} call site(s) in ${governed.length} file(s) governed by allowlist.`
    );
  } else {
    console.error(`❌ require-release-sd-wrapper-lint: ${violations.length} file(s) with ungoverned violation(s)\n`);
    for (const v of violations) {
      console.error(`  ${v.filePath} — ${v.reason}`);
      for (const h of v.hits) {
        console.error(`    ${h.filePath}:${h.line}:${h.column}  ${h.message}`);
      }
    }
    console.error(
      "\nFix: route the call through bestEffortReleaseSd(expectedSdKey) from lib/fleet/best-effort-release.mjs."
    );
    console.error(
      "Or, if this site is a known, pending-retrofit exception, add/raise a {reason, expected} entry in scripts/lint/require-release-sd-wrapper-allowlist.json."
    );
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

main();
