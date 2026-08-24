/**
 * Unit tests for createMetadataResolver (lib/eva/lifecycle/thesis-kill-evaluator.js).
 *
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 (FR-1)
 *
 * Covers the real per-metric resolver wiring for K1-K3, the floor-gating false-kill guard,
 * and provenance attachment — using evaluateThesisKillCriteria as the integration point so
 * these tests exercise the exact same normalizeReading() path production traffic uses.
 */
import { describe, it, expect } from 'vitest';
import { createMetadataResolver, evaluateThesisKillCriteria } from '../../../../lib/eva/lifecycle/thesis-kill-evaluator.js';

const k1 = { id: 'kill-demand-conversion', metric: 'demand_test_conversion_rate', comparator: 'lt', threshold: 2, stage_by: 21, description: 'K1' };
const k2 = { id: 'kill-willingness-to-pay', metric: 'card_verified_preorders', comparator: 'lt', threshold: 1, stage_by: 21, description: 'K2' };
const k3 = { id: 'kill-economics-ltv-cac', metric: 'ltv_cac_ratio', comparator: 'lt', threshold: 3, stage_by: 21, description: 'K3' };

describe('createMetadataResolver', () => {
  it('resolves a real conversion rate and attaches provenance when demand_test_results is present with a floor-satisfying sample', async () => {
    const resolver = createMetadataResolver({
      demand_test_results: { visitors: 400, conversions: 20 }, // 5% >= 2% threshold-comparison metric
      demand_test_plan: { floors: { visitors_min: 300 } },
    });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k1], toStage: 21, resolveObservedValue: resolver });
    expect(result.evaluatedCount).toBe(1);
    expect(result.clear).toHaveLength(1); // 5% is not < 2% threshold -> CLEAR
    expect(result.clear[0].provenance).toMatchObject({ metric: 'demand_test_conversion_rate', source_id: 'ventures.metadata.demand_test_results' });
  });

  it('FR-1 false-kill guard: a finite reading computed from a below-floor sample never FIREs — HOLD with floor_unmet instead', async () => {
    const resolver = createMetadataResolver({
      // 0/4 = 0.0, finite, and 0 < 2 would FIRE if floor-gating were absent
      demand_test_results: { visitors: 4, conversions: 0 },
      demand_test_plan: { floors: { visitors_min: 300 } },
    });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k1], toStage: 21, resolveObservedValue: resolver });
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(1);
    expect(result.held[0].errorClass).toBe('floor_unmet');
  });

  it('no floor registered anywhere in metadata: floorMet defaults to true (never invents a floor it was not told about)', async () => {
    const resolver = createMetadataResolver({
      demand_test_results: { visitors: 4, conversions: 0 },
      // no demand_test_plan.floors at all
    });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k1], toStage: 21, resolveObservedValue: resolver });
    expect(result.fired).toHaveLength(1); // 0 < 2 genuinely FIREs since no floor to withhold it
    expect(result.held).toHaveLength(0);
  });

  it('demand_test_results entirely absent: true no-data, HOLD with unobservable_input', async () => {
    const resolver = createMetadataResolver({});
    const result = await evaluateThesisKillCriteria({ killCriteria: [k1], toStage: 21, resolveObservedValue: resolver });
    expect(result.held).toHaveLength(1);
    expect(result.held[0].errorClass).toBe('unobservable_input');
  });

  it('K2 (card_verified_preorders) resolves from payment_capture', async () => {
    const resolver = createMetadataResolver({ payment_capture: { card_verified_preorders_count: 0 } });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k2], toStage: 21, resolveObservedValue: resolver });
    expect(result.fired).toHaveLength(1); // 0 < 1 -> FIRED, no floor registered for K2 in this fixture
    expect(result.fired[0].provenance.source_id).toBe('ventures.metadata.payment_capture');
  });

  it('K3 (ltv_cac_ratio) resolves from unit_economics', async () => {
    const resolver = createMetadataResolver({ unit_economics: { ltv_cac_ratio: 5, sample_size: 10 } });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k3], toStage: 21, resolveObservedValue: resolver });
    expect(result.clear).toHaveLength(1); // 5 is not < 3 -> CLEAR
  });

  it('an unknown metric name resolves to undefined (fail-closed HOLD), not a crash', async () => {
    const resolver = createMetadataResolver({ demand_test_results: { visitors: 400, conversions: 20 } });
    const result = await evaluateThesisKillCriteria({
      killCriteria: [{ ...k1, metric: 'some_metric_nobody_registered' }],
      toStage: 21,
      resolveObservedValue: resolver,
    });
    expect(result.held).toHaveLength(1);
  });

  it('all 3 AltifyAI-shaped criteria evaluate together with real per-criterion provenance', async () => {
    const resolver = createMetadataResolver({
      demand_test_results: { visitors: 400, conversions: 4 }, // 1% < 2% -> FIRED
      demand_test_plan: { floors: { visitors_min: 300 } },
      payment_capture: { card_verified_preorders_count: 2 }, // 2 not < 1 -> CLEAR
      unit_economics: { ltv_cac_ratio: 1, sample_size: 5 }, // 1 < 3 -> FIRED
    });
    const result = await evaluateThesisKillCriteria({ killCriteria: [k1, k2, k3], toStage: 21, resolveObservedValue: resolver });
    expect(result.evaluatedCount).toBe(3);
    expect(result.fired.map((v) => v.criterionId).sort()).toEqual(['kill-demand-conversion', 'kill-economics-ltv-cac']);
    expect(result.clear.map((v) => v.criterionId)).toEqual(['kill-willingness-to-pay']);
    expect(result.verdicts.every((v) => v.provenance)).toBe(true);
  });
});
