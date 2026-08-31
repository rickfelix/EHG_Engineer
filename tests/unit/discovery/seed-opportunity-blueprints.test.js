/**
 * SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 / FR-1, FR-2, FR-3
 *
 * Pure logic for authoring opportunity blueprints from cancelled-venture history.
 * All fixtures are frozen literals -- never live-DB reads.
 */
import { describe, it, expect } from 'vitest';
import { buildBlueprintFromVenture, resolveBaselineIds } from '../../../scripts/discovery/seed-opportunity-blueprints.mjs';
import { evaluateIntakeBar } from '../../../lib/discovery/intake-bar.js';

const FROZEN_NOW = '2026-08-30T22:00:00.000Z';

const VENTURE_FIXTURE = {
  id: 'v-1111',
  name: 'Canvas AI',
  problem_statement: 'Property managers need to furnish properties faster.',
  target_market: 'property managers',
  category: 'proptech',
  kill_reason: 'cancel due to testing',
  solution_approach: 'AI-generated staging',
  unique_value_proposition: null,
};

describe('buildBlueprintFromVenture (FR-1/FR-2, pure)', () => {
  const bp = buildBlueprintFromVenture(VENTURE_FIXTURE, ['baseline-1'], FROZEN_NOW);

  it('carries the source venture problem/market context forward', () => {
    expect(bp.problem_statement).toBe(VENTURE_FIXTURE.problem_statement);
    expect(bp.target_market).toBe(VENTURE_FIXTURE.target_market);
    expect(bp.venture_id).toBe(VENTURE_FIXTURE.id);
  });

  // REGRESSION finding (evidence 4a293bdc): saveBlueprintsToDatabase()'s insert() allowlist
  // drops problem_statement/solution_concept/venture_id -- lib/eva/stage-zero/paths/
  // blueprint-browse.js selects exactly these columns and can auto-pick blueprints[0]. The
  // builder must still produce them (main()'s follow-up UPDATE patches them in post-write).
  it('carries solution_concept forward when the source venture has one', () => {
    const withSolution = { ...VENTURE_FIXTURE, solution_approach: 'AI-generated staging' };
    const built = buildBlueprintFromVenture(withSolution, [], FROZEN_NOW);
    expect(built.solution_concept).toBe('AI-generated staging');
  });

  it('TESTING T-5: preserves the source kill_reason in metadata (never silently resurrects a killed idea)', () => {
    expect(bp.metadata.source_kill_reason).toBe('cancel due to testing');
    expect(bp.metadata.source_venture_id).toBe(VENTURE_FIXTURE.id);
  });

  it('TESTING T-2: source_type is never "manual" (would classify as e2e_fixture on reseed)', () => {
    expect(bp.source_type).not.toBe('manual');
    expect(bp.source_type).toBe('ai_generated');
  });

  it('populates the fields evaluateIntakeBar() actually reads (kill_assumption, spof_assumption, customer_evidence)', () => {
    expect(typeof bp.kill_assumption).toBe('string');
    expect(bp.kill_assumption.length).toBeGreaterThanOrEqual(20);
    expect(typeof bp.spof_assumption).toBe('string');
    expect(bp.spof_assumption.length).toBeGreaterThanOrEqual(10);
    expect(typeof bp.customer_evidence).toBe('string');
  });

  it('is_active is true (a seeded blueprint enters the live queue)', () => {
    expect(bp.is_active).toBe(true);
  });

  it('FR-3: carries the resolved competitive_baseline_ids in metadata', () => {
    expect(bp.metadata.competitive_baseline_ids).toEqual(['baseline-1']);
  });

  it('a blueprint built from this fixture clears the intake bar majority (>=5/7, advisory-only)', () => {
    const result = evaluateIntakeBar(bp);
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(result.advisory).toBe(true);
  });
});

describe('resolveBaselineIds (FR-3, pure)', () => {
  const baselineByVenture = new Map([
    ['v-own', { id: 'baseline-own', venture_id: 'v-own' }],
    ['v-fallback-source', { id: 'baseline-fallback', venture_id: 'v-fallback-source' }],
  ]);

  it('returns the venture\'s own baseline id when one exists', () => {
    expect(resolveBaselineIds('v-own', baselineByVenture, 'v-fallback-source')).toEqual(['baseline-own']);
  });

  it('falls back to the documented fallback venture\'s baseline when the venture has none', () => {
    expect(resolveBaselineIds('v-no-baseline', baselineByVenture, 'v-fallback-source')).toEqual(['baseline-fallback']);
  });

  it('returns an empty array when neither the venture nor the fallback has a baseline', () => {
    expect(resolveBaselineIds('v-no-baseline', baselineByVenture, 'v-also-missing')).toEqual([]);
  });

  it('returns an empty array when no fallback is supplied and the venture has none', () => {
    expect(resolveBaselineIds('v-no-baseline', baselineByVenture, undefined)).toEqual([]);
  });
});
