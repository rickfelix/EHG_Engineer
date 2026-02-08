/**
 * Tests for Constraint Drift Detector
 * SD-LEO-FEAT-CONSTRAINT-DRIFT-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectConstraintDrift,
  buildFilterEnginePayload,
  _internal,
} from '../../../lib/eva/constraint-drift-detector.js';

const { normalize, deepEqual, isContradiction, computeDrift, computeSeverity, SEVERITY, DRIFT_TYPE } = _internal;

// ── Mock Supabase helpers ──────────────────────────────────

function createMockDb({
  assumptionData = null,
  assumptionError = null,
  artifactData = [],
  artifactError = null,
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'assumption_sets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: assumptionData,
                        error: assumptionError,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: artifactData,
                  error: artifactError,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// ── normalize ────────────────────────────────────────────────

describe('normalize', () => {
  it('trims and lowercases strings', () => {
    expect(normalize('  Hello World  ')).toBe('hello world');
  });

  it('sorts arrays', () => {
    expect(normalize(['SEO', 'Email'])).toEqual(['email', 'seo']);
  });

  it('sorts object keys recursively', () => {
    expect(normalize({ b: 'Two', a: 'One' })).toEqual({ a: 'one', b: 'two' });
  });

  it('returns null for null/undefined', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeNull();
  });

  it('passes numbers through', () => {
    expect(normalize(42)).toBe(42);
  });
});

// ── deepEqual ────────────────────────────────────────────────

describe('deepEqual', () => {
  it('returns true for identical primitives', () => {
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 1)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deepEqual('a', 'b')).toBe(false);
  });

  it('compares arrays element by element', () => {
    expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(deepEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('compares objects by keys and values', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('handles null comparisons', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, 'a')).toBe(false);
  });
});

// ── isContradiction ──────────────────────────────────────────

describe('isContradiction', () => {
  it('detects subscription vs one_time as contradiction', () => {
    expect(isContradiction('subscription_model', 'one_time_payment')).toBe(true);
  });

  it('detects b2b vs b2c', () => {
    expect(isContradiction('B2B enterprise', 'B2C consumer')).toBe(true);
  });

  it('returns false for similar but non-contradicting strings', () => {
    expect(isContradiction('subscription annual', 'subscription monthly')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isContradiction(123, 456)).toBe(false);
  });
});

// ── computeDrift ─────────────────────────────────────────────

describe('computeDrift', () => {
  it('returns NO_CHANGE for identical values after normalization', () => {
    const result = computeDrift('Hello', '  hello  ');
    expect(result.driftType).toBe(DRIFT_TYPE.NO_CHANGE);
  });

  it('returns CONTRADICTION for opposite values', () => {
    const result = computeDrift('subscription_only', 'one_time_license');
    expect(result.driftType).toBe(DRIFT_TYPE.CONTRADICTION);
  });

  it('returns DRIFT for different but non-contradicting values', () => {
    const result = computeDrift('north_america', 'emea');
    expect(result.driftType).toBe(DRIFT_TYPE.DRIFT);
  });

  it('handles array comparison with reordering', () => {
    const result = computeDrift(['SEO', 'Email'], ['Email', 'SEO']);
    expect(result.driftType).toBe(DRIFT_TYPE.NO_CHANGE);
  });

  it('detects drift in arrays with different elements', () => {
    const result = computeDrift(['SEO', 'Email'], ['Social', 'Email']);
    expect(result.driftType).toBe(DRIFT_TYPE.DRIFT);
  });
});

// ── computeSeverity ──────────────────────────────────────────

describe('computeSeverity', () => {
  it('returns NONE for no findings', () => {
    expect(computeSeverity([])).toBe(SEVERITY.NONE);
  });

  it('returns HIGH for contradiction', () => {
    const findings = [{ driftType: DRIFT_TYPE.CONTRADICTION }];
    expect(computeSeverity(findings)).toBe(SEVERITY.HIGH);
  });

  it('returns MEDIUM for 2 drifts', () => {
    const findings = [{ driftType: DRIFT_TYPE.DRIFT }, { driftType: DRIFT_TYPE.DRIFT }];
    expect(computeSeverity(findings)).toBe(SEVERITY.MEDIUM);
  });

  it('returns LOW for single drift', () => {
    const findings = [{ driftType: DRIFT_TYPE.DRIFT }];
    expect(computeSeverity(findings)).toBe(SEVERITY.LOW);
  });

  it('returns HIGH for 3+ drifts', () => {
    const findings = [
      { driftType: DRIFT_TYPE.DRIFT },
      { driftType: DRIFT_TYPE.DRIFT },
      { driftType: DRIFT_TYPE.DRIFT },
    ];
    expect(computeSeverity(findings)).toBe(SEVERITY.HIGH);
  });
});

// ── detectConstraintDrift ────────────────────────────────────

describe('detectConstraintDrift', () => {
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('returns no-drift when no baseline exists', async () => {
    const db = createMockDb({ assumptionData: null });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 10,
      db,
      logger,
    });

    expect(result.baselineAssumptionSetId).toBeNull();
    expect(result.driftDetected).toBe(false);
    expect(result.severity).toBe('NONE');
    expect(logger.info).toHaveBeenCalled();
  });

  it('returns NO_CURRENT_DATA when no artifacts exist', async () => {
    const db = createMockDb({
      assumptionData: {
        id: 'as-1',
        market_assumptions: { tam: 1000000 },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
      },
      artifactData: [],
    });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 10,
      db,
      logger,
    });

    expect(result.driftDetected).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].driftType).toBe('NO_CURRENT_DATA');
  });

  it('detects drift when pricing changes', async () => {
    const db = createMockDb({
      assumptionData: {
        id: 'as-1',
        market_assumptions: { pricing: 'subscription_only' },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
      },
      artifactData: [
        {
          id: 'art-1',
          artifact_type: 'stage_output',
          content: { market_assumptions: { pricing: 'one_time_license' } },
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 25,
      db,
      logger,
    });

    expect(result.driftDetected).toBe(true);
    expect(result.severity).not.toBe('NONE');
    expect(result.findings.some(f => f.category === 'market_assumptions')).toBe(true);
  });

  it('detects no drift when values match after normalization', async () => {
    const db = createMockDb({
      assumptionData: {
        id: 'as-1',
        market_assumptions: { channels: ['SEO', 'Email'] },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
      },
      artifactData: [
        {
          id: 'art-1',
          artifact_type: 'stage_output',
          content: { market_assumptions: { channels: ['Email', 'SEO'] } },
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 10,
      db,
      logger,
    });

    expect(result.driftDetected).toBe(false);
    expect(result.severity).toBe('NONE');
  });

  it('returns error result on database failure', async () => {
    const db = createMockDb({
      assumptionError: new Error('Connection refused'),
    });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 10,
      db,
      logger,
    });

    expect(result.driftDetected).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].driftType).toBe('ERROR');
    expect(result.findings[0].rationale).toContain('Connection refused');
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles multiple category drifts', async () => {
    const db = createMockDb({
      assumptionData: {
        id: 'as-1',
        market_assumptions: { region: 'north_america' },
        competitor_assumptions: { intensity: 'low' },
        product_assumptions: { model: 'B2B enterprise' },
        timing_assumptions: null,
      },
      artifactData: [
        {
          id: 'art-1',
          artifact_type: 'stage_output',
          content: {
            market_assumptions: { region: 'emea' },
            competitor_assumptions: { intensity: 'high' },
            product_assumptions: { model: 'B2C consumer' },
          },
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const result = await detectConstraintDrift({
      ventureId: 'v-1',
      currentStage: 15,
      db,
      logger,
    });

    expect(result.driftDetected).toBe(true);
    const driftFindings = result.findings.filter(
      f => f.driftType === 'DRIFT' || f.driftType === 'CONTRADICTION'
    );
    expect(driftFindings.length).toBeGreaterThanOrEqual(2);
  });
});

// ── buildFilterEnginePayload ─────────────────────────────────

describe('buildFilterEnginePayload', () => {
  it('returns null when no drift detected', () => {
    const result = buildFilterEnginePayload({
      driftDetected: false,
      severity: 'NONE',
      findings: [],
    });
    expect(result).toBeNull();
  });

  it('returns null for LOW severity', () => {
    const result = buildFilterEnginePayload({
      driftDetected: true,
      severity: 'LOW',
      findings: [{ driftType: 'DRIFT', category: 'market' }],
    });
    expect(result).toBeNull();
  });

  it('returns payload for MEDIUM severity', () => {
    const result = buildFilterEnginePayload({
      ventureId: 'v-1',
      currentStage: 25,
      driftDetected: true,
      severity: 'MEDIUM',
      findings: [
        { category: 'pricing', driftType: 'DRIFT', rationale: 'Pricing changed' },
        { category: 'market', driftType: 'DRIFT', rationale: 'Market shifted' },
      ],
    });

    expect(result.type).toBe('CONSTRAINT_DRIFT');
    expect(result.ventureId).toBe('v-1');
    expect(result.stage).toBe(25);
    expect(result.severity).toBe('MEDIUM');
    expect(result.summary.length).toBeLessThanOrEqual(240);
    expect(result.findings).toHaveLength(2);
  });

  it('returns payload for HIGH severity with contradiction', () => {
    const result = buildFilterEnginePayload({
      ventureId: 'v-1',
      currentStage: 25,
      driftDetected: true,
      severity: 'HIGH',
      findings: [
        { category: 'pricing', driftType: 'CONTRADICTION', rationale: 'Subscription vs one-time' },
        { category: 'geo', driftType: 'NO_CHANGE', rationale: 'No change' },
      ],
    });

    expect(result.type).toBe('CONSTRAINT_DRIFT');
    expect(result.severity).toBe('HIGH');
    // Should only include drift/contradiction findings, not NO_CHANGE
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe('pricing');
  });

  it('truncates summary to 240 chars', () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({
      category: `very_long_category_name_${i}`,
      driftType: 'DRIFT',
      rationale: 'changed',
    }));

    const result = buildFilterEnginePayload({
      ventureId: 'v-1',
      currentStage: 10,
      driftDetected: true,
      severity: 'HIGH',
      findings,
    });

    expect(result.summary.length).toBeLessThanOrEqual(240);
  });
});
