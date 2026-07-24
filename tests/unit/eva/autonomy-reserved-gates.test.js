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
import { getStageGovernance, _resetCacheForTest } from '../../../lib/eva/stage-governance.js';

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

const RESERVED = [3, 5, 10, 16, 17, 18, 19];

describe('RESERVED_CHAIRMAN_STAGES (FR-1)', () => {
  it('contains exactly the chairman-reserved stages 3,5,10,16,17,18,19', () => {
    expect([...RESERVED_CHAIRMAN_STAGES].sort((a, b) => a - b)).toEqual(RESERVED);
  });

  // SD-LEO-FIX-RETRO-ACTION-ITEMS-001 (FR-1): stage 16 (Blueprint->Build) is reserved because the
  // DB trigger reject_s16_programmatic_approval already unconditionally rejects a stage-16
  // programmatic approval -- the reserved set previously didn't reflect that, letting autonomy
  // classify stage 16 as auto_approve-able only for the RPC to then fail.
  it('stage 16 is reserved', () => {
    expect(RESERVED_CHAIRMAN_STAGES.has(16)).toBe(true);
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

  it('non-reserved stage 20 at L4 is unaffected (normal matrix → auto_approve)', async () => {
    const r = await checkAutonomy('v1', 'stage_gate', { supabase: mockSb('L4') }, 20);
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
    const r = await autonomyPreCheck('v1', 'stage_gate', overrideDeps, 20);
    expect(r.action).toBe('auto_approve'); // L4 override → stage_gate auto_approve
    expect(r.overridden).toBe(true);
  });

  it('backward-compatible: omitting stageNumber preserves override/precheck behavior', async () => {
    const r = await autonomyPreCheck('v1', 'kill_gate', overrideDeps);
    expect(r.action).toBe('manual'); // kill_gate is manual at every level
    expect(r.overridden).toBe(true);
  });
});

describe('stage-governance gate-type resolution (FR-2b / FR-3)', () => {
  // Real venture_stages classification (verified against the DB): S18 is artifact_only + promotion,
  // S19 is sd_required + promotion — both excluded from the work_type-driven promotionStages, so
  // they previously fell into the stage_gate catch-all. gateTypeForAutonomy keys on the row gate_type.
  const ROWS = [
    { stage_number: 3, gate_type: 'kill', work_type: 'decision_gate', review_mode: 'auto' },
    { stage_number: 5, gate_type: 'kill', work_type: 'decision_gate', review_mode: 'auto' },
    { stage_number: 16, gate_type: 'promotion', work_type: 'decision_gate', review_mode: 'auto' },
    { stage_number: 18, gate_type: 'promotion', work_type: 'artifact_only', review_mode: 'auto' },
    { stage_number: 19, gate_type: 'promotion', work_type: 'sd_required', review_mode: 'auto' },
    { stage_number: 22, gate_type: 'none', work_type: 'artifact_only', review_mode: 'review' },
  ];
  // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: _readFresh now ALSO reads leo_feature_flags
  // (HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED) on every refresh — table-aware branch so that
  // read resolves instead of throwing; irrelevant to every assertion in this describe block
  // (none of these rows set is_high_consequence).
  function mockGovSb(rows) {
    return {
      from: (table) => {
        if (table === 'leo_feature_flags') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { is_enabled: true }, error: null }) }) }) };
        }
        return { select: () => ({ order: () => ({ data: rows, error: null }) }) };
      },
    };
  }

  it('gate-type: S18/S19 resolve to promotion_gate (no longer the stage_gate catch-all)', async () => {
    _resetCacheForTest();
    const gov = await getStageGovernance(mockGovSb(ROWS));
    expect(gov.gateTypeForAutonomy(18)).toBe('promotion_gate');
    expect(gov.gateTypeForAutonomy(19)).toBe('promotion_gate');
    // ...but the canonical work_type-driven decision sets are unchanged (additive fix):
    expect(gov.isPromotion(18)).toBe(false);
    expect(gov.isPromotion(19)).toBe(false);
  });

  it('gate-type: kill stages → kill_gate, decision promotion → promotion_gate, non-gate → stage_gate', async () => {
    _resetCacheForTest();
    const gov = await getStageGovernance(mockGovSb(ROWS));
    expect(gov.gateTypeForAutonomy(3)).toBe('kill_gate');
    expect(gov.gateTypeForAutonomy(16)).toBe('promotion_gate');
    expect(gov.gateTypeForAutonomy(22)).toBe('stage_gate');
    expect(gov.gateTypeForAutonomy(999)).toBe('stage_gate'); // unknown stage
  });

  it('gate-type: reserved-stage awareness is exposed', async () => {
    _resetCacheForTest();
    const gov = await getStageGovernance(mockGovSb(ROWS));
    expect(gov.isReserved(18)).toBe(true);
    // SD-LEO-FIX-RETRO-ACTION-ITEMS-001 (FR-1): 16 is now reserved (see autonomy-reserved-gates
    // describe block above) — stage-governance derives reservedStages/isReserved directly from
    // RESERVED_CHAIRMAN_STAGES, so this must move in lockstep with that fix.
    expect(gov.isReserved(16)).toBe(true);
    expect([...gov.reservedStages].sort((a, b) => a - b)).toEqual([3, 5, 10, 16, 17, 18, 19]);
  });
});
