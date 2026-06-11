/**
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-A — executeHandoff artifact-preflight wiring.
 *
 * Asserts: (a) HARD_FAIL stops PRE-PIPELINE — the executor is never invoked,
 * the failure is recorded with ARTIFACT_PREFLIGHT_FAILED and the violations
 * are attached; (b) clean payloads pass through byte-identical (executor
 * called with identical args, verdict unchanged); (c) a preflight module
 * exception falls OPEN (pipeline runs normally); (d) prevented-bounce
 * telemetry fires on HARD_FAIL (fail-soft).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeArtifactPreflightMock = vi.fn();
const logPreventedBounceMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./artifact-preflight.js', () => ({
  executeArtifactPreflight: executeArtifactPreflightMock,
  logPreventedBounce: logPreventedBounceMock,
  formatViolations: (vs) => vs.map(v => `${v.field}: expected ${v.expected}, got ${v.got}`).join('\n'),
}));
vi.mock('./auto-proceed-resolver.js', () => ({
  resolveAutoProceed: vi.fn().mockResolvedValue({ autoProceed: true, source: 'test', sessionId: 's-1' }),
  createHandoffMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock('../../../lib/flywheel/capture.js', () => ({
  captureHandoffGate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./pre-checks/prerequisite-preflight.js', () => ({
  runPrerequisitePreflight: vi.fn().mockResolvedValue({ passed: true, issues: [] }),
}));
vi.mock('../../../lib/learning/surface-prior-lessons.js', () => ({
  surfacePriorLessons: vi.fn().mockResolvedValue({ patterns: [], retrospectives: [] }),
  formatPriorLessons: vi.fn().mockReturnValue(''),
  resolvePhaseStrategy: vi.fn().mockReturnValue('strategy'),
}));
vi.mock('../../../lib/learning/issue-knowledge-base.js', () => ({ IssueKnowledgeBase: class {} }));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({}) }));

const { HandoffOrchestrator } = await import('./HandoffOrchestrator.js');

const SD_ROW = { id: 'uuid-1', sd_key: 'SD-X-001', title: 'T', category: 'infrastructure', sd_type: 'infrastructure' };

function makeOrchestrator(executeResult) {
  const executorExecute = vi.fn().mockResolvedValue(executeResult);
  const recorder = {
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordSystemError: vi.fn().mockResolvedValue(undefined),
  };
  const orchestrator = new HandoffOrchestrator({
    supabase: { mock: true },
    sdRepo: { verifyExists: vi.fn().mockResolvedValue(SD_ROW), getById: vi.fn().mockResolvedValue(SD_ROW) },
    handoffRepo: { loadTemplate: vi.fn().mockResolvedValue({}) },
    recorder,
  });
  orchestrator._executors = { 'LEAD-TO-PLAN': { execute: executorExecute } };
  return { orchestrator, executorExecute, recorder };
}

beforeEach(() => {
  executeArtifactPreflightMock.mockReset();
  logPreventedBounceMock.mockClear().mockResolvedValue(undefined);
});

describe('executeHandoff artifact-preflight wiring', () => {
  it('HARD_FAIL stops pre-pipeline: executor never invoked, ARTIFACT_PREFLIGHT_FAILED recorded with violations', async () => {
    executeArtifactPreflightMock.mockResolvedValue({
      verdict: 'HARD_FAIL',
      violations: [{ field: 'success_metrics', expected: '>=3 UNIQUE', got: '1 unique of 1', hint: 'h' }],
      advisories: [],
    });
    const { orchestrator, executorExecute, recorder } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    expect(executorExecute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('ARTIFACT_PREFLIGHT_FAILED');
    expect(result.preflightViolations[0].field).toBe('success_metrics');
    expect(recorder.recordFailure).toHaveBeenCalledTimes(1);
    expect(logPreventedBounceMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sdKey: 'SD-X-001', handoffType: 'LEAD-TO-PLAN', trapFields: ['success_metrics'] })
    );
  });

  it('PASS verdict: pipeline runs byte-identical (executor called once, verdict unchanged)', async () => {
    executeArtifactPreflightMock.mockResolvedValue({ verdict: 'PASS', violations: [], advisories: [] });
    const { orchestrator, executorExecute, recorder } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(executorExecute).toHaveBeenCalledWith('SD-X-001', expect.objectContaining({ autoProceed: true }));
    expect(result.success).toBe(true);
    expect(recorder.recordSuccess).toHaveBeenCalledTimes(1);
    expect(logPreventedBounceMock).not.toHaveBeenCalled();
  });

  it('preflight module throw falls OPEN: pipeline runs normally', async () => {
    executeArtifactPreflightMock.mockRejectedValue(new Error('module exploded'));
    const { orchestrator, executorExecute } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('ERROR verdict (wrapper-internal failure) falls OPEN: pipeline runs normally', async () => {
    executeArtifactPreflightMock.mockResolvedValue({ verdict: 'ERROR', violations: [], advisories: [], error: 'db down' });
    const { orchestrator, executorExecute } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
