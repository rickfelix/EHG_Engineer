#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-4) -- POST-MERGE production alarm for the
 * liveness-SSOT defect class: a claude_sessions row that reached a terminal status without
 * is_alive:false landing in the same statement.
 *
 * CORRECTED PREDICATE (current-status-gated), not the originally-worded one. The original
 * wording -- "status='released' OR stale_at IS SET, AND is_alive=true" -- is unsatisfiable by
 * construction: stale_at is never cleared when a session returns to status='active', so a
 * currently-healthy session with a leftover stale_at timestamp permanently violates the literal
 * predicate. Measured live 2026-09-05 (validation-agent e523e69f, re-measured by PLAN-phase
 * testing-agent bb6a3a1f): of ~2,106 rows flagged under the unsatisfiable predicate, only 2 were
 * that false-positive class; the other 2,104 were genuine status='released' + is_alive=true
 * contradictions. The corrected predicate below excludes the false-positive class by construction.
 *
 * FR-1's chokepoint + census-completeness test is the PRE-MERGE gate (a new writer cannot ship
 * without routing through terminalSessionUpdate()); this script is the POST-MERGE alarm --
 * neither substitutes for the other.
 *
 *   node scripts/session-liveness-ssot-exit-predicate-check.mjs
 *
 * READS THE COUNT VIA {count:'exact', head:true} — never data.length off a capped SELECT. This
 * environment's measured db-max-rows cap truncates a plain .limit(5000) SELECT at 1000 actual
 * rows, so a naive `.select('id').then(d => d.data.length)` would silently under-report a
 * population in the thousands as 1000.
 *
 * POPULATION CANARY (security-agent EXEC review, dd020db5): a downgraded/rotated service-role
 * credential that gets silently RLS-filtered returns {count:0, error:null} from PostgREST --
 * indistinguishable from a genuinely clean population using the violation count alone. Live
 * reproduction: an anon key against this same table also returns count:0/error:null. Without a
 * denominator, this exact alarm -- built for an 8.6-hour incident class -- would print
 * "PASS: zero violations" forever under a fail-open credential, which is the WORSE failure mode
 * this SD's whole premise is closing. The canary reads the TOTAL (unfiltered) claude_sessions
 * count alongside the violation count; a total of 0 refuses to report a pass at all.
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const SAMPLE_LIMIT = 10;

/**
 * Count rows violating the corrected predicate: status IN ('released','stale') AND is_alive=true.
 * Returns a small sample (bounded, display-only -- never used for the count) alongside it.
 */
export async function checkLivenessSsotExitPredicate(supabase, { sampleLimit = SAMPLE_LIMIT } = {}) {
  // Population canary -- see header. Must be checked BEFORE trusting a zero violation count.
  const { count: totalPopulation, error: totalError } = await supabase
    .from('claude_sessions')
    .select('session_id', { count: 'exact', head: true });
  if (totalError) throw new Error(`population canary query failed: ${totalError.message}`);

  const { count, error: countError } = await supabase
    .from('claude_sessions')
    .select('session_id', { count: 'exact', head: true })
    .in('status', ['released', 'stale'])
    .eq('is_alive', true);
  if (countError) throw new Error(`count query failed: ${countError.message}`);

  const { data: sample, error: sampleError } = await supabase
    .from('claude_sessions')
    .select('session_id, status, is_alive, released_at, stale_at, released_reason')
    .in('status', ['released', 'stale'])
    .eq('is_alive', true)
    .limit(sampleLimit);
  if (sampleError) throw new Error(`sample query failed: ${sampleError.message}`);

  return { count: count ?? 0, sample: sample ?? [], totalPopulation: totalPopulation ?? 0 };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const { count, sample, totalPopulation } = await checkLivenessSsotExitPredicate(supabase);

  if (totalPopulation === 0) {
    console.error('FAIL: claude_sessions population canary read 0 total rows -- refusing to report a pass. This is almost certainly a credential/RLS visibility failure (a fail-open, not a genuinely empty fleet table), since a "0 violations" result under the same failure would be indistinguishable from a real clean pass.');
    process.exit(1);
  }

  console.log(`session-liveness-ssot-exit-predicate-check: violations=${count} of ${totalPopulation} total (status IN ('released','stale') AND is_alive=true)`);
  for (const row of sample) {
    console.log(`  ${row.session_id}  status=${row.status} released_at=${row.released_at ?? 'null'} stale_at=${row.stale_at ?? 'null'} released_reason=${row.released_reason ?? 'null'}`);
  }
  if (count > sample.length) {
    console.log(`  ...and ${count - sample.length} more (sample limited to ${SAMPLE_LIMIT})`);
  }

  if (count > 0) {
    console.error(`FAIL: ${count} claude_sessions row(s) violate the liveness-SSOT exit predicate.`);
    process.exit(1);
  }
  console.log('PASS: zero violations.');
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('session-liveness-ssot-exit-predicate-check failed:', e.message);
    process.exit(1);
  });
}
