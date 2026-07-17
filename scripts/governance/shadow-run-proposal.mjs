#!/usr/bin/env node
/**
 * shadow-run-proposal.mjs — the FIRST real shadow-trial producer path
 * (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C FR-5 reachability witness):
 *
 *   build proposal -> stageProposal (ceremony-aware) -> shadow-run against the
 *   LIVE sealed corpus -> composePrecheckPacket -> [post-ceremony] attach packet.
 *
 * Default proposal: refine a genesis closure predicate by adding the
 * authorized_writer field (QF-20260716-579: validateClosurePredicate requires it;
 * 33 genesis predicates predate the requirement) — a real, chairman-relevant
 * governed change whose shadow replay should be clean (authorized_writer does not
 * alter evaluateLoopClosure verdicts).
 *
 * CEREMONY-AWARE (VALIDATION binding condition 1): governed_change_proposals is
 * chairman-gated STAGED and absent live. Pre-ceremony, stageProposal returns
 * ceremony_pending — this CLI honors it (exit 2 AFTER completing the shadow-run
 * and packet on the in-memory proposal), so the full advisory pipeline is
 * witnessed today and the persisted 4-hop chain activates with the ceremony.
 *
 * ZERO-LIVE-MUTATION READ-BACK (FR-2): the target loop_registry row is snapshot
 * before and after the run and byte-compared; any drift fails loudly. ADVISORY
 * ONLY: nothing here applies a change.
 *
 * Run (shared root): node scripts/governance/shadow-run-proposal.mjs [--loop-key L7] [--broken]
 *   --broken  stages a deliberately-degenerate predicate (window so wide a stale
 *             edge reads fresh) to demonstrate the regression catch (GT-replay).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { stageProposal } from '../../lib/governance/shadow-trial/proposal-writer.mjs';
import { composePrecheckPacket } from '../../lib/governance/shadow-trial/precheck-packet.mjs';
import { shadowRun } from '../../lib/governance/shadow-trial/shadow-run.mjs';
import { loadEvalSet, evalCaseHash } from '../../lib/eval/eval-set-loader.mjs';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const loopKey = argValue('--loop-key') || 'L7';
const broken = process.argv.includes('--broken');
// SECURITY L1: the degenerate demo proposal must never be STAGED for real —
// post-ceremony it would upsert a genuine staged row. Without the explicit demo
// env the broken variant runs the shadow replay on the in-memory proposal only.
const allowBrokenStage = process.env.SHADOW_TRIAL_DEMO === '1';

// ── Read-only snapshot of the proposal's target artifact ──
const before = await supabase.from('loop_registry')
  .select('loop_key, predicate_type, closure_predicate').eq('loop_key', loopKey).maybeSingle();
if (before.error || !before.data) {
  console.error(`target loop ${loopKey} unreadable: ${before.error?.message || 'not found'}`);
  process.exit(1);
}
const currentPredicate = before.data.closure_predicate || {};

const proposedPredicate = broken
  ? { ...currentPredicate, window_seconds: 100 * 365 * 86400 } // degenerate: century window — stale edges read fresh (false-CLOSE)
  : { ...currentPredicate, authorized_writer: 'loop-closure-verifier' };

const proposal = {
  artifact_class: 'closure_predicates',
  target_ref: `loop_registry:${loopKey}`,
  current_hash: evalCaseHash({ predicate: currentPredicate }),
  proposed_diff: JSON.stringify({ from: currentPredicate, to: proposedPredicate }),
  proposer: 'shadow-run-proposal.mjs',
  provenance: 'SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C reachability witness',
  rationale: broken
    ? 'DEMO ONLY: deliberately-degenerate century window to prove the regression catch'
    : 'Refine genesis predicate with authorized_writer per QF-20260716-579 validateClosurePredicate requirement',
  proposed_predicate: proposedPredicate,
};

// ── Stage (ceremony-aware; broken demo never stages without SHADOW_TRIAL_DEMO=1) ──
const staged = broken && !allowBrokenStage
  ? { staged: false, demo_dry: true }
  : await stageProposal(supabase, proposal);
if (staged.demo_dry) console.log('DEMO-DRY: --broken proposal is never staged without SHADOW_TRIAL_DEMO=1 — replaying in-memory only.');
const proposalId = staged.staged ? staged.id : null;
if (staged.demo_dry) {
  // logged above; continue the in-memory advisory pipeline
} else if (staged.ceremony_pending) {
  console.log('CEREMONY_PENDING: governed_change_proposals not applied yet — continuing on the in-memory proposal (persisted chain activates with the chairman ceremony).');
} else if (staged.staged) {
  console.log(`Proposal staged: ${staged.id}`);
} else if (staged.errors) {
  console.error('Proposal invalid:', staged.errors.join('; '));
  process.exit(1);
} else {
  console.error('stageProposal error:', staged.error);
  process.exit(1);
}

// ── Shadow-run against the LIVE sealed corpus ──
const corpus = await loadEvalSet(supabase, 'closure_predicates');
const run = shadowRun({ proposal, corpus });
if (run.fall_through) {
  console.log(`FALL-THROUGH (no shadow verdict): ${run.reason}`);
} else {
  for (const r of run.results) {
    console.log(`  ${r.case_id}  current=${r.current_verdict} proposed=${r.proposed_verdict} delta=${r.delta ?? 'none'} regression=${r.regression}`);
  }
}

const packet = composePrecheckPacket(run.results, { proposalId });
console.log(`PACKET: recommendation=${packet.recommendation} confidence=${packet.confidence} cases=${packet.summary.cases_total} regressions=${packet.summary.regressions} experimental=${packet.experimental}`);

// ── Zero-live-mutation read-back ──
const after = await supabase.from('loop_registry')
  .select('loop_key, predicate_type, closure_predicate').eq('loop_key', loopKey).maybeSingle();
const clean = !after.error && JSON.stringify(after.data) === JSON.stringify(before.data);
console.log(`READ-BACK: target ${loopKey} ${clean ? 'UNCHANGED — zero live mutation' : 'CHANGED — ISOLATION VIOLATION'}`);
if (!clean) process.exit(3);

if (staged.ceremony_pending) process.exitCode = 2;
