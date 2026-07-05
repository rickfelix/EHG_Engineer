/**
 * Unit tests for the S19->S20 Post-Build Convergence Gate.
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D.
 *
 * Covers the acceptance criteria from the PRD: automatic firing for a convergence-subject
 * venture, a provable no-op for every other venture (the reverse-starvation guardrail),
 * feature-flag gating, verdict persistence (merge-safe, never clobbers pause_state), and
 * the loud below-threshold flag reusing the existing chairman escalation surface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/clean-clone/launch.js', () => ({
  isConvergenceSubject: vi.fn(),
}));
vi.mock('../../../lib/eva/convergence-loop.js', () => ({
  runConvergenceLoop: vi.fn(),
}));
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({
  requestProductReview: vi.fn(),
}));
vi.mock('../../../lib/eva/convergence-remediation-writers.js', () => ({
  createQuickFixWriter: vi.fn(() => 'qf-writer-fn'),
  createSdWriter: vi.fn(() => 'sd-writer-fn'),
}));

import {
  isPostBuildConvergenceGateEnabled,
  persistVerdictSummary,
  loadVerdictSummary,
  runS19ConvergenceGate,
  POST_BUILD_CONVERGENCE_GATE_STAGE,
} from '../../../lib/eva/post-build-convergence-gate.js';
import { isConvergenceSubject } from '../../../lib/eva/clean-clone/launch.js';
import { runConvergenceLoop } from '../../../lib/eva/convergence-loop.js';
import { requestProductReview } from '../../../lib/eva/chairman-product-review.js';
import { createQuickFixWriter, createSdWriter } from '../../../lib/eva/convergence-remediation-writers.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.POST_BUILD_CONVERGENCE_GATE_ENABLED;
});

describe('constants', () => {
  it('shares S20PauseController stage 20', () => {
    expect(POST_BUILD_CONVERGENCE_GATE_STAGE).toBe(20);
  });
});

describe('isPostBuildConvergenceGateEnabled', () => {
  it('defaults to enabled when unset (fail-open)', () => {
    expect(isPostBuildConvergenceGateEnabled({})).toBe(true);
  });

  it('disables only on the literal string "false"', () => {
    expect(isPostBuildConvergenceGateEnabled({ POST_BUILD_CONVERGENCE_GATE_ENABLED: 'false' })).toBe(false);
  });

  it('treats any other value as enabled (fail-open on malformed input)', () => {
    expect(isPostBuildConvergenceGateEnabled({ POST_BUILD_CONVERGENCE_GATE_ENABLED: 'nope' })).toBe(true);
    expect(isPostBuildConvergenceGateEnabled({ POST_BUILD_CONVERGENCE_GATE_ENABLED: '' })).toBe(true);
  });
});

function makeSupabase({ existingAdvisoryData = {}, existingStageStatus = undefined } = {}) {
  const upserts = [];
  return {
    _upserts: upserts,
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { advisory_data: existingAdvisoryData, stage_status: existingStageStatus } }),
      upsert: vi.fn().mockImplementation((row) => { upserts.push(row); return Promise.resolve({ data: null, error: null }); }),
    })),
  };
}

describe('persistVerdictSummary', () => {
  it('merges into existing advisory_data without clobbering pause_state', async () => {
    const supabase = makeSupabase({ existingAdvisoryData: { pause_state: { state: 'PAUSED' } }, existingStageStatus: 'blocked' });
    const summary = { status: 'PASS', adherence_score: 92 };

    await persistVerdictSummary(supabase, 'v-1', summary);

    expect(supabase._upserts).toHaveLength(1);
    const row = supabase._upserts[0];
    expect(row.venture_id).toBe('v-1');
    expect(row.lifecycle_stage).toBe(20);
    expect(row.advisory_data.pause_state).toEqual({ state: 'PAUSED' });
    expect(row.advisory_data.post_build_verdict).toEqual(summary);
    expect(row.stage_status).toBe('blocked'); // preserves existing, doesn't force one
  });

  it('defaults stage_status to blocked when no row exists yet', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    await persistVerdictSummary(supabase, 'v-1', { status: 'PASS' });
    const upsertCall = supabase.from().upsert.mock.calls[0][0];
    expect(upsertCall.stage_status).toBe('blocked');
  });
});

describe('loadVerdictSummary', () => {
  it('returns the persisted summary', async () => {
    const supabase = makeSupabase({ existingAdvisoryData: { post_build_verdict: { status: 'PASS', adherence_score: 88 } } });
    const result = await loadVerdictSummary(supabase, 'v-1');
    expect(result).toEqual({ status: 'PASS', adherence_score: 88 });
  });

  it('fails soft to null on a read error', async () => {
    const supabase = { from: vi.fn().mockImplementation(() => { throw new Error('db down'); }) };
    const result = await loadVerdictSummary(supabase, 'v-1');
    expect(result).toBeNull();
  });

  it('returns null when nothing has been persisted yet', async () => {
    const supabase = makeSupabase({ existingAdvisoryData: {} });
    expect(await loadVerdictSummary(supabase, 'v-1')).toBeNull();
  });
});

describe('runS19ConvergenceGate — acceptance criteria', () => {
  const logger = createMockLogger();

  it('acceptance #2 (reverse-starvation guardrail): a non-convergence-subject venture is a provable no-op', async () => {
    isConvergenceSubject.mockResolvedValue(false);
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: false, reason: 'not_convergence_subject' });
    expect(runConvergenceLoop).not.toHaveBeenCalled();
    expect(requestProductReview).not.toHaveBeenCalled();
  });

  it('feature flag disabled is a provable no-op (zero-code-change rollback path)', async () => {
    process.env.POST_BUILD_CONVERGENCE_GATE_ENABLED = 'false';
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: false, reason: 'flag_disabled' });
    expect(isConvergenceSubject).not.toHaveBeenCalled();
    expect(runConvergenceLoop).not.toHaveBeenCalled();
  });

  it('acceptance #1: fires automatically for a convergence subject, persists a PASS verdict, does NOT escalate', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockResolvedValue({
      status: 'PASS', cycles: 1,
      scoreResult: { mean: 91, dimensionScores: { ui_evidence: 95 }, unscoredDimensions: [], rubric: { dimension_floor: 60 } },
    });
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: true, status: 'PASS', adherenceScore: 91, escalated: false });
    expect(supabase._upserts).toHaveLength(1);
    expect(supabase._upserts[0].advisory_data.post_build_verdict.status).toBe('PASS');
    expect(requestProductReview).not.toHaveBeenCalled();
  });

  it('QF-20260705-633: passes createQuickFixFn/createSdFn (built via the writer factories) into runConvergenceLoop', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockResolvedValue({
      status: 'PASS', cycles: 1,
      scoreResult: { mean: 91, dimensionScores: {}, unscoredDimensions: [], rubric: { dimension_floor: 60 } },
    });
    const supabase = makeSupabase();

    await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(createQuickFixWriter).toHaveBeenCalledWith(supabase);
    expect(createSdWriter).toHaveBeenCalledWith();
    expect(runConvergenceLoop).toHaveBeenCalledWith(supabase, expect.objectContaining({
      ventureId: 'v-1',
      createQuickFixFn: 'qf-writer-fn',
      createSdFn: 'sd-writer-fn',
    }));
  });

  it('acceptance negative case: an ESCALATED verdict persists + fires the loud flag via the EXISTING chairman surface (no new channel)', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockResolvedValue({
      status: 'ESCALATED', cycles: 3,
      scoreResult: { mean: 4, dimensionScores: { user_story_coverage: 0, persona_coverage: 0 }, unscoredDimensions: ['persona_coverage'], rubric: { dimension_floor: 60 } },
      escalationPacket: { dispositions: [] },
    });
    requestProductReview.mockResolvedValue({ id: 'decision-1', isNew: true, escalated: true });
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: true, status: 'ESCALATED', adherenceScore: 4, escalated: true });
    expect(supabase._upserts[0].advisory_data.post_build_verdict.escalated).toBe(true);
    expect(requestProductReview).toHaveBeenCalledWith(supabase, 'v-1', logger);
  });

  it('fails open (non-blocking) when runConvergenceLoop throws', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockRejectedValue(new Error('scorer db down'));
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: false, reason: 'convergence_loop_error' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('fails open when isConvergenceSubject itself throws', async () => {
    isConvergenceSubject.mockRejectedValue(new Error('config table unreadable'));
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: false, reason: 'convergence_subject_check_failed' });
    expect(runConvergenceLoop).not.toHaveBeenCalled();
  });

  it('a failed persistVerdictSummary write is non-fatal — the gate result still reports applicable:true with the real status', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockResolvedValue({
      status: 'PASS', cycles: 1,
      scoreResult: { mean: 91, dimensionScores: {}, unscoredDimensions: [], rubric: { dimension_floor: 60 } },
    });
    const supabase = {
      from: vi.fn().mockImplementation(() => { throw new Error('venture_stage_work unreachable'); }),
    };

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result).toEqual({ applicable: true, status: 'PASS', adherenceScore: 91, escalated: false });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('a failed requestProductReview escalation is non-fatal — the gate result still reports ESCALATED', async () => {
    isConvergenceSubject.mockResolvedValue(true);
    runConvergenceLoop.mockResolvedValue({
      status: 'ESCALATED', cycles: 3,
      scoreResult: { mean: 10, dimensionScores: {}, unscoredDimensions: [], rubric: { dimension_floor: 60 } },
    });
    requestProductReview.mockRejectedValue(new Error('decision insert failed'));
    const supabase = makeSupabase();

    const result = await runS19ConvergenceGate(supabase, 'v-1', { logger });

    expect(result.status).toBe('ESCALATED');
    expect(logger.warn).toHaveBeenCalled();
  });
});
