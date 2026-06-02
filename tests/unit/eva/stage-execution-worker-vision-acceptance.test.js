/**
 * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-2) — worker-level tests that drive the REAL
 * _evaluateVisionAcceptanceHold seam (mirroring stage-execution-worker-s19-harden.test.js), plus the
 * static exactly-7 _advanceStage invariant (VA-25) and the flag-guard structure (VA-15). VA-13..VA-16,
 * VA-25 from the PRD test_scenarios.
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
const VID = 'venture-w';

/**
 * Chainable supabase fake serving per-table terminal data — drives the REAL
 * _evaluateVisionAcceptanceHold + _isLeoBridgeBuildComplete (the latter reads ventures + the same
 * venture_stage_work + strategic_directives_v2; resolve-build-model.js runs for real).
 */
function makeSupabase({ verdict, sdRows = [{ status: 'completed' }], buildModel = 'leo_bridge', advisoryExtra = {} } = {}) {
  const advisory_data = { ...advisoryExtra };
  if (verdict !== undefined) advisory_data.vision_acceptance_verdict = verdict;
  const stageWork = { advisory_data };
  const ventureRow = { build_model: buildModel };
  const from = (table) => {
    const terminalData =
      table === 'strategic_directives_v2' ? sdRows :
      table === 'ventures' ? ventureRow :
      table === 'venture_stage_work' ? stageWork : null;
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

describe('_evaluateVisionAcceptanceHold (VA-13..VA-16)', () => {
  let savedStrict;
  beforeEach(() => { savedStrict = process.env.VISION_ACCEPTANCE_STRICT; delete process.env.VISION_ACCEPTANCE_STRICT; });
  afterEach(() => { if (savedStrict === undefined) delete process.env.VISION_ACCEPTANCE_STRICT; else process.env.VISION_ACCEPTANCE_STRICT = savedStrict; });

  it('VA-13: recorded pass=false + complete build → HOLD (with the verdict surfaced for the caller)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { pass: false, gaps: [{ name: 'x' }] } }));
    const { hold, verdict } = await worker._evaluateVisionAcceptanceHold(VID);
    expect(hold).toBe(true);
    expect(verdict.pass).toBe(false);
  });

  it('VA-14: recorded pass=true → no-hold (the existing normal advance proceeds)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { pass: true } }));
    expect((await worker._evaluateVisionAcceptanceHold(VID)).hold).toBe(false);
  });

  it('VA-16a: no recorded verdict + strict OFF (default) → no-hold (fail-open, zero regression)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: undefined }));
    expect((await worker._evaluateVisionAcceptanceHold(VID)).hold).toBe(false);
  });

  it('VA-16b: no recorded verdict + VISION_ACCEPTANCE_STRICT=true → HOLD (verify-before-advance)', async () => {
    process.env.VISION_ACCEPTANCE_STRICT = 'true';
    const worker = makeWorker(makeSupabase({ verdict: undefined }));
    expect((await worker._evaluateVisionAcceptanceHold(VID)).hold).toBe(true);
  });

  it('VA-11(worker): incomplete build (draft SDs) → no-hold even with a stale pass=false verdict', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { pass: false }, sdRows: [{ status: 'draft' }] }));
    expect((await worker._evaluateVisionAcceptanceHold(VID)).hold).toBe(false);
  });

  it('non-leo_bridge built venture (buildComplete=null) with gaps still holds (vision applies)', async () => {
    const worker = makeWorker(makeSupabase({ verdict: { pass: false }, buildModel: 'seeded_repo' }));
    expect((await worker._evaluateVisionAcceptanceHold(VID)).hold).toBe(true);
  });
});

describe('never-advance invariant (VA-25) + flag-guard structure (VA-15)', () => {
  it('VA-25: stage-execution-worker.js has exactly 7 this._advanceStage( call sites', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    const matches = src.match(/this\._advanceStage\(/g) || [];
    expect(matches.length).toBe(7);
  });

  it('VA-15: the vision-acceptance worker block is guarded by isVisionAcceptanceGateEnabled() (flag OFF skips it)', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    expect(src).toMatch(/currentStage === 19 && isVisionAcceptanceGateEnabled\(\)/);
    // and the HOLD is a break, not a new advance, inside that block
    expect(src).toMatch(/_evaluateVisionAcceptanceHold/);
  });

  it('the worker imports the pure decision from vision-acceptance-gate.js', () => {
    const src = readFileSync(WORKER_PATH, 'utf8');
    expect(src).toMatch(/from '\.\/bridge\/vision-acceptance-gate\.js'/);
  });
});
