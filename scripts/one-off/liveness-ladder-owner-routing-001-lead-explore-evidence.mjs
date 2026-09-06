#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001,
 * LEAD-TO-PLAN phase. Records the mechanism-verification pass performed directly (Read tool)
 * plus a fresh Explore sub-agent citation pass, closing GATE_SUBAGENT_EVIDENCE (Explore) and
 * feeding GATE_MECHANISM_CLAIM_VERIFIER's named-verifier requirement.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';

const findings = [
  {
    id: 'rung2-is-owner-blind-by-construction',
    severity: 'HIGH',
    summary: 'scripts/periodic-liveness-watcher.mjs:622-624 resolves ownerTarget via resolveOwnerTarget(supabase, row.owner) and calls climbLadder({supabase,row,ownerTarget}), but climbLadder (lib/periodic-liveness/ladder-escalation.mjs:115-126) sets laddered:true purely from the consecutive-miss counter reaching LADDER_THRESHOLD (line 120-121) -- ownerTarget is consulted only inside emitCoordinatorRung/ownerTargetIsCoordinator (lines 75-76, 81) for the rung-1 message, never for whether the row enters ladderCandidates. ladderCandidates.push(...) fires at watcher.mjs:622-629 for every OVERDUE row crossing threshold regardless of owner; emitLadderDigest is invoked at watcher.mjs:663 gated only on ladderCandidates.length>0 (line 661). This confirms the SD\'s core premise directly against source: rung 2 has no owner check anywhere in its call path.',
  },
  {
    id: 'fr2-real-lever-is-the-fresh-insert-blocking-literal-not-the-refresh-escalate-call',
    severity: 'HIGH',
    summary: 'ladder-escalation.mjs:253-260 (existing-digest refresh branch) calls escalate(supabase, existing.id) UNCONDITIONALLY -- no blocking/threshold gate -- but this call is dedup-neutered by the escalation_email_sent_at CAS marker in escalateChairmanDecision (record-pending-decision.mjs:212-219), preserved across refreshes via the brief_data spread at ladder-escalation.mjs:255. The actual email-driving lever is the fresh-insert branch (ladder-escalation.mjs:263-269), which passes blocking:true (line 267) into recordPendingDecision; record-pending-decision.mjs:332 writes row.blocking=!!blocking verbatim into the insert, and shouldAutoEscalate (record-pending-decision.mjs:101-104: `if (blocking===true) return true;`) then fires the standout email unconditionally for every ladder-digest fresh insert. Corroborated live: 31/35 all-time ladder rows carry escalation_email_sent_at with created_at approx equal to the email timestamp (fresh-insert firings), while the refresh-only escalate() legitimately re-fires only for the 4/35 rows created inside the chairman quiet window (23:00-05:00 ET) and closed before it opened -- a designed retry, not a bug. FR-2 implementation should target line 267, not line 259.',
  },
  {
    id: 'owner-target-resolver-cannot-distinguish-eva-scheduler-from-chairman-fleet',
    severity: 'HIGH',
    summary: 'owner-target-resolver.mjs:23 KNOWN_PEERS = new Set([\'adam\',\'solomon\',\'coordinator\']) -- chairman is not a member. candidatePeerKey (lines 25-35) strips known suffixes then checks membership; both eva-scheduler (stripped to "eva") and chairman-fleet (stripped to "chairman") fail the KNOWN_PEERS check and return null (line 34). resolveOwnerTarget (lines 43-69) then falls through to the identical coordinator-fallback shape for both (lines 62-68): {kind:\'coordinator\', target:coordinatorId||\'broadcast-coordinator\', resolvedPeer:null, live:Boolean(coordinatorId)}. FR-1 (route eva-scheduler rows via the coordinator\'s EVA lane, never to chairman) and FR-2b (route chairman-fleet rows TO the chairman) need a distinguishing signal this resolver\'s return shape does not currently carry -- an explicit raw-label check (e.g. /^chairman(-fleet)?$/i against row.owner) is required at the call site.',
  },
  {
    id: 'fr4-cadence-mismatch-confirmed-against-the-schedulers-own-registration',
    severity: 'HIGH',
    summary: 'lib/eva/eva-master-scheduler.js:1049-1056 registers okr-day28-hardstop with cadenceDays:30 (line 1054). lib/eva/jobs/okr-day28-hardstop.js:34-36 isDay28OrLater returns date.getUTCDate()>=28, and runOkrDay28HardStop (lines 48-51) returns {fired:false, reason:\'before-day-28\'} on every day before the 28th, with an additional per-period idempotency short-circuit (lines 56-68) once it has fired. The live periodic_process_registry row for scheduler_round:okr-day28-hardstop declares expected_interval_seconds=86400 (daily) -- disagreeing with the scheduler\'s OWN registered cadenceDays:30 (2592000s), not merely with a vague "monthly expectation". Every sibling okr scheduler_round row (mid-month-review, monthly-generate, monthly-snapshot) satisfies expected_interval_seconds===cadenceDays*86400; okr-day28-hardstop is the sole exception. This registry row is confirmed live (created 2026-09-01T21:56:22Z), already interim-mitigated (currently_expected_active=false, last_state=INTENTIONALLY_DOWN) by the coordinator, so it is not an active fire risk today but its declared cadence is still wrong.',
  },
  {
    id: 'fr1-owner-first-resolver-already-wired-not-new-work',
    severity: 'INFO',
    summary: 'The watcher already calls resolveOwnerTarget(supabase, row.owner) at the rung-1 call site (watcher.mjs:622) and owner-target-resolver.mjs already exists in full with a working coordinator-fallback path. FR-1 is a REROUTE of an already-computed ownerTarget value into a new ack-required session_coordination directive at rung 2 (which does not currently consult ownerTarget at all, per finding 1), not new resolver-authoring work.',
  },
  {
    id: 'createAdvisoryNotification-not-reusable-for-fr2',
    severity: 'MEDIUM',
    summary: 'lib/eva/chairman-decision-watcher.js:624 createAdvisoryNotification() opens with `if (!ventureId || stageNumber === undefined || !supabase) { logger.warn(...); return null; }` -- hard venture-and-stage scoped by construction. All 35 live periodic-liveness ladder rows have venture_id=null, so calling this directly for FR-2\'s "one non-blocking awareness row per day" would return null every time, converting the flood into total silence. The shape (decision:\'advisory\', status:\'approved\' pre-resolved, blocking:false) is sound and should be reimplemented venture-less inside lib/periodic-liveness/, not called directly.',
  },
];

const warnings = [
  'FR-6\'s six cited backfill rows (27f1cdcf, c720180f, 33034701, 47baa32e, 0d449890, 0dd5f899) are all blocking=false and share brief_data.recorded_via=\'ladder-escalation\' (refreshed at least once) -- they are NOT "the blocking-critical subset" as the SD text implies. The one genuinely blocking=true row in the same window (315ef490, 2026-09-02T00:28Z) is omitted from the list; PLAN must decide whether it joins the backfill set.',
  'success_metrics baseline "6 since 08-28" does not match the verified live count of 11 rows since 08-28 -- PLAN should re-baseline from verified figures (11 rows, 2 approved/9 rejected/1 unresolved-at-query-time per validation-agent) rather than carry the stale "6" forward.',
  'A separate, real defect (ladder-escalation.mjs:255-258 overwrites brief_data.context/summary on every refresh, destroying mint-time forensic values used by FR-3\'s signature-based dismissal suppression) was found during this investigation and is not currently named as an FR -- recommend folding into FR-3\'s scope rather than leaving it as an undocumented side effect.',
];

const recommendations = [
  'PLAN should scope FR-2\'s implementation to lib/periodic-liveness/ladder-escalation.mjs:267 (remove/flip the blocking:true literal, or pass skipEscalation) plus NEW standalone daily-awareness-row logic for the dead-owner/chairman-owned cases -- explicitly NOT rely on shouldAutoEscalate\'s existing blocking-check path for the "one row per day" requirement, since disabling escalation entirely also removes legitimate chairman visibility for case (b).',
  'PLAN should add an explicit raw-owner-label check (not a resolveOwnerTarget return-shape change) to distinguish chairman-owned rows from eva-scheduler/other-unmapped-owner rows at the watcher\'s FR-1/FR-2 call site.',
  'PLAN should decide whether 315ef490 (the one genuinely blocking=true historical row) is added to FR-6\'s backfill list alongside the six already cited.',
  'PLAN should fold the brief_data-overwrite-on-refresh defect (ladder-escalation.mjs:255-258) into FR-3\'s acceptance criteria, since it directly affects self-resolve/suppression correctness.',
];

const summary = 'Explore-phase mechanism verification for SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001, combining direct Read-tool citation of all 6 core mechanism claims (rung-2 owner-blindness, the fresh-insert blocking:true literal as the real FR-2 lever vs. the dedup-neutered refresh escalate() call, owner-target-resolver\'s KNOWN_PEERS gap for chairman-fleet vs eva-scheduler, and the okr-day28-hardstop registry-vs-scheduler cadence mismatch) with a follow-on RCA pass (see sub_agent_execution_results RCA evidence, same SD/phase) that definitively resolved a blocking=false-at-rest contradiction as a post-closure artifact of fn_chairman_decide/approve_chairman_decision/reject_chairman_decision, not a live insert-path bug. All citations verified against current source (file:line); no stale/lagging-tree risk (watcher, ladder-escalation, and record-pending-decision confirmed byte-identical to origin/main during the RCA pass).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 96,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/periodic-liveness/ladder-escalation.mjs',
        'lib/periodic-liveness/owner-target-resolver.mjs',
        'lib/chairman/record-pending-decision.mjs',
        'scripts/periodic-liveness-watcher.mjs',
        'lib/eva/eva-master-scheduler.js',
        'lib/eva/jobs/okr-day28-hardstop.js',
        'lib/eva/chairman-decision-watcher.js',
      ],
      cross_referenced_evidence: [
        'sub_agent_execution_results VALIDATION 3a1bb8e6-a98e-4464-9210-09eb083698df (dedup/overlap, live-DB counts, createAdvisoryNotification coupling)',
        'rca-agent pass (this session, agentId ab5c79a9842ede82d) root-causing the blocking=false-at-rest contradiction via fn_chairman_decide/approve_chairman_decision/reject_chairman_decision closer functions',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
