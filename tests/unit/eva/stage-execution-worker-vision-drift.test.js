/**
 * SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (FR-2) — worker-level tests that drive the REAL
 * _evaluateVisionDriftHold seam (mirroring stage-execution-worker-vision-acceptance.test.js), plus the
 * static exactly-7 _advanceStage invariant (DR-22) and the flag-guard structure (DR-23). The seam is
 * read-only and (unlike the acceptance seam) reads ONLY venture_stage_work.advisory_data — no
 * buildComplete recompute (D7). DR-16..DR-23 from the PRD test_scenarios.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  getOrchestratorState: vi.fn().mockResolvedValue({ state: 'processing' }),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({ createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn() }));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = resolve(__dirname, '../../../lib/eva/stage-execution-worker.js');
const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const VID = 'venture-d';

/** Chainable supabase fake serving venture_stage_work.advisory_data — drives the REAL _evaluateVisionDriftHold. */
function makeSupabase({ verdict, advisoryExtra = {} } = {}) {
  const advisory_data = { ...advisoryExtra };
  if (verdict !== undefined) advisory_data.vision_drift_verdict = verdict;
  const stageWork = { advisory_data };
  const from = (table) => {
    const terminalData = table === 'venture_stage_work' ? stageWork : null;
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, in: () => chain, gt: () => chain,
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: terminalData, error: null }),
      single: async () => ({ data: terminalData, error: null }),
      then: (res) => res({ data: terminalData, error: null }),
    };
    return chain;
  };
  return { from };
}

function makeWorker(supabase) {
  return new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
}

describe('_evaluateVisionDriftHold (DR-16..DR-21)', () => {
  let savedStrict;
  beforeEach(() => { savedStrict = process.env.VISION_DRIFT_STRICT; delete process.env.VISION_DRIFT_STRICT; });
  afterEach(() => { if (savedStrict === undefined) delete process.env.VISION_DRIFT_STRICT; else process.env.VISION_DRIFT_STRICT = savedStrict; });

  it('DR-16: recorded material_drift=true → HOLD, cause=chairman (verdict surfaced for the caller)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { material_drift: true, dimensions: [{ dimension: 'technical-modality', drift: true }] } }));
    const { hold, cause, verdict } = await worker._evaluateVisionDriftHold(VID);
    expect(hold).toBe(true);
    expect(cause).toBe('chairman');
    expect(verdict.material_drift).toBe(true);
  });

  it('DR-17: recorded material_drift=false → no-hold (the existing normal advance proceeds)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { material_drift: false } }));
    expect((await worker._evaluateVisionDriftHold(VID)).hold).toBe(false);
  });

  it('DR-18: no recorded verdict + strict OFF (default) → no-hold (D1 deadlock-avoidance, fail-OPEN)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: undefined }));
    expect((await worker._evaluateVisionDriftHold(VID)).hold).toBe(false);
  });

  it('DR-19: no recorded verdict + VISION_DRIFT_STRICT=true → HOLD (cause=unevaluated)', async () => {
    process.env.VISION_DRIFT_STRICT = 'true';
    const worker = makeWorker(makeSupabase({ verdict: undefined }));
    const { hold, cause } = await worker._evaluateVisionDriftHold(VID);
    expect(hold).toBe(true);
    expect(cause).toBe('unevaluated');
  });

  it('DR-20: recorded board_unavailable → HOLD, cause=transient (never chairman)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { board_unavailable: true } }));
    const { hold, cause } = await worker._evaluateVisionDriftHold(VID);
    expect(hold).toBe(true);
    expect(cause).toBe('transient');
  });

  it('DR-21: the read-only seam does not require a vision_acceptance_verdict and ignores unrelated advisory_data keys', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { material_drift: false }, advisoryExtra: { vision_acceptance_verdict: { pass: true }, build_method: 'claude_code' } }));
    // drift seam reads only its own key; an existing acceptance verdict is irrelevant to the drift decision
    expect((await worker._evaluateVisionDriftHold(VID)).hold).toBe(false);
  });
});

describe('never-advance invariant (DR-22) + flag-guard structure (DR-23)', () => {
  it('DR-22: stage-execution-worker.js has exactly 7 this._advanceStage( call sites', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    const matches = src.match(/this\._advanceStage\(/g) || [];
    expect(matches.length).toBe(7);
  });

  it('DR-23: the vision-drift worker block is guarded by isVisionDriftGateEnabled() (flag OFF skips it) and HOLDs via break', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    expect(src).toMatch(/currentStage === 19 && isVisionDriftGateEnabled\(\)/);
    expect(src).toMatch(/_evaluateVisionDriftHold/);
  });

  it('the worker imports the pure decision from vision-drift-gate.js', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    expect(src).toMatch(/from '\.\/bridge\/vision-drift-gate\.js'/);
  });
});
