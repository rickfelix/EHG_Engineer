#!/usr/bin/env node
/**
 * Owner backfill + reassignment worklist (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-3).
 *
 * Phase 1 of the two-phase NOT NULL migration: sets owner='coordinator-fleet' (interim) on every
 * NULL-owner periodic_process_registry row — never silently unowned — and prints the reassignment
 * worklist: every interim-owned row with a suggested real owner, so ownership converges to
 * addressable agents instead of fossilizing on the interim.
 *
 * Idempotent: skips rows that already have owners. Run BEFORE applying
 * database/migrations/20260711_periodic_process_registry_owner_not_null.sql (which pre-checks
 * for remaining NULLs and aborts loudly if this script has not run).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const INTERIM_OWNER = 'coordinator-fleet';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function suggestOwner(row) {
  if (row.process_type === 'scheduler_round') return 'eva-scheduler';
  if (row.process_type === 'role_session') return 'chairman-fleet';
  if (row.process_key.startsWith('standard_loop:')) return 'coordinator-fleet (native)';
  if (row.process_key.startsWith('gha_cron:adam-')) return 'adam';
  if (row.process_key.startsWith('gha_cron:chairman-')) return 'chairman-fleet';
  if (row.process_key.startsWith('gha_cron:eva-') || row.process_key.startsWith('cron_script:eva-')) return 'eva-scheduler';
  return 'coordinator-fleet (needs review)';
}

async function main() {
  const { data: nullRows, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, process_type')
    .is('owner', null);
  if (error) throw new Error(`NULL-owner query failed: ${error.message}`);

  if ((nullRows || []).length > 0) {
    const { error: updErr } = await supabase
      .from('periodic_process_registry')
      .update({ owner: INTERIM_OWNER, updated_at: new Date().toISOString() })
      .is('owner', null);
    if (updErr) throw new Error(`backfill update failed: ${updErr.message}`);
    console.log(`Backfilled ${nullRows.length} NULL-owner row(s) to interim owner '${INTERIM_OWNER}'.`);
  } else {
    console.log('No NULL-owner rows — backfill is a no-op.');
  }

  // Reassignment worklist: interim-owned rows that should converge to a real owner.
  const { data: interimRows, error: wlErr } = await supabase
    .from('periodic_process_registry')
    .select('process_key, process_type, display_name')
    .eq('owner', INTERIM_OWNER)
    .order('process_key');
  if (wlErr) throw new Error(`worklist query failed: ${wlErr.message}`);

  console.log(`\nREASSIGNMENT WORKLIST — ${interimRows.length} interim-owned row(s):`);
  for (const row of interimRows) {
    console.log(`  ${row.process_key.padEnd(55)} suggested: ${suggestOwner(row)}`);
  }

  const { count } = await supabase
    .from('periodic_process_registry')
    .select('process_key', { count: 'exact', head: true })
    .is('owner', null);
  console.log(`\nRemaining NULL owners: ${count ?? 'unknown'} (must be 0 before the NOT NULL migration)`);
}

main().catch((err) => {
  console.error(`[backfill-registry-owners] FAILED: ${err.message}`);
  process.exit(1);
});
