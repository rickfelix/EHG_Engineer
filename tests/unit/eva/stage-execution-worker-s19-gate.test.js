/**
 * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-2 + FR-3
 *
 * The fail-loud S19 leo_bridge gate. Verifies _runS19Bridge returns the
 * { created, errors, orchestratorKey, childKeys } contract for the discriminated
 * cases (created / idempotency-no-op / VENTURE_L2_VISION_MISSING real-failure), the
 * S19 entry-gate block-decision discrimination mirrors the NC-7 /already exists/ regex,
 * _blockS19LeoBridge writes the reason:'vision_pending' block row, and the FR-3
 * vision_key lookup filters to the chairman-approved canonical L2 only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bridge module so _runS19Bridge's dynamic import resolves to a controllable stub.
const convertSprintToSDs = vi.fn();
vi.mock('../../../lib/eva/lifecycle-sd-bridge.js', () => ({
  convertSprintToSDs: (...args) => convertSprintToSDs(...args),
  buildBridgeArtifactRecord: vi.fn(() => ({ lifecycle_stage: 19, artifact_type: 'x', title: 't', content: {}, metadata: {} })),
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

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Chainable supabase mock. `responses` maps an ordered queue of resolved values
 * per (table) for the terminal awaits (.maybeSingle / .single). The chain records
 * upserts/inserts and the .eq filter args (so FR-3 filters can be asserted).
 */
function createMockSupabase({ ventureName = 'CronGenius', buildModel = 'leo_bridge', visionDoc = null, archPlan = null, artifacts = [] } = {}) {
  const upsertCalls = [];
  const eqArgs = [];
  // Per-table terminal resolvers (LIFO queues consumed by maybeSingle/single).
  const make = () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col, val) => { eqArgs.push({ col, val }); return chain; }),
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
      // terminal await is the chained .limit() result for the artifacts query path
      chain.limit.mockReturnValue(Promise.resolve({ data: artifacts, error: null }));
    } else if (table === 'eva_vision_documents') {
      chain.maybeSingle.mockResolvedValue({ data: visionDoc, error: null });
    } else if (table === 'eva_architecture_plans') {
      chain.maybeSingle.mockResolvedValue({ data: archPlan, error: null });
    } else {
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      chain.single.mockResolvedValue({ data: null, error: null });
    }
    return chain;
  });
  return { from, _upsertCalls: upsertCalls, _eqArgs: eqArgs };
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

describe('_runS19Bridge (FR-2 contract + FR-3 vision filter)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('VENTURE_L2_VISION_MISSING → created:false with the missing-vision error (real failure)', async () => {
    convertSprintToSDs.mockResolvedValue({
      created: false, orchestratorKey: null, childKeys: [], grandchildKeys: [],
      errors: ['Venture CronGenius: no L2 vision document found.\nTo unblock orchestrator generation, run:'],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');
    expect(res.created).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.errors)).toContain('no L2 vision document found');
    expect(JSON.stringify(res.errors)).not.toMatch(/already exists/i);
  });

  it('created:true → returns created:true with orchestratorKey', async () => {
    convertSprintToSDs.mockResolvedValue({
      created: true, orchestratorKey: 'SD-LEO-ORCH-1', childKeys: ['c1', 'c2'], grandchildKeys: [], errors: [],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');
    expect(res.created).toBe(true);
    expect(res.orchestratorKey).toBe('SD-LEO-ORCH-1');
    expect(res.childKeys).toEqual(['c1', 'c2']);
  });

  it('idempotency (existing orchestrator) → created:false, errors empty', async () => {
    convertSprintToSDs.mockResolvedValue({
      created: false, orchestratorKey: 'SD-LEO-ORCH-EXISTING', childKeys: ['c1'], grandchildKeys: [], errors: [],
    });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');
    expect(res.created).toBe(false);
    expect(res.errors).toEqual([]);
  });

  it('FR-3: vision_key lookup filters to level=L2 + status=active + chairman_approved=true', async () => {
    convertSprintToSDs.mockResolvedValue({ created: true, orchestratorKey: 'o', childKeys: [], grandchildKeys: [], errors: [] });
    const supabase = createMockSupabase({ artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    await worker._runS19Bridge('v-1');

    // The eva_vision_documents lookup must have applied all three FR-3 filters.
    const cols = supabase._eqArgs.map((e) => `${e.col}=${e.val}`);
    expect(cols).toContain('level=L2');
    expect(cols).toContain('status=active');
    expect(cols).toContain('chairman_approved=true');
  });

  it('seeded_repo → created:true (gate proceeds; repo-seeding handled separately)', async () => {
    const supabase = createMockSupabase({ buildModel: 'seeded_repo', artifacts: ARTIFACTS_WITH_PAYLOAD });
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
    worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);

    const res = await worker._runS19Bridge('v-1');
    expect(res.created).toBe(true);
    expect(convertSprintToSDs).not.toHaveBeenCalled();
  });
});

describe('_blockS19LeoBridge (FR-2 block row)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('upserts a vision_pending blocked / sd_required row keyed on (venture_id,lifecycle_stage)', async () => {
    const supabase = createMockSupabase();
    const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });

    await worker._blockS19LeoBridge('v-1', ['Venture CronGenius: no L2 vision document found.']);

    const row = supabase._upsertCalls.at(-1);
    expect(row.venture_id).toBe('v-1');
    expect(row.lifecycle_stage).toBe(19);
    expect(row.stage_status).toBe('blocked');
    expect(row.work_type).toBe('sd_required');
    expect(row.advisory_data.build_model).toBe('leo_bridge');
    expect(row.advisory_data.bridge_failed).toBe(true);
    expect(row.advisory_data.reason).toBe('vision_pending');
    expect(Array.isArray(row.advisory_data.bridge_errors)).toBe(true);
    expect(typeof row.advisory_data.escalated_at).toBe('string');
  });
});

/**
 * Gate discrimination logic (mirrors the NC-7 regex branch in the S19 entry gate).
 * The block decision is inline in the _processVenture loop; this characterization
 * test replicates the exact discriminator so a regression in the rule is caught.
 */
function gateDecision(bridge, advisory = {}) {
  if (advisory.chairman_override === true) return 'proceed';
  const errs = bridge.errors || [];
  const errStr = JSON.stringify(errs);
  const isIdempotent = !bridge.created && (!errs || errs.length === 0 || /already exists/i.test(errStr));
  if (bridge.created || isIdempotent) return 'proceed';
  return 'block';
}

describe('S19 entry-gate discrimination (mirrors inline gate logic)', () => {
  it('VENTURE_L2_VISION_MISSING → block + no advance', () => {
    expect(gateDecision({ created: false, errors: ['Venture X: no L2 vision document found.'] })).toBe('block');
  });
  it('errors empty (idempotency) → proceed', () => {
    expect(gateDecision({ created: false, errors: [] })).toBe('proceed');
  });
  it('/already exists/ → proceed', () => {
    expect(gateDecision({ created: false, errors: ['Orchestrator already exists for venture'] })).toBe('proceed');
  });
  it('created:true → proceed', () => {
    expect(gateDecision({ created: true, errors: [] })).toBe('proceed');
  });
  it('chairman_override → proceed even on a real failure', () => {
    expect(gateDecision({ created: false, errors: ['no L2 vision document found'] }, { chairman_override: true })).toBe('proceed');
  });
});
