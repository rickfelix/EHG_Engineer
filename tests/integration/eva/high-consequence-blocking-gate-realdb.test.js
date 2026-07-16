/**
 * REAL, DB-backed integration test for the high-consequence stage-gate blocking
 * mechanism (chairman-delegated, 2026-07-14: "operate autonomously, make
 * high-consequence gates bind").
 *
 * SD: SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001
 *
 * Independent, non-mocked confirmation that BOTH choke points hold advancement
 * on a pending chairman_decisions row with blocking=true, and do NOT hold on a
 * blocking=false (advisory) row — against the LIVE Postgres schema:
 *
 *   1. RPC path        — public.fn_advance_venture_stage(uuid,int,int,jsonb,uuid)
 *   2. Daemon-walk path — lib/eva/stage-execution-worker.js::_advanceStage()
 *
 * Uses Stage 6 (gate_type='none', review_mode='auto', single required artifact
 * 'engine_risk_matrix', ZERO real ventures currently at this stage per a live
 * count taken before writing this file) as a stage that is clean of the OTHER 3
 * pre-existing _advanceStage backstops (S19, product-review, artifact) once its
 * one artifact is satisfied, isolating the NEW 4th backstop precisely.
 *
 * Stage 6's venture_stages.is_high_consequence is temporarily flipped true in
 * beforeAll and restored to false in afterAll. This is deliberately the ONLY
 * test in the suite that mutates the shared venture_stages config row, and is
 * judged safe because: (a) gate_type='none'/review_mode='auto' means NO
 * existing production code path ever calls createOrReusePendingDecision for
 * this stage today (review-mode-pause requires review_mode='review';
 * _handleChairmanGate requires kill/promotion; product-review is hardcoded to
 * stage 23) — so no OTHER venture can acquire a blocking=true row here during
 * the test window regardless of the classification flip; (b) zero real
 * ventures are currently at stage 6, confirmed live before authoring this file.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no
 * real DB. Creates disposable ventures whose names do NOT match
 * isFixtureVenture's regex and are is_demo=false, so the REAL (non-fixture)
 * code path is exercised. All rows (including the classification flip) are
 * cleaned up in afterAll -> zero residue.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { resolve } from 'path';

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { isFixtureVenture } from '../../../lib/eva/chairman-decision-watcher.js';
import { _resetCacheForTest } from '../../../lib/eva/stage-governance.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const ts = Date.now();
const ventureIds = [];
const STAGE = 6;
const REQUIRED_ARTIFACT = 'engine_risk_matrix';

async function createVenture(tag) {
  const { data, error } = await supabase
    .from('ventures')
    .insert({
      // Deliberately NOT __e2e_-prefixed: FIXTURE_VENTURE_NAME_RE in chairman-decision-watcher.js
      // treats that prefix as a fixture pattern (QF-20260710-243), which would make the
      // "not a fixture" sanity check below meaningless for this real-code-path test.
      name: `HCGate-RealDB-${tag}-${ts}`,
      problem_statement: 'Disposable venture for SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 real-DB gate test',
      current_lifecycle_stage: STAGE,
      is_demo: false,
      status: 'active',
    })
    .select('id, name, is_demo')
    .single();
  if (error) throw new Error(`Failed to create ${tag} venture: ${error.message}`);
  ventureIds.push(data.id);

  // Satisfy the ONE artifact precondition for STAGE so only the NEW high-consequence
  // check remains as a blocker (isolates the 4th backstop from the pre-existing 3rd).
  const { error: artErr } = await supabase.from('venture_artifacts').insert({
    venture_id: data.id,
    lifecycle_stage: STAGE,
    artifact_type: REQUIRED_ARTIFACT,
    title: 'E2E artifact for high-consequence gate isolation',
    is_current: true,
  });
  if (artErr) throw new Error(`Failed to seed artifact for ${tag}: ${artErr.message}`);

  return data;
}

async function currentStage(ventureId) {
  const { data } = await supabase.from('ventures').select('current_lifecycle_stage').eq('id', ventureId).single();
  return data?.current_lifecycle_stage;
}

async function insertDecision({ ventureId, status, blocking, lifecycleStage = STAGE }) {
  return supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: lifecycleStage,
      decision_type: 'stage_gate',
      status,
      decision: status === 'approved' ? 'approve' : 'pending',
      blocking,
    })
    .select('id, status, blocking')
    .single();
}

async function approveAllPending(ventureId) {
  const { data: decisions } = await supabase
    .from('chairman_decisions').select('id').eq('venture_id', ventureId).eq('status', 'pending');
  for (const d of decisions || []) {
    await supabase.from('chairman_decisions').update({ status: 'approved', decision: 'approve' }).eq('id', d.id);
  }
}

async function callAdvance(ventureId, from = STAGE, to = STAGE + 1) {
  return supabase.rpc('fn_advance_venture_stage', {
    p_venture_id: ventureId,
    p_from_stage: from,
    p_to_stage: to,
    p_handoff_data: {},
    p_idempotency_key: randomUUID(),
  });
}

describe.skipIf(!HAS_REAL_DB)('High-consequence blocking gate — REAL DB, both choke points (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001)', () => {
  let ventureRpcBlock, ventureRpcAdvisory, ventureRpcScope;
  let ventureDaemonBlock, ventureDaemonAdvisory;

  beforeAll(async () => {
    // Flip Stage 6 to high-consequence for the duration of this suite only.
    const { error: flagErr } = await supabase
      .from('venture_stages').update({ is_high_consequence: true }).eq('stage_number', STAGE);
    if (flagErr) throw new Error(`Failed to classify stage ${STAGE} as high-consequence: ${flagErr.message}`);
    _resetCacheForTest(); // force stage-governance.js to pick up the flip immediately

    ventureRpcBlock = await createVenture('rpc-block');
    ventureRpcAdvisory = await createVenture('rpc-advisory');
    ventureRpcScope = await createVenture('rpc-scope');
    ventureDaemonBlock = await createVenture('daemon-block');
    ventureDaemonAdvisory = await createVenture('daemon-advisory');
  });

  afterAll(async () => {
    for (const id of ventureIds) {
      await supabase.from('chairman_decisions').delete().eq('venture_id', id);
      await supabase.from('venture_artifacts').delete().eq('venture_id', id);
      await supabase.from('venture_stage_work').delete().eq('venture_id', id);
      await supabase.from('venture_stage_transitions').delete().eq('venture_id', id);
    }
    for (const id of ventureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
    // Restore stage 6 to its original (unclassified) state — zero residue.
    await supabase.from('venture_stages').update({ is_high_consequence: false }).eq('stage_number', STAGE);
    _resetCacheForTest();
  });

  it('sanity: disposable ventures are NOT treated as fixtures (real code path)', () => {
    expect(isFixtureVenture(ventureRpcBlock)).toBe(false);
  });

  // ───────────────────────── RPC PATH ─────────────────────────

  it('TS-1 RPC: a pending blocking=true decision HOLDS advancement (high_consequence_gate_blocked)', async () => {
    const { error: insErr } = await insertDecision({ ventureId: ventureRpcBlock.id, status: 'pending', blocking: true });
    expect(insErr).toBeNull();

    const { data, error } = await callAdvance(ventureRpcBlock.id);
    expect(error).toBeNull();
    expect(data.success).toBe(false);
    expect(data.error).toBe('high_consequence_gate_blocked');
    expect(await currentStage(ventureRpcBlock.id)).toBe(STAGE);
  });

  it('TS-4 RPC: approving the pending blocking decision releases advancement', async () => {
    await approveAllPending(ventureRpcBlock.id);

    const { data, error } = await callAdvance(ventureRpcBlock.id);
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.to_stage).toBe(STAGE + 1);
    expect(await currentStage(ventureRpcBlock.id)).toBe(STAGE + 1);
  });

  it('TS-6 RPC: a pending ADVISORY (blocking=false) decision does NOT hold advancement (zero regression)', async () => {
    const { error: insErr } = await insertDecision({ ventureId: ventureRpcAdvisory.id, status: 'pending', blocking: false });
    expect(insErr).toBeNull();

    const { data, error } = await callAdvance(ventureRpcAdvisory.id);
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(await currentStage(ventureRpcAdvisory.id)).toBe(STAGE + 1);
  });

  it('TS-9 RPC: a blocking decision at a DIFFERENT stage does not hold advancement from this stage', async () => {
    const { error: insErr } = await insertDecision({
      ventureId: ventureRpcScope.id, status: 'pending', blocking: true, lifecycleStage: STAGE + 5,
    });
    expect(insErr).toBeNull();

    const { data, error } = await callAdvance(ventureRpcScope.id);
    expect(error).toBeNull();
    expect(data.success).toBe(true); // unaffected — the blocking row is scoped to a different stage
    expect(await currentStage(ventureRpcScope.id)).toBe(STAGE + 1);
  });

  // ──────────────────── DAEMON-WALK PATH ─────────────────────

  it('TS-2 WORKER: _advanceStage HOLDS on a pending blocking=true decision', async () => {
    const { error: insErr } = await insertDecision({ ventureId: ventureDaemonBlock.id, status: 'pending', blocking: true });
    expect(insErr).toBeNull();

    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureDaemonBlock.id, STAGE, STAGE + 1, {});
    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
    expect(await currentStage(ventureDaemonBlock.id)).toBe(STAGE);
  });

  it('WORKER: approving the pending blocking decision releases _advanceStage', async () => {
    await approveAllPending(ventureDaemonBlock.id);

    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureDaemonBlock.id, STAGE, STAGE + 1, {});
    expect(result?.blocked).not.toBe(true);
    expect(await currentStage(ventureDaemonBlock.id)).toBe(STAGE + 1);
  });

  it('WORKER: a pending advisory (blocking=false) decision does NOT hold _advanceStage', async () => {
    const { error: insErr } = await insertDecision({ ventureId: ventureDaemonAdvisory.id, status: 'pending', blocking: false });
    expect(insErr).toBeNull();

    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureDaemonAdvisory.id, STAGE, STAGE + 1, {});
    expect(result?.blocked).not.toBe(true);
    expect(await currentStage(ventureDaemonAdvisory.id)).toBe(STAGE + 1);
  });

  // ──────────────── ZERO-CLASSIFICATION NO-OP INVARIANT (TS-10) ────────────────
  // A DIFFERENT, never-classified stage (12: gate_type='none', review_mode='auto',
  // zero real ventures per the live count taken before authoring this file) must
  // be a complete no-op for the new check — proves the feature is additive, not a
  // global behavior change. (Stage 7 was deliberately NOT used here — its
  // review_mode='review' would trip the pre-existing review-gate check first,
  // confounding this specific invariant.)

  it('TS-10: an unclassified stage is unaffected even with a stray blocking=true row present', async () => {
    const NOOP_STAGE = 12;
    const venture = await createVenture('unclassified-noop');
    // Move it to the no-op stage and seed its two required artifacts.
    await supabase.from('ventures').update({ current_lifecycle_stage: NOOP_STAGE }).eq('id', venture.id);
    await supabase.from('venture_artifacts').insert([
      { venture_id: venture.id, lifecycle_stage: NOOP_STAGE, artifact_type: 'identity_brand_guidelines', title: 'noop artifact 1', is_current: true },
      { venture_id: venture.id, lifecycle_stage: NOOP_STAGE, artifact_type: 'identity_gtm_sales_strategy', title: 'noop artifact 2', is_current: true },
    ]);
    // A blocking=true row at NOOP_STAGE must be harmless since it is never classified.
    const { error: insErr } = await insertDecision({ ventureId: venture.id, status: 'pending', blocking: true, lifecycleStage: NOOP_STAGE });
    expect(insErr).toBeNull();

    const { data, error } = await callAdvance(venture.id, NOOP_STAGE, NOOP_STAGE + 1);
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(await currentStage(venture.id)).toBe(NOOP_STAGE + 1);
  });
});
