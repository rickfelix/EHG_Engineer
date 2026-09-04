// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 FR-5b.
import { describe, it, expect } from 'vitest';
import { findDirectoryOnlyWorktreeCaptures, stripComments } from '../../../scripts/lint/directory-only-worktree-key-lint.mjs';

describe('findDirectoryOnlyWorktreeCaptures', () => {
  it('flags a directory-segment-as-key regex capture (the exact pre-fix anti-pattern)', () => {
    const src = 'const WORKTREE_PATH_RE = /[/\\\\]\\.worktrees[/\\\\]([^/\\\\]+)/;\nconst key = filePath.match(WORKTREE_PATH_RE)[1];\nif (key !== claimedSdKey) block();\n';
    const hits = findDirectoryOnlyWorktreeCaptures(src);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag a prose parenthetical near ".worktrees" in a comment', () => {
    const src = '// .worktrees/<sd>/ subtree (including via `git -C <worktree>`)\nconst x = 1;\n';
    expect(findDirectoryOnlyWorktreeCaptures(src)).toEqual([]);
  });

  it('does NOT flag a template-literal interpolation near ".worktrees"', () => {
    const src = 'const msg = `worktree add would register outside <repo>/.worktrees/ (${verdict.reason})`;\n';
    expect(findDirectoryOnlyWorktreeCaptures(src)).toEqual([]);
  });

  it('does NOT flag path.join constructing a .worktrees path from an already-known key (no regex capture at all)', () => {
    const src = "const worktreePath = path.join(repoRoot, '.worktrees', 'sd', worktreeKey);\n";
    expect(findDirectoryOnlyWorktreeCaptures(src)).toEqual([]);
  });

  it('reports the correct line number after comment-stripping shifts nothing (line count preserved)', () => {
    const src = '// header comment\n// more comment\nconst WORKTREE_PATH_RE = /[/\\\\]\\.worktrees[/\\\\]([^/\\\\]+)/;\n';
    const hits = findDirectoryOnlyWorktreeCaptures(src);
    expect(hits[0].line).toBe(3);
  });
});

describe('stripComments', () => {
  it('blanks out line comments while preserving line count', () => {
    const src = 'const a = 1; // trailing comment\nconst b = 2;\n';
    const stripped = stripComments(src);
    expect(stripped).not.toContain('trailing comment');
    expect(stripped.split('\n').length).toBe(src.split('\n').length);
  });

  it('blanks out block comments while preserving line count', () => {
    const src = 'const a = 1;\n/* block\ncomment */\nconst b = 2;\n';
    const stripped = stripComments(src);
    expect(stripped).not.toContain('block');
    expect(stripped.split('\n').length).toBe(src.split('\n').length);
  });
});
