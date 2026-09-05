#!/usr/bin/env node
// SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 -- restores the interim-deactivated
// periodic_process_registry rows now that slice 1 (owner-routed rung 2, PR #8195) has merged to
// main. Per coordinator instruction 2026-09-05T02:19Z: "restore the six interim registry rows
// with honest cadences (before-states on the SD row, rounds 1, 2, 4)".
//
// Rounds 1 (3 rows, wrong cadence) are already corrected by
// fix-scheduler-round-cadence-liveness-ladder-001.mjs (2026-09-05, part of slice 2). This script
// covers rounds 2 and 4 (3 rows, cadence was never wrong -- only currently_expected_active was
// flipped false as an interim stopgap while rung 2 had no owner-routing gate). Round 3 (7 rows)
// was already self-reverted by the coordinator at 2026-09-05T01:38:52Z and needs no action.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RESTORE_KEYS = [
  'standard_loop:account-usage-sample', // round 2, 2026-09-05T00:59Z
  'standard_loop:index-jam-detector',   // round 2, 2026-09-05T00:59Z
  'standard_loop:inbox',                // round 4, 2026-09-05T01:49Z
];

async function main() {
  for (const key of RESTORE_KEYS) {
    const { data: before, error: readErr } = await supabase
      .from('periodic_process_registry')
      .select('process_key, expected_interval_seconds, currently_expected_active, last_state')
      .eq('process_key', key)
      .single();
    if (readErr) { console.error(`READ FAILED for ${key}: ${readErr.message}`); continue; }
    console.log(`BEFORE ${key}:`, before);

    const { error: updateErr } = await supabase
      .from('periodic_process_registry')
      .update({ currently_expected_active: true })
      .eq('process_key', key);
    if (updateErr) { console.error(`UPDATE FAILED for ${key}: ${updateErr.message}`); continue; }
    console.log(`RESTORED ${key}: currently_expected_active=true (expected_interval_seconds unchanged at ${before.expected_interval_seconds} -- this row's cadence was never misdeclared, only paused)`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
