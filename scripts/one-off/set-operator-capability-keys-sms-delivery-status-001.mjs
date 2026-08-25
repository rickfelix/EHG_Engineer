#!/usr/bin/env node
// SD-LEO-INFRA-SMS-DELIVERY-STATUS-001, PLAN-TO-LEAD OPERATOR_CONTRACT gate: the armed-cadence
// check derives candidate periodic_process_registry keys from the created table name
// (sms_status_staging -> sms_status_staging/-sweep/-reaper/sms-status-staging), but this SD's
// actual registered cadence key is standard_loop:sms-status-relay-drain (matching the sibling
// inbound-relay drain's naming convention, not the table-name-derived guess). Declaring the real
// key explicitly via metadata.operator_capability_keys, the escape hatch
// lib/gates/operator-contract/harness-adapter.js's resolveOperatorContract already reads.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const SD_KEY = 'SD-LEO-INFRA-SMS-DELIVERY-STATUS-001';

  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw readErr;

  const existing = sd.metadata || {};
  if (Array.isArray(existing.operator_capability_keys) && existing.operator_capability_keys.length) {
    console.log('operator_capability_keys already set:', existing.operator_capability_keys);
    return;
  }

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...existing, operator_capability_keys: ['standard_loop:sms-status-relay-drain'] } })
    .eq('id', sd.id);
  if (updateErr) throw updateErr;

  console.log('Set metadata.operator_capability_keys = ["standard_loop:sms-status-relay-drain"] on', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
