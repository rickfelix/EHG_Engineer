// SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 FR-5.
//
// TS-2 (negative control): every currently-known Category C prose line must NOT trip the guard.
// TS-3 (positive control): a synthetic new bare instruction, outside the allowlist, MUST trip it.
// TS-4 (exclusions): Category D (--auto) and Category E (--repo / no-PR#) sites must NOT trip it
// (they carry inline pragmas, same mechanism as the negative control -- tested together here).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFileViolations, findViolations, stripCommentsPreservingLines, SCAN_FILES } from '../../../scripts/lint/gh-merge-guard-lint.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('stripCommentsPreservingLines', () => {
  it('preserves line count across a multi-line block comment', () => {
    const src = 'const a = 1;\n/*\n * line two\n * line three\n */\nconst b = 2;\n';
    const stripped = stripCommentsPreservingLines(src);
    expect(stripped.split('\n').length).toBe(src.split('\n').length);
  });

  it('blanks a line comment but keeps the newline', () => {
    const src = 'const a = 1; // gh pr merge mention\nconst b = 2;\n';
    const stripped = stripCommentsPreservingLines(src);
    const lines = stripped.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).not.toMatch(/gh pr merge/);
    expect(lines[1]).toBe('const b = 2;');
  });

  it('does not touch a genuine occurrence outside any comment', () => {
    const src = 'run(`gh pr merge ${n} --merge`);\n';
    expect(stripCommentsPreservingLines(src)).toContain('gh pr merge');
  });
});

describe('findFileViolations — positive control (TS-3)', () => {
  it('flags a new bare gh pr merge instruction with no pragma', () => {
    const v = findFileViolations('scripts/synthetic-example.js', 'run(`gh pr merge ${n} --merge --delete-branch`);\n');
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(1);
  });

  it('does not flag the same line once it names gh-merge-safe.mjs instead', () => {
    const v = findFileViolations('scripts/synthetic-example.js', 'run(`node scripts/gh-merge-safe.mjs ${n} --merge --delete-branch`);\n');
    expect(v).toHaveLength(0);
  });

  it('a pragma on the same line exempts an otherwise-flagged instruction', () => {
    const v = findFileViolations(
      'scripts/synthetic-example.js',
      'run(`gh pr merge ${n} --merge`); // gh-merge-guard-exempt: synthetic test fixture\n'
    );
    expect(v).toHaveLength(0);
  });

  it('a BARE pragma marker with no reason text does NOT exempt (mandatory-reason contract)', () => {
    const v = findFileViolations(
      'scripts/synthetic-example.js',
      'run(`gh pr merge ${n} --merge`); // gh-merge-guard-exempt:\n'
    );
    expect(v).toHaveLength(1);
  });

  it('matches bare gh pr merge without requiring --delete-branch (B4: worker-checkin.cjs / worktree-merge.js shape)', () => {
    const v = findFileViolations('scripts/synthetic-example.js', 'run(`gh pr merge ${n} --merge`);\n');
    expect(v).toHaveLength(1);
  });
});

describe('findFileViolations — .md pragma form', () => {
  it('an HTML-comment pragma exempts a doc line', () => {
    const v = findFileViolations(
      'docs/synthetic-example.md',
      'Run `gh pr merge <PR#> --merge --delete-branch` <!-- gh-merge-guard-exempt: synthetic doc fixture -->\n'
    );
    expect(v).toHaveLength(0);
  });

  it('the same doc line without a pragma is flagged', () => {
    const v = findFileViolations('docs/synthetic-example.md', 'Run `gh pr merge <PR#> --merge --delete-branch`\n');
    expect(v).toHaveLength(1);
  });
});

describe('gh-merge-guard-lint — full repo scan (TS-2, TS-4)', () => {
  // Run against the REAL, currently-scoped file set. This is intentionally a live integration
  // check, not a fixture -- FR-1 through FR-4's edits (and this FR's own pragma pass) must land
  // for this to go green, which is exactly the "runs in CI, has teeth" property FR-5 requires.
  // Documented as a known-red state until the rest of this SD's FRs land (tracked in the SD's own
  // EXEC checklist, not hidden here) -- kept as a real assertion rather than skipped so a future
  // reader sees the actual live count, not a comment claiming green.
  it('SCAN_FILES resolves to the expected known file set (guards against silent scope drift)', () => {
    expect(SCAN_FILES).toContain('scripts/worker-checkin.cjs');
    expect(SCAN_FILES).toContain('CLAUDE_EXEC.md');
    expect(SCAN_FILES.length).toBeGreaterThanOrEqual(20);
  });

  it('reports zero violations once every FR-1/FR-2/FR-3/FR-4 site is fixed and every Category C/D/E/A site carries a pragma', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      // Fails loud with the exact remaining list, not just a count -- the whole point of this
      // guard is a discoverable, actionable failure, not a green checkmark someone has to
      // re-derive by hand.
      const summary = violations.map((v) => `${v.file}:${v.line}`).join(', ');
      throw new Error(`${violations.length} unresolved bare "gh pr merge" site(s): ${summary}`);
    }
    expect(violations).toHaveLength(0);
  });
});

describe('FR-3 — CLAUDE_EXEC.md content-assertion, not just drift-check', () => {
  // Content-anchored, not line-anchored (SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 regenerates this
  // file from the DB on every run; unrelated section churn -- e.g. the "Recent Retrospectives"
  // block -- routinely shifts line numbers between regens, so a fixed-line assertion would rot).
  //
  // FR-3 edited leo_protocol_sections.id=286 (the completion-merge step) and added an exemption
  // pragma to id=306 (the --auto workflow), which is explicitly OUT of this SD's fix scope --
  // gh-merge-safe.mjs has no --auto support. This test pins that id=306's actual COMMAND TEXT is
  // untouched (only a trailing pragma comment was appended), so a future regen can't silently
  // mangle the one site this SD deliberately left alone.
  const claudeExec = fs.readFileSync(path.join(repoRoot, 'CLAUDE_EXEC.md'), 'utf8');

  it('the id=286 completion step names gh-merge-safe.mjs', () => {
    expect(claudeExec).toMatch(/node scripts\/gh-merge-safe\.mjs <PR#> --merge --delete-branch/);
  });

  it('the id=306 --auto workflow command text is unchanged (still both occurrences, still --auto)', () => {
    const autoLines = claudeExec.match(/gh pr merge --auto --squash --delete-branch/g) || [];
    expect(autoLines).toHaveLength(2);
  });

  it('both --auto lines carry the mandatory-reason exemption (would otherwise re-trip the guard)', () => {
    const pragmaLines = claudeExec.match(/gh pr merge --auto --squash --delete-branch\s+# gh-merge-guard-exempt: \S/g) || [];
    expect(pragmaLines).toHaveLength(2);
  });
});

describe('TS-8 — FR-4 WHY clause exists and does not self-trip the guard', () => {
  const errorCodes = fs.readFileSync(path.join(repoRoot, 'docs/reference/error-codes.md'), 'utf8');

  it('the PR_MERGE_VERIFICATION row explains WHY a bare gh pr merge fails in a worktree', () => {
    expect(errorCodes).toMatch(/PR_MERGE_VERIFICATION/);
    expect(errorCodes).toMatch(/fails? the local checkout/i);
  });

  it('the WHY clause names the bare command it warns against without tripping the guard', () => {
    const violations = findFileViolations('docs/reference/error-codes.md', errorCodes);
    expect(violations).toHaveLength(0);
  });
});

describe('TS-9 — every gh-merge-safe.mjs invocation is actually runnable by its own parseArgs', () => {
  // The defect class TESTING review caught (docs/reference/ship-command-guide.md:101/:223
  // originally shipped with NO PR# positional -- gh-merge-safe.mjs's parseArgs requires a numeric
  // positionals[0] and, unlike bare `gh pr merge`, cannot infer the PR from the current branch, so
  // the printed command exited 2). This guards the CLASS, not just those two now-fixed instances:
  // every invocation across the guard's own SCAN_FILES corpus must carry a token before its first
  // `--flag` (a real number, or a `<placeholder>` a human fills in -- either is fine, "nothing" is
  // not), and every flag used must be one gh-merge-safe.mjs's parseArgs actually defines
  // (scripts/gh-merge-safe.mjs: squash/merge/rebase/delete-branch, all boolean).
  const ALLOWED_FLAGS = new Set(['--squash', '--merge', '--rebase', '--delete-branch']);
  const INVOCATION = /node scripts\/gh-merge-safe\.mjs\s+(\S+)((?:\s+--[\w-]+)*)/g;

  it('every invocation has a positional before its flags, and only flags parseArgs defines', () => {
    const missingPositional = [];
    const unsupportedFlags = [];
    for (const rel of SCAN_FILES) {
      let content;
      try { content = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { continue; }
      for (const match of content.matchAll(INVOCATION)) {
        const [full, firstToken, flagsText] = match;
        if (firstToken.startsWith('--')) {
          missingPositional.push(`${rel}: "${full}"`);
          continue;
        }
        for (const flag of flagsText.trim().split(/\s+/).filter(Boolean)) {
          if (!ALLOWED_FLAGS.has(flag)) unsupportedFlags.push(`${rel}: "${flag}" in "${full}"`);
        }
      }
    }
    if (missingPositional.length) {
      throw new Error(`${missingPositional.length} invocation(s) missing a PR# positional: ${missingPositional.join('; ')}`);
    }
    if (unsupportedFlags.length) {
      throw new Error(`${unsupportedFlags.length} unsupported flag(s): ${unsupportedFlags.join('; ')}`);
    }
    expect(missingPositional).toHaveLength(0);
    expect(unsupportedFlags).toHaveLength(0);
  });

  it('sanity: the corpus actually contains invocations (a regex that matches nothing proves nothing)', () => {
    let total = 0;
    for (const rel of SCAN_FILES) {
      let content;
      try { content = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { continue; }
      total += [...content.matchAll(INVOCATION)].length;
    }
    expect(total).toBeGreaterThanOrEqual(13); // FR-1's 2 live sites + FR-2's 13 doc/prompt sites (some files repeat)
  });
});
