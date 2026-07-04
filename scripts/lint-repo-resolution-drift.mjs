#!/usr/bin/env node
/**
 * lint-repo-resolution-drift — regression guard for SD-LEO-INFRA-CANONICAL-REPO-APP-001 (FR-4).
 *
 * Flags NEW literal references to the two platform repos (rickfelix/ehg,
 * rickfelix/EHG_Engineer) outside an explicit allowlist. This is the class of
 * bug the SD exists to stop recurring: code that assumes the codebase only
 * ever has these two repos instead of going through the canonical
 * lib/repo-paths.js resolver.
 *
 * AST-scoped (via acorn) rather than pure regex, per risk-agent's too-loose
 * failure-mode note: also catches a fully-literal string concatenation
 * (`'rickfelix' + '/' + 'ehg'`) that a naive substring regex could miss if
 * split across a `+` expression. A genuinely dynamic concatenation
 * (`owner + '/' + repoNameVar`) is NOT flagged — its value isn't statically
 * known, so it can't be the literal-repo-string bug this lint targets.
 *
 * Allowlist (per risk-agent, PRD FR-4):
 *   - lib/repo-paths.js / lib/repo-paths.cjs — the resolver's own intentional anchor
 *   - lib/ship/auto-merge.mjs — the FR-3 fail-closed floor (AUTO_MERGE_PLATFORM_REPOS)
 *   - tests/** — fixtures legitimately reference literal repo names for mocking
 *
 * Exit codes: 0=clean, 1=drift found, 2=execution error.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SCAN_ROOTS = ['lib', 'scripts', 'tests'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.worktrees', '.git', 'coverage', 'dist', 'build']);

const FORBIDDEN_STRINGS = new Set(['rickfelix/ehg', 'rickfelix/ehg_engineer']);

// Each entry documented in docs/architecture/canonical-repo-resolution-census.md (FR-1).
// "Self-anchor" entries are this SD's own intentional literals (the resolver, the FR-3
// floor, this lint's own FORBIDDEN_STRINGS definition). "Deferred" entries are real,
// pre-existing sites this lint's first-run AST sweep surfaced — out of this SD's
// tractable-slice scope (TR-3/TR-4) but explicitly tracked, not silently dropped.
const ALLOWLIST_EXACT = new Set([
  // Self-anchors (intentional, per risk-agent)
  'lib/repo-paths.js',
  'lib/repo-paths.cjs',
  'lib/ship/auto-merge.mjs',
  'scripts/lint-repo-resolution-drift.mjs',
  // Deferred — pre-existing sites surfaced by this lint's first run (census: deferred-with-owner)
  'lib/deleteVentureFully.js',
  'lib/multi-repo/index.js',
  'scripts/adam-github-assessment.mjs',
  'scripts/archive/one-time/monitor-scheduled-jobs.js',
  'scripts/audit-orphan-prs.mjs',
  'scripts/backfill-pr-tracking.js',
  'scripts/check-migration-readiness.mjs',
  'scripts/clockwork/gh-failure-monitor.cjs',
  'scripts/modules/handoff/executors/exec-to-plan/gates/sub-agent-orchestration.js',
  'scripts/modules/handoff/executors/lead-final-approval/gates.js', // TR-4: HIGH-risk, requires golden-master regression pass
  'scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js',
  'scripts/one-off/_design-agent-evidence-stage23-reject.cjs',
]);
const ALLOWLIST_PREFIXES = ['tests/'];

function toRelPosix(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function isAllowlisted(relPath) {
  if (ALLOWLIST_EXACT.has(relPath)) return true;
  return ALLOWLIST_PREFIXES.some((p) => relPath.startsWith(p));
}

function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // scan root doesn't exist — skip silently (e.g. no tests/ dir in some checkouts)
  }
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Statically evaluate a fully-literal `+`-concatenation to a string, or return null. */
function evalIfFullyLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? '').join('');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = evalIfFullyLiteral(node.left);
    const right = evalIfFullyLiteral(node.right);
    if (left === null || right === null) return null;
    return left + right;
  }
  return null;
}

/** Generic recursive AST walk (no acorn-walk dependency — visits every own enumerable node). */
function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, seen);
    return;
  }
  if (typeof node.type !== 'string') return;
  seen.add(node);
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'start' || key === 'end' || key === 'parent') continue;
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visit, seen);
  }
}

function scanFile(absPath) {
  const relPath = toRelPosix(absPath);
  const findings = [];
  if (isAllowlisted(relPath)) return findings;

  const source = readFileSync(absPath, 'utf8');
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true });
  } catch {
    return findings; // unparsable file (e.g. a non-JS-family .cjs edge case) — not this lint's concern
  }

  const alreadyFlaggedConcatRoots = new Set();

  walk(ast, (node) => {
    let value = null;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      value = node.value;
    } else if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      value = node.quasis.map((q) => q.value.cooked ?? '').join('');
    } else if (node.type === 'BinaryExpression' && node.operator === '+' && !alreadyFlaggedConcatRoots.has(node)) {
      value = evalIfFullyLiteral(node);
      if (value !== null) {
        // Mark descendants so a nested +-chain doesn't double-report the same literal.
        walk(node, (n) => alreadyFlaggedConcatRoots.add(n));
      }
    }
    if (value !== null && FORBIDDEN_STRINGS.has(value.toLowerCase())) {
      findings.push({ file: relPath, line: node.loc?.start?.line ?? '?', value });
    }
  });

  return findings;
}

export function runLint() {
  const files = SCAN_ROOTS.flatMap((root) => collectFiles(path.join(REPO_ROOT, root)));
  const findings = files.flatMap(scanFile);
  return { filesScanned: files.length, findings };
}

function main() {
  const { filesScanned, findings } = runLint();
  console.log(`🔍 lint-repo-resolution-drift: scanned ${filesScanned} files under ${SCAN_ROOTS.join(', ')}/`);
  if (findings.length === 0) {
    console.log('✅ No new hardcoded platform-repo literals found outside the allowlist.');
    process.exit(0);
  }
  console.log(`❌ ${findings.length} hardcoded platform-repo literal(s) found outside the allowlist:\n`);
  for (const f of findings) {
    console.log(`   ${f.file}:${f.line}  "${f.value}"`);
  }
  console.log(
    '\n   Fix: resolve the repo via lib/repo-paths.js (resolveGitHubRepo/resolveRepoPath) instead of a ' +
    'literal string, or add a justified allowlist entry to scripts/lint-repo-resolution-drift.mjs if this ' +
    'really is an intentional anchor (SD-LEO-INFRA-CANONICAL-REPO-APP-001).',
  );
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`❌ Linter error: ${err.message}`);
    process.exit(2);
  }
}
