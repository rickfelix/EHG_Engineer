#!/usr/bin/env node
/**
 * scripts/one-off/* mutate+service-role-key manifest generator.
 * SD-LEO-FIX-TEST-FIXTURE-LANE-001.
 *
 * Produces a precomputed, committed manifest of scripts/one-off/** files that BOTH (a) mutate the
 * DB (a Supabase .insert(/.update(/.upsert(/.delete( call) AND (b) hold SUPABASE_SERVICE_ROLE_KEY
 * -- the exact signature of the file class that caused the 2026-08-21 incident (a bare import of
 * scripts/one-off/backfill-solomon-ledger-decision-by.mjs executed a live prod backfill).
 *
 * Consumed lazily by scripts/hooks/lib/one-off-bare-import.cjs (ENF-18): the hook only reads this
 * manifest AFTER its own import/require regex has already matched an operative command, so a
 * non-matching Bash command performs zero manifest I/O (measured NFR: pre-tool-enforce.cjs
 * baseline is already 729-1094ms on a trivial payload -- no latency budget for a live scan).
 *
 * Guard-presence reuses the SAME detection ESLint rule require-main-guard-in-one-off-lint.mjs uses
 * (eslint-rules/require-main-guard-in-one-off.js via ESLint's Linter API), so "guarded" here means
 * exactly what that lint's own violation/pass verdict means -- one implementation of the guard
 * shape, not two that could drift apart.
 *
 * Only DANGEROUS files (mutate + key + unguarded) are written to the manifest -- a guarded file
 * needs no runtime block (FR-3: direct execution and imports of already-guarded files are never
 * blocked).
 *
 * Usage:
 *   node scripts/lint/generate-one-off-mutate-key-manifest.mjs [--check] [--root <dir>]
 *
 * --check: exit 1 if the committed manifest is stale relative to a fresh scan (CI drift-check,
 *          TR-4) instead of overwriting the file.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'node:child_process';
import { Linter } from 'eslint';
import rule from '../../eslint-rules/require-main-guard-in-one-off.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const MANIFEST_PATH = path.resolve(__dirname, 'one-off-mutate-key-manifest.json');

const SCAN_DIRS = ['scripts/one-off'];
const SCAN_EXTENSIONS = new Set(['.mjs', '.cjs', '.js']);
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive', '_deprecated'];
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.)/i;

// The mutate+key signature: a raw SUPABASE_SERVICE_ROLE_KEY env read, plus at least one Supabase
// mutation-shaped call. Deliberately simple/textual (not a full AST walk) -- this manifest is a
// coarse, fast, precomputed CLASSIFIER, not a security proof; false positives (a guarded/inert
// file flagged dangerous) just cost an unnecessary block, false negatives are the real risk and
// are documented as a known gap (PRD risk: "bypassable by a command-shape not covered").
const KEY_RE = /SUPABASE_SERVICE_ROLE_KEY/;
const MUTATE_RE = /\.(insert|update|upsert|delete)\s*\(/;

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
  plugins: { 'require-main-guard-in-one-off': { rules: { 'require-main-guard-in-one-off': rule } } },
  rules: { [RULE_ID]: 'error' },
};

function gitLines(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function isCandidate(relPath) {
  return SCAN_EXTENSIONS.has(path.extname(relPath))
    && !EXCLUDE_FILE_RE.test(path.basename(relPath))
    && !relPath.split('/').some((seg) => EXCLUDE_DIR_SEGMENTS.includes(seg));
}

function trackedFiles(scanRoot) {
  return gitLines(['ls-files', '--', ...SCAN_DIRS], scanRoot).filter(isCandidate);
}

/** True when ESLint's require-main-guard-in-one-off rule finds NO violation in this file. */
function isGuarded(linter, absPath, code) {
  try {
    const messages = linter.verify(code, FLAT_CONFIG, { filename: absPath });
    return !messages.some((m) => m.ruleId === RULE_ID);
  } catch {
    // Parse error -- cannot prove guarded; treat conservatively as unguarded/dangerous.
    return false;
  }
}

/**
 * Scan the corpus and return the DANGEROUS-only manifest entries.
 * @param {string} [scanRoot]
 * @returns {{ entries: Record<string,{reason:string}>, scanned: number, mutateAndKey: number }}
 */
export function generateManifest(scanRoot = REPO_ROOT) {
  const linter = new Linter({ cwd: scanRoot });
  const files = trackedFiles(scanRoot);
  const entries = {};
  let mutateAndKey = 0;

  for (const relPath of files) {
    const absPath = path.join(scanRoot, relPath);
    let code;
    try { code = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
    const holdsKey = KEY_RE.test(code);
    const mutates = MUTATE_RE.test(code);
    if (!holdsKey || !mutates) continue;
    mutateAndKey++;
    if (isGuarded(linter, absPath, code)) continue; // guarded -- not dangerous, not in manifest
    entries[relPath] = { reason: 'mutates DB + holds SUPABASE_SERVICE_ROLE_KEY, no recognized main-guard (auto-generated)' };
  }

  return { entries, scanned: files.length, mutateAndKey };
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const rootIdx = args.indexOf('--root');
  const scanRoot = rootIdx !== -1 && args[rootIdx + 1] ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;

  const { entries, scanned, mutateAndKey } = generateManifest(scanRoot);
  const manifest = {
    _doc: 'AUTO-GENERATED by scripts/lint/generate-one-off-mutate-key-manifest.mjs -- DO NOT HAND-EDIT. Regenerate: node scripts/lint/generate-one-off-mutate-key-manifest.mjs',
    generated_at: new Date().toISOString(),
    scanned,
    mutate_and_key_total: mutateAndKey,
    dangerous_count: Object.keys(entries).length,
    dangerous: entries,
  };
  const serialized = JSON.stringify(manifest, null, 2) + '\n';

  if (checkMode) {
    let existing = null;
    try { existing = fs.readFileSync(MANIFEST_PATH, 'utf8'); } catch { /* absent -- treat as drift */ }
    const existingDangerous = existing ? (() => { try { return JSON.parse(existing).dangerous; } catch { return null; } })() : null;
    const drifted = JSON.stringify(existingDangerous) !== JSON.stringify(entries);
    if (drifted) {
      console.error(`❌ one-off-mutate-key-manifest DRIFT: committed manifest does not match a fresh scan (${Object.keys(entries).length} dangerous file(s) currently, committed had ${existingDangerous ? Object.keys(existingDangerous).length : 'none/unreadable'}).`);
      console.error('   Run: node scripts/lint/generate-one-off-mutate-key-manifest.mjs   and commit the result.');
      process.exit(1);
    }
    console.log(`✅ one-off-mutate-key-manifest: up to date (${Object.keys(entries).length} dangerous file(s), ${mutateAndKey} total mutate+key, ${scanned} scanned).`);
    process.exit(0);
  }

  fs.writeFileSync(MANIFEST_PATH, serialized);
  console.log(`✅ Wrote ${MANIFEST_PATH}: ${Object.keys(entries).length} dangerous file(s), ${mutateAndKey} total mutate+key, ${scanned} scanned.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
