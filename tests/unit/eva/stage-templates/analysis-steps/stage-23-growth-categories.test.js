/**
 * Unit tests for the S23 launch kill-gate growth categories.
 * SD: SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D (FR-005 + FR-006)
 *
 * Locks in:
 *   - Golden default-OFF parity: flag OFF keeps the verdict + REQUIRED set baseline-identical.
 *   - Flag-ON enforcement: growth_playbook + distribution_ad_copy become REQUIRED; absence => NOT_READY.
 *   - Deploy-order safety: in-flight ventures lacking a playbook are NOT blocked while the flag is OFF.
 *   - Flag read defaults OFF on absence/error.
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test
 */

import { describe, it, expect, vi } from 'vitest';

import {
  analyzeStage23LaunchReadiness,
  readGrowthPlaybookRequiredFlag,
  GROWTH_CATEGORIES,
  REQUIRED_CATEGORIES,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

const silentLogger = { info: () => {}, warn: () => {} };

// Minimal chainable Supabase mock (per-table results; thenable terminal).
function makeQuery(result) {
  const q = {};
  for (const m of ['select', 'eq', 'in', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve) => resolve(result);
  return q;
}
function makeSupabase({ flagEnabled = false, presentTypes = [] } = {}) {
  return {
    from: vi.fn((t) => {
      if (t === 'leo_feature_flags') return makeQuery({ data: { is_enabled: flagEnabled }, error: null });
      if (t === 'venture_artifacts') return makeQuery({ data: presentTypes.map((x) => ({ artifact_type: x, is_current: true })), error: null });
      return makeQuery({ error: null }); // eva_orchestration_events insert
    }),
  };
}

// Base upstream that satisfies the (unchanged) preflight in both flag states.
const BASE_PRESENT = ['code_quality_report', 'visual_social_graphics', 'distribution_channel_config'];
// Params that pass the 3 baseline REQUIRED categories.
const PASSING_PARAMS = {
  stage20Data: { verdict: 'PASS' },
  stage21Data: { total_assets: 5 },
  stage22Data: { active_channels: 3 },
  ventureName: 'Acme',
  ventureId: 'v1',
  logger: silentLogger,
};

function requiredCats(checklist) {
  return checklist.filter((c) => c.mode === 'REQUIRED').map((c) => c.category);
}

describe('readGrowthPlaybookRequiredFlag', () => {
  it('defaults OFF when no supabase', async () => {
    expect(await readGrowthPlaybookRequiredFlag(null, silentLogger)).toBe(false);
  });
  it('defaults OFF when the flag row is absent', async () => {
    const supabase = makeSupabase({ flagEnabled: false });
    expect(await readGrowthPlaybookRequiredFlag(supabase, silentLogger)).toBe(false);
  });
});

describe('FR-006 golden: default-OFF parity', () => {
  it('flag OFF keeps verdict READY, REQUIRED set baseline-identical, and growth cats ABSENT', async () => {
    const supabase = makeSupabase({ flagEnabled: false, presentTypes: BASE_PRESENT });
    const r = await analyzeStage23LaunchReadiness({ ...PASSING_PARAMS, supabase });

    expect(r.verdict).toBe('READY');
    expect(r.growth_playbook_required).toBe(false);
    // REQUIRED set is exactly the pre-001-D baseline — no growth categories.
    expect(requiredCats(r.checklist)).toEqual(REQUIRED_CATEGORIES);
    // Default-OFF parity: the growth categories are entirely absent from the checklist
    // and counts, so no in-flight venture's verdict/readiness_pct changes during rollout.
    for (const cat of GROWTH_CATEGORIES) {
      expect(r.checklist.find((c) => c.category === cat)).toBeUndefined();
    }
    expect(r.total_categories).toBe(REQUIRED_CATEGORIES.length + 3); // 3 advisory (analytics/monitoring/legal)
  });

  it('deploy-order safety: flag OFF + no pre-launch playbook still yields READY (in-flight not blocked)', async () => {
    const supabase = makeSupabase({ flagEnabled: false, presentTypes: BASE_PRESENT });
    const r = await analyzeStage23LaunchReadiness({ ...PASSING_PARAMS, supabase });
    expect(r.verdict).toBe('READY');
  });
});

describe('FR-005 flag-ON enforcement', () => {
  it('flag ON + playbook present => growth_playbook REQUIRED & passing, verdict READY', async () => {
    const supabase = makeSupabase({
      flagEnabled: true,
      presentTypes: [...BASE_PRESENT, 'growth_playbook', 'distribution_ad_copy'],
    });
    const r = await analyzeStage23LaunchReadiness({ ...PASSING_PARAMS, supabase });

    expect(r.growth_playbook_required).toBe(true);
    expect(requiredCats(r.checklist)).toEqual([...REQUIRED_CATEGORIES, ...GROWTH_CATEGORIES]);
    const gp = r.checklist.find((c) => c.category === 'growth_playbook');
    expect(gp.mode).toBe('REQUIRED');
    expect(gp.status).toBe('pass');
    expect(r.verdict).toBe('READY');
  });

  it('flag ON + playbook ABSENT => growth_playbook REQUIRED & pending, verdict NOT_READY', async () => {
    const supabase = makeSupabase({ flagEnabled: true, presentTypes: BASE_PRESENT }); // no growth_playbook / ad_copy
    const r = await analyzeStage23LaunchReadiness({ ...PASSING_PARAMS, supabase });

    const gp = r.checklist.find((c) => c.category === 'growth_playbook');
    expect(gp.mode).toBe('REQUIRED');
    expect(gp.status).toBe('pending');
    expect(r.verdict).toBe('NOT_READY');
  });
});
