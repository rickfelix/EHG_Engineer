import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PROCESS_KEY = 'standard_loop:orphan-writers-triage';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: existing } = await supabase.from('periodic_process_registry').select('process_key').eq('process_key', PROCESS_KEY).maybeSingle();
  if (existing) {
    console.log(`Already registered: ${PROCESS_KEY}`);
    return;
  }
  const { error } = await supabase.from('periodic_process_registry').insert({
    process_key: PROCESS_KEY,
    display_name: 'Orphan-writers registry weekly triage pass',
    owner: 'coordinator-fleet',
    process_type: 'standalone_cron',
    expected_interval_seconds: 604800, // weekly, per PRD FR-5 "weekly triage pass"
    grace_multiplier: 2,
    liveness_source: 'self_stamped',
    liveness_source_ref: { discovered_from: 'SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001', required_invocation: 'scripts/orphan-writers-count.mjs' },
    session_bound: false,
    currently_expected_active: true,
    last_state: 'UNVERIFIED',
  });
  if (error) throw error;
  console.log(`Registered: ${PROCESS_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
