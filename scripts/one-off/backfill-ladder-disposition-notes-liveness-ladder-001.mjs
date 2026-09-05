#!/usr/bin/env node
// SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-6.
//
// Backfills a disposition note (brief_data field only -- NEVER a raw status/blocking mutation,
// per RCA's finding that 3/35 historical rows already carry drift from ad-hoc UPDATEs bypassing
// fn_chairman_decide/approve_chairman_decision/reject_chairman_decision's side effects) onto the
// SEVEN historical ladder rows: the six originally cited by the SD (all blocking=false,
// recorded_via='ladder-escalation') PLUS 315ef490, the one genuinely blocking=true row in the
// same window that the SD's own Step-0 corrections pass omitted (found via validation-agent's
// live-query verification during LEAD).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';

const ROW_ID_PREFIXES = ['27f1cdcf', 'c720180f', '33034701', '47baa32e', '0d449890', '0dd5f899', '315ef490'];

async function main() {
  // uuid ids can't be filtered with ilike server-side without a text cast that PostgREST's
  // .filter() does not expose cleanly here -- fetch the bounded ladder-window candidate set once
  // and match prefixes client-side instead.
  const { data: candidates, error: fetchErr } = await supabase
    .from('chairman_decisions')
    .select('id, brief_data, status')
    .gte('created_at', '2026-08-28T00:00:00Z')
    .like('summary', 'Periodic-liveness ladder:%');
  if (fetchErr) { console.error(`CANDIDATE FETCH FAILED: ${fetchErr.message}`); process.exitCode = 1; return; }

  for (const prefix of ROW_ID_PREFIXES) {
    const matches = (candidates || []).filter((r) => r.id.startsWith(prefix));
    if (matches.length === 0) { console.error(`NOT FOUND: ${prefix}`); continue; }
    if (matches.length > 1) { console.error(`AMBIGUOUS PREFIX ${prefix}: ${matches.length} matches, skipping`); continue; }
    const row = matches[0];

    if (row.brief_data?.disposition_note) {
      console.log(`ALREADY DISPOSITIONED: ${row.id} -- skipping`);
      continue;
    }

    const mergedBriefData = {
      ...(row.brief_data || {}),
      disposition_note: `Superseded by ${SD_KEY}: this row was a periodic-liveness ladder digest that reached the chairman's decision queue for a process that was never actually a chairman decision. FR-1/FR-2 of ${SD_KEY} route future occurrences to the owning role seat (or a non-blocking awareness row for a dead/unresolvable owner or a chairman-owned process), so this class of row will not recur in this shape.`,
      disposition_sd: SD_KEY,
      disposition_recorded_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('chairman_decisions')
      .update({ brief_data: mergedBriefData }) // brief_data ONLY -- never status/blocking/decision
      .eq('id', row.id);
    if (updateErr) { console.error(`UPDATE FAILED for ${row.id}: ${updateErr.message}`); continue; }
    console.log(`DISPOSITIONED: ${row.id} (status=${row.status})`);
  }
}

main();
