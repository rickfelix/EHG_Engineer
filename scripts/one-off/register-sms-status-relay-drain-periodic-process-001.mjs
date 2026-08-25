#!/usr/bin/env node
// SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-6 — registers standard_loop:sms-status-relay-drain in
// periodic_process_registry. Required BEFORE stampLastFired can do anything: registry membership
// is additive, not auto-creating (lib/periodic-liveness/stamp-last-fired.js's own docblock) --
// SECURITY finding (sub_agent_execution_results e4523e04-98c7-46d5-96bd-9eab60bb93f5) measured
// live that no row exists yet, making the runner's stamp call a permanent no-op until this runs.
// Mirrors the sibling row (standard_loop:sms-relay-drain) exactly, one process_key over.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: readErr } = await supabase
    .from('periodic_process_registry')
    .select('process_key')
    .eq('process_key', 'standard_loop:sms-status-relay-drain')
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) {
    console.log('standard_loop:sms-status-relay-drain already registered — no-op.');
    return;
  }

  const { error } = await supabase.from('periodic_process_registry').insert({
    process_key: 'standard_loop:sms-status-relay-drain',
    display_name: 'coordinator loop: SMS status-callback relay-staging drain',
    owner: 'coordinator-fleet',
    process_type: 'standalone_cron',
    expected_interval_seconds: 300,
    grace_multiplier: 3,
    liveness_source: 'self_stamped',
    liveness_source_ref: { cron: '*/5 * * * *', discovered_from: 'standard_loop' },
    session_bound: true,
    currently_expected_active: true,
  });
  if (error) throw error;

  console.log('Registered standard_loop:sms-status-relay-drain in periodic_process_registry.');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
