import { describe, it, expect } from 'vitest';
import { RUBRIC_DEFINITIONS, ARTIFACT_TYPES } from '../../../lib/eva/blueprint-scoring/rubric-definitions.js';
import { ARTIFACT_TYPES as AT } from '../../../lib/eva/artifact-types.js';
import { scoreArtifact } from '../../../lib/eva/blueprint-scoring/quality-scorer.js';
import { checkConsistency } from '../../../lib/eva/blueprint-scoring/consistency-checker.js';
import { calculateReadiness } from '../../../lib/eva/blueprint-scoring/readiness-calculator.js';
import { evaluateGate } from '../../../lib/eva/blueprint-scoring/gate-engine.js';
import { scoreAndPersist, seedDefaultRubrics, getLatestReadiness, getLatestAssessment, listAssessments } from '../../../lib/eva/blueprint-scoring/persistence.js';

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
    const result = scoreArtifact(AT.BLUEPRINT_DATA_MODEL, content);
    expect(result.total).toBeGreaterThanOrEqual(50);
    expect(result.dimensions).toHaveLength(4);
    expect(result.artifactType).toBe(AT.BLUEPRINT_DATA_MODEL);
    expect(result.rubricVersion).toBe(1);
  });

  it('scores empty content as 0', () => {
    const result = scoreArtifact(AT.BLUEPRINT_DATA_MODEL, {});
    expect(result.total).toBe(0);
  });

  it('scores minimal content low', () => {
    const result = scoreArtifact(AT.BLUEPRINT_DATA_MODEL, { note: 'todo' });
    expect(result.total).toBeLessThanOrEqual(50);
  });

  it('throws for unknown artifact type', () => {
    expect(() => scoreArtifact('nonexistent_type', {})).toThrow('No quality rubric defined');
  });

  it('returns feedback for each dimension', () => {
    const result = scoreArtifact(AT.BLUEPRINT_API_CONTRACT, { endpoints: ['/users', '/orders'] });
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
      [AT.BLUEPRINT_API_CONTRACT]: { endpoints: ['users', 'orders'] },
      [AT.BLUEPRINT_LAUNCH_READINESS]: { screens: ['users', 'orders'] },
      [AT.BLUEPRINT_USER_STORY_PACK]: { stories: ['create user', 'view orders'] },
      [AT.BLUEPRINT_DATA_MODEL]: { entities: ['User', 'Order'] },
      [AT.BLUEPRINT_ERD_DIAGRAM]: { entities: ['User', 'Order'] },
    };
    const result = checkConsistency(artifacts);
    expect(result.totalPenalty).toBe(0);
    expect(result.penalties).toHaveLength(0);
  });

  it('detects orphaned API endpoints', () => {
    const artifacts = {
      [AT.BLUEPRINT_API_CONTRACT]: { endpoints: ['users', 'orders', 'payments'] },
      [AT.BLUEPRINT_LAUNCH_READINESS]: { screens: ['users'] },
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
      [AT.BLUEPRINT_DATA_MODEL]: { entities: ['User', 'Order', 'Payment'] },
      [AT.BLUEPRINT_ERD_DIAGRAM]: { entities: ['User'] },
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
      missingArtifacts: [AT.BLUEPRINT_RISK_REGISTER, AT.BLUEPRINT_FINANCIAL_PROJECTION],
    };
    const result = evaluateGate(readiness);
    expect(result.remediationItems).toHaveLength(2);
    expect(result.remediationItems[0].artifactType).toBe(AT.BLUEPRINT_RISK_REGISTER);
    expect(result.remediationItems[0].dimension).toBe('presence');
  });

  it('includes remediation for low-scoring dimensions', () => {
    const readiness = { readinessScore: 55, artifactSubscores: {}, missingArtifacts: [] };
    const details = [{
      artifactType: AT.BLUEPRINT_DATA_MODEL,
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

// --- Persistence Module (Exports Check) ---

describe('PersistenceModule', () => {
  it('exports scoreAndPersist function', () => {
    expect(typeof scoreAndPersist).toBe('function');
  });

  it('exports seedDefaultRubrics function', () => {
    expect(typeof seedDefaultRubrics).toBe('function');
  });

  it('exports getLatestReadiness function', () => {
    expect(typeof getLatestReadiness).toBe('function');
  });

  it('exports getLatestAssessment function', () => {
    expect(typeof getLatestAssessment).toBe('function');
  });

  it('exports listAssessments function', () => {
    expect(typeof listAssessments).toBe('function');
  });
});

// --- End-to-End Scoring Flow (Pure Logic) ---

describe('End-to-End Scoring Flow', () => {
  it('scores a complete blueprint through all stages', () => {
    const artifacts = {
      [AT.BLUEPRINT_DATA_MODEL]: {
        entities: [
          { name: 'User', attributes: [{ name: 'id' }, { name: 'email' }, { name: 'name' }] },
          { name: 'Order', attributes: [{ name: 'id' }, { name: 'total' }, { name: 'status' }] },
        ],
        relationships: [{ from: 'User', to: 'Order', type: '1:N' }],
        normalization: { level: '3NF' },
        naming: { convention: 'snake_case' },
      },
      [AT.BLUEPRINT_ERD_DIAGRAM]: { entities: ['User', 'Order'], diagram: 'erDiagram...' },
      [AT.BLUEPRINT_API_CONTRACT]: { endpoints: ['users', 'orders'], schemas: { User: {}, Order: {} } },
      [AT.BLUEPRINT_USER_STORY_PACK]: { stories: ['create user', 'place order'], epics: [{ name: 'Core' }] },
      [AT.BLUEPRINT_TECHNICAL_ARCHITECTURE]: { layers: ['presentation', 'api', 'data'], components: ['auth'] },
      [AT.BLUEPRINT_SCHEMA_SPEC]: { tables: { users: {}, orders: {} }, types: {} },
      [AT.BLUEPRINT_RISK_REGISTER]: { risks: [{ name: 'Scale' }, { name: 'Security' }], mitigations: {} },
      [AT.BLUEPRINT_FINANCIAL_PROJECTION]: { revenue: {}, costs: {}, metrics: { ltv: 500, cac: 100 } },
      [AT.BLUEPRINT_LAUNCH_READINESS]: { screens: ['users', 'orders'], checklist: [], dimensions: {} },
      [AT.BLUEPRINT_SPRINT_PLAN]: { sprints: [{ stories: ['create user', 'place order'] }] },
      [AT.BLUEPRINT_PROMOTION_GATE]: { criteria: {}, decision: 'promote', evidence: {} },
    };

    // Score each artifact
    const scores = [];
    for (const [type, content] of Object.entries(artifacts)) {
      if (ARTIFACT_TYPES.includes(type)) {
        const result = scoreArtifact(type, content);
        scores.push({ artifactType: type, total: result.total });
        expect(result.total).toBeGreaterThan(0);
      }
    }

    // Consistency check
    const consistency = checkConsistency(artifacts);
    expect(consistency.checkedPairs).toBe(3);

    // Readiness calculation
    const readiness = calculateReadiness(scores, consistency);
    expect(readiness.readinessScore).toBeGreaterThan(0);
    expect(readiness.missingArtifacts).toHaveLength(0);
    expect(readiness.breakdown.presentCount).toBe(11);

    // Gate decision
    const gate = evaluateGate(readiness);
    expect(['pass', 'retry', 'fail']).toContain(gate.decision);
    expect(gate.score).toBe(readiness.readinessScore);
  });

  it('handles partial blueprint with missing artifacts', () => {
    const artifacts = {
      [AT.BLUEPRINT_DATA_MODEL]: { entities: [{ name: 'User' }] },
      [AT.BLUEPRINT_API_CONTRACT]: { endpoints: ['users'] },
    };

    const scores = Object.entries(artifacts)
      .filter(([type]) => ARTIFACT_TYPES.includes(type))
      .map(([type, content]) => ({ artifactType: type, total: scoreArtifact(type, content).total }));

    const consistency = checkConsistency(artifacts);
    const readiness = calculateReadiness(scores, consistency);

    expect(readiness.missingArtifacts.length).toBeGreaterThan(0);
    expect(readiness.readinessScore).toBeLessThan(50);

    const gate = evaluateGate(readiness);
    expect(gate.decision).toBe('fail');
    expect(gate.remediationItems.length).toBeGreaterThan(0);
  });
});
