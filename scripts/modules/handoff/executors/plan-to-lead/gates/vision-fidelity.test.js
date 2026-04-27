/**
 * VISION_FIDELITY_GATE tests (FR-2).
 *
 * Uses the gate's `executor` injection seam to swap in a fake sub-agent —
 * keeps tests hermetic, no LLM calls, no DB hits.
 */
import { describe, it, expect, vi } from 'vitest';
import { createVisionFidelityGate } from './vision-fidelity.js';

const fakeSupabase = {}; // gate doesn't touch supabase directly — sub-agent does
const ctx = (overrides = {}) => ({ sd: { id: 'sd-uuid', sd_key: 'SD-FIXTURE-001', sd_type: 'feature' }, ...overrides });

describe('createVisionFidelityGate (FR-2)', () => {
  it('exports a gate config with the right shape', () => {
    const gate = createVisionFidelityGate(fakeSupabase);
    expect(gate.name).toBe('VISION_FIDELITY_GATE');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('translates sub-agent PASS into passed=true score=100', async () => {
    const executor = vi.fn().mockResolvedValue({
      verdict: 'PASS', passed: true,
      issues: [], warnings: [],
      details: { delivered_count: 9, partial_count: 0, missing_count: 0, scope_creep_count: 0, vision_coverage_pct: 1, sd_type: 'feature' }
    });
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx());

    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.max_score).toBe(100);
    expect(r.issues).toEqual([]);
    expect(r.details.verdict).toBe('PASS');
    expect(r.details.gate).toBe('VISION_FIDELITY_GATE');
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ sdId: 'sd-uuid', supabase: fakeSupabase }));
  });

  it('translates sub-agent FAIL into passed=false with issues passed through', async () => {
    const executor = vi.fn().mockResolvedValue({
      verdict: 'FAIL', passed: false,
      issues: ['[critical] vision missing: Default 0/9 counter (header)'],
      warnings: ['vision missing: persona dash (panel)'],
      details: { delivered_count: 1, partial_count: 0, missing_count: 5, scope_creep_count: 0, vision_coverage_pct: 0.167, sd_type: 'feature' }
    });
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx());

    expect(r.passed).toBe(false);
    expect(r.score).toBe(17);
    expect(r.issues).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.details.verdict).toBe('FAIL');
  });

  it('translates sub-agent WARNING (warn-only) into passed=true with warnings', async () => {
    const executor = vi.fn().mockResolvedValue({
      verdict: 'WARNING', passed: true,
      issues: [],
      warnings: ['vision missing: x', 'vision missing: y'],
      details: { delivered_count: 0, partial_count: 0, missing_count: 8, scope_creep_count: 0, vision_coverage_pct: 0, sd_type: 'infrastructure' }
    });
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx({ sd: { id: 'sd-infra', sd_key: 'SD-INFRA', sd_type: 'infrastructure' } }));

    expect(r.passed).toBe(true);
    expect(r.score).toBe(0);
    expect(r.warnings).toHaveLength(2);
    expect(r.details.verdict).toBe('WARNING');
  });

  it('translates sub-agent skip (documentation) into passed=true with skipped detail', async () => {
    const executor = vi.fn().mockResolvedValue({
      verdict: 'PASS', passed: true,
      issues: [], warnings: ['Vision-fidelity skipped: sd-type does not produce UI'],
      details: { skipped: true, reason: 'sd-type does not produce UI', sd_type: 'documentation' }
    });
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx({ sd: { id: 'sd-doc', sd_key: 'SD-DOC', sd_type: 'documentation' } }));

    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
    expect(r.details.verdict).toBe('PASS');
  });

  it('fail-soft: sub-agent throws → advisory pass with warning', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('boom'));
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx());

    expect(r.passed).toBe(true);
    expect(r.warnings.some(w => /boom/.test(w))).toBe(true);
    expect(r.details.advisory).toBe(true);
  });

  it('fail-soft: missing ctx.sd.id → advisory pass with reason', async () => {
    const executor = vi.fn();
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator({}); // no sd

    expect(r.passed).toBe(true);
    expect(r.details.advisory).toBe(true);
    expect(r.details.reason).toBe('no_sd_context');
    expect(executor).not.toHaveBeenCalled();
  });

  it('coverage_pct=null (skipped path) → score defaults to 100', async () => {
    const executor = vi.fn().mockResolvedValue({
      verdict: 'PENDING', passed: true,
      issues: [], warnings: ['no vision_key'],
      details: { skipped: true, skipped_reason: 'no_vision_key', vision_coverage_pct: undefined, sd_type: 'feature' }
    });
    const gate = createVisionFidelityGate(fakeSupabase, { executor });
    const r = await gate.validator(ctx());

    expect(r.score).toBe(100);
    expect(r.details.skipped_reason).toBe('no_vision_key');
  });
});

describe('VISION_FIDELITY_GATE registration in gates/index.js', () => {
  it('createVisionFidelityGate is reachable through the index barrel', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.createVisionFidelityGate).toBe('function');
    const gate = mod.createVisionFidelityGate({});
    expect(gate.name).toBe('VISION_FIDELITY_GATE');
  });
});
