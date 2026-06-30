/**
 * SD-LEO-INFRA-S19-NC7-ESCALATION-DIVERGENT-REDERIVATION-001 (FR-4)
 *
 * The NC-7 escalation in _runS19Bridge must gate on the canonical classifyBridgeOutcome enum,
 * NOT the dead `/already exists/i` errors-text regex. Follow-on to #5250: the dedup path now
 * returns errors:[], so the old regex never matched and a healthy idempotent NOOP_EXISTS re-run was
 * mislabeled 'Bridge FAILED' + wrote a stale stage_status='blocked'/bridge_failed venture_stage_work
 * row. These tests exercise the REAL escalation decision: only the convertSprintToSDs dependency is
 * stubbed; classifyBridgeOutcome is the genuine import (no test-masking-via-isolation), so the
 * idempotent re-run must write NO blocked row while a genuine failure still escalates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const convertSprintToSDs = vi.fn();
vi.mock('../../../lib/eva/lifecycle-sd-bridge.js', () => ({
  convertSprintToSDs: (...args) => convertSprintToSDs(...args),
  buildBridgeArtifactRecord: vi.fn(() => ({ lifecycle_stage: 19, artifact_type: 'x', title: 't', content: {}, metadata: {} })),
  sprintSignature: vi.fn(() => 'sigtest12'),
}));
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({ writeArtifact: vi.fn() }));
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({ createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn() }));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
// REAL shared enum — NOT mocked. The escalation gate reads exactly this.
import { S19_BRIDGE_OUTCOME } from '../../../lib/eva/bridge/s19-advance-decision.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

function createMockSupabase({ ventureName = 'CronGenius', buildModel = 'leo_bridge', artifacts = [] } = {}) {
  const upsertCalls = [];
  const make = () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      upsert: vi.fn((payload) => { upsertCalls.push(payload); return Promise.resolve({ data: null, error: null }); }),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
    };
    return chain;
  };
  const from = vi.fn((table) => {
    const chain = make();
    if (table === 'ventures') {
      chain.single.mockResolvedValue({ data: { name: ventureName }, error: null });
      chain.maybeSingle.mockResolvedValue({ data: { name: ventureName, build_model: buildModel }, error: null });
    } else if (table === 'venture_stage_work') {
      chain.maybeSingle.mockResolvedValue({ data: { advisory_data: { build_method: null } }, error: null });
    } else if (table === 'venture_artifacts') {
      chain.limit.mockReturnValue(Promise.resolve({ data: artifacts, error: null }));
    } else {
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      chain.single.mockResolvedValue({ data: null, error: null });
    }
    return chain;
  });
  return { from, _upsertCalls: upsertCalls };
}

// A venture S19 with one sd_bridge_payload so _runS19Bridge reaches convertSprintToSDs.
const ARTIFACTS_WITH_PAYLOAD = [
  {
    content: JSON.stringify({
      sprint_name: 'Sprint 1', sprint_goal: 'g', sprint_duration_days: 14,
      sd_bridge_payloads: [{ title: 'A', type: 'feature', description: 'd', scope: 's', success_criteria: 'sc' }],
    }),
    metadata: null,
  },
];

const blockedUpserts = (supabase) => supabase._upsertCalls.filter((u) => u && u.stage_status === 'blocked');

describe('_runS19Bridge NC-7 escalation gated on classifyBridgeOutcome (FR-1/FR-4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('idempotent NOOP_EXISTS re-run → writes NO blocked row + outcome NOOP_EXISTS (the #5250 dedup shape)', async () => {
    // The dedup return: existing orchestrator, created:false, errors:[] (errors-text regex never matches).
    convertSprintToSDs.mockResolvedValue({
      created: false, orchestratorKey: 'SD-LEO-ORCH-EXISTING', childKeys: ['c1'], grandchildKeys: [], errors: [],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');

    expect(res.outcome).toBe(S19_BRIDGE_OUTCOME.NOOP_EXISTS);
    // The bug: the old regex mislabeled this as a failure and wrote a stale blocked row. Must NOT happen.
    expect(blockedUpserts(supabase)).toEqual([]);
  });

  it('genuine ZERO_SDS_FAILURE → still escalates (blocked + bridge_failed + bridge_outcome) + outcome ZERO_SDS_FAILURE', async () => {
    // payloads present but 0 SDs produced, no orchestrator key — the schism that MUST surface.
    convertSprintToSDs.mockResolvedValue({
      created: false, orchestratorKey: null, childKeys: [], grandchildKeys: [], errors: [],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');

    expect(res.outcome).toBe(S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE);
    const blocked = blockedUpserts(supabase);
    expect(blocked.length).toBe(1);
    expect(blocked[0].lifecycle_stage).toBe(19);
    expect(blocked[0].work_type).toBe('sd_required');
    expect(blocked[0].advisory_data.bridge_failed).toBe(true);
    expect(blocked[0].advisory_data.bridge_outcome).toBe(S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE);
  });

  it('genuine VISION_MISSING → still escalates (blocked row) + outcome VISION_MISSING', async () => {
    convertSprintToSDs.mockResolvedValue({
      created: false, orchestratorKey: null, childKeys: [], grandchildKeys: [],
      errors: ['Venture CronGenius: no L2 vision document found.'],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');

    expect(res.outcome).toBe(S19_BRIDGE_OUTCOME.VISION_MISSING);
    expect(blockedUpserts(supabase).length).toBe(1);
  });
});
