import { describe, it, expect } from 'vitest';
import { detectSourceToCapacity } from '../../../lib/coordinator/charter-audit-detectors.mjs';

// SD-LEO-INFRA-FLEET-HIBERNATION-001 FR-3 (LINCHPIN): the belt-low source-to-capacity charter
// violation must be SUPPRESSED while the fleet is quiescent — there is nothing to source for while
// the line is genuinely stopped, so the chairman's drive-to-0 has no belt-low violation to force a
// handshake re-send for.

describe('FR-3: detectSourceToCapacity quiescence-awareness', () => {
  const beltLowIdle = { claimableBelt: 0, idleWorkers: 1, sourceRequestedRecently: false };

  it('FIRES a violation when belt-low + idle + no source request AND NOT quiescent (unchanged)', () => {
    const r = detectSourceToCapacity({ ...beltLowIdle, quiescent: false });
    expect(r.violation).toBe(true);
    expect(r.remediation).toMatch(/ping Adam|source/i);
  });

  it('SUPPRESSES the violation when quiescent (the linchpin)', () => {
    const r = detectSourceToCapacity({ ...beltLowIdle, quiescent: true });
    expect(r.violation).toBe(false);
    expect(r.remediation).toBeNull();
    expect(r.detail).toMatch(/quiescent/i);
  });

  it('quiescent suppresses even with unresolved inputs (no fail-loud spam while the line is stopped)', () => {
    const r = detectSourceToCapacity({ claimableBelt: null, idleWorkers: null, sourceRequestedRecently: null, quiescent: true });
    expect(r.violation).toBe(false);
  });

  it('default (quiescent omitted) preserves the prior fail-loud-on-unresolved behavior', () => {
    const r = detectSourceToCapacity({ claimableBelt: null, idleWorkers: 1, sourceRequestedRecently: false });
    expect(r.violation).toBe(true);
    expect(r.detail).toMatch(/unresolved/i);
  });

  it('a recent source request clears the violation regardless (unchanged path)', () => {
    const r = detectSourceToCapacity({ claimableBelt: 0, idleWorkers: 1, sourceRequestedRecently: true, quiescent: false });
    expect(r.violation).toBe(false);
  });
});
