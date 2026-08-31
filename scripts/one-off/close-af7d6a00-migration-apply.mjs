#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001 (FR-3) — documented follow-up, NOT run by this SD.
 *
 * Closes chairman_decisions row af7d6a00-295e-465f-a99c-414dc4aca283 (decision_type=
 * 'migration_apply') through the canonical fn_chairman_decide RPC. Its underlying migration
 * (database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql) was already
 * applied by chairman ceremony 2026-08-30 14:57Z; the row has been stuck pending purely because
 * fn_chairman_decision_value had no mapping for decision_type='migration_apply'.
 *
 * PRECONDITION: this SD's own migration
 * (database/chairman-gated/20260831_add_migration_apply_to_decision_value.sql) must already be
 * chairman-applied, or this call raises UNMAPPED_DECISION_TYPE and this script exits non-zero.
 *
 * Usage: node scripts/one-off/close-af7d6a00-migration-apply.mjs [--decided-by "<name>"]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const DECISION_ID = 'af7d6a00-295e-465f-a99c-414dc4aca283';

const args = process.argv.slice(2);
const decidedByIdx = args.indexOf('--decided-by');
const decidedBy = decidedByIdx >= 0 ? args[decidedByIdx + 1] : 'chairman ceremony (post fn_chairman_decision_value migration_apply mapping)';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.rpc('fn_chairman_decide', {
    p_decision_id: DECISION_ID,
    p_action: 'approved',
    p_decided_by: decidedBy,
    p_rationale: 'Underlying migration (20260829_reject_path_type_aware_and_live_kill_gate.sql) was already applied 2026-08-30 14:57Z (readback clean). Row was stuck only because fn_chairman_decision_value had no mapping for decision_type=migration_apply -- fixed by SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001.',
  });

  if (error) {
    console.error('fn_chairman_decide RPC error:', error.message);
    process.exit(1);
  }
  if (!data?.success) {
    console.error('fn_chairman_decide returned failure:', JSON.stringify(data));
    process.exit(1);
  }
  console.log('Closed:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
