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

  it('SD-LEO-INFRA-CLOSE-PHASE-TRANSITION-001 TS-8: prerequisite preflight failure display loop still prints ALL issues (including info) while the durable rejection reason lists only blocking codes', async () => {
    const { runPrerequisitePreflight } = await import('./pre-checks/prerequisite-preflight.js');
    vi.mocked(runPrerequisitePreflight).mockResolvedValueOnce({
      passed: false,
      issues: [
        { code: 'USER_STORIES_BYPASSED', severity: 'info', message: 'exempt', remediation: 'none' },
        { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'missing TESTING', remediation: 'run it' }
      ],
      blockingIssues: [
        { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'missing TESTING', remediation: 'run it' }
      ]
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { orchestrator, executorExecute, recorder } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    // Display loop (operator visibility) still shows BOTH codes, unchanged.
    const loggedLines = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(loggedLines).toContain('USER_STORIES_BYPASSED');
    expect(loggedLines).toContain('SUBAGENT_EVIDENCE_MISSING');

    // Durable rejection reason / recorded issues use blockingIssues ONLY.
    expect(result.reasonCode).toBe('PREREQUISITE_PREFLIGHT_FAILED');
    expect(result.message).toContain('SUBAGENT_EVIDENCE_MISSING');
    expect(result.message).not.toContain('USER_STORIES_BYPASSED');
    expect(result.preflightIssues.map((i) => i.code)).toEqual(['SUBAGENT_EVIDENCE_MISSING']);
    expect(executorExecute).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});

describe('QF-20260903-019: --bypass-validation reaches the prerequisite preflight stage', () => {
  it('a preflight failure with bypassValidation set runs the executor anyway and stamps the result as bypassed (audited, not silently swallowed)', async () => {
    const { runPrerequisitePreflight } = await import('./pre-checks/prerequisite-preflight.js');
    vi.mocked(runPrerequisitePreflight).mockResolvedValueOnce({
      passed: false,
      issues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
      blockingIssues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
    });
    const { orchestrator, executorExecute, recorder } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001', {
      bypassValidation: true,
      bypassReason: 'preflight instrument is defective, work is already shipped',
      patternId: 'PAT-1234',
    });

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(recorder.recordFailure).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(result.bypassedGates).toEqual(['SUBAGENT_EVIDENCE_BAD_VERDICT']);
    expect(result.bypassReason).toBe('preflight instrument is defective, work is already shipped');
    expect(result.bypassPatternId).toBe('PAT-1234');
  });

  it('a preflight bypass and a downstream gate bypass both fired: both gate names survive, neither stamp overwrites the other', async () => {
    const { runPrerequisitePreflight } = await import('./pre-checks/prerequisite-preflight.js');
    vi.mocked(runPrerequisitePreflight).mockResolvedValueOnce({
      passed: false,
      issues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
      blockingIssues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
    });
    // Simulates the executor ALSO bypassing a gate internally (BaseExecutor's own stamp).
    const { orchestrator, executorExecute } = makeOrchestrator({
      success: true,
      bypassed: true,
      bypassReason: 'gate override reason',
      bypassedGates: ['GATE_SOME_OTHER_FAILURE'],
    });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001', {
      bypassValidation: true,
      bypassReason: 'preflight instrument is defective',
    });

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(result.bypassed).toBe(true);
    expect(result.bypassedGates.sort()).toEqual(['GATE_SOME_OTHER_FAILURE', 'SUBAGENT_EVIDENCE_BAD_VERDICT'].sort());
    // The executor's own bypass reason is preserved -- the preflight merge only extends gates.
    expect(result.bypassReason).toBe('gate override reason');
  });

  it('a preflight failure WITHOUT bypassValidation is unaffected: still rejected before the executor runs', async () => {
    const { runPrerequisitePreflight } = await import('./pre-checks/prerequisite-preflight.js');
    vi.mocked(runPrerequisitePreflight).mockResolvedValueOnce({
      passed: false,
      issues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
      blockingIssues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'TESTING=BLOCKED', remediation: 'fix TESTING' }],
    });
    const { orchestrator, executorExecute, recorder } = makeOrchestrator({ success: true });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-X-001');

    expect(executorExecute).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('PREREQUISITE_PREFLIGHT_FAILED');
    expect(recorder.recordFailure).toHaveBeenCalledTimes(1);
  });
});
