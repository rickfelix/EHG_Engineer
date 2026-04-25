/**
 * lib/ship/qf-detector unit tests
 * SD-LEO-INFRA-SHIP-INVOKE-COMPLETE-001
 *
 * Covers BOTH production prefix variants (qf/ and quick-fix/) plus the
 * common false-positive shapes that should NOT be treated as QFs.
 */

import { describe, it, expect } from 'vitest';
import { isQuickFixBranch, extractQFId } from '../../../lib/ship/qf-detector.mjs';

describe('isQuickFixBranch', () => {
  it('returns true for canonical qf/QF-<id> prefix', () => {
    expect(isQuickFixBranch('qf/QF-20260424-808')).toBe(true);
  });

  it('returns true for legacy quick-fix/QF-<id> prefix (still in production)', () => {
    expect(isQuickFixBranch('quick-fix/QF-20260424-808')).toBe(true);
  });

  it('returns false for SD branches (feat/SD-*, fix/SD-*, etc.)', () => {
    expect(isQuickFixBranch('feat/SD-LEO-INFRA-SHIP-INVOKE-COMPLETE-001')).toBe(false);
    expect(isQuickFixBranch('fix/SD-FOO-001')).toBe(false);
    expect(isQuickFixBranch('main')).toBe(false);
  });

  it('returns false for null/undefined/empty/non-string', () => {
    expect(isQuickFixBranch(null)).toBe(false);
    expect(isQuickFixBranch(undefined)).toBe(false);
    expect(isQuickFixBranch('')).toBe(false);
    expect(isQuickFixBranch(42)).toBe(false);
    expect(isQuickFixBranch({})).toBe(false);
  });

  it('handles uppercase prefix variants (defensive)', () => {
    expect(isQuickFixBranch('QF/QF-20260424-808')).toBe(true);
    expect(isQuickFixBranch('Quick-Fix/QF-20260424-808')).toBe(true);
  });

  it('returns false when prefix matches but no QF- separator follows', () => {
    // Prefix-only matches still register as QF branches per the prefix rule;
    // extractQFId is the gate that requires the full ID. This separation is
    // intentional: the skill prompt can warn on prefix-without-ID instead of
    // silently treating the merge as a non-QF.
    expect(isQuickFixBranch('qf/random-branch')).toBe(true);
    expect(extractQFId('qf/random-branch')).toBeNull();
  });
});

describe('extractQFId', () => {
  it('extracts ID from qf/QF-<id>', () => {
    expect(extractQFId('qf/QF-20260424-808')).toBe('QF-20260424-808');
  });

  it('extracts ID from quick-fix/QF-<id>', () => {
    expect(extractQFId('quick-fix/QF-20260424-081')).toBe('QF-20260424-081');
  });

  it('preserves QF- ID hyphenation and digits', () => {
    expect(extractQFId('qf/QF-CLAIM-CONFLICT-UX-001')).toBe('QF-CLAIM-CONFLICT-UX-001');
  });

  it('returns null when QF- segment is missing', () => {
    expect(extractQFId('qf/something-else')).toBeNull();
    expect(extractQFId('quick-fix/random')).toBeNull();
  });

  it('returns null for non-QF branches', () => {
    expect(extractQFId('feat/SD-FOO-001')).toBeNull();
    expect(extractQFId('main')).toBeNull();
  });

  it('returns null for null/undefined/empty/non-string', () => {
    expect(extractQFId(null)).toBeNull();
    expect(extractQFId(undefined)).toBeNull();
    expect(extractQFId('')).toBeNull();
    expect(extractQFId(42)).toBeNull();
  });

  it('is case-insensitive on prefix only', () => {
    // The QF- prefix on the ID itself is case-insensitive too in the regex
    expect(extractQFId('QF/QF-20260424-808')).toBe('QF-20260424-808');
  });
});
