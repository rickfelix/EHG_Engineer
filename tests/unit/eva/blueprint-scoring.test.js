import { describe, it, expect } from 'vitest';
import { RUBRIC_DEFINITIONS, ARTIFACT_TYPES } from '../../../lib/eva/blueprint-scoring/rubric-definitions.js';
import { scoreArtifact } from '../../../lib/eva/blueprint-scoring/quality-scorer.js';
import { checkConsistency } from '../../../lib/eva/blueprint-scoring/consistency-checker.js';
import { calculateReadiness } from '../../../lib/eva/blueprint-scoring/readiness-calculator.js';
import { evaluateGate } from '../../../lib/eva/blueprint-scoring/gate-engine.js';

// --- Rubric Definitions ---

describe('RubricDefinitions', () => {
  it('defines rubrics for all 11 artifact types', () => {
    expect(ARTIFACT_TYPES).toHaveLength(11);
    for (const type of ARTIFACT_TYPES) {
      expect(RUBRIC_DEFINITIONS[type]).toBeDefined();
    }
  });

  it('each rubric has dimensions with weights summing to 1.0', () => {
    for (const [type, rubric] of Object.entries(RUBRIC_DEFINITIONS)) {
      const weightSum = rubric.dimensions.reduce((s, d) => s + d.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 5);
      expect(rubric.dimensions.length).toBeGreaterThanOrEqual(3);
      expect(rubric.version).toBeGreaterThanOrEqual(1);
      expect(rubric.min_pass_score).toBeGreaterThan(0);
    }
  });
});

// --- Quality Scorer ---

describe('BlueprintQualityScorer', () => {
  it('scores a well-formed artifact with high score', () => {
    const content = {
      entities: [
        { name: 'User', attributes: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'text' }] },
        { name: 'Order', attributes: [{ name: 'id', type: 'uuid' }, { name: 'total', type: 'numeric' }] },
      ],
      relationships: [{ from: 'User', to: 'Order', cardinality: '1:N' }],
      naming: { convention: 'snake_case', consistent: true },
      normalization: { level: '3NF', rationale: 'Standard for transactional data' },
    };
    const result = scoreArtifact('data_model', content);
    expect(result.total).toBeGreaterThanOrEqual(50);
    expect(result.dimensions).toHaveLength(4);
    expect(result.artifactType).toBe('data_model');
    expect(result.rubricVersion).toBe(1);
  });

  it('scores empty content as 0', () => {
    const result = scoreArtifact('data_model', {});
    expect(result.total).toBe(0);
  });

  it('scores minimal content low', () => {
    const result = scoreArtifact('data_model', { note: 'todo' });
    expect(result.total).toBeLessThanOrEqual(50);
  });

  it('throws for unknown artifact type', () => {
    expect(() => scoreArtifact('nonexistent_type', {})).toThrow('No quality rubric defined');
  });

  it('returns feedback for each dimension', () => {
    const result = scoreArtifact('api_contract', { endpoints: ['/users', '/orders'] });
    for (const dim of result.dimensions) {
      expect(dim.feedback).toBeTruthy();
      expect(dim.name).toBeTruthy();
      expect(dim.weight).toBeGreaterThan(0);
    }
  });
});

// --- Consistency Checker ---

describe('CrossArtifactConsistencyChecker', () => {
  it('returns no penalties when all references match', () => {
    const artifacts = {
      api_contract: { endpoints: ['users', 'orders'] },
      launch_readiness: { screens: ['users', 'orders'] },
      user_story_pack: { stories: ['create user', 'view orders'] },
      data_model: { entities: ['User', 'Order'] },
      erd_diagram: { entities: ['User', 'Order'] },
    };
    const result = checkConsistency(artifacts);
    expect(result.totalPenalty).toBe(0);
    expect(result.penalties).toHaveLength(0);
  });

  it('detects orphaned API endpoints', () => {
    const artifacts = {
      api_contract: { endpoints: ['users', 'orders', 'payments'] },
      launch_readiness: { screens: ['users'] },
    };
    const result = checkConsistency(artifacts);
    expect(result.penalties.length).toBeGreaterThan(0);
    expect(result.totalPenalty).toBeGreaterThan(0);
    const epPenalty = result.penalties.find((p) => p.type === 'endpoint_wireframe');
    expect(epPenalty.orphaned).toContain('orders');
    expect(epPenalty.orphaned).toContain('payments');
  });

  it('detects entity-ERD mismatches', () => {
    const artifacts = {
      data_model: { entities: ['User', 'Order', 'Payment'] },
      erd_diagram: { entities: ['User'] },
    };
    const result = checkConsistency(artifacts);
    const erdPenalty = result.penalties.find((p) => p.type === 'entity_erd');
    expect(erdPenalty).toBeDefined();
    expect(erdPenalty.orphaned).toContain('Order');
  });

  it('handles missing artifacts gracefully', () => {
    const result = checkConsistency({});
    expect(result.totalPenalty).toBe(0);
    expect(result.checkedPairs).toBe(3);
  });
});

// --- Readiness Calculator ---

describe('ReadinessScoreCalculator', () => {
  it('calculates high readiness for full high-quality blueprint', () => {
    const scores = ARTIFACT_TYPES.map((t) => ({ artifactType: t, total: 85 }));
    const consistency = { totalPenalty: 0, penalties: [] };
    const result = calculateReadiness(scores, consistency);
    expect(result.readinessScore).toBeGreaterThanOrEqual(80);
    expect(result.missingArtifacts).toHaveLength(0);
    expect(result.consistencyPenalty).toBe(0);
  });

  it('reduces score for missing artifacts', () => {
    const scores = ARTIFACT_TYPES.slice(0, 8).map((t) => ({ artifactType: t, total: 80 }));
    const consistency = { totalPenalty: 0, penalties: [] };
    const result = calculateReadiness(scores, consistency);
    expect(result.readinessScore).toBeLessThan(80);
    expect(result.missingArtifacts).toHaveLength(3);
    expect(result.breakdown.presentCount).toBe(8);
  });

  it('applies consistency penalty', () => {
    const scores = ARTIFACT_TYPES.map((t) => ({ artifactType: t, total: 80 }));
    const consistency = { totalPenalty: 15, penalties: [{ type: 'test', penalty: 15 }] };
    const result = calculateReadiness(scores, consistency);
    expect(result.consistencyPenalty).toBe(15);
    expect(result.readinessScore).toBeLessThan(80);
  });

  it('handles empty input', () => {
    const result = calculateReadiness([], { totalPenalty: 0, penalties: [] });
    expect(result.readinessScore).toBe(0);
    expect(result.missingArtifacts).toHaveLength(11);
  });
});

// --- Gate Engine ---

describe('QualityGateDecisionEngine', () => {
  it('returns pass for score >= 70', () => {
    const readiness = { readinessScore: 75, artifactSubscores: {}, missingArtifacts: [] };
    const result = evaluateGate(readiness);
    expect(result.decision).toBe('pass');
    expect(result.score).toBe(75);
  });

  it('returns retry for score 50-69', () => {
    const readiness = { readinessScore: 55, artifactSubscores: {}, missingArtifacts: [] };
    const result = evaluateGate(readiness);
    expect(result.decision).toBe('retry');
  });

  it('returns fail for score < 50', () => {
    const readiness = { readinessScore: 30, artifactSubscores: {}, missingArtifacts: [] };
    const result = evaluateGate(readiness);
    expect(result.decision).toBe('fail');
  });

  it('includes remediation for missing artifacts', () => {
    const readiness = {
      readinessScore: 40,
      artifactSubscores: {},
      missingArtifacts: ['risk_register', 'financial_projection'],
    };
    const result = evaluateGate(readiness);
    expect(result.remediationItems).toHaveLength(2);
    expect(result.remediationItems[0].artifactType).toBe('risk_register');
    expect(result.remediationItems[0].dimension).toBe('presence');
  });

  it('includes remediation for low-scoring dimensions', () => {
    const readiness = { readinessScore: 55, artifactSubscores: {}, missingArtifacts: [] };
    const details = [{
      artifactType: 'data_model',
      dimensions: [
        { name: 'entity_coverage', score: 30, weight: 0.3 },
        { name: 'relationship_clarity', score: 80, weight: 0.3 },
      ],
    }];
    const result = evaluateGate(readiness, details);
    expect(result.remediationItems.some((r) => r.dimension === 'entity_coverage')).toBe(true);
    expect(result.remediationItems.some((r) => r.dimension === 'relationship_clarity')).toBe(false);
  });
});
