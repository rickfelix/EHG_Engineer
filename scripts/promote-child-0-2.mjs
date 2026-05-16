#!/usr/bin/env node
// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-6
// Kill-switch-aware Child 0.2 promotion gate.
//   - Reads app_config.child_0_kill_switch
//   - If kill_switch=true or blocked=true → exit non-zero (kill-switch active)
//   - Else → exit 0 (promotion allowed)
// Pilot accuracy oracle: tests/fixtures/lineage-validation-set.json (30 hand-labeled SDs).
// Manual override requires CISO + LEAD signatures via audit_log entries (out of scope here).

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG_KEYS, KILL_SWITCH_ACCURACY_THRESHOLD } from './lineage/constants.mjs';

config();

export async function checkKillSwitch(supabase) {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', APP_CONFIG_KEYS.KILL_SWITCH)
    .maybeSingle();
  if (error) {
    return { active: false, source: 'error', message: error.message };
  }
  const v = data?.value;
  if (!v) return { active: false, source: 'unset', threshold: KILL_SWITCH_ACCURACY_THRESHOLD };
  const active = Boolean(v.kill_switch || v.blocked);
  return { active, source: 'app_config', payload: v };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('promote-child-0-2.mjs')) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
  checkKillSwitch(supabase).then((res) => {
    console.log(JSON.stringify(res, null, 2));
    if (res.active) {
      console.log('PROMOTE_STATUS=BLOCKED');
      process.exit(2);
    }
    console.log('PROMOTE_STATUS=ALLOWED');
    process.exit(0);
  }).catch((err) => {
    console.error('PROMOTE_FAILED:', err.message);
    process.exit(1);
  });
}
