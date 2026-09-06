#!/usr/bin/env node
// LEAD-phase verification findings for SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
// Persists corrections to the SD's own metadata BEFORE PLAN authors the PRD, per validation-agent
// (sub_agent_execution_results id 3a1bb8e6-a98e-4464-9210-09eb083698df) and a follow-up RCA pass
// that root-caused the blocking=false-at-rest contradiction (rca-agent, agentId ab5c79a9842ede82d).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error(fetchErr.message); process.exitCode = 1; return; }

  const lead_phase_verification = {
    verified_at: new Date().toISOString(),
    verified_by: 'LEAD (direct code read + validation-agent + rca-agent)',
    sub_agent_evidence: {
      validation: '3a1bb8e6-a98e-4464-9210-09eb083698df',
      rca: 'ab5c79a9842ede82d (RCA agent transcript; findings replicated below for durability)',
    },
    confirmed_true_as_written: [
      'okr-day28-hardstop registry row exists live (created 2026-09-01T21:56:22Z), expected_interval_seconds=86400 (daily) while the job (lib/eva/jobs/okr-day28-hardstop.js) only fires when getUTCDate()>=28. Sharper root cause than the SD text: the registry disagrees with the job\'s OWN registered cadenceDays:30 in lib/eva/eva-master-scheduler.js (2592000s) -- every sibling okr scheduler_round row satisfies expected_interval_seconds===cadenceDays*86400; this is the only one that does not. Already interim-mitigated (currently_expected_active=false, last_state=INTENTIONALLY_DOWN) so it is not an active fire risk today, but the declared cadence is still wrong and needs FR-4\'s permanent fix (2592000s + restore currently_expected_active=true, plus a generic predicate asserting the equality for every scheduler_round:* row).',
      'periodic_process_registry census: 246 rows, 29 distinct owners, exactly as cited (coordinator-fleet 193, eva-scheduler 18, g3-activation 7, chairman-fleet 3, adam 1, 24 single-owner keys). No NULL owners.',
      'No dedup/overlap conflict: only SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001 also mentions ladder/periodic-liveness and is unrelated; both out-of-scope-cited SDs (OPERATIVE-AGENT-OWNERSHIP-001-B, CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001) are completed with no live work; 0 of 77 open PRs touch lib/periodic-liveness/** or scripts/periodic-liveness-watcher.mjs.',
      'FR-1\'s "existing owner-first resolver" claim is accurate and even understates the reuse: owner-target-resolver.mjs already exists AND the watcher already calls resolveOwnerTarget(supabase, row.owner) at the rung-1 climbLadder call site -- FR-1 is a reroute of an existing resolver call, not new resolver-authoring work.',
    ],
    corrections_required_before_prd: [
      {
        claim: 'FR-6: "the six ladder rows since 08-28 carry a disposition note citing this SD" implies these six are the blocking-critical subset needing backfill.',
        correction: 'All six cited rows (27f1cdcf, c720180f, 33034701, 47baa32e, 0d449890, 0dd5f899) are blocking=false; what actually unites them is brief_data.recorded_via=\'ladder-escalation\' (rows that were refreshed at least once). The ONE genuinely blocking=true row in the window (315ef490, 2026-09-02T00:28Z, decided_by=coordinator-cli) is OMITTED from the FR-6 list. PLAN must decide whether 315ef490 joins the backfill set -- it is the single row that actually reached the chairman as a hard block, so it is arguably the most important one to annotate.',
        evidence: 'validation-agent sub_agent_execution_results 3a1bb8e6-a98e-4464-9210-09eb083698df; live query of chairman_decisions confirms blocking column values.',
      },
      {
        claim: 'FR-2: "the chairman queue and email are reached only when... blocking critical" (implying the fix is to stop setting blocking:true on the ladder digest insert, ladder-escalation.mjs:267).',
        correction: 'CONFIRMED via RCA as the correct and ONLY lever that needs to change. ladder-escalation.mjs:259 (the refresh-branch\'s unconditional escalate() call, no blocking check) is DEDUP-NEUTERED by the escalation_email_sent_at CAS marker (preserved across refreshes) and legitimately fires only as a quiet-window retry (4/35 all-time rows, by design, not a bug) -- changing it would be a near no-op and should NOT be where FR-2\'s implementation effort goes. Fresh-mint email volume is exactly one email per newly-inserted row, driven entirely by the `blocking: true` literal at line 267 flowing into shouldAutoEscalate() in lib/chairman/record-pending-decision.mjs:101-104. FR-2\'s fix: change line 267 to NOT set blocking:true (or pass skipEscalation), then implement the "ONE non-blocking awareness row per day" requirement as SEPARATE new logic (own throttle/dedup), NOT by relying on the existing shouldAutoEscalate path, since disabling escalation entirely also removes ALL chairman visibility including the legitimate (b) chairman-owns-it case.',
        evidence: 'RCA-agent, cited file:line + commit SHAs (bd4d058254f6 / 6c028386a3ac, 2026-07-11) + live query proof (email volume === insert volume, 2026-09-04 mint gaps of 44min/58min/4m44s each followed a disposal).',
      },
      {
        claim: '(Not in original SD text -- a gap found during LEAD review.) createAdvisoryNotification() in lib/eva/chairman-decision-watcher.js:624 was flagged by an Explore pass as a reusable "one row, no email" pattern for FR-2.',
        correction: 'NOT reusable as-is. It opens with `if (!ventureId || stageNumber === undefined || !supabase) return null;` -- hard venture-and-stage scoped by construction. All 35 live ladder rows have venture_id=null, so calling it would silently return null for every case, converting the flood into total silence (worse than the bug). The *shape* (decision:\'advisory\', status:\'approved\' pre-resolved, blocking:false) is sound and worth copying into a NEW venture-less writer inside lib/periodic-liveness/, cross-checked against SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003\'s finding that venture-less rows are undecidable/mislabeled in some consumer paths.',
        evidence: 'validation-agent sub_agent_execution_results 3a1bb8e6-a98e-4464-9210-09eb083698df, direct file:line read.',
      },
      {
        claim: '(Not in original SD text.) resolveOwnerTarget cannot distinguish "eva-scheduler -> route to EVA lane via coordinator" (FR-1, must NOT reach chairman) from "chairman-fleet -> route to chairman" (FR-2b, SHOULD reach chairman) -- both produce an identical {kind:\'coordinator\', resolvedPeer:null, ...} fallback shape today.',
        correction: 'FR-1/FR-2 implementation needs an explicit raw-label check (e.g. /^chairman(-fleet)?$/i against the registry row\'s raw owner column) at the watcher\'s call site, BEFORE or alongside resolveOwnerTarget, since the resolver\'s own return shape cannot carry this distinction without a breaking change to its contract.',
        evidence: 'Direct read of lib/periodic-liveness/owner-target-resolver.mjs (candidatePeerKey lines 25-35, resolveOwnerTarget lines 43-69) -- KNOWN_PEERS = {adam, solomon, coordinator} does not include chairman, so a chairman-owned row and an eva-scheduler row both fall through to the same coordinator-fallback shape.',
      },
      {
        claim: 'success_metrics: "chairman emails from ladder escalations per week... baseline 6 since 08-28".',
        correction: 'Verified baseline via live query is 11 rows since 08-28 (not 6), of which effectively all eventually fired a standout email (blocking:true at every fresh insert per current code) except transient quiet-window suppressions. "6" may have been conflating the FR-6 backfill-list count with this metric\'s baseline -- PLAN should re-baseline this metric from the verified 11/35 figures, and separately track the 315ef490 omission from FR-6\'s six-row list.',
        evidence: 'validation-agent + rca-agent live queries against chairman_decisions.',
      },
    ],
    secondary_defects_found_scope_decision_needed: [
      {
        finding: 'ladder-escalation.mjs:255-258 overwrites brief_data.context (process_keys/process_signatures) and summary on EVERY refresh, destroying the mint-time forensic record. This degrades FR-3\'s self-resolve correctness (a recovered process\'s recorded signature may no longer match what it was escalated for) and FR-6\'s backfill/disposition accuracy.',
        recommendation: 'Fold into FR-3\'s scope: merge/append rather than overwrite, or preserve original mint-time context under a stable sub-key.',
      },
      {
        finding: 'ladder-escalation.mjs:195-197 silently swallows an error in findDismissedSignatures() (empty catch{}), making a total suppression-lookup failure indistinguishable from "nothing dismissed" -- inconsistent with every other fail-soft path in the file (all of which log).',
        recommendation: 'Fold into FR-3\'s scope as a preventive fix: add a console.error matching the existing NC-7 logging style (lines 45, 51).',
      },
      {
        finding: '3 of 35 historical ladder rows (315ef490, b057386b, fc80aeae) still carry blocking=true because they were closed via ad-hoc direct UPDATEs that bypassed fn_chairman_decide/approve_chairman_decision/reject_chairman_decision and therefore never replicated those functions\' blocking=false side effect. This is a systemic drift risk beyond just this SD\'s rows.',
        recommendation: 'OUT OF SCOPE for this SD (chairman_decisions disposal-path hygiene is broader than periodic-liveness). Log as a durable feedback item / candidate future QF rather than expanding this SD.',
      },
    ],
  };

  const metadata = { ...sd.metadata, lead_phase_verification };
  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('id', sd.id);
  if (updateErr) { console.error(updateErr.message); process.exitCode = 1; return; }
  console.log('lead_phase_verification persisted to', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main();
}
