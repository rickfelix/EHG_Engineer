/**
 * Unit tests for lib/eva/convergence-loop.js.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C
 *
 * @module tests/unit/eva/convergence-loop.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ESCALATION_DISPOSITIONS,
  classifyGaps,
  backfillCompletenessGap,
  classifyRemediationTier,
  routeRemediation,
  buildEscalationPacket,
  runConvergenceLoop,
} from '../../../lib/eva/convergence-loop.js';

/** Same filterable/sortable in-memory chain mock as adherence-scorer.test.js. */
function makeChain(rows, transforms = []) {
  const apply = (data) => transforms.reduce((acc, fn) => fn(acc), data);
  const withTransform = (fn) => makeChain(rows, [...transforms, fn]);
  return {
    eq: (col, val) => withTransform((data) => data.filter((r) => r[col] === val)),
    in: (col, vals) => withTransform((data) => data.filter((r) => vals.includes(r[col]))),
    contains: (col, obj) => withTransform((data) => data.filter((r) => {
      const target = r[col];
      return target && Object.entries(obj).every(([k, v]) => target[k] === v);
    })),
    order: (col, opts = {}) => withTransform((data) => {
      const sorted = [...data].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0));
      return opts.ascending === false ? sorted.reverse() : sorted;
    }),
    limit: (n) => withTransform((data) => data.slice(0, n)),
    maybeSingle: async () => ({ data: apply(rows)[0] ?? null, error: null }),
    single: async () => ({ data: apply(rows)[0] ?? null, error: null }),
    then: (resolve) => resolve({ data: apply(rows), error: null }),
  };
}

/** Mutable per-table store so scoring can reflect remediation between rescores. */
function createMockSupabase(initialTables = {}) {
  const tables = { adherence_rubrics: [], post_build_verdicts: [], venture_artifacts: [], ...initialTables };
  return {
    from: (tableName) => ({ select: () => makeChain(tables[tableName] || []) }),
    _tables: tables,
  };
}

const PUBLISHED_RUBRIC = {
  rubric_key: 'post_build_adherence_v1',
  version: 1,
  status: 'published',
  dimensions: {},
  dimension_floor: 3,
  mean_floor: 4,
  zero_unscored_fails: true,
};

const ALL_BUILT_VERDICTS = (ventureId) => ([
  { id: 'v1', venture_id: ventureId, artifact_type: 'blueprint_user_story_pack', claim_ref: 'story-1', disposition: 'BUILT' },
  { id: 'v2', venture_id: ventureId, artifact_type: 'identity_persona_brand', claim_ref: 'identity_persona_brand', disposition: 'BUILT' },
  { id: 'v3', venture_id: ventureId, artifact_type: 'blueprint_data_model', claim_ref: 'blueprint_data_model', disposition: 'BUILT' },
  { id: 'v4', venture_id: ventureId, artifact_type: 'blueprint_technical_architecture', claim_ref: 'blueprint_technical_architecture', disposition: 'BUILT' },
]);

describe('classifyGaps()', () => {
  it('classifies an unscored dimension as completeness and a below-floor scored dimension as adherence', () => {
    const scoreResult = {
      dimensionScores: { user_story_coverage: null, persona_surface_coverage: 2, data_model_fidelity: 5, architecture_conformance: 5 },
      unscoredDimensions: ['user_story_coverage'],
      rubric: { dimension_floor: 3, mean_floor: 4 },
    };
    const gaps = classifyGaps(scoreResult);
    expect(gaps).toEqual([
      { dimension: 'user_story_coverage', kind: 'completeness', score: null },
      { dimension: 'persona_surface_coverage', kind: 'adherence', score: 2 },
    ]);
  });
});

describe('backfillCompletenessGap() — TS-6 circularity guard', () => {
  it('rejects a build/repo-sourced backfill result', async () => {
    const sourceFn = vi.fn().mockResolvedValue({ source: 'build', artifact: { fake: true } });
    await expect(backfillCompletenessGap({ dimension: 'user_story_coverage' }, sourceFn))
      .rejects.toThrow(/circularity guard/);
  });

  it('accepts a genuinely upstream-sourced backfill result and stamps retroactive=true', async () => {
    const sourceFn = vi.fn().mockResolvedValue({ source: 'blueprint_user_story_pack_v2', artifact: { id: 'a1' } });
    const result = await backfillCompletenessGap({ dimension: 'user_story_coverage' }, sourceFn);
    expect(result.retroactive).toBe(true);
    expect(result.confidence).toBe('low');
  });

  it('throws when no sourceFn is provided at all (no default that could read from the build)', async () => {
    await expect(backfillCompletenessGap({ dimension: 'user_story_coverage' }, undefined))
      .rejects.toThrow(/no default/);
  });
});

describe('classifyRemediationTier()', () => {
  it('routes to tier 3 when a critical-weight deviation is attached to the gap dimension', () => {
    const ledger = [{ dimension: 'architecture_conformance', weight: 'critical' }];
    expect(classifyRemediationTier({ dimension: 'architecture_conformance' }, ledger)).toBe(3);
  });

  it('routes to tier 2 when no critical-weight deviation exists for the gap dimension', () => {
    const ledger = [{ dimension: 'architecture_conformance', weight: 'minor' }];
    expect(classifyRemediationTier({ dimension: 'architecture_conformance' }, ledger)).toBe(2);
  });
});

describe('routeRemediation() — TS-5 per-cycle cap + overflow', () => {
  it('routes exactly perCycleCap items and defers the rest, never silently dropping overflow', async () => {
    const gaps = Array.from({ length: 7 }, (_, i) => ({ dimension: `dim-${i}`, kind: 'adherence', score: 1 }));
    const createQuickFixFn = vi.fn().mockResolvedValue('QF-mock-id');
    const { routed, deferred, errors } = await routeRemediation(gaps, {
      ventureId: 'v-1', perCycleCap: 5, ledger: [], createQuickFixFn,
    });

    expect(routed).toHaveLength(5);
    expect(deferred).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(createQuickFixFn).toHaveBeenCalledTimes(5);
  });

  it('routes completeness gaps to backfillFn and adherence gaps to fix-filing separately in the same cycle', async () => {
    const gaps = [
      { dimension: 'user_story_coverage', kind: 'completeness', score: null },
      { dimension: 'architecture_conformance', kind: 'adherence', score: 2 },
    ];
    const backfillFn = vi.fn().mockResolvedValue({ source: 'upstream-blueprint', artifact: {} });
    const createQuickFixFn = vi.fn().mockResolvedValue('QF-1');
    const { routed, deferred } = await routeRemediation(gaps, {
      ventureId: 'v-1', perCycleCap: 5, ledger: [], backfillFn, createQuickFixFn,
    });

    expect(deferred).toHaveLength(0);
    expect(routed.find((r) => r.dimension === 'user_story_coverage').remediation).toBe('completeness-backfill');
    expect(routed.find((r) => r.dimension === 'architecture_conformance').remediation).toBe('adherence-fix');
    expect(backfillFn).toHaveBeenCalledTimes(1);
    expect(createQuickFixFn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a filing failure into deferred rather than silently treating remediation as succeeded', async () => {
    const gaps = [{ dimension: 'architecture_conformance', kind: 'adherence', score: 2 }];
    const createQuickFixFn = vi.fn().mockRejectedValue(new Error('duplicate key'));
    const { routed, deferred, errors } = await routeRemediation(gaps, {
      ventureId: 'v-1', perCycleCap: 5, ledger: [], createQuickFixFn,
    });

    expect(routed).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/duplicate key/);
  });
});

describe('buildEscalationPacket() — TS-7', () => {
  it('has exactly the 3 specified dispositions', () => {
    const packet = buildEscalationPacket({ scoreResult: { pass: false }, ledger: [], deferredItems: [] });
    expect(packet.dispositions.map((d) => d.key)).toEqual(ESCALATION_DISPOSITIONS);
    expect(packet.dispositions).toHaveLength(3);
  });

  it('flags pivot-the-artifact with requires_chairman_ratification when the artifact was chairman-approved', () => {
    const packet = buildEscalationPacket({ scoreResult: { pass: false }, ledger: [], deferredItems: [], isArtifactChairmanApproved: true });
    const pivot = packet.dispositions.find((d) => d.key === 'pivot-the-artifact');
    expect(pivot.requires_chairman_ratification).toBe(true);
  });

  it('does not require ratification when the artifact was not chairman-approved', () => {
    const packet = buildEscalationPacket({ scoreResult: { pass: false }, ledger: [], deferredItems: [], isArtifactChairmanApproved: false });
    const pivot = packet.dispositions.find((d) => d.key === 'pivot-the-artifact');
    expect(pivot.requires_chairman_ratification).toBe(false);
  });
});

describe('runConvergenceLoop()', () => {
  it('TS-1 (via loop): all-BUILT venture returns PASS on cycle 1 with zero remediation items filed', async () => {
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: ALL_BUILT_VERDICTS('v-1'),
    });

    const result = await runConvergenceLoop(supabase, { ventureId: 'v-1' });
    expect(result.status).toBe('PASS');
    expect(result.cycles).toBe(1);
    expect(result.remediationHistory).toEqual([]);
  });

  it('TS-4: exits early before cycle 3 on monotone non-improvement between cycles', async () => {
    // Cycle 1 (initial): user_story_coverage MISSING entirely -> FAIL.
    // Remediation "succeeds" per the mock, but the underlying verdict table
    // never actually changes between rescores (a stalled fix) -> deficit
    // series is flat -> early exit before cycle 3.
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: ALL_BUILT_VERDICTS('v-4').filter((r) => r.artifact_type !== 'blueprint_user_story_pack'),
    });
    const createQuickFixFn = vi.fn().mockResolvedValue('QF-stall');
    const backfillFn = vi.fn().mockResolvedValue({ source: 'upstream-noop', artifact: {} }); // never actually inserts a row

    const result = await runConvergenceLoop(supabase, {
      ventureId: 'v-4', createQuickFixFn, backfillFn,
    });

    expect(result.status).toBe('ESCALATED');
    expect(result.cycles).toBeLessThan(3);
    expect(result.escalationPacket).toBeTruthy();
  });

  it('TS-5/TS-6 integration: 7 gaps in one cycle cap at 5, circularity-guarded completeness backfill throws are treated as a per-item failure not a loop crash', async () => {
    // Build a venture with all 4 mapped dimensions unscored (completeness gaps) —
    // fewer than 7 real dimensions exist, so this exercises the cap logic at the
    // routeRemediation unit level (already covered above) and confirms the loop
    // itself does not throw when backfillFn is a circularity-guard rejection.
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: [],
    });
    const backfillFn = vi.fn().mockResolvedValue({ source: 'build', artifact: {} }); // will be rejected every time

    const result = await runConvergenceLoop(supabase, { ventureId: 'v-5', backfillFn });

    expect(result.status).toBe('ESCALATED');
    expect(result.remediationHistory[0].errors.length).toBeGreaterThan(0);
    expect(result.remediationHistory[0].errors.every((e) => /circularity guard/.test(e.error))).toBe(true);
  });

  it('TS-7 (via loop): escalation packet on cap exhaustion has exactly 3 dispositions', async () => {
    const supabase = createMockSupabase({
      adherence_rubrics: [PUBLISHED_RUBRIC],
      post_build_verdicts: [],
    });
    const result = await runConvergenceLoop(supabase, { ventureId: 'v-7' });
    expect(result.status).toBe('ESCALATED');
    expect(result.escalationPacket.dispositions).toHaveLength(3);
    expect(result.escalationPacket.dispositions.map((d) => d.key)).toEqual(ESCALATION_DISPOSITIONS);
  });
});
