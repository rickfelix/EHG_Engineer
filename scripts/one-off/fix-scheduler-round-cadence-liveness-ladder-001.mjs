#!/usr/bin/env node
// SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-4.
//
// Corrects the 3 periodic_process_registry scheduler_round:* rows whose declared
// expected_interval_seconds disagrees with their eva-master-scheduler.js registration --
// verified live (2026-09-05) against all 18 scheduler_round rows: exactly these three diverge,
// all currently interim-mitigated (currently_expected_active=false, INTENTIONALLY_DOWN) by the
// coordinator on 2026-09-04. Restoring the correct interval AND currently_expected_active=true
// is safe now that the declared cadence matches the job's actual designed cadence.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CORRECTIONS = [
  { process_key: 'scheduler_round:okr-day28-hardstop', expected_interval_seconds: 2592000 }, // registerJob cadenceDays:30
  { process_key: 'scheduler_round:portfolio_review', expected_interval_seconds: 604800 }, // registerRound cadence:'weekly'
  { process_key: 'scheduler_round:stage_health', expected_interval_seconds: 2592000 }, // registerRound cadence:'monthly'
];

async function main() {
  for (const c of CORRECTIONS) {
    const { data: before, error: readErr } = await supabase
      .from('periodic_process_registry')
      .select('process_key, expected_interval_seconds, currently_expected_active, last_state')
      .eq('process_key', c.process_key)
      .single();
    if (readErr) { console.error(`READ FAILED for ${c.process_key}: ${readErr.message}`); continue; }
    console.log(`BEFORE ${c.process_key}:`, before);

    const { error: updateErr } = await supabase
      .from('periodic_process_registry')
      .update({ expected_interval_seconds: c.expected_interval_seconds, currently_expected_active: true })
      .eq('process_key', c.process_key);
    if (updateErr) { console.error(`UPDATE FAILED for ${c.process_key}: ${updateErr.message}`); continue; }
    console.log(`CORRECTED ${c.process_key}: expected_interval_seconds=${c.expected_interval_seconds}, currently_expected_active=true`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
