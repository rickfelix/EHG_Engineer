#!/usr/bin/env node
/**
 * gh-merge-guard-lint — SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 (FR-5).
 *
 * `gh pr merge --delete-branch` merges server-side, then runs a local checkout/branch-delete
 * that fails in a git worktree ("main is already used by worktree"), exiting non-zero AFTER the
 * merge already landed. scripts/gh-merge-safe.mjs exists specifically to avoid this. This guard
 * stops a NEW bare `gh pr merge` instruction/execution site from being introduced un-repointed.
 *
 * DESIGN (deliberately simple over deliberately clever): earlier drafts tried an "opens the
 * string" heuristic (a quote/backtick immediately before the command distinguishes an invocation
 * from a mention) borrowed from scripts/lint/scanner-convention-lint.mjs. It does not generalize
 * to this corpus -- decorative prefixes ("  → gh pr merge ...") and chained commands ("gh pr
 * create && gh pr merge ...") put real instruction sites arbitrarily far from any string-opening
 * quote, and a NESTED quote used for prose emphasis ("...deleted via 'gh pr merge --delete-
 * branch'...") satisfies a naive "quote immediately before" test without being an invocation at
 * all. Rather than chase these cases with an ever-more-precise regex, this guard matches bare
 * `gh pr merge` ANYWHERE in non-comment text and requires every match to resolve one of two ways:
 * the text is fixed (it no longer says `gh pr merge` once repointed to name gh-merge-safe.mjs,
 * so it falls out of the match set with no special-casing needed), or the site carries an inline,
 * mandatory-reason pragma. A boolean exemption is not accepted -- the reason is the audit trail.
 *
 * SCOPE: .js/.cjs/.mjs (comment-stripped via lib/lint/added-line-text.mjs's stripComments; string
 * literals -- including template literals -- are intentionally LEFT INTACT, since that is where
 * this corpus's actual command strings live) and .md (no comment concept; every genuine
 * occurrence, instruction or explanation, must be fixed or pragma'd).
 *
 * Pragma forms (mandatory reason, same convention as schema-lint-disable-line):
 *   // gh-merge-guard-exempt: <reason>          (js/cjs/mjs, trailing or own-line)
 *   <!-- gh-merge-guard-exempt: <reason> -->    (md, trailing or own-line)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const BARE_COMMAND = /\bgh pr merge\b/;
const PRAGMA = /gh-merge-guard-exempt:[ \t]*(\S.*)$/;

/**
 * Line-preserving comment strip for WHOLE-FILE, per-line-numbered scanning.
 *
 * lib/lint/added-line-text.mjs's stripComments is deliberately NOT line-preserving -- it targets
 * added-line DIFF FRAGMENTS, where a collapsed multi-line block comment is fine because no caller
 * needs to map back to an absolute line number in the original file. This scanner reports
 * file:line for a whole file, so a block comment's internal newlines must survive: only comment
 * CHARACTERS become spaces, every '\n' stays a '\n', keeping stripped-text line N === raw-text
 * line N for every N.
 */
export function stripCommentsPreservingLines(text) {
  const s = String(text || '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    // Block comment: /* ... */ (or unterminated -- runs to EOF)
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2;
      for (let j = i; j < stop; j++) out += s[j] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    // Line comment: // ... to end of line (newline itself is NOT part of the comment)
    if (s[i] === '/' && s[i + 1] === '/') {
      let j = i;
      while (j < s.length && s[j] !== '\n') { out += ' '; j += 1; }
      i = j;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out;
}

/**
 * EXPLICIT file list, not directory roots. An unrestricted sweep of .claude/docs/lib/scripts
 * pulls in ~35 incidental "gh pr merge" mentions outside this SD's approved scope -- diagnostic
 * log messages inside the ALREADY-HARDENED lib/ship/auto-merge.mjs (e.g. "gh pr merge exited 0
 * but mergedAt is null"), unrelated wiki/reference docs, past SDs' retro-insert scripts, and this
 * session's own scratch files under scripts/temp/. This SD's scope-lock (LEAD-approved) is the
 * specific FR-1/FR-2/FR-3/Category-A/C/D/E sites enumerated in the PRD -- this guard's job is
 * regression prevention FOR THOSE, not a general-purpose repo-wide "gh pr merge" census (that
 * would be its own, separately-scoped SD). Grow this list only alongside a PRD update, the same
 * way any other scope-locked file set changes.
 */
export const SCAN_FILES = [
  '.claude/commands/checkin.md',
  '.claude/commands/ship.md',
  'docs/reference/error-code-catalog.md',
  'docs/reference/error-codes.md',
  'docs/reference/ship-command-guide.md',
  'docs/03_protocols_and_standards/quick-fix-protocol.md',
  'docs/01_architecture/learning-capture-architecture.md',
  'docs/01_architecture/worktree-first-isolation-integration.md',
  'CLAUDE_EXEC.md',
  'scripts/modules/handoff/executors/lead-final-approval/gates.js',
  'scripts/modules/complete-quick-fix/git-operations.js',
  'scripts/worker-checkin.cjs',
  'scripts/modules/handoff/rejection-subagent-mapping.js',
  'scripts/modules/plan-mode/intelligent-plan-templates.js',
  'scripts/modules/plan-mode/plan-templates.js',
  'scripts/modules/shipping/MultiRepoCoordinator.js',
  'scripts/modules/shipping/ShippingPreflightVerifier.js',
  'scripts/modules/shipping/worktree-merge.js',
  'lib/ship/auto-merge.mjs',
  'lib/exec-context-guard.mjs',
  'scripts/handoff.js',
  'scripts/modules/shipping/post-merge-worktree-cleanup.js',
];

const CODE_EXT = /\.(?:js|cjs|mjs)$/;
const MD_EXT = /\.md$/;

/**
 * Check one already-split-into-lines file for violations.
 * @param {string} relPath repo-relative path (forward slashes)
 * @param {string} content raw file content
 * @returns {{file: string, line: number, text: string}[]}
 */
export function findFileViolations(relPath, content) {
  const isCode = CODE_EXT.test(relPath);
  const isMd = MD_EXT.test(relPath);
  if (!isCode && !isMd) return [];

  // Comment-stripping only makes sense for code; for .md every line is "prose" already.
  // Stripped text and raw text are kept PARALLEL (same line count) so a match's line number in
  // the stripped text maps 1:1 to the raw line carrying (or not) the pragma.
  const rawLines = content.split('\n');
  const scanLines = isCode ? stripCommentsPreservingLines(content).split('\n') : rawLines;

  const violations = [];
  for (let i = 0; i < scanLines.length; i++) {
    if (!BARE_COMMAND.test(scanLines[i])) continue;
    const rawLine = rawLines[i] ?? '';
    if (PRAGMA.test(rawLine)) continue;
    violations.push({ file: relPath, line: i + 1, text: rawLine.trim() });
  }
  return violations;
}

/**
 * @returns {{file: string, line: number, text: string}[]} violations across all scanned files
 */
export function findViolations({ root = repoRoot, files = SCAN_FILES, readFile } = {}) {
  const read = readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const violations = [];
  for (const rel of files) {
    let src;
    try {
      src = read(path.join(root, rel));
    } catch {
      continue; // a listed file that no longer exists is not this guard's concern
    }
    violations.push(...findFileViolations(rel, src));
  }
  return violations;
}

if (isMainModule(import.meta.url)) {
  const violations = findViolations();
  for (const v of violations) {
    console.error(`[gh-merge-guard-lint] ${v.file}:${v.line}: bare "gh pr merge" -- repoint to scripts/gh-merge-safe.mjs, or add "gh-merge-guard-exempt: <reason>" if this line genuinely cannot (explanatory prose, execution site tracked elsewhere, or a gh-merge-safe.mjs limitation like --repo/--auto).`);
    console.error(`  ${v.text}`);
  }
  console.log(`[gh-merge-guard-lint] checked; violations=${violations.length}`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
