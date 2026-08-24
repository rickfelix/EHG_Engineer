#!/usr/bin/env node
// SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-1.
//
// Scans git-tracked *.js/*.mjs/*.cjs files for a literal, machine-specific absolute
// home-directory path (this repo checkout owner's Windows or POSIX home path -- see
// HOME_PATH_RE below for the exact shape) -- the exact class of defect that made
// lib/gates/cross-repo-build-check.js and .../ui-interactivity-check.js silently break for
// anyone whose checkout isn't at that one path. Both sites were retrofitted in this SD to
// call resolveRepoPath('ehg') (lib/repo-paths.js) instead; this lint prevents a NEW instance of
// the same anti-pattern from being reintroduced.
//
// Structurally modeled on scripts/lint/require-main-guard-in-one-off-lint.mjs: a live regex scan
// over a scoped file population, with a reason-required grandfather allowlist for pre-existing
// violations rather than a corpus-wide retrofit (which is not this SD's scope -- only the 2
// live-gate-code sites named in the PRD were fixed directly).
//
// SCOPE: only *.js/*.mjs/*.cjs are scanned -- the anti-pattern this lint targets is specifically
// "live JS/CJS/MJS source resolving a repo path via a literal instead of lib/repo-paths.js".
// *.ps1 (a different runtime, not something lib/repo-paths.js's resolver can help with), *.sql
// (historical, already-applied migrations -- never edited retroactively), *.md/*.json (docs and
// data, not executable resolution logic) are out of population entirely, not merely allowlisted.
//
// KNOWN LIMITATION: this is a per-user-name regex (rickf), not a general "any Windows/POSIX home
// directory" detector -- it will not catch a hardcoded path under a different username. Widening
// the pattern to a general `C:\Users\<name>\` / `/home/<name>/` shape was considered and rejected:
// it would also flag every doc/example path shown for illustration (already a majority of the
// corpus -- see docs/ exclusion below) with no way to distinguish "this repo's real checkout path"
// from "an illustrative example username" without also matching common English words used as
// example usernames. Narrower and precise beats broader and noisy for a lint meant to gate CI.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.resolve(__dirname, 'no-literal-home-path-allowlist.json');

// Case-insensitive: the same literal has appeared with mixed-case drive letters and backslash
// vs forward-slash separators across the corpus (Windows path normalization varies by tool).
// [\\/]+ (one or more), not a single char class: a real Windows path embedded in a JS string
// literal is backslash-ESCAPED on disk ("C:\\Users\\rickf" -- two literal backslash bytes per
// separator, since JS string syntax requires doubling a backslash to represent one). A
// single-backslash class alone missed every real occurrence in scripts/modules/handoff/gates/
// and scripts/hooks/lib/detect-context.cjs on first pass -- caught by a failing unit test before
// this lint had ever run against the live corpus.
export const HOME_PATH_RE = /(?:[A-Za-z]:[\\/]+Users[\\/]+rickf|\/home\/rickf)/i;

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE_FILE_RE = /\.test\.(js|mjs|cjs)$/i;

// Directory-level exemptions: historical/disposable script buckets (scripts/one-off/,
// scripts/archive/ -- same convention as require-main-guard-in-one-off-lint.mjs, which also
// declines to retrofit these), test fixtures (tests/ -- legitimately reference realistic paths
// to exercise path-resolution logic itself), and session/tooling scratch directories that are
// never shipped (.claude/, .artifacts/, .rca/, .logs/, .prd-payloads/).
export const DIR_ALLOWLIST_RE = /^(scripts\/one-off\/|scripts\/archive\/|tests\/|\.claude\/|\.artifacts\/|\.rca\/|\.logs\/|\.prd-payloads\/)/;

export function isAllowlistedDir(filePath) {
  return DIR_ALLOWLIST_RE.test(filePath);
}

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

/**
 * Pure evaluator over already-loaded {path, content} pairs, so tests can exercise directory/file
 * allowlist behavior without depending on live repo state or git.
 */
export function evaluateFiles(files, { allow = {} } = {}) {
  const hits = [];
  for (const { path: filePath, content } of files) {
    if (isAllowlistedDir(filePath)) continue;
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (HOME_PATH_RE.test(line)) {
        hits.push({ file: filePath, line: i + 1 });
      }
    });
  }
  const violations = hits.filter((h) => !(h.file in allow));
  const grandfathered = hits.filter((h) => h.file in allow);
  return { violations, grandfathered, ok: violations.length === 0 };
}

function loadTrackedFiles() {
  // -z: NUL-delimited output, sidesteps core.quotePath escaping non-ASCII paths.
  const raw = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const paths = raw.split('\0').filter(Boolean);
  const files = [];
  for (const p of paths) {
    if (!SCAN_EXTENSIONS.has(path.extname(p)) || EXCLUDE_FILE_RE.test(p)) continue;
    try {
      files.push({ path: p, content: fs.readFileSync(path.join(REPO_ROOT, p), 'utf8') });
    } catch {
      continue; // binary/deleted-since-ls-files/permission error -- not a violation
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');

  const allow = loadAllowlist();
  const files = loadTrackedFiles();
  const { violations, grandfathered, ok } = evaluateFiles(files, { allow });

  if (jsonMode) {
    console.log(JSON.stringify({ scanned: files.length, violations, grandfathered: grandfathered.length }, null, 2));
  } else if (ok) {
    console.log(`✅ no-literal-home-path-lint: 0 ungoverned violations across ${files.length} file(s) scanned (*.js/*.mjs/*.cjs); ${grandfathered.length} grandfathered.`);
  } else {
    console.error(`❌ no-literal-home-path-lint: ${violations.length} violation(s) across ${files.length} file(s) scanned\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
    }
    console.error("\nFix: replace the literal with resolveRepoPath('ehg') (or the relevant app name) from lib/repo-paths.js.");
    console.error('Or, if this file is genuinely pending retrofit, add a reason-required entry to scripts/lint/no-literal-home-path-allowlist.json.');
  }

  process.exitCode = ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main();
}
