/**
 * Unit tests for lib/eva/uat-robustness-gate.js — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C
 * (FR-1). Covers the TR-1 fleet-safety short-circuit (no-op until a stage row carries the
 * gate marker — this is true of every stage today, since child B has not landed), the S2 fix
 * (per-venture opt-in via ventures.metadata.uat_robustness_probe_required, not fleet-wide once
 * a stage is marked), the S3 fix (an absent stage row fails closed, distinct from a present
 * row with the marker false), and the gate-satisfied/unsatisfied paths once opted in + a run
 * exists.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkUatRobustnessGate } from '../../../lib/eva/uat-robustness-gate.js';

function buildSupabase({ stageMetadata = null, stageRowExists = true, ventureMetadata = null, ventureRowExists = true, run = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'venture_stages') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: stageRowExists ? { metadata: stageMetadata || {} } : null, error: null }) })) })) };
      }
      if (table === 'ventures') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: ventureRowExists ? { metadata: ventureMetadata || {} } : null, error: null }) })) })) };
      }
      if (table === 'uat_test_runs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: run, error: null }),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const OPTED_IN_VENTURE = { uat_robustness_probe_required: true };
const MARKED_STAGE = { gates: { uat_robustness_required: true } };

describe('checkUatRobustnessGate', () => {
  it('TR-1 fleet-safety short-circuit: applies=false when the stage has no gate marker (true of every stage today)', async () => {
    const supabase = buildSupabase({ stageMetadata: {} });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 19);
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it('S3 fix: an ABSENT stage row now fails closed (indeterminate), not applies=false', async () => {
    const supabase = buildSupabase({ stageRowExists: false });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 99);
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.indeterminate).toBe(true);
    expect(result.reason).toMatch(/no venture_stages row found/);
  });

  it('S2 fix: applies=false when the stage IS marked but the venture has NOT opted in (fleet-safety, not fleet-wide)', async () => {
    const supabase = buildSupabase({ stageMetadata: MARKED_STAGE, ventureMetadata: {} });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
    expect(result.reason).toMatch(/has not opted in/);
  });

  it('S2 fix: an ABSENT ventures row also does not apply (never blocks a venture that cannot be looked up as opted-in)', async () => {
    const supabase = buildSupabase({ stageMetadata: MARKED_STAGE, ventureRowExists: false });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.applies).toBe(false);
  });

  it('applies=true, satisfied=false when marked + opted-in but no UAT run exists for this venture/stage', async () => {
    const supabase = buildSupabase({ stageMetadata: MARKED_STAGE, ventureMetadata: OPTED_IN_VENTURE, run: null });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/no UAT run recorded/);
  });

  it('applies=true, satisfied=false when the latest run has not completed', async () => {
    const supabase = buildSupabase({
      stageMetadata: MARKED_STAGE,
      ventureMetadata: OPTED_IN_VENTURE,
      run: { id: 'run-1', status: 'running', metadata: {} },
    });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/has not completed/);
  });

  it('applies=true, satisfied=false when the latest completed run is not GREEN, surfacing control-pack failure detail', async () => {
    const supabase = buildSupabase({
      stageMetadata: MARKED_STAGE,
      ventureMetadata: OPTED_IN_VENTURE,
      run: { id: 'run-1', status: 'completed', metadata: { quality_gate: 'RED', control_pack_failures: [{ control: 'canary_mutation_control', reason: 'did not fire' }] } },
    });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/canary_mutation_control/);
  });

  it('applies=true, satisfied=true when opted-in and the latest completed run is GREEN', async () => {
    const supabase = buildSupabase({
      stageMetadata: MARKED_STAGE,
      ventureMetadata: OPTED_IN_VENTURE,
      run: { id: 'run-1', status: 'completed', metadata: { quality_gate: 'GREEN' } },
    });
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.satisfied).toBe(true);
  });

  it('fails closed (indeterminate) on a venture_stages read error', async () => {
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })) })) })),
    };
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.indeterminate).toBe(true);
  });

  it('fails closed (indeterminate) on a ventures read error', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_stages') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: MARKED_STAGE }, error: null }) })) })) };
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })) })) };
      }),
    };
    const result = await checkUatRobustnessGate(supabase, 'venture-1', 20);
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.indeterminate).toBe(true);
  });
});
