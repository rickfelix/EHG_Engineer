#!/usr/bin/env node
/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-6) -- CI-asserted exit predicate (ratification
 * 49656c8c): a quick_fixes row whose oracle-hold marker cites a consult row absent from BOTH
 * session_coordination and retention_archive is an orphaned marker -- FR-1's archive-aware
 * lookup means this class should never recur once the fix is live; this check catches a future
 * regression rather than relying on it being noticed live months later.
 *
 * Reuses scripts/session-liveness-ssot-exit-predicate-check.mjs's population-canary + service-role
 * -guard scaffolding: a downgraded/rotated service-role credential that gets silently RLS-filtered
 * returns count:0/error:null, indistinguishable from a genuinely clean population using the
 * violation count alone. The canary reads the total oracle-held-QF population; a total of 0
 * refuses to report a pass at all.
 *
 *   node scripts/oracle-hold-orphaned-marker-exit-predicate-check.mjs
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { QF_ORACLE_HOLD_PREFIX, extractConsultRowIdFromQfCondition } from '../lib/fleet/hold-writer.js';

export async function checkOrphanedOracleHoldMarkers(supabase) {
  // count-truncation-diff-lint: 999 (just under the PostgREST 1000-row cap) bounds every read
  // below -- the currently oracle-held QF population is operationally small, but each read still
  // needs an explicit, visible bound. `ids` (used by the two existence checks) is a derived list
  // from this same bounded `held` read, so it inherits the same bound.
  const { data: held, error } = await supabase
    .from('quick_fixes')
    .select('id, release_condition')
    .eq('owner', 'chairman')
    .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`)
    .limit(999);
  if (error) throw new Error(`held-QF query failed: ${error.message}`);

  const totalHeld = (held || []).length;
  const withConsultRow = (held || [])
    .map((qf) => ({ id: qf.id, consultRowId: extractConsultRowIdFromQfCondition(qf.release_condition) }))
    .filter((r) => r.consultRowId);

  if (withConsultRow.length === 0) return { count: 0, sample: [], totalPopulation: totalHeld };

  const ids = withConsultRow.map((r) => r.consultRowId);
  const { data: live, error: liveErr } = await supabase.from('session_coordination').select('id').in('id', ids).limit(999);
  if (liveErr) throw new Error(`session_coordination existence query failed: ${liveErr.message}`);
  const { data: archived, error: archErr } = await supabase
    .from('retention_archive').select('source_id').eq('source_table', 'session_coordination').in('source_id', ids).limit(999);
  if (archErr) throw new Error(`retention_archive existence query failed: ${archErr.message}`);

  const liveIds = new Set((live || []).map((r) => r.id));
  const archivedIds = new Set((archived || []).map((r) => r.source_id));
  const orphaned = withConsultRow.filter((r) => !liveIds.has(r.consultRowId) && !archivedIds.has(r.consultRowId));

  return { count: orphaned.length, sample: orphaned.slice(0, 10), totalPopulation: totalHeld };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const { count, sample, totalPopulation } = await checkOrphanedOracleHoldMarkers(supabase);

  if (totalPopulation === 0) {
    console.log('oracle-hold-orphaned-marker-exit-predicate-check: 0 currently oracle-held QFs -- nothing to check (genuinely empty population, not a credential failure: an empty result here is a normal steady state, unlike claude_sessions which is never empty).');
    process.exit(0);
  }

  console.log(`oracle-hold-orphaned-marker-exit-predicate-check: orphaned=${count} of ${totalPopulation} currently oracle-held QF(s)`);
  for (const row of sample) console.log(`  ${row.id}  consult_row=${row.consultRowId} (absent from both session_coordination and retention_archive)`);
  if (count > sample.length) console.log(`  ...and ${count - sample.length} more (sample limited to 10)`);

  if (count > 0) {
    console.error(`FAIL: ${count} quick_fixes row(s) carry an oracle-hold marker citing a consult row absent from both tables.`);
    process.exit(1);
  }
  console.log('PASS: zero orphaned markers.');
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('oracle-hold-orphaned-marker-exit-predicate-check failed:', e.message);
    process.exit(1);
  });
}
