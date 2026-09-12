#!/usr/bin/env node
/**
 * EVA Logger-Injection Required Lint.
 *
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-145 (pattern PAT-LES-927aac4a3d0b).
 *
 * lib/logger.js's createLogger(module, context) already exists -- structured JSON output,
 * LOG_LEVEL filtering, a console-compatible .log() shim for DI -- but only 1 of 683
 * lib/eva/**\/*.js files import it (637 non-test files; 332 with zero logging of any kind,
 * 437 with zero structured-logger usage, measured 2026-09-12). No standard was ever
 * mandatory and nothing enforced one. This lint is the enforcement half; the standard doc
 * (docs/reference/eva-logging-standard.md) is the convention half.
 *
 * SCOPE: new/modified lib/eva/**\/*.js files ONLY, never a backfill of the existing
 * ~332-437 file backlog. Diff-scoping (not a whole-tree-scan + allowlist, unlike the 3
 * scripts/lint/*.mjs precedents this SD's own LEAD-phase sub-agents sampled) is the
 * mechanism that enforces exactly that boundary -- a file untouched by the current branch
 * is never scanned, regardless of its instrumentation state.
 *
 * ACCEPTED INSTRUMENTATION (either satisfies the rule):
 *   - lib/logger.js's createLogger(module) -- the mandatory default (see the standard doc).
 *   - lib/eva/observability.js's OrchestratorTracer / createOrchestratorTracer -- an existing,
 *     working instrumentation mechanism (SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-E). A file that
 *     already instruments itself via the tracer is not forced into a second, redundant
 *     mechanism.
 * Bare console.* calls do NOT satisfy this rule (lib/logger.js's own docblock: "Replaces
 * direct console.* calls"). Detection requires BOTH an import from the standard module AND an
 * actual call -- an incidental mention of the word "logger" in a comment or string, with no
 * accompanying import + call, does not count as instrumented.
 *
 * "Executable logic" (files with NEITHER pattern are exempt, per TR-4): a top-level
 * function/arrow-function/class declaration or expression. A file with only
 * `export const X = {...}` / type-shaped exports has nothing to log.
 *
 * ESCAPE HATCH: a `// eva-logger-lint-ignore: <reason>` pragma anywhere in the file exempts
 * it, but ONLY with a non-blank reason -- a blank reason is rejected and the file is still
 * flagged (mirrors this repo's established allowlist-reason convention, e.g.
 * fixture-producer-guard-lint.mjs's allowlist).
 *
 * KNOWN LIMITATION: this is a regex-based heuristic, not a full AST parser (matches this
 * repo's established narrow-regex-not-full-parser philosophy -- see
 * rls-anon-tenant-predicate-lint.mjs's own header). It cannot detect a createLogger import
 * that is aliased to an unrelated name (`import { createLogger as cl } from '../logger.js'`
 * followed by a call as `foo(` instead of `cl(`) -- such a file would be incorrectly flagged
 * as uninstrumented. It also cannot detect a logger instance threaded in via a function
 * parameter from a DIFFERENT file (dependency injection across module boundaries) --  only
 * same-file import + call is recognized.
 *
 * KILL-SWITCH: LEO_DISABLE_EVA_LOGGER_LINT=1 bypasses the rule entirely (mirrors
 * LEO_DISABLE_MECHANISM_VERIFIER_GATE's established convention) -- printed explicitly as
 * BYPASSED, never silently reported as "0 violations", so a bypass can never be mistaken for
 * a genuine clean pass.
 *
 * FAIL-LOUD ON UNRESOLVABLE DIFF SCOPE: if the merge-base cannot be computed (shallow clone,
 * detached history -- repo-wide only 38/240 workflows set fetch-depth: 0), the rule exits 2
 * with an explicit "cannot compute diff scope" error. It NEVER falls back to silently
 * reporting zero violations, which would be indistinguishable from a genuinely clean PR
 * (the QF-20260905-934 zero-yield trap). Use --all to explicitly request an advisory full
 * sweep instead (never blocking).
 *
 * Modes (mirrors rls-anon-tenant-predicate-lint.mjs's precedent):
 *   --diff (default, blocking): only files changed vs the merge-base with origin/main
 *       (falls back to main if origin/main is absent, per secdef-execute-revoke-lint.mjs).
 *   --all (advisory only, never blocking): full sweep of lib/eva/**, for census/testing use.
 *
 * Usage:
 *   node scripts/lint/eva-logger-required-lint.mjs [--diff|--all] [--json] [--root <dir>]
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const EVA_FILE_RE = /^lib\/eva\/.+\.(?:js|mjs)$/;
const TEST_FILE_RE = /\.(test|spec)\.(js|mjs)$/;

const EXECUTABLE_LOGIC_RE = /\bfunction\s*[\w$]*\s*\(|=>\s*[{(]|=>\s*[^\s;]|\bclass\s+[\w$]+|\bclass\s*\{/;
const LOGGER_IMPORT_RE = /from\s+['"][^'"]*\blogger\.js['"]/;
const LOGGER_CALL_RE = /\bcreateLogger\s*\(/;
const TRACER_IMPORT_RE = /from\s+['"][^'"]*\bobservability\.js['"]/;
const TRACER_CALL_RE = /\b(createOrchestratorTracer|OrchestratorTracer)\s*[\(\.]|\bnew\s+OrchestratorTracer\b/;
// [ \t]* (not \s*) between the colon and the captured reason: \s* would greedily consume the
// trailing newline on a blank-reason line and bleed into the NEXT line's text, misreporting a
// blank reason as a genuine one (caught by the TS-7 negative test).
const IGNORE_PRAGMA_RE = /\/\/\s*eva-logger-lint-ignore:[ \t]*(.*)$/m;

/** PURE: does this source text contain top-level executable logic? */
export function hasExecutableLogic(source) {
  return EXECUTABLE_LOGIC_RE.test(source);
}

/** PURE: is this source instrumented via createLogger or OrchestratorTracer? */
export function isInstrumented(source) {
  const hasLogger = LOGGER_IMPORT_RE.test(source) && LOGGER_CALL_RE.test(source);
  const hasTracer = TRACER_IMPORT_RE.test(source) && TRACER_CALL_RE.test(source);
  return hasLogger || hasTracer;
}

/** PURE: parse the escape-hatch pragma, if present. Returns {present, reason} or null. */
export function findIgnorePragma(source) {
  const m = IGNORE_PRAGMA_RE.exec(source);
  if (!m) return null;
  return { present: true, reason: m[1].trim() };
}

/**
 * PURE: classify one file's source. Returns null (clean) or a violation descriptor.
 * @param {string} source
 * @param {string} filePath for reporting
 * @returns {object|null}
 */
export function classifyFile(source, filePath) {
  if (!hasExecutableLogic(source)) return null; // TR-4 / TS-4: nothing to log
  if (isInstrumented(source)) return null; // TS-2 / TS-5

  const pragma = findIgnorePragma(source);
  if (pragma) {
    if (pragma.reason.length > 0) return null; // TS-7: documented escape hatch honored
    return {
      filePath,
      reason: 'BLANK_ESCAPE_HATCH_REASON',
      message: `${filePath}: has an eva-logger-lint-ignore pragma but its reason is blank -- a documented, non-empty reason is required (matches this repo's allowlist-reason convention).`,
    };
  }

  return {
    filePath,
    reason: 'NOT_INSTRUMENTED',
    message: `${filePath}: contains executable logic with no createLogger (lib/logger.js) or OrchestratorTracer (lib/eva/observability.js) usage. See docs/reference/eva-logging-standard.md. Bare console.* calls do not satisfy this standard. Add instrumentation, or a documented '// eva-logger-lint-ignore: <reason>' pragma for a genuine exception.`,
  };
}

// ── CLI driver ───────────────────────────────────────────────────────────────

function resolveMergeBase(repoRoot) {
  for (const ref of ['origin/main', 'main']) {
    try {
      return execFileSync('git', ['merge-base', ref, 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }).trim();
    } catch {
      // try next ref
    }
  }
  return null;
}

/** Files changed vs merge-base, filtered to non-test lib/eva/**\/*.{js,mjs}. Throws {code:'NO_MERGE_BASE'} if unresolvable. */
export function candidateFilesDiff(repoRoot) {
  const mergeBase = resolveMergeBase(repoRoot);
  if (!mergeBase) {
    const err = new Error('cannot compute diff scope: no merge-base against origin/main or main resolved (shallow clone or detached history?)');
    err.code = 'NO_MERGE_BASE';
    throw err;
  }
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AMR', mergeBase, 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => EVA_FILE_RE.test(f) && !TEST_FILE_RE.test(f))
    .map((f) => path.join(repoRoot, f));
}

/** Full sweep of lib/eva/**\/*.{js,mjs} (excluding tests) -- advisory only, never throws for scope reasons. */
export function candidateFilesAll(repoRoot) {
  const files = [];
  const root = path.join(repoRoot, 'lib', 'eva');
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(e.name) && !TEST_FILE_RE.test(e.name)) files.push(full);
    }
  };
  walk(root);
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const repoRoot = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : REPO_ROOT;
  const mode = args.includes('--all') ? 'all' : 'diff';

  if (process.env.LEO_DISABLE_EVA_LOGGER_LINT === '1' || String(process.env.LEO_DISABLE_EVA_LOGGER_LINT).toLowerCase() === 'true') {
    const msg = 'LEO_DISABLE_EVA_LOGGER_LINT active -- BYPASSED (not a measured pass)';
    if (asJson) console.log(JSON.stringify({ mode, bypassed: true, violations: [] }, null, 2));
    else console.log(`[EVA-LOGGER-REQUIRED-LINT] ${msg}`);
    process.exitCode = 0;
    return;
  }

  let files;
  try {
    files = mode === 'all' ? candidateFilesAll(repoRoot) : candidateFilesDiff(repoRoot);
  } catch (e) {
    if (e.code === 'NO_MERGE_BASE') {
      console.error(`[EVA-LOGGER-REQUIRED-LINT] FAIL-LOUD: ${e.message}. Use --all for an advisory full sweep instead, or fix CI checkout to set fetch-depth: 0.`);
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  const violations = [];
  for (const f of files) {
    let source;
    try { source = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const relPath = path.relative(repoRoot, f).split(path.sep).join('/');
    const v = classifyFile(source, relPath);
    if (v) violations.push(v);
  }

  const result = { mode, scanned: files.length, violations, blocking: mode === 'diff' };
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[EVA-LOGGER-REQUIRED-LINT] mode=${mode} scanned=${files.length}`);
    if (violations.length === 0) console.log('  0 violation(s) -- clean.');
    else for (const v of violations) console.log(`  ${v.message}`);
  }

  if (mode === 'diff' && violations.length > 0) process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  main();
}
