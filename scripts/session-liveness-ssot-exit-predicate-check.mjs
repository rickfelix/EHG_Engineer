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

  return { count: count ?? 0, sample: sample ?? [] };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const { count, sample } = await checkLivenessSsotExitPredicate(supabase);

  console.log(`session-liveness-ssot-exit-predicate-check: violations=${count} (status IN ('released','stale') AND is_alive=true)`);
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
