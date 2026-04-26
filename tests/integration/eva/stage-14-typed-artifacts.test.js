/**
 * Stage 14 Typed-Artifact Integration Test (FR-5 of SD-LEO-INFRA-STAGE-PER-TYPE-001).
 *
 * Validates the analysis-step → orchestrator contract end-to-end (without
 * Supabase persistence): analyzeStage14 returns 5 typed artifacts; legacy
 * top-level keys are preserved for backward-compat with cross-stage consumers
 * (S15/S16/S18/S19) that read stage14Data.layers/total_components/etc;
 * orchestrator detection rule `Array.isArray(stepResult.artifacts) && length > 0`
 * correctly identifies the new-form return.
 *
 * @module tests/integration/eva/stage-14-typed-artifacts.test
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockComplete = vi.fn();
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

const { analyzeStage14 } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js');
const { ARTIFACT_TYPES } = await import('../../../lib/eva/artifact-types.js');

const silentLogger = { warn: vi.fn(), info() {}, error() {}, debug() {}, log() {} };

const ARCH_PAYLOAD = {
  architecture_summary: 'Full-stack architecture with five layers and risk register',
  layers: {
    presentation: { technology: 'React', components: ['App'], rationale: 'SPA' },
    api: { technology: 'REST', components: ['/users'], rationale: 'Standard' },
    business_logic: { technology: 'Node.js', components: ['svc'], rationale: 'JS unification' },
    data: { technology: 'PostgreSQL', components: ['users'], rationale: 'ACID' },
    infrastructure: { technology: 'AWS', components: ['ECS'], rationale: 'Managed' },
  },
  security: { authStrategy: 'JWT', dataClassification: 'internal', complianceRequirements: ['SOC2'] },
  dataEntities: [
    { name: 'User', description: 'app user', relationships: ['Profile'], estimatedVolume: '1k/mo' },
  ],
  integration_points: [
    { name: 'Auth', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' },
  ],
  constraints: [
    { name: 'Latency', description: 'p95<200ms', category: 'performance' },
    { name: 'TLS', description: 'TLS1.3', category: 'security' },
  ],
};

const RISK_PAYLOAD = {
  risks: [
    { title: 'Scope creep', description: 'Risk of feature scope expanding', owner: 'PM',
      severity: 'medium', priority: 'short_term', phaseRef: 'phase-1',
      mitigationPlan: 'Lock scope at sprint planning', contingencyPlan: 'Re-baseline' },
  ],
};

const STAGE1_DATA = {
  description: 'A platform that does X',
  targetMarket: 'SMB',
  problemStatement: 'Y is hard',
};

describe('Stage 14 typed-artifact emission (FR-5)', () => {
  beforeEach(() => {
    silentLogger.warn.mockClear();
    mockComplete.mockReset();
    // Two LLM calls: architecture, then risk register
    mockComplete
      .mockResolvedValueOnce(JSON.stringify(ARCH_PAYLOAD))
      .mockResolvedValueOnce(JSON.stringify(RISK_PAYLOAD));
  });

  it('returns artifacts array of length 5 in deterministic order', async () => {
    const result = await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(result.artifacts).toHaveLength(5);
    expect(result.artifacts.map(a => a.artifactType)).toEqual([
      ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE,
      ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
      ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
      ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
      ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
    ]);
  });

  it('artifacts[0] preserves legacy single-payload key set', async () => {
    const result = await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    const tech = result.artifacts[0];
    expect(tech.artifactType).toBe(ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE);
    expect(tech.source).toBe('analysis-step:stage-14');
    expect(tech.payload.architecture_summary).toBe(ARCH_PAYLOAD.architecture_summary);
    expect(tech.payload.layers).toBeDefined();
    expect(tech.payload.layers.presentation.technology).toBe('React');
    expect(tech.payload.dataEntities).toHaveLength(1);
    expect(tech.payload.layer_count).toBe(5);
    expect(tech.payload.total_components).toBe(5);
    expect(tech.payload.all_layers_defined).toBe(true);
    expect(tech.payload.entity_count).toBe(1);
    expect(Array.isArray(tech.payload.risks)).toBe(true);
    expect(tech.payload.total_risks).toBeGreaterThan(0);
    expect(tech.payload.severity_breakdown).toBeDefined();
    expect(tech.payload.budget_coherence).toBeDefined();
  });

  it('projection artifacts (1..4) carry source=analysis-step:stage-14-projection', async () => {
    const result = await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    for (const a of result.artifacts.slice(1)) {
      expect(a.source).toBe('analysis-step:stage-14-projection');
      expect(Array.isArray(a.gaps)).toBe(true);
    }
  });

  it('legacy top-level keys spread for backward-compat with cross-stage consumers', async () => {
    const result = await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    expect(result.layers).toBeDefined();
    expect(result.layers.presentation.technology).toBe('React');
    expect(result.dataEntities).toHaveLength(1);
    expect(result.layer_count).toBe(5);
    expect(result.total_components).toBe(5);
    expect(result.all_layers_defined).toBe(true);
    expect(result.security).toBeDefined();
    expect(result.integration_points).toBeDefined();
    expect(result.constraints).toBeDefined();
    expect(Array.isArray(result.risks)).toBe(true);
    expect(result.total_risks).toBeGreaterThan(0);
  });

  it('orchestrator detection rule: Array.isArray(stepResult.artifacts) && length > 0', async () => {
    const result = await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    // This is the exact predicate eva-orchestrator.js uses
    const isTypedForm = Array.isArray(result.artifacts) && result.artifacts.length > 0;
    expect(isTypedForm).toBe(true);
  });

  it('zero "multi-artifact extraction incomplete" warnings emitted by analysis step', async () => {
    await analyzeStage14({ stage1Data: STAGE1_DATA, ventureName: 'TestVenture', logger: silentLogger });
    const warnCalls = silentLogger.warn.mock.calls.flat().filter(
      arg => typeof arg === 'string' && arg.includes('multi-artifact extraction incomplete')
    );
    expect(warnCalls).toHaveLength(0);
  });
});
