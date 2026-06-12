/**
 * SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001 — contract pins.
 * Pure/unit only: registry shape, intake-bar advisory contract,
 * calibration-cohort stamping. No DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { listSources, getSource, DISCOVERY_SOURCES } from '../../lib/discovery/source-registry.js';
import { evaluateIntakeBar } from '../../lib/discovery/intake-bar.js';
import OpportunityDiscoveryService from '../../lib/discovery/opportunity-discovery-service.js';

describe('discovery source registry (FR-1)', () => {
  it('registers 4 active sources + nursery_recombination deferred with reason', () => {
    const sources = listSources();
    const active = sources.filter((s) => s.active).map((s) => s.key);
    expect(active).toEqual(['harness_exhaust', 'intake_streams', 'competitor_teardown', 'capability_overhang']);
    const deferred = sources.find((s) => s.key === 'nursery_recombination');
    expect(deferred.active).toBe(false);
    expect(deferred.reason).toMatch(/n>=3/);
  });

  it('every active source has a gather function; deferred has none', () => {
    for (const s of DISCOVERY_SOURCES) {
      if (s.active) expect(typeof s.gather).toBe('function');
      else expect(s.gather).toBeNull();
    }
  });

  it('getSource resolves keys and returns null for unknown', () => {
    expect(getSource('harness_exhaust').name).toMatch(/exhaust/i);
    expect(getSource('nope')).toBeNull();
  });
});

describe('7-point intake bar (FR-3, observe-first)', () => {
  it('returns 7 checks with rationales, advisory:true, never throws on empty input', () => {
    const result = evaluateIntakeBar({});
    expect(result.advisory).toBe(true);
    expect(result.max).toBe(7);
    expect(result.checks).toHaveLength(7);
    for (const c of result.checks) {
      expect(typeof c.rationale).toBe('string');
      expect(c.rationale.length).toBeGreaterThan(0);
    }
    expect(result.failures.length + result.score).toBe(7);
  });

  it('scores a well-formed idea higher than an empty one', () => {
    const good = evaluateIntakeBar({
      source_type: 'ai_generated',
      source_key: 'harness_exhaust',
      customer_evidence: { quotes: ['x'] },
      kill_assumption: 'If no operator pays within 30 days the demand thesis is false',
      confidence_score: 75,
      spof_assumption: 'Depends entirely on YouTube API quota',
      capability_lift: 'Reuses the existing intake scanner',
      difficulty_level: 'medium',
    });
    expect(good.score).toBe(7);
    expect(evaluateIntakeBar({}).score).toBeLessThan(good.score);
  });
});

describe('calibration-cohort stamping (FR-4)', () => {
  it('buildBlueprintRow stamps intake_bar + calibration_cohort=true + cohort_number=1, preserving prior metadata', () => {
    const svc = new OpportunityDiscoveryService({ autoGenerateBlueprints: false });
    const row = svc.buildBlueprintRow({ title: 'X', metadata: { prior: 'kept' } }, evaluateIntakeBar);
    expect(row.metadata.calibration_cohort).toBe(true);
    expect(row.metadata.cohort_number).toBe(1);
    expect(row.metadata.prior).toBe('kept');
    expect(row.metadata.intake_bar.advisory).toBe(true);
    expect(row.metadata.intake_bar.checks).toHaveLength(7);
  });
});
