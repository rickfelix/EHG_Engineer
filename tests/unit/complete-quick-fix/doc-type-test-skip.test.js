/**
 * QF-20260530-493 — type=documentation test-gate skip
 *
 * Closes feedback 9b6d1e05: the complete-quick-fix orchestrator skipped the
 * unit+e2e gate ONLY when isDocsOnlyDiff() matched the diff by file pattern
 * (*.md, docs/, README/LICENSE/CHANGELOG). A type=documentation QF whose change
 * lives in a non-doc-pattern file (e.g. a 2-line .sql comment header —
 * QF-20260530-432) was NOT recognized, so the full unit+e2e suite ran and
 * SIGTERMed at 3-7min before any DB write, forcing a --force-complete bypass.
 *
 * canSkipTestGate honors the QF's declared type so such QFs skip the gate too.
 * It is the pure-helper contract the orchestrator uses for the skip decision
 * (mirrors the sibling isDocsOnlyDiff helper pinned in docs-only-test-skip.test.js).
 */

import { describe, it, expect } from 'vitest';
import { canSkipTestGate } from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('canSkipTestGate', () => {
  it('skips when the diff is docs-only (regardless of type)', () => {
    expect(canSkipTestGate({ qfType: 'bug', docsOnlyDiff: true })).toBe(true);
    expect(canSkipTestGate({ qfType: 'polish', docsOnlyDiff: true })).toBe(true);
  });

  it('skips when qfType is documentation even if the diff is NOT docs-only', () => {
    // The QF-20260530-432 case: a .sql comment header is type=documentation but
    // isDocsOnlyDiff() returns false because .sql is not a docs path.
    expect(canSkipTestGate({ qfType: 'documentation', docsOnlyDiff: false })).toBe(true);
  });

  it('does NOT skip for a non-doc type with a non-docs diff', () => {
    expect(canSkipTestGate({ qfType: 'bug', docsOnlyDiff: false })).toBe(false);
    expect(canSkipTestGate({ qfType: 'polish', docsOnlyDiff: false })).toBe(false);
    expect(canSkipTestGate({ qfType: 'typo', docsOnlyDiff: false })).toBe(false);
  });

  it('requires docsOnlyDiff to be strictly true (a truthy non-boolean does not skip)', () => {
    expect(canSkipTestGate({ qfType: 'bug', docsOnlyDiff: 'yes' })).toBe(false);
    expect(canSkipTestGate({ qfType: 'bug', docsOnlyDiff: 1 })).toBe(false);
  });

  it('returns false for empty / missing args (cannot prove a safe skip)', () => {
    expect(canSkipTestGate()).toBe(false);
    expect(canSkipTestGate({})).toBe(false);
    expect(canSkipTestGate({ qfType: undefined, docsOnlyDiff: undefined })).toBe(false);
  });
});
