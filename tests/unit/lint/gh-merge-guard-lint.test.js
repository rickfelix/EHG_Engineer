// SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001 FR-5.
//
// TS-2 (negative control): every currently-known Category C prose line must NOT trip the guard.
// TS-3 (positive control): a synthetic new bare instruction, outside the allowlist, MUST trip it.
// TS-4 (exclusions): Category D (--auto) and Category E (--repo / no-PR#) sites must NOT trip it
// (they carry inline pragmas, same mechanism as the negative control -- tested together here).
import { describe, it, expect } from 'vitest';
import { findFileViolations, findViolations, stripCommentsPreservingLines, SCAN_FILES } from '../../../scripts/lint/gh-merge-guard-lint.mjs';

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
