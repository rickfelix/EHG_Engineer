// Tests for SD-FDBK-ENH-CREATE-QUICK-FIX-001 FR-3 — completion-time type-vs-filepath
// reconciliation (the compensating control for the work-item-router documentation Tier-2 floor).
// reconcileDeclaredTypeVsFiles classifies a documentation QF whose diff touches non-docs source
// files as a mislabel; verifyDeclaredTypeMatchesFiles turns that signal into a self-verifier
// confidence-reducing blocker so a code change cannot silently complete as "documentation".

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { reconcileDeclaredTypeVsFiles } = await import(
  '../../../scripts/modules/complete-quick-fix/git-operations.js'
);
const { verifyDeclaredTypeMatchesFiles } = await import(
  '../../../lib/quickfix-self-verifier.js'
);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('FR-3 reconcileDeclaredTypeVsFiles: documentation type vs changed files', () => {
  it('flags a mismatch when a documentation QF touches a non-docs source file', () => {
    const r = reconcileDeclaredTypeVsFiles({ qfType: 'documentation', filesChanged: ['src/foo.js'] });
    expect(r.mismatch).toBe(true);
    expect(r.nonDocsFiles).toEqual(['src/foo.js']);
  });

  it('returns only the non-docs files in a mixed diff', () => {
    const r = reconcileDeclaredTypeVsFiles({ qfType: 'documentation', filesChanged: ['docs/guide.md', 'README.md', 'lib/x.js'] });
    expect(r.mismatch).toBe(true);
    expect(r.nonDocsFiles).toEqual(['lib/x.js']);
  });

  it('does NOT flag a documentation QF whose diff is entirely docs', () => {
    const r = reconcileDeclaredTypeVsFiles({ qfType: 'documentation', filesChanged: ['docs/guide.md', 'README.md', 'CHANGELOG.md'] });
    expect(r.mismatch).toBe(false);
    expect(r.nonDocsFiles).toEqual([]);
  });

  it('does NOT flag a non-documentation type even when it touches source files', () => {
    const r = reconcileDeclaredTypeVsFiles({ qfType: 'bug', filesChanged: ['src/foo.js'] });
    expect(r.mismatch).toBe(false);
  });

  it('is safe for empty / missing filesChanged and missing args', () => {
    expect(reconcileDeclaredTypeVsFiles({ qfType: 'documentation', filesChanged: [] }).mismatch).toBe(false);
    expect(reconcileDeclaredTypeVsFiles({ qfType: 'documentation' }).mismatch).toBe(false);
    expect(reconcileDeclaredTypeVsFiles({}).mismatch).toBe(false);
    expect(reconcileDeclaredTypeVsFiles().mismatch).toBe(false);
  });
});

describe('FR-3 verifyDeclaredTypeMatchesFiles: self-verifier blocker on mislabel', () => {
  it('fails (blocker) when context carries a type/file mismatch', () => {
    const check = verifyDeclaredTypeMatchesFiles(
      { type: 'documentation' },
      { typeFileMismatch: { mismatch: true, nonDocsFiles: ['src/x.js', 'lib/y.js'] } }
    );
    expect(check.passed).toBe(false);
    expect(check.issue).toMatch(/bypass LEAD/i);
    expect(check.details).toMatch(/src\/x\.js/);
  });

  it('passes when the mismatch signal is false', () => {
    const check = verifyDeclaredTypeMatchesFiles({ type: 'documentation' }, { typeFileMismatch: { mismatch: false, nonDocsFiles: [] } });
    expect(check.passed).toBe(true);
  });

  it('passes when no mismatch signal is present (non-doc QF or clean diff)', () => {
    expect(verifyDeclaredTypeMatchesFiles({ type: 'bug' }, {}).passed).toBe(true);
    expect(verifyDeclaredTypeMatchesFiles({ type: 'documentation' }, {}).passed).toBe(true);
  });
});
