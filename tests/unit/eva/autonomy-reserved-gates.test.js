/**
 * FR-1 — chairman-reserved EVA gates are ALWAYS manual
 * SD-LEO-INFRA-EVA-RESERVED-GATES-ENFORCEMENT-001
 *
 * GATE_BEHAVIOR_MATRIX has no stage-number awareness, so at L2+ a reserved stage classified as
 * anything but kill_gate would auto-approve. RESERVED_CHAIRMAN_STAGES is the durable backstop:
 * it fires before the matrix lookup (checkAutonomy) and before override resolution (autonomyPreCheck).
 */
import { describe, it, expect } from 'vitest';
import {
  RESERVED_CHAIRMAN_STAGES,
  checkAutonomy,
  autonomyPreCheck,
} from '../../../lib/eva/autonomy-model.js';

// Minimal supabase mock: eva_ventures.autonomy_level read returns the given level.
function mockSb(level) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: level == null ? null : { autonomy_level: level }, error: null }),
        }),
      }),
    }),
  };
}

const RESERVED = [3, 5, 10, 17, 18, 19];

describe('RESERVED_CHAIRMAN_STAGES (FR-1)', () => {
  it('contains exactly the chairman-reserved stages 3,5,10,17,18,19', () => {
    expect([...RESERVED_CHAIRMAN_STAGES].sort((a, b) => a - b)).toEqual(RESERVED);
  });
});

describe('checkAutonomy reserved-stage backstop (FR-1)', () => {
  for (const stage of RESERVED) {
    it(`reserved stage ${stage} is manual even at L4 (matrix would auto_approve)`, async () => {
      const r = await checkAutonomy('v1', 'stage_gate', { supabase: mockSb('L4') }, stage);
      expect(r.action).toBe('manual');
      expect(r.reserved).toBe(true);
    });
  }

  it('reserved stage is manual for ANY gateType (classification-independent)', async () => {
    for (const gt of ['stage_gate', 'promotion_gate', 'reality_gate', 'devils_advocate']) {
      const r = await checkAutonomy('v1', gt, { supabase: mockSb('L4') }, 18);
      expect(r.action).toBe('manual');
      expect(r.reserved).toBe(true);
    }
  });

  it('non-reserved stage 16 at L4 is unaffected (normal matrix → auto_approve)', async () => {
    const r = await checkAutonomy('v1', 'stage_gate', { supabase: mockSb('L4') }, 16);
    expect(r.action).toBe('auto_approve');
    expect(r.reserved).toBeUndefined();
  });

  it('backward-compatible: omitting stageNumber preserves exact matrix behavior', async () => {
    const r = await checkAutonomy('v1', 'stage_gate', { supabase: mockSb('L2') });
    expect(r.action).toBe('auto_approve'); // L2 stage_gate = auto_approve, unchanged
    expect(r.reserved).toBeUndefined();
  });
});

describe('autonomyPreCheck reserved beats chairman override (FR-1)', () => {
  // chairmanPreferenceStore returning an L4 autonomy_override.
  const overrideDeps = {
    supabase: mockSb('L0'),
    chairmanPreferenceStore: { getPreference: async () => ({ value: 'L4' }) },
  };

  it('a reserved stage stays manual even with a chairman L4 override (override cannot downgrade)', async () => {
    const r = await autonomyPreCheck('v1', 'stage_gate', overrideDeps, 19);
    expect(r.action).toBe('manual');
    expect(r.reserved).toBe(true);
    expect(r.overridden).toBe(false);
  });

  it('a non-reserved stage still honors the chairman override', async () => {
    const r = await autonomyPreCheck('v1', 'stage_gate', overrideDeps, 16);
    expect(r.action).toBe('auto_approve'); // L4 override → stage_gate auto_approve
    expect(r.overridden).toBe(true);
  });

  it('backward-compatible: omitting stageNumber preserves override/precheck behavior', async () => {
    const r = await autonomyPreCheck('v1', 'kill_gate', overrideDeps);
    expect(r.action).toBe('manual'); // kill_gate is manual at every level
    expect(r.overridden).toBe(true);
  });
});
