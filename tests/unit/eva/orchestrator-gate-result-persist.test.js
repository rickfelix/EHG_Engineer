/**
 * Tests for gate result persistence wiring in eva-orchestrator.js
 * SD-EVA-INFRA-GATE-RESULT-PERSIST-001
 *
 * Verifies that recordGateResult is imported and wired into
 * the eva-orchestrator gate evaluation flow.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock transitive deps
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

vi.mock('../../../lib/eva/stage-templates/index.js', () => ({
  getTemplate: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../lib/eva/dependency-manager.js', () => ({
  checkDependencies: vi.fn().mockResolvedValue([]),
  getDependencyGraph: vi.fn().mockResolvedValue({ dependsOn: [], providesTo: [] }),
  wouldCreateCycle: vi.fn().mockResolvedValue(false),
  addDependency: vi.fn(),
  resolveDependency: vi.fn(),
  removeDependency: vi.fn(),
  MODULE_VERSION: '1.0.0',
}));

vi.mock('../../../lib/eva/shared-services.js', async () => {
  const actual = await vi.importActual('../../../lib/eva/shared-services.js');
  return { ...actual, emit: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../../lib/eva/devils-advocate.js', () => ({
  isDevilsAdvocateGate: vi.fn().mockReturnValue({ isGate: false, gateType: null }),
  getDevilsAdvocateReview: vi.fn(),
  buildArtifactRecord: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('art-001'),
  writeArtifactBatch: vi.fn().mockResolvedValue(['art-001']),
  recordGateResult: vi.fn().mockResolvedValue('gate-result-001'),
  // SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001: this mock factory must list every named import
  // eva-orchestrator.js actually uses. Before this fix it omitted recordGateAttempt entirely --
  // if this quarantined, source-inspection-only file were ever un-quarantined without this entry,
  // every dual-write call site would hit `undefined(...)`, get swallowed by that call site's own
  // try/catch, and the suite would stay green regardless (TESTING F-D, EXEC-TO-PLAN row 7910c783).
  recordGateAttempt: vi.fn().mockResolvedValue('attempt-001'),
  advanceStage: vi.fn().mockResolvedValue({ success: true, wasDuplicate: false, result: {} }),
}));

vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  autonomyPreCheck: vi.fn().mockResolvedValue({ action: 'manual', level: 'L0' }),
}));

vi.mock('../../../lib/eva/utils/knowledge-retriever.js', () => ({
  retrieveKnowledge: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../lib/eva/contracts/stage-contracts.js', () => ({
  getContract: vi.fn().mockReturnValue(null),
  validatePreStage: vi.fn().mockReturnValue({ valid: true }),
  validatePostStage: vi.fn().mockReturnValue({ valid: true }),
  CONTRACT_ENFORCEMENT: 'advisory',
}));

vi.mock('../../../lib/eva/utils/token-tracker.js', () => ({
  recordTokenUsage: vi.fn().mockResolvedValue(undefined),
  checkBudget: vi.fn().mockResolvedValue({ ok: true }),
  buildTokenSummary: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../lib/eva/utils/assumption-reality-tracker.js', () => ({
  runRealityTracking: vi.fn().mockResolvedValue(undefined),
}));

describe('Gate Result Persistence (SD-EVA-INFRA-GATE-RESULT-PERSIST-001)', () => {
  it('should export recordGateResult from artifact-persistence-service', async () => {
    const mod = await import('../../../lib/eva/artifact-persistence-service.js');
    expect(mod.recordGateResult).toBeDefined();
    expect(typeof mod.recordGateResult).toBe('function');
  });

  it('should import recordGateResult and recordGateAttempt in eva-orchestrator (via source inspection)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    // SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001: this exact-string assertion is inherently brittle
    // (it broke the moment recordGateAttempt was added to the same import) -- kept as a coarse
    // canary, not a substitute for behavioural coverage of the actual call sites.
    expect(source).toContain("import { writeArtifact, recordGateResult, recordGateAttempt, advanceStage } from './artifact-persistence-service.js'");
  });

  it('calls recordGateAttempt alongside recordGateResult at both known gate-writing call sites (source inspection, SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    const recordGateResultCalls = source.split('await recordGateResult(supabase').length - 1;
    const recordGateAttemptCalls = source.split('await recordGateAttempt(supabase').length - 1;
    expect(recordGateResultCalls).toBe(2); // gate-persist loop + taste-gate block
    expect(recordGateAttemptCalls).toBe(2);
  });

  it('should have gate result persistence block after gate evaluation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    // Verify the persistence block exists
    expect(source).toContain('Persist gate results to eva_stage_gate_results');
    expect(source).toContain("g.type !== 'autonomy_check'");
    expect(source).toContain('await recordGateResult(supabase');
    expect(source).toContain('Gate result persist failed');
  });

  it('should respect dryRun guard in persistence block', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    // Find the persistence block and verify dryRun guard
    const persistBlock = source.substring(
      source.indexOf('Persist gate results to eva_stage_gate_results'),
      source.indexOf("5b. Devil's Advocate")
    );
    expect(persistBlock).toContain('!options.dryRun');
    expect(persistBlock).toContain('supabase');
  });

  it('should filter out autonomy_check and error gate types', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    const persistBlock = source.substring(
      source.indexOf('Persist gate results to eva_stage_gate_results'),
      source.indexOf("5b. Devil's Advocate")
    );
    expect(persistBlock).toContain("g.type !== 'autonomy_check'");
    expect(persistBlock).toContain("g.type !== 'error'");
  });

  it('should wrap recordGateResult in try/catch for non-blocking behavior', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const orchestratorPath = path.resolve('lib/eva/eva-orchestrator.js');
    const source = fs.readFileSync(orchestratorPath, 'utf-8');

    const persistBlock = source.substring(
      source.indexOf('Persist gate results to eva_stage_gate_results'),
      source.indexOf("5b. Devil's Advocate")
    );
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('catch (grErr)');
    expect(persistBlock).toContain('logger.warn');
  });
});
