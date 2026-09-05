#!/usr/bin/env node
// GATE_MECHANISM_CLAIM_VERIFIER evidence for SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
// Each entry cites a file:line I (LEAD) or a delegated Explore sub-agent actually opened and
// read, per scripts/modules/handoff/executors/lead-to-plan/gates/mechanism-claim-verifier.js's
// requirement (a boolean attestation is not accepted -- the file:line is the evidence).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';

const mechanism_verifications = [
  {
    verified_by: 'LEAD (direct Read)',
    verified_at: 'lib/periodic-liveness/ladder-escalation.mjs:267',
    claim: 'emitLadderDigest\'s fresh-insert branch passes blocking:true into recordPendingDecision, the sole lever driving shouldAutoEscalate()\'s standout chairman email on every ladder digest mint.',
  },
  {
    verified_by: 'LEAD (direct Read)',
    verified_at: 'lib/periodic-liveness/ladder-escalation.mjs:259',
    claim: 'emitLadderDigest\'s existing-digest refresh branch calls escalate(supabase, existing.id) unconditionally, with no blocking check -- confirmed dedup-neutered by the CAS marker (record-pending-decision.mjs:212-219) via rca-agent live-data cross-check.',
  },
  {
    verified_by: 'LEAD (direct Read)',
    verified_at: 'lib/chairman/record-pending-decision.mjs:102',
    claim: 'shouldAutoEscalate returns true whenever blocking===true, independent of raisedBy/decisionType.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 9285f21f-29a5-4e5e-9d21-479398589465)',
    verified_at: 'lib/periodic-liveness/owner-target-resolver.mjs:23',
    claim: 'KNOWN_PEERS = new Set([\'adam\',\'solomon\',\'coordinator\']) does not include chairman, so both eva-scheduler and chairman-fleet owner labels resolve to the identical coordinator-fallback shape.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 9285f21f-29a5-4e5e-9d21-479398589465)',
    verified_at: 'scripts/periodic-liveness-watcher.mjs:622',
    claim: 'climbLadder is called with ownerTarget already resolved, but laddered:true is decided purely by the consecutive-miss counter (ladder-escalation.mjs:120-121) -- ownerTarget never gates entry into ladderCandidates/rung 2.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 9285f21f-29a5-4e5e-9d21-479398589465)',
    verified_at: 'lib/eva/eva-master-scheduler.js:1054',
    claim: 'okr-day28-hardstop is registered with cadenceDays:30, disagreeing with its live periodic_process_registry row\'s expected_interval_seconds=86400 (daily).',
  },
  {
    verified_by: 'LEAD (direct Read)',
    verified_at: 'lib/eva/jobs/okr-day28-hardstop.js:35',
    claim: 'isDay28OrLater returns date.getUTCDate()>=28 -- the job only fires from day 28 onward, corroborating the cadence-mismatch claim.',
  },
];

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) { console.error(fetchErr.message); process.exitCode = 1; return; }

  const metadata = { ...sd.metadata, mechanism_verifications };
  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('id', sd.id);
  if (updateErr) { console.error(updateErr.message); process.exitCode = 1; return; }
  console.log('mechanism_verifications persisted:', mechanism_verifications.length, 'entries');
}

main();
