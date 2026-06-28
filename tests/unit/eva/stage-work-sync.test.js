/**
 * Unit tests for the shared venture_stage_work write-through.
 *
 * SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001: this helper was extracted from
 * StageExecutionWorker._syncStageWork so the daemon AND run-stage/executeStage
 * produce identical venture_stage_work records. These tests pin the contract:
 * upserts the row with merged advisory_data, computes stage_status (incl. the
 * gate override), and is keyed by (venture_id, lifecycle_stage).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Non-gate governance by default (overridden per-test).
const gov = { isBlocking: vi.fn(() => false), isReview: vi.fn(() => false) };
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => gov),
}));
vi.mock('../../../lib/eva/health-score-computer.js', () => ({
  computeHealthScore: vi.fn(() => 80),
}));

import { syncStageWork, isInHardGateStages } from '../../../lib/eva/stage-work-sync.js';

function makeSupabase({ hardGateStages = [], workType = 'artifact_only', captureUpsert } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'chairman_dashboard_config') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { hard_gate_stages: hardGateStages } }) }) }) };
      }
      if (table === 'venture_stages') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { work_type: workType } }) }) }) };
      }
      if (table === 'venture_stage_work') {
        return { upsert: (payload, opts) => { captureUpsert?.(payload, opts); return Promise.resolve({ error: null }); } };
      }
      return {};
    }),
  };
}

describe('syncStageWork (SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001)', () => {
  beforeEach(() => {
    gov.isBlocking.mockReturnValue(false);
    gov.isReview.mockReturnValue(false);
  });

  it('upserts venture_stage_work with merged advisory_data + completed status for a non-gate stage', async () => {
    let captured;
    const supabase = makeSupabase({ captureUpsert: (p) => { captured = p; } });

    await syncStageWork(supabase, {
      ventureId: 'v1',
      stageNumber: 2,
      logger: { log() {}, warn() {} },
      result: {
        status: 'COMPLETED',
        startedAt: '2026-06-28T00:00:00.000Z',
        artifacts: [{ artifactType: 'truth_market', payload: { tam: 100, segment: 'smb' } }],
      },
    });

    expect(captured.venture_id).toBe('v1');
    expect(captured.lifecycle_stage).toBe(2);
    expect(captured.stage_status).toBe('completed');
    expect(captured.work_type).toBe('artifact_only');
    // flat-merge + prefix-stripped section key ('truth_market' -> 'market')
    expect(captured.advisory_data.tam).toBe(100);
    expect(captured.advisory_data.market).toEqual({ tam: 100, segment: 'smb' });
    expect(captured.advisory_data.totalSections).toBe(1);
    expect(captured.completed_at).toBeTruthy();
    expect(captured.health_score).toBe(80);
  });

  it('overrides to blocked for a gate stage that was NOT approved, and stays completed when approved', async () => {
    gov.isReview.mockReturnValue(true); // make it a gate stage

    let blockedPayload;
    await syncStageWork(makeSupabase({ captureUpsert: (p) => { blockedPayload = p; } }), {
      ventureId: 'v1', stageNumber: 13, logger: { log() {}, warn() {} },
      result: { status: 'COMPLETED', artifacts: [{ artifactType: 'x_y', payload: { a: 1 } }] },
    });
    expect(blockedPayload.stage_status).toBe('blocked');

    let approvedPayload;
    await syncStageWork(makeSupabase({ captureUpsert: (p) => { approvedPayload = p; } }), {
      ventureId: 'v1', stageNumber: 13, logger: { log() {}, warn() {} },
      result: { status: 'COMPLETED', _gateApproved: true, artifacts: [{ artifactType: 'x_y', payload: { a: 1 } }] },
    });
    expect(approvedPayload.stage_status).toBe('completed');
  });

  it('isInHardGateStages reflects chairman_dashboard_config membership (fail-soft)', async () => {
    expect(await isInHardGateStages(makeSupabase({ hardGateStages: [3, 5] }), 5)).toBe(true);
    expect(await isInHardGateStages(makeSupabase({ hardGateStages: [3, 5] }), 7)).toBe(false);
  });

  it('no-ops on a null result', async () => {
    let called = false;
    await syncStageWork(makeSupabase({ captureUpsert: () => { called = true; } }), {
      ventureId: 'v1', stageNumber: 2, logger: { log() {}, warn() {} }, result: null,
    });
    expect(called).toBe(false);
  });
});
