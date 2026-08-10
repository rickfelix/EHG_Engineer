// QF-20260809-341 — the passed/valid wire, tested WITHOUT mocking the producer.
//
// The RETROSPECTIVE_EXISTS tier-3 arm reads `assessment.passed` (lead-final-approval/gates.js),
// and its contract test ratifies that by MOCKING validateSDCompletionReadiness with a `passed`
// key. The real function only emitted `valid`, so both sides were green while the wire was
// broken: `!assessment?.passed` was true for EVERY tier-3 SD and the gate could not pass at any
// score (observed live: "assessed score 75% is below minimum 60%"). This suite calls the REAL
// producer on its no-network early-return path, so the contract key can never silently vanish
// behind a mock again.

import { describe, it, expect } from 'vitest';
import { validateSDCompletionReadiness } from '../../scripts/modules/sd-quality-validation.js';

describe('validateSDCompletionReadiness emits the passed key the gate consumes', () => {
  it('null SD: passed exists, mirrors valid, and is false', async () => {
    const r = await validateSDCompletionReadiness(null);
    expect(r.valid).toBe(false);
    // The load-bearing assertion: `passed` must be a boolean, not undefined — undefined is what
    // made the gate's `!assessment?.passed` unconditionally true.
    expect(r.passed).toBe(false);
    expect(r.passed).toBe(r.valid);
  });
});
