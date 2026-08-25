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
 * @returns {Promise<Array<{venture_id:string, stage_number:number, attempt_count:number}>>}
 */
export async function findUnboundedRetryVentures(supabase, { ceiling = GATE_RETRY_CEILING } = {}) {
  const { data: attempts, error } = await supabase
    .from('eva_stage_gate_attempts')
    .select('venture_id, stage_number');
  if (error) {
    throw new Error(`[census-unbounded-retry] attempts query failed: ${error.message}`);
  }

  const counts = new Map();
  for (const row of attempts || []) {
    const key = `${row.venture_id}::${row.stage_number}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= ceiling)
    .map(([key, count]) => {
      const [venture_id, stage_number] = key.split('::');
      return { venture_id, stage_number: Number(stage_number), attempt_count: count };
    });

  if (candidates.length === 0) return [];

  const ventureIds = [...new Set(candidates.map((c) => c.venture_id))];
  const { data: ventures, error: ventureErr } = await supabase
    .from('ventures')
    .select('id, metadata')
    .in('id', ventureIds);
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
