#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 — Explore breadth pass at LEAD-TO-PLAN.
 *
 * Read-only confirmation of the checkin pipeline's rung ordering and the exact mechanism by
 * which a resumable-release claim outranks a directed WORK_ASSIGNMENT (the specimen: message
 * 13655143, sat unread 98 minutes while resume.cjs rediscovered a stale-mirror claim).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read-only confirmation of the checkin pipeline (lib/checkin/pipeline.cjs, contract: {name, applies(ctx)?, run(ctx)} — a truthy return short-circuits, ctx.base accumulates across steps) and its rung order (lib/checkin/steps/index.cjs): roll-call creates ctx.base, resume runs at rung 4, directed-assignment at rung 5. Root cause confirmed: a stale-session sweep clears ONLY claude_sessions.sd_key (the session-side mirror) while leaving strategic_directives_v2.claiming_session_id (the authoritative claim) untouched. resume.cjs\'s `if (!ctx.mySd)` branch then rediscovers the still-authoritative claim via findOwnSdClaim/getMyClaims and returns a resolved action BEFORE directed-assignment (rung 5) ever runs — so an addressed, unread WORK_ASSIGNMENT for a DIFFERENT SD sits unread. Live specimen: message_id 13655143 (created 13:11:21Z), addressed and unread for 98 minutes while the seat resumed the rediscovered claim. FIX SHAPE CONFIRMED FEASIBLE: resume.cjs can distinguish "ctx.mySd arrived already populated" (continuously held — rule 7a never-strand must still apply, never yield) from "ctx.mySd was NULL and just got rediscovered this tick" (a resumable release — safe to yield, since the claim was only reattached this instant, not being actively worked). The symmetric-clear fix already shipped in SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A (claim_sd() releases the old SD when a session switches claims) makes it safe for directed-assignment to then genuinely claim_sd() the directed item without leaving the yielded claim orphaned.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'LOW',
      issue: 'quick_fixes has no claim_history equivalent, so a directed QF assignment outranked by a resumed SD/QF claim cannot be measured by a stored-history CI predicate the way the SD side can.',
      evidence: 'Live query confirmed quick_fixes carries no per-row claim_history-shaped field (checked this session, prior to compaction); strategic_directives_v2.metadata.claim_history is a per-SD-row array of {claimed_at, session_id, identity_source} with no QF-side analog.',
      location: 'quick_fixes table (no claim_history column); strategic_directives_v2.metadata.claim_history',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'A second known specimen class (multiple simultaneously-pending directed WORK_ASSIGNMENT rows for one seat, requiring a chairman-directed > priority > landed-before-parked > created_at ordering) is a distinct rung-5-internal ordering question, not the resume-vs-directed ordering this SD\'s FR-1 fixes. Scoping this out of the current increment keeps the PR at the ≤400 LOC ceiling from CLAUDE.md\'s tiered PR guidance.',
      evidence: 'lib/checkin/steps/directed-assignment.cjs currently picks a single WORK_ASSIGNMENT row per tick (its existing selection logic, unmodified by FR-1-4); reworking it to rank multiple pending rows is separable, larger-scoped work touching a different chokepoint (lib/coordinator/dispatch.cjs, 1638 lines) than FR-1-4 touches.',
      location: 'lib/checkin/steps/directed-assignment.cjs; lib/coordinator/dispatch.cjs (insert-time chokepoint, assertSdDispatchable call site ~line 1358)',
    },
  ],
  recommendations: [
    'PLAN: scope the PRD to FR-1 (resume.cjs yields to a directed WORK_ASSIGNMENT only when the claim was rediscovered THIS tick, never when continuously held), FR-2 (printed directed_lane_verdict on every terminal branch of resume.cjs and directed-assignment.cjs), FR-3 (regression fixtures proving both the yield and the never-yield cases), FR-4 (a CI predicate script measuring the defect class against live claim_history data) — all of which are already implemented and test-passing in the worktree.',
    'PLAN: record the insert-time dispatch validation (a WORK_ASSIGNMENT with neither a resolvable sd_key/assigned-key nor assignment_type) and the multi-pending-row directed-rung ordering as an explicit DEFERRED FOLLOW-UP scope note in the PRD, not silently dropped — same SD, later EXEC increment, since it is genuinely separable and touches a materially different, larger chokepoint (dispatch.cjs).',
  ],
  detailed_analysis: {
    searched_identifiers: ['findOwnSdClaim', 'getMyClaims', 'claiming_session_id', 'claude_sessions.sd_key', 'claim_history', 'directed_lane_verdict', 'assertSdDispatchable'],
    searched_paths: ['lib/checkin/pipeline.cjs', 'lib/checkin/steps/index.cjs', 'lib/checkin/steps/resume.cjs', 'lib/checkin/steps/directed-assignment.cjs', 'lib/checkin/steps/roll-call.cjs', 'lib/coordinator/dispatch.cjs'],
    live_specimen: { message_id: '13655143', created_at: '2026-09-04T13:11:21Z', unread_duration_minutes: 98 },
    ci_predicate_live_smoke: { since: '2026-09-06T00:00:00Z', status: 'FAIL_before_fix', denominator: 19, offender_count: 4 },
    fr1_4_status: 'implemented and test-passing in worktree, uncommitted',
    fr5_8_status: 'deferred to a documented follow-up EXEC increment of this same SD',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/checkin-directed-before-resume-001-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
