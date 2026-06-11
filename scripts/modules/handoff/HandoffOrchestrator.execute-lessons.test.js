/**
 * QF-20260610-551: executeHandoff surfaces the prior-lessons advisory (parity with
 * precheckHandoff from QF-457). Autonomous /loop workers call executeHandoff directly
 * and never run precheck, so the advisory must live on the execute path too.
 *
 * Asserts: (a) fail-open — the verdict is unchanged when surfacePriorLessons throws;
 * (b) the advisory is skipped entirely when LEO_SURFACE_LESSONS==='off';
 * (c) the advisory runs post-verdict with the SD's category feeding the search.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const surfacePriorLessonsMock = vi.fn();
const formatPriorLessonsMock = vi.fn().mockReturnValue('LESSONS-BLOCK');
const resolvePhaseStrategyMock = vi.fn().mockReturnValue('strategy');

vi.mock('../../../lib/learning/surface-prior-lessons.js', () => ({
  surfacePriorLessons: surfacePriorLessonsMock,
  formatPriorLessons: formatPriorLessonsMock,
  resolvePhaseStrategy: resolvePhaseStrategyMock,
}));
vi.mock('../../../lib/learning/issue-knowledge-base.js', () => ({
  IssueKnowledgeBase: class {},
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
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({}) }));

const { HandoffOrchestrator } = await import('./HandoffOrchestrator.js');

const SD_ROW = { id: 'uuid-1', sd_key: 'SD-X-001', title: 'A title', category: 'infrastructure', sd_type: 'infrastructure' };

function makeOrchestrator(executeResult) {
  const orchestrator = new HandoffOrchestrator({
    supabase: { mock: true },
    sdRepo: { verifyExists: vi.fn().mockResolvedValue(SD_ROW) },
    handoffRepo: { loadTemplate: vi.fn().mockResolvedValue({}) },
    recorder: {
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn().mockResolvedValue(undefined),
    },
  });
  // Bypass lazy executor loading.
  orchestrator._executors = {
    'PLAN-TO-LEAD': { execute: vi.fn().mockResolvedValue(executeResult) },
  };
  return orchestrator;
}

beforeEach(() => {
  surfacePriorLessonsMock.mockReset().mockResolvedValue({ patterns: [{ p: 1 }], retrospectives: [] });
  formatPriorLessonsMock.mockClear();
  delete process.env.LEO_SURFACE_LESSONS;
});

afterEach(() => {
  delete process.env.LEO_SURFACE_LESSONS;
});

describe('QF-551 executeHandoff prior-lessons advisory', () => {
  it('surfaces lessons post-verdict using the SD category, verdict unchanged', async () => {
    const orchestrator = makeOrchestrator({ success: true, score: 95 });
    const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-X-001');

    expect(result.success).toBe(true);
    expect(result.score).toBe(95);
    expect(surfacePriorLessonsMock).toHaveBeenCalledTimes(1);
    const args = surfacePriorLessonsMock.mock.calls[0][0];
    expect(args.sdCategory).toBe('infrastructure'); // sd.category from verifyExists row
    expect(args.limit).toBe(3);
    expect(resolvePhaseStrategyMock).toHaveBeenCalledWith('PLAN-TO-LEAD');
    expect(formatPriorLessonsMock).toHaveBeenCalled();
  });

  it('FAIL-OPEN: verdict unchanged and no throw when surfacePriorLessons rejects', async () => {
    surfacePriorLessonsMock.mockRejectedValue(new Error('DB down'));
    const orchestrator = makeOrchestrator({ success: true, score: 88 });

    const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-X-001');

    expect(result.success).toBe(true);
    expect(result.score).toBe(88);
    expect(result.systemError).toBeUndefined(); // never escalates to the catch-all
    expect(orchestrator.recorder.recordSystemError).not.toHaveBeenCalled();
  });

  it('SKIPPED entirely when LEO_SURFACE_LESSONS=off', async () => {
    process.env.LEO_SURFACE_LESSONS = 'off';
    const orchestrator = makeOrchestrator({ success: true, score: 90 });

    const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-X-001');

    expect(result.success).toBe(true);
    expect(surfacePriorLessonsMock).not.toHaveBeenCalled();
  });

  it('also surfaces (and stays fail-open) on a FAILED verdict', async () => {
    const orchestrator = makeOrchestrator({ success: false, reason: 'GATE_FAILED' });

    const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-X-001');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('GATE_FAILED');
    expect(surfacePriorLessonsMock).toHaveBeenCalledTimes(1);
    expect(orchestrator.recorder.recordFailure).toHaveBeenCalled();
  });
});
