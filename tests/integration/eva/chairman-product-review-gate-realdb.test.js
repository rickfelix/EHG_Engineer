/**
 * REAL, DB-backed integration test for the chairman product-review gate at the
 * Stage 23 -> 24 boundary (Launch Readiness -> Go Live & Announce).
 *
 * SD: SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001
 *
 * Independent, non-mocked confirmation that BOTH choke points enforce the gate
 * against the LIVE Postgres schema, now that the RPC precondition AND the
 * chairman_decisions uniqueness widening (decision_type added to
 * uq_chairman_decision_attempt + idx_chairman_decisions_unique_pending) are in
 * place together:
 *
 *   1. RPC path  — public.fn_advance_venture_stage(uuid,int,int,jsonb,uuid)
 *   2. Daemon-walk path — lib/eva/stage-execution-worker.js::_advanceStage()
 *
 * plus an adversarial coexistence check proving a 'product_review' decision and
 * a 'stage_gate' decision live independently at the SAME
 * (venture_id, lifecycle_stage=23), and a widened-partial-pending-index check.
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no real
 * DB. Creates disposable ventures whose names deliberately do NOT match
 * isFixtureVenture's regex (/^(parity-test-|test-stub)/i) and are is_demo=false,
 * so the REAL (non-fixture) code path is exercised. All rows are cleaned up in
 * afterAll → zero residue.
 *
 * IMPORTANT gate-ordering nuance discovered live (documented via the 2a-raw vs
 * 2a-isolated split below): for 23->24 the RPC evaluates the pre-existing
 * decision_type-AGNOSTIC kill-gate FIRST (stage 23 is gate_type='kill'), THEN the
 * new product_review block, THEN an artifact precondition (launch_readiness_
 * checklist). So a venture with ZERO decisions returns 'gate_blocked' (the old
 * kill-gate), NOT 'product_review_required'. To ISOLATE the new gate we satisfy
 * the kill-gate (an approved non-product_review decision) and the artifact
 * precondition first, then show the transition STILL blocks solely on the missing
 * product_review decision, and finally releases when it is added.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { resolve } from 'path';

// SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: _advanceStage's block path proactively calls
// requestProductReview() (which ultimately calls escalateChairmanDecision -> a REAL detached
// `node scripts/adam-decision-email.mjs` spawn) as a production feature (FR-4: never strand a
// venture with nobody having asked the chairman). That side effect must NEVER fire from an
// automated test run -- it would attempt to send a real chairman email referencing a disposable
// __e2e_product_review_gate_* venture on every CI execution. The wiring itself (does _advanceStage
// call requestProductReview on block, does it NOT call it on release) is already covered by fully
// mocked unit tests (tests/unit/eva/stage-execution-worker-product-review-gate.test.js); this
// integration test's job is the GATE mechanics against real Postgres constraints, not the
// escalation side effect, so that one call is neutralized here and nowhere else in this file.
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({
  requestProductReview: vi.fn().mockResolvedValue({ id: null, isNew: false, skipped: true, reason: 'test_neutralized' }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { isFixtureVenture } from '../../../lib/eva/chairman-decision-watcher.js';

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

async function createVenture(tag) {
  const { data, error } = await supabase
    .from('ventures')
    .insert({
      name: `__e2e_product_review_gate_${tag}_${ts}__`,
      problem_statement: 'Disposable venture for SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 real-DB gate test',
      current_lifecycle_stage: 23,
      is_demo: false,
      status: 'active',
    })
    .select('id, name, is_demo')
    .single();
  if (error) throw new Error(`Failed to create ${tag} venture: ${error.message}`);
  ventureIds.push(data.id);
  return data;
}

async function currentStage(ventureId) {
  const { data } = await supabase
    .from('ventures').select('current_lifecycle_stage').eq('id', ventureId).single();
  return data?.current_lifecycle_stage;
}

async function insertDecision({ ventureId, decisionType, status, decision, attempt = 1 }) {
  return supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: 23,
      decision_type: decisionType,
      status,
      decision,
      attempt_number: attempt,
    })
    .select('id, decision_type, status, decision, attempt_number')
    .single();
}

// SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: _advanceStage's block path now proactively calls
// requestProductReview() (added after this test file was first written), which mints a PENDING
// product_review decision as a side effect of the 3a-block test's own _advanceStage() call. A
// bare insertDecision(status:'approved') in a later test would then 23505-collide with that
// already-minted attempt_number=1 row. Approve the existing pending row when the proactive-ask
// already created one (the current, expected reality) -- falls back to a fresh insert otherwise,
// so this stays correct if that side effect is ever removed.
async function approveOrInsertDecision({ ventureId, decisionType }) {
  const { data: existing } = await supabase
    .from('chairman_decisions')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 23)
    .eq('decision_type', decisionType)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return supabase
      .from('chairman_decisions')
      .update({ status: 'approved', decision: 'approve' })
      .eq('id', existing.id)
      .select('id, decision_type, status, decision, attempt_number')
      .single();
  }
  return insertDecision({ ventureId, decisionType, status: 'approved', decision: 'approve' });
}

async function callAdvance(ventureId, from, to) {
  return supabase.rpc('fn_advance_venture_stage', {
    p_venture_id: ventureId,
    p_from_stage: from,
    p_to_stage: to,
    p_handoff_data: {},
    p_idempotency_key: randomUUID(),
  });
}

describe.skipIf(!HAS_REAL_DB)('Chairman product-review gate — REAL DB, both choke points', () => {
  let ventureA; // RPC path
  let ventureB; // daemon-walk (_advanceStage) path
  let ventureC; // adversarial coexistence

  beforeAll(async () => {
    ventureA = await createVenture('rpc');
    ventureB = await createVenture('worker');
    ventureC = await createVenture('adv');
  });

  afterAll(async () => {
    // Delete children first, then the ventures themselves — zero residue.
    for (const id of ventureIds) {
      await supabase.from('chairman_decisions').delete().eq('venture_id', id);
      await supabase.from('venture_artifacts').delete().eq('venture_id', id);
      await supabase.from('venture_stage_work').delete().eq('venture_id', id);
      await supabase.from('venture_stage_transitions').delete().eq('venture_id', id);
      await supabase.from('workflow_executions').delete().eq('venture_id', id);
    }
    for (const id of ventureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  it('sanity: disposable ventures are NOT treated as fixtures (real code path)', () => {
    expect(isFixtureVenture(ventureA)).toBe(false);
    expect(isFixtureVenture(ventureB)).toBe(false);
    expect(isFixtureVenture(ventureC)).toBe(false);
  });

  // ───────────────────────── RPC PATH (Venture A) ─────────────────────────

  it('RPC 2a-raw: 23→24 with ZERO decisions is blocked & does NOT advance (kill-gate fires first)', async () => {
    const { data, error } = await callAdvance(ventureA.id, 23, 24);
    expect(error).toBeNull();
    expect(data.success).toBe(false);
    // Documented ordering nuance: with no decisions at all, the pre-existing
    // decision_type-agnostic kill-gate ('gate_blocked') fires before the new
    // product_review block. Either way the transition is refused.
    expect(['gate_blocked', 'review_gate_blocked', 'product_review_required']).toContain(data.error);
    expect(await currentStage(ventureA.id)).toBe(23);
  });

  it('RPC 2a-isolated: with kill-gate+artifact satisfied but NO product_review, returns product_review_required', async () => {
    // Satisfy the artifact precondition (stage 23 requires launch_readiness_checklist).
    const { error: artErr } = await supabase.from('venture_artifacts').insert({
      venture_id: ventureA.id,
      lifecycle_stage: 23,
      artifact_type: 'launch_readiness_checklist',
      title: 'E2E launch readiness checklist',
      is_current: true,
    });
    expect(artErr).toBeNull();

    // Satisfy the pre-existing decision_type-agnostic kill-gate with a
    // NON-product_review approved decision.
    const { error: sgErr } = await insertDecision({
      ventureId: ventureA.id, decisionType: 'stage_gate', status: 'approved', decision: 'approve',
    });
    expect(sgErr).toBeNull();

    const { data, error } = await callAdvance(ventureA.id, 23, 24);
    expect(error).toBeNull();
    expect(data.success).toBe(false);
    // The NEW gate is now the sole remaining blocker → isolates it precisely.
    expect(data.error).toBe('product_review_required');
    expect(await currentStage(ventureA.id)).toBe(23);
  });

  it('RPC 2c-release: approving a product_review decision releases 23→24 and advances the DB row', async () => {
    const { error: prErr } = await insertDecision({
      ventureId: ventureA.id, decisionType: 'product_review', status: 'approved', decision: 'approve',
    });
    expect(prErr).toBeNull();

    const { data, error } = await callAdvance(ventureA.id, 23, 24);
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.to_stage).toBe(24);
    expect(await currentStage(ventureA.id)).toBe(24);
  });

  // ──────────────────── DAEMON-WALK PATH (Venture B) ─────────────────────
  // Drives the REAL _advanceStage() against a REAL service-role client. The
  // worker gate checks ONLY the approved product_review decision (kill-gate /
  // artifacts are the RPC's responsibility), so no extra preconditions here.

  it('WORKER 3a-block: _advanceStage(23→24) with no product_review returns blocked & does NOT advance', async () => {
    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureB.id, 23, 24, {});
    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
    // Authoritative DB assertion — not just the in-memory return value.
    expect(await currentStage(ventureB.id)).toBe(23);
  });

  it('WORKER 3c-release: after approving product_review, _advanceStage advances the DB row to 24', async () => {
    // 3a-block's _advanceStage() call already minted a PENDING product_review decision via its
    // own proactive requestProductReview() side effect — approve that same row.
    const { error: prErr } = await approveOrInsertDecision({ ventureId: ventureB.id, decisionType: 'product_review' });
    expect(prErr).toBeNull();

    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureB.id, 23, 24, {});
    expect(result?.blocked).not.toBe(true);
    // Authoritative DB assertion: the ventures row actually moved to 24.
    expect(await currentStage(ventureB.id)).toBe(24);
  });

  // ──────────────── ADVERSARIAL COEXISTENCE (Venture C) ──────────────────

  it('ADVERSARIAL: product_review and stage_gate decisions coexist independently at (venture,23)', async () => {
    // Both inserted as PENDING at the same (venture_id, lifecycle_stage=23):
    // pre-widening this violated idx_chairman_decisions_unique_pending
    // (venture_id, lifecycle_stage) WHERE status='pending'. Both succeeding
    // proves decision_type is now part of that partial unique index.
    const { data: pr, error: prErr } = await insertDecision({
      ventureId: ventureC.id, decisionType: 'product_review', status: 'pending', decision: 'pending',
    });
    expect(prErr).toBeNull();
    const { data: sg, error: sgErr } = await insertDecision({
      ventureId: ventureC.id, decisionType: 'stage_gate', status: 'pending', decision: 'pending',
    });
    expect(sgErr).toBeNull();

    // Both rows persist, independently.
    const { data: rows } = await supabase
      .from('chairman_decisions')
      .select('id, decision_type, status, decision')
      .eq('venture_id', ventureC.id)
      .eq('lifecycle_stage', 23)
      .order('decision_type');
    expect(rows.map(r => r.decision_type)).toEqual(['product_review', 'stage_gate']);

    // The pending partial index STILL enforces uniqueness within a decision_type:
    // a second pending product_review (different attempt_number, so
    // uq_chairman_decision_attempt passes) must collide on the pending index.
    const { error: dupErr } = await insertDecision({
      ventureId: ventureC.id, decisionType: 'product_review', status: 'pending', decision: 'pending', attempt: 2,
    });
    expect(dupErr).toBeTruthy();
    expect((dupErr.message || '').toLowerCase()).toMatch(/duplicate|unique|idx_chairman_decisions_unique_pending/);

    // Approving product_review must NOT alter the stage_gate row.
    const { error: updErr } = await supabase
      .from('chairman_decisions')
      .update({ status: 'approved', decision: 'approve' })
      .eq('id', pr.id);
    expect(updErr).toBeNull();

    const { data: sgAfter } = await supabase
      .from('chairman_decisions')
      .select('status, decision')
      .eq('id', sg.id)
      .single();
    expect(sgAfter.status).toBe('pending');
    expect(sgAfter.decision).toBe('pending');
  });
});
