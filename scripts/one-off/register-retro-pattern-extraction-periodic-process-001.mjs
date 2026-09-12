#!/usr/bin/env node
// QF-20260911-299 -- registers gha_cron:retro-pattern-extraction-cron.yml in
// periodic_process_registry. Required BEFORE the periodic-liveness-watcher can classify this
// cron's liveness: registry membership is additive, not auto-creating (lib/periodic-liveness/
// stamp-last-fired.js's own docblock). Mirrors register-sms-status-relay-drain-periodic-
// process-001.mjs, one process_key over.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PROCESS_KEY = 'gha_cron:retro-pattern-extraction-cron.yml';

export async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: readErr } = await supabase
    .from('periodic_process_registry')
    .select('process_key')
    .eq('process_key', PROCESS_KEY)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) {
    console.log(`${PROCESS_KEY} already registered — no-op.`);
    return;
  }

  const { error } = await supabase.from('periodic_process_registry').insert({
    process_key: PROCESS_KEY,
    display_name: 'retro -> issue_patterns learning-extraction hop',
    owner: 'coordinator-fleet',
    process_type: 'standalone_cron',
    expected_interval_seconds: 3600,
    grace_multiplier: 3,
    liveness_source: 'github_actions_api',
    liveness_source_ref: { workflow_cron: '0 * * * *' },
    session_bound: false,
    currently_expected_active: true,
  });
  if (error) throw error;

  console.log(`Registered ${PROCESS_KEY} in periodic_process_registry.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
