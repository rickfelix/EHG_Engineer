// Tests for QF-20260504-501 — validateLOC hard cap aligned with CLAUDE.md routing.
// Pre-fix: cap was 50, but CLAUDE.md says Tier 2 Standard QF spans 31–75 LOC and
// Tier 3 (>75) is full SD. Post-fix: cap is 75. QFs at 31–75 LOC must validate.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateLOC, QF_HARD_LOC_CAP } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('QF-501 LOC-CAP-1: hard cap matches CLAUDE.md routing (Tier 3 = >75)', () => {
  it('exports QF_HARD_LOC_CAP === 75', () => {
    expect(QF_HARD_LOC_CAP).toBe(75);
  });
});

// QF-20260509-409: validateLOC signature was extended by SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-1
// from (loc, qfId, supabase, prompt) to (sourceLoc, testLoc, qfId, supabase, prompt, flags). These tests
// were not updated — the testLoc/qfId/supabase positions shifted, so prompt was landing in the wrong
// position. The ≤75-LOC tests passed silently (no prompt call) but the >75 test crashed at prompt
// invocation (TypeError: prompt is not a function). All 4 calls now use the canonical 5-arg form.

describe('QF-501 LOC-CAP-2: 31–75 LOC (Tier 2 Standard QF) is accepted', () => {
  it('returns true for 75 LOC (boundary)', async () => {
    const r = await validateLOC(75, 0, 'QF-X', null, async () => 'no');
    expect(r).toBe(true);
  });
  it('returns true for 60 LOC (mid-Tier 2)', async () => {
    const r = await validateLOC(60, 0, 'QF-X', null, async () => 'no');
    expect(r).toBe(true);
  });
  it('returns true for 51 LOC (was rejected pre-fix)', async () => {
    const r = await validateLOC(51, 0, 'QF-X', null, async () => 'no');
    expect(r).toBe(true);
  });
});

describe('QF-501 LOC-CAP-3: >75 LOC (Tier 3) still rejected', () => {
  it('returns false for 76 LOC and prompts for escalation', async () => {
    const prompt = vi.fn(async () => 'no');
    const r = await validateLOC(76, 0, 'QF-X', null, prompt);
    expect(r).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });
});
