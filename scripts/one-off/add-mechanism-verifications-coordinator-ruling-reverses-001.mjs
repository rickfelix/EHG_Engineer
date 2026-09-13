#!/usr/bin/env node
// GATE_MECHANISM_CLAIM_VERIFIER evidence for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001.
// Each entry cites a file:line the VALIDATION or Explore sub-agent actually opened and read
// (sub_agent_execution_results 39101e4d-0b38-4ee4-a573-26926221e585 / 705eca19-4e6f-40c4-9ae8-714608f04b43),
// per scripts/modules/handoff/executors/lead-to-plan/gates/mechanism-claim-verifier.js's requirement
// (a boolean attestation is not accepted -- the file:line is the evidence).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001';

const mechanism_verifications = [
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results 39101e4d-0b38-4ee4-a573-26926221e585)',
    verified_at: 'scripts/hooks/coordination-inbox.cjs:848',
    claim: 'the merged reader fetches urgentRows uncapped on payload.urgency=interrupt and merges them ahead of the oldest-five batch via mergePriorityExempt([...priorityRows, ...replyToSignalRows, ...urgentRows], oldestBatch || []).',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results 39101e4d-0b38-4ee4-a573-26926221e585)',
    verified_at: 'scripts/hooks/coordination-inbox.cjs:1050',
    claim: 'the lane-blind nudge checks urgentRows[0] first at cutMinutes:2 naming the row subject, falling back to the existing oldestBatch check (cutMinutes default 15) only when no urgent row exists.',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results 39101e4d-0b38-4ee4-a573-26926221e585)',
    verified_at: 'scripts/hooks/coordination-inbox.cjs:842',
    claim: 'the in-code comment cites docs/protocol/coordinator-adam-comms.md as the doc location for payload.urgency, but that file contains zero occurrences of "urgency" or "fence_notice" -- the real section lives at docs/reference/fleet-coordination.md:173-194. Live DB probe (session_coordination, 1755 total rows) confirms 0 rows carry payload.urgency NOT NULL: the fix shape\'s writer limb (a) was never implemented, so the merged reader currently matches zero rows by construction.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 705eca19-4e6f-40c4-9ae8-714608f04b43)',
    verified_at: 'lib/coordinator/dispatch.cjs:1453',
    claim: 'insertCoordinationRow(supabase, row, opts) is the canonical low-level session_coordination writer; dispatchToWorker (lib/coordinator/dispatch.cjs:1905) is a thin wrapper over it and is the actual chokepoint any future payload.urgency=interrupt stamp must pass through.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 705eca19-4e6f-40c4-9ae8-714608f04b43)',
    verified_at: 'lib/sd/amend-sd.js:301',
    claim: 'the fence_notice precedent this fix was explicitly modeled on has a real writer: amendSd() calls dispatchToWorker(supabase, { ..., payload: { kind: "fence_notice", sd_key, amended_fields, body } }, { logger }) -- the structural template for adding a payload.urgency key at the same call site.',
  },
  {
    verified_by: 'Explore sub-agent (sub_agent_execution_results 705eca19-4e6f-40c4-9ae8-714608f04b43)',
    verified_at: 'lib/coordinator/message-kinds.cjs:30',
    claim: 'CORRECTION_KINDS = [\'retraction\',\'amend\',\'supersede\'] is the closest adjacent classifier to "reverses in-flight work", but it marks correction of a PRIOR MESSAGE, not contradiction of code a worker is currently building -- confirming no existing mechanism can be reused to auto-detect urgency; it must be an explicit caller-supplied parameter at ruling-authoring time.',
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

if (isMainModule(import.meta.url)) {
  main();
}
