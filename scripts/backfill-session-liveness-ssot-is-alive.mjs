#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-5) -- one-time idempotent backfill of existing
 * claude_sessions rows contradicting the corrected liveness-SSOT predicate: status IN
 * ('released','stale') AND is_alive=true. Sets is_alive=false on every matching row.
 *
 * WHY A COUNT-DELTA LOOP, NOT A SINGLE UPDATE + data.length. PLAN-phase testing-agent (bb6a3a1f)
 * found the population (~2,104 rows measured live 2026-09-05) EXCEEDS this environment's measured
 * db-max-rows cap of 1000: a naive .update(...).select('id') then data.length undercounts (returns
 * 1000, not ~2,104), and if the SAME cap also bounds the actual WRITE (not just the SELECT-back), a
 * second idempotent run would affect the remaining ~1,104 rows and falsely fail an idempotency check
 * expecting 0 on re-run. This script instead brackets EVERY UPDATE pass with two separate
 * {count:'exact', head:true} queries against the identical predicate and takes the pre/post delta
 * as the affected-row count for that pass -- correct regardless of any row-count cap on the UPDATE's
 * own return payload -- and loops passes until the predicate count reaches zero. A second run of the
 * whole script then measures 0 on its very first count and performs no UPDATE at all, which is what
 * makes it idempotent by construction rather than by assumption.
 *
 *   node scripts/backfill-session-liveness-ssot-is-alive.mjs             # run for real
 *   node scripts/backfill-session-liveness-ssot-is-alive.mjs --dry-run   # count only, write nothing
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const MAX_ITERATIONS = 20;

async function countViolations(supabase) {
  const { count, error } = await supabase
    .from('claude_sessions')
    .select('session_id', { count: 'exact', head: true })
    .in('status', ['released', 'stale'])
    .eq('is_alive', true);
  if (error) throw new Error(`count query failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Run the backfill. Pure of console/process side effects so it is directly testable; the CLI
 * wrapper (main(), below) owns all console.log/process.exit.
 *
 * @param {object} supabase - injected client
 * @param {{dryRun?: boolean, maxIterations?: number}} [opts]
 * @returns {Promise<{totalAffected: number, iterations: {before:number, after:number, affected:number}[], finalCount: number, stalled: boolean}>}
 */
export async function runLivenessSsotBackfill(supabase, { dryRun = false, maxIterations = MAX_ITERATIONS } = {}) {
  const initialCount = await countViolations(supabase);
  if (dryRun || initialCount === 0) {
    return { totalAffected: 0, iterations: [], finalCount: initialCount, stalled: false };
  }

  const iterations = [];
  let totalAffected = 0;
  let stalled = false;

  for (let i = 0; i < maxIterations; i += 1) {
    const before = await countViolations(supabase);
    if (before === 0) break;

    const { error: updateError } = await supabase
      .from('claude_sessions')
      .update({ is_alive: false })
      .in('status', ['released', 'stale'])
      .eq('is_alive', true);
    if (updateError) throw new Error(`update failed on iteration ${i}: ${updateError.message}`);

    const after = await countViolations(supabase);
    const affected = before - after;
    iterations.push({ before, after, affected });
    totalAffected += affected;

    if (affected <= 0) {
      // The UPDATE made no measurable progress -- stop rather than spin forever. A caller-visible
      // stall is safer than silently looping MAX_ITERATIONS times against an unresponsive predicate.
      stalled = true;
      break;
    }
    if (after === 0) break;
  }

  const finalCount = await countViolations(supabase);
  return { totalAffected, iterations, finalCount, stalled };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const dryRun = process.argv.includes('--dry-run');

  const result = await runLivenessSsotBackfill(supabase, { dryRun });

  if (dryRun) {
    console.log(`DRY RUN: ${result.finalCount} row(s) currently violate the predicate. Re-run without --dry-run to backfill.`);
    process.exit(0);
  }

  console.log(`backfill complete: totalAffected=${result.totalAffected} passes=${result.iterations.length} finalCount=${result.finalCount}`);
  for (const [i, pass] of result.iterations.entries()) {
    console.log(`  pass ${i + 1}: before=${pass.before} after=${pass.after} affected=${pass.affected}`);
  }

  if (result.stalled) {
    console.error(`STALLED: an UPDATE pass affected zero rows while ${result.finalCount} still violate the predicate.`);
    process.exit(1);
  }
  if (result.finalCount > 0) {
    console.error(`INCOMPLETE: ${result.finalCount} row(s) still violate the predicate after ${MAX_ITERATIONS} passes.`);
    process.exit(1);
  }
  console.log('PASS: zero violations remain.');
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('backfill-session-liveness-ssot-is-alive failed:', e.message);
    process.exit(1);
  });
}
