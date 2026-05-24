/**
 * QF-20260524-057: complete-quick-fix LOC-cap accuracy (feedback 1becd80a).
 *
 * countLocByPrFiles: when the merged PR commit isn't local (--merge non-squash,
 * or completing from an unrelated CWD), the source/test split must come from the
 * PR file list — otherwise the splitter is skipped and the orchestrator defaults
 * actualSourceLoc=total / test=0, falsely escalating test-only QFs to Tier-3
 * (QF-20260523-562: 84 add ≈ 5 src + 79 test, but reported 86/0).
 */
import { describe, it, expect } from 'vitest';
import { countLocByPrFiles } from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('countLocByPrFiles (1becd80a: PR-file-list source/test split)', () => {
  it('classifies tests/unit/*.test.js as test, not source (the QF-562 case)', () => {
    const files = [
      { path: 'tests/unit/foo.test.js', additions: 79, deletions: 0 },
      { path: 'scripts/foo.js', additions: 5, deletions: 0 },
    ];
    const r = countLocByPrFiles(files);
    expect(r.source).toBe(5);   // was misreported as 84 (100% source) before the fix
    expect(r.test).toBe(79);
    expect(r.total).toBe(84);
  });

  it('counts additions + deletions and recognizes spec/__tests__/e2e patterns', () => {
    const files = [
      { path: 'src/a.spec.ts', additions: 10, deletions: 2 },      // test
      { path: 'src/__tests__/b.js', additions: 4, deletions: 1 },  // test
      { path: 'e2e/c.js', additions: 3, deletions: 0 },            // test
      { path: 'lib/d.js', additions: 6, deletions: 4 },            // source
    ];
    const r = countLocByPrFiles(files);
    expect(r.test).toBe(20);
    expect(r.source).toBe(10);
    expect(r.total).toBe(30);
  });

  it('is robust to empty / undefined / missing fields', () => {
    expect(countLocByPrFiles([])).toEqual({ source: 0, test: 0, total: 0 });
    expect(countLocByPrFiles(undefined)).toEqual({ source: 0, test: 0, total: 0 });
    expect(countLocByPrFiles([{ path: '' }, { additions: 5 }])).toEqual({ source: 0, test: 0, total: 0 });
  });
});
