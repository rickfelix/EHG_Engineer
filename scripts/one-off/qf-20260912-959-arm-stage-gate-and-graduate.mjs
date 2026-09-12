#!/usr/bin/env node
/**
 * QF-20260912-959 — the chairman's approved arming of STAGE_GATE_PREDICATE_ARMED plus
 * graduation stamps on LEO_HIGH_CONSEQUENCE_GATES_ENABLED and HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED
 * (chairman_decisions 6cb60a30, approved 2026-09-12T16:00:30Z; chairman_ratifications b75ddfff,
 * ratified 2026-09-12T16:05:21Z — both artifacts of the SAME single chairman SMS reply "A",
 * cited here as the two approvals a HIGH-risk-tier flag's registry gate requires).
 *
 * FIX SHAPE:
 *   (a) enable STAGE_GATE_PREDICATE_ARMED through the governed registry path
 *       (requestApproval -> approveTransition x2 -> transitionLifecycleState), never a raw
 *       UPDATE -- citing the decision + ratification as the two approvals and as the
 *       transition's changedBy, so the resulting leo_feature_flag_audit_log row carries the
 *       citation.
 *   (b) stamp rolled_out_at on the two already-enabled HIGH_CONSEQUENCE flags via the new
 *       markRolledOut() governed writer (lib/feature-flags/registry.js), so
 *       governance-review.js's classifyFlag() stops recommending GRADUATE for them (it already
 *       reads rolled_out_at as the graduation signal -- this was simply never stamped).
 *   (c) read back all three rows, then prove the armed predicate actually enforces: one
 *       checkStageGate() call against AltifyAI (non-demo, stage 23, below the S24 requirement)
 *       with `armed` omitted (reads the live flag) must return blocked:true.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  requestApproval,
  approveTransition,
  transitionLifecycleState,
  markRolledOut,
  getFlag,
} from '../../lib/feature-flags/registry.js';
import { checkStageGate, shouldEnforceBlock } from '../../lib/governance/stage-gate-predicate.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DECISION_CITATION = 'chairman_decision:6cb60a30-93d4-49a3-83b4-8e1ba1d49dd2';
const RATIFICATION_CITATION = 'chairman_ratification:b75ddfff-ea06-495d-a507-b887f1623eed';
const ALTIFY_VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9'; // AltifyAI, stage 23, non-demo

async function armStageGatePredicate() {
  const approval = await requestApproval('STAGE_GATE_PREDICATE_ARMED', 'enable', DECISION_CITATION);
  console.log(`  requestApproval -> id=${approval.id} required=${approval.required_approvals} status=${approval.status}`);

  let current = approval;
  current = await approveTransition(current.id, DECISION_CITATION);
  console.log(`  approveTransition(decision) -> received=${current.approvals_received}/${current.required_approvals} status=${current.status}`);
  current = await approveTransition(current.id, RATIFICATION_CITATION);
  console.log(`  approveTransition(ratification) -> received=${current.approvals_received}/${current.required_approvals} status=${current.status}`);

  const flag = await transitionLifecycleState('STAGE_GATE_PREDICATE_ARMED', 'enabled', {
    reason: `Chairman decision ${DECISION_CITATION} (ratification ${RATIFICATION_CITATION}) approved arming: shouldEnforceBlock() now actually enforces checkStageGate's verdict instead of shadow/audit-only mode.`,
    actorId: DECISION_CITATION,
    actorType: 'chairman',
  });
  console.log(`  transitionLifecycleState -> ${flag.flag_key}: is_enabled=${flag.is_enabled} lifecycle_state=${flag.lifecycle_state}`);
  return flag;
}

async function graduateHighConsequenceFlags() {
  const now = new Date().toISOString();
  const results = [];
  for (const key of ['LEO_HIGH_CONSEQUENCE_GATES_ENABLED', 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED']) {
    const flag = await markRolledOut(key, now, DECISION_CITATION);
    console.log(`  markRolledOut -> ${flag.flag_key}: rolled_out_at=${flag.rolled_out_at}`);
    results.push(flag);
  }
  return results;
}

async function readback() {
  console.log('\nReadback:');
  for (const key of ['STAGE_GATE_PREDICATE_ARMED', 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED', 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED']) {
    const flag = await getFlag(key);
    console.log(`  ${key}: is_enabled=${flag.is_enabled} lifecycle_state=${flag.lifecycle_state} rolled_out_at=${flag.rolled_out_at}`);
  }

  const result = await checkStageGate({
    supabase,
    ventureId: ALTIFY_VENTURE_ID,
    requiredStage: 24,
    actorType: 'qf_readback',
    actorId: 'QF-20260912-959',
    // armed intentionally omitted -- reads the live STAGE_GATE_PREDICATE_ARMED flag just armed above
  });
  console.log(`\n  checkStageGate(AltifyAI, requiredStage=24): armed=${result.armed} verdict=${result.verdict} blocked=${result.blocked}`);
  console.log(`  shouldEnforceBlock(result) = ${shouldEnforceBlock(result)}`);

  const pass = result.armed === true && result.blocked === true && shouldEnforceBlock(result) === true;
  console.log(pass ? '\n✅ PROOF: the armed predicate now enforces BLOCK on a below-go-live venture.' : '\n❌ PROOF FAILED');
  return pass;
}

async function main() {
  console.log('Step (a): arm STAGE_GATE_PREDICATE_ARMED');
  await armStageGatePredicate();
  console.log('\nStep (b): graduate the two HIGH_CONSEQUENCE flags');
  await graduateHighConsequenceFlags();
  const pass = await readback();
  process.exitCode = pass ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('QF-20260912-959 apply FAILED:', err.stack || err.message);
    process.exitCode = 1;
  });
}
