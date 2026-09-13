/**
 * QF-20260912-366 fix (c): findFenceVerdictContradiction is the exact shape this QF was filed
 * against -- a dated fence_status_* object reading CLEARED alongside a stale
 * venture_gate_last_verdict reading NOT_MET.
 */
import { describe, it, expect } from 'vitest';
import { findFenceVerdictContradiction } from '../../../scripts/audit/venture-gate-fence-consistency.mjs';

describe('findFenceVerdictContradiction', () => {
  it('flags the real specimen shape (fence CLEARED, verdict NOT_MET)', () => {
    const metadata = {
      fence_status_2026_08_17: { state: 'CLEARED', cleared_at: '2026-08-17T15:39:26.548Z' },
      venture_gate_last_verdict: 'NOT_MET',
    };
    const hit = findFenceVerdictContradiction(metadata);
    expect(hit).not.toBeNull();
    expect(hit.fenceKey).toBe('fence_status_2026_08_17');
  });

  it('does not flag when the verdict is already MET (re-measured)', () => {
    const metadata = {
      fence_status_2026_08_17: { state: 'CLEARED' },
      venture_gate_last_verdict: 'MET',
    };
    expect(findFenceVerdictContradiction(metadata)).toBeNull();
  });

  it('does not flag when there is no fence_status_* key at all', () => {
    expect(findFenceVerdictContradiction({ venture_gate_last_verdict: 'NOT_MET' })).toBeNull();
  });

  it('does not flag a fence that is not CLEARED', () => {
    const metadata = {
      fence_status_2026_08_17: { state: 'PENDING' },
      venture_gate_last_verdict: 'NOT_MET',
    };
    expect(findFenceVerdictContradiction(metadata)).toBeNull();
  });

  it('handles null/empty metadata without throwing', () => {
    expect(findFenceVerdictContradiction(null)).toBeNull();
    expect(findFenceVerdictContradiction({})).toBeNull();
  });
});
