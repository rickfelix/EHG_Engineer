#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-4): census-as-code for ventures currently in
 * unbounded-retry posture -- a venture/stage with attempt count >= GATE_RETRY_CEILING that is
 * NOT yet terminalized (gating_decision.parked !== true). Post-ship this should read 0; a
 * nonzero count means the FR-1/FR-2 guard is not being reached for that venture (e.g. an older
 * worker process still running, or a new un-guarded write path).
 *
 * Usage: node scripts/eva/census-unbounded-retry.mjs
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { GATE_RETRY_CEILING } from '../../lib/eva/gate-retry-guard.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

/**
 * Pure-ish query function (exported for unit testing with a mock supabase client).
 *
 * Paginates via .range() rather than one unbounded .select() -- PostgREST silently caps an
 * unbounded select at 1000 rows (SECURITY finding SEC-1 / TESTING finding, evidence
 * 7b1758b7/11345782: the table held 1902 attempt rows for ApexNiche alone, so a single .select()
 * truncated the count and could produce a false "0 unbounded ventures" on a table this size).
 *
 * @returns {Promise<Array<{venture_id:string, stage_number:number, attempt_count:number}>>}
 */
export async function findUnboundedRetryVentures(supabase, { ceiling = GATE_RETRY_CEILING, pageSize = 1000 } = {}) {
  const counts = new Map();
  let offset = 0;
  for (;;) {
    const { data: page, error } = await supabase
      .from('eva_stage_gate_attempts')
      .select('venture_id, stage_number')
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`[census-unbounded-retry] attempts query failed: ${error.message}`);
    }
    for (const row of page || []) {
      const key = `${row.venture_id}::${row.stage_number}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (!page || page.length < pageSize) break;
    offset += pageSize;
  }

  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= ceiling)
    .map(([key, count]) => {
      const [venture_id, stage_number] = key.split('::');
      return { venture_id, stage_number: Number(stage_number), attempt_count: count };
    });

  if (candidates.length === 0) return [];

  const ventureIds = [...new Set(candidates.map((c) => c.venture_id))];
  // .limit(999): ventureIds is inherently small in practice (the distinct venture/stage pairs
  // that crossed GATE_RETRY_CEILING -- the whole point of this census is that count should be
  // ~0 in steady state), but an explicit bound keeps this select provably bounded rather than
  // relying on .in()'s practical size limits alone (count-truncation-diff-lint requires a
  // recognized bounding marker: single()/maybeSingle()/limit(<1000)/range()/fetchAllPaginated).
  const { data: ventures, error: ventureErr } = await supabase
    .from('ventures')
    .select('id, metadata')
    .in('id', ventureIds)
    .limit(999);
  if (ventureErr) {
    throw new Error(`[census-unbounded-retry] ventures query failed: ${ventureErr.message}`);
  }
  const parkedIds = new Set(
    (ventures || [])
      .filter((v) => v.metadata?.gating_decision?.parked === true)
      .map((v) => v.id)
  );

  return candidates.filter((c) => !parkedIds.has(c.venture_id));
}

async function run() {
  const supabase = createSupabaseServiceClient();
  const unbounded = await findUnboundedRetryVentures(supabase);
  console.log(`Ventures in unbounded-retry posture (attempt_count >= ${GATE_RETRY_CEILING}, not terminalized): ${unbounded.length}`);
  for (const v of unbounded) {
    console.log(`  venture=${v.venture_id} stage=${v.stage_number} attempts=${v.attempt_count}`);
  }
  if (unbounded.length > 0) process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
