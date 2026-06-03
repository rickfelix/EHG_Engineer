// Tests for QF-20260504-501 — validateLOC hard cap aligned with CLAUDE.md routing.
// Pre-fix: cap was 50, but CLAUDE.md says Tier 2 Standard QF spans 31–75 LOC and
// Tier 3 (>75) is full SD. Post-fix: cap is 75. QFs at 31–75 LOC must validate.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateLOC, QF_HARD_LOC_CAP, computeNetSourceLoc } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);
const { verifyLOCConstraint } = await import(
  '../../../lib/quickfix-self-verifier.js'
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

// SD-FDBK-ENH-COMPLETE-QUICK-FIX-002: deletion-aware source-LOC cap. Pure whole-file
// deletions (sourceDeletionLoc) are discounted from the cap so dead-code-removal QFs are
// not force-escalated. Discounts PURE deletions ONLY — a modify (add+delete) keeps its count.

describe('FDBK-002 computeNetSourceLoc: shared net-LOC helper', () => {
  it('subtracts pure-deletion LOC (145 - 145 = 0)', () => {
    expect(computeNetSourceLoc(145, 145)).toBe(0);
  });
  it('mixed source minus pure deletions (80 - 10 = 70)', () => {
    expect(computeNetSourceLoc(80, 10)).toBe(70);
  });
  it('undefined sourceDeletionLoc behaves as no discount (120)', () => {
    expect(computeNetSourceLoc(120, undefined)).toBe(120);
  });
  it('clamps to 0 when deletions exceed source (50 - 100 -> 0)', () => {
    expect(computeNetSourceLoc(50, 100)).toBe(0);
  });
  it('both undefined -> 0', () => {
    expect(computeNetSourceLoc(undefined, undefined)).toBe(0);
  });
});

describe('FDBK-002 validateLOC: deletion-aware cap', () => {
  it('pure-deletion QF (145 source / 145 deletion -> net 0) passes WITHOUT prompting', async () => {
    const prompt = vi.fn(async () => 'no');
    const r = await validateLOC(145, 0, 'QF-X', null, prompt, { sourceDeletionLoc: 145 });
    expect(r).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });
  it('modify QF (145 source / 0 deletion -> net 145) still escalates', async () => {
    const prompt = vi.fn(async () => 'no');
    const r = await validateLOC(145, 0, 'QF-X', null, prompt, { sourceDeletionLoc: 0 });
    expect(r).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });
  it('mixed (80 source / 10 deletion -> net 70) passes', async () => {
    const r = await validateLOC(80, 0, 'QF-X', null, async () => 'no', { sourceDeletionLoc: 10 });
    expect(r).toBe(true);
  });
  it('boundary: net 75 passes, net 76 escalates', async () => {
    const pass = await validateLOC(76, 0, 'QF-X', null, async () => 'no', { sourceDeletionLoc: 1 }); // net 75
    expect(pass).toBe(true);
    const fail = await validateLOC(77, 0, 'QF-X', null, vi.fn(async () => 'no'), { sourceDeletionLoc: 1 }); // net 76
    expect(fail).toBe(false);
  });
  it('sourceDeletionLoc undefined behaves as today (76 raw -> escalates)', async () => {
    const r = await validateLOC(76, 0, 'QF-X', null, vi.fn(async () => 'no'), {});
    expect(r).toBe(false);
  });
  it('clamps: 50 source / 100 deletion -> net 0 passes', async () => {
    const r = await validateLOC(50, 0, 'QF-X', null, async () => 'no', { sourceDeletionLoc: 100 });
    expect(r).toBe(true);
  });
  it('--over-cap-reason: raw 120 / net 0 passes via the plain net path (no over-cap bypass log)', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const r = await validateLOC(120, 0, 'QF-X', null, async () => 'no', { sourceDeletionLoc: 120, overCapReason: 'cleanup' });
    expect(r).toBe(true);
    expect(logSpy.mock.calls.flat().join(' ')).not.toMatch(/over-cap-reason/);
  });
  it('--over-cap-reason: genuinely-large net (120 / 0) bypasses', async () => {
    const r = await validateLOC(120, 0, 'QF-X', null, async () => 'no', { sourceDeletionLoc: 0, overCapReason: 'big but justified' });
    expect(r).toBe(true);
  });
  it('--force-complete bypasses regardless of deletion math', async () => {
    const r = await validateLOC(200, 0, 'QF-X', null, async () => 'no', { forceComplete: true, reason: 'x' });
    expect(r).toBe(true);
  });
});

describe('FDBK-002 verifyLOCConstraint: deletion-aware (second hard gate — half-fix guard)', () => {
  it('pure-deletion (145 source / 145 deletion -> net 0) passes', async () => {
    const r = await verifyLOCConstraint({}, { actualSourceLoc: 145, sourceDeletionLoc: 145 });
    expect(r.passed).toBe(true);
  });
  it('modify (145 source / 0 deletion -> net 145) fails (still escalates)', async () => {
    const r = await verifyLOCConstraint({}, { actualSourceLoc: 145, sourceDeletionLoc: 0 });
    expect(r.passed).toBe(false);
  });
  it('mixed (80 / 10 -> net 70) passes', async () => {
    const r = await verifyLOCConstraint({}, { actualSourceLoc: 80, sourceDeletionLoc: 10 });
    expect(r.passed).toBe(true);
  });
});
