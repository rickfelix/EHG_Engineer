#!/usr/bin/env node
/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 — FR-4
 *
 * One-time re-baseline for the measured defect class: claude_sessions rows carrying
 * metadata.tier_rank set while metadata.model/metadata.effort are BOTH unset. Per
 * lib/fleet/tier-ladder.cjs's own doc comments (resolveWorkerTierRank / stampRankForWorker),
 * such a row's persisted tier_rank can be stale relative to the seat's actual verified
 * capability -- resolveWorkerTierRank reads the persisted number rather than re-deriving it.
 *
 * This script does NOT invent a model/effort for a seat -- it only re-stamps rows where the
 * FLEET-WIDE operator-confirmed reality (sonnet/medium, per the two-week disclosure this SD's
 * evidence is built on) is the correction, recording that basis in tier_rank_source so a future
 * reader knows this was a bulk correction, not an individually-verified stamp.
 *
 * Dry-run by default; --execute applies. Idempotent -- a second run finds zero rows to fix.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require_ = createRequire(import.meta.url);
const { rankForModelEffort } = require_('../lib/fleet/tier-ladder.cjs');

const SD_KEY = 'SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001';
const CONFIRMED_MODEL = 'sonnet';
const CONFIRMED_EFFORT = 'medium';

export function findDefectRows(sessions) {
  return sessions.filter((s) => {
    const m = s.metadata || {};
    return m.tier_rank != null && !m.model && !m.effort;
  });
}

export function buildRestamp(row) {
  const trueRank = rankForModelEffort(CONFIRMED_MODEL, CONFIRMED_EFFORT);
  return {
    session_id: row.session_id,
    metadata: {
      ...(row.metadata || {}),
      tier_rank: trueRank,
      tier_rank_source: `bulk_rebaseline:${SD_KEY}`,
    },
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sessions, error } = await supabase.from('claude_sessions').select('session_id, status, metadata').eq('status', 'active');
  if (error) throw error;

  const defects = findDefectRows(sessions);
  console.log(`Active sessions: ${sessions.length}`);
  console.log(`Defect rows (tier_rank set, model+effort unset): ${defects.length}`);
  for (const d of defects) console.log(`  ${d.session_id}: tier_rank=${d.metadata.tier_rank}`);

  if (!execute) {
    console.log(`\nDRY RUN — would re-stamp ${defects.length} row(s). Pass --execute to apply.`);
    return;
  }

  let fixed = 0;
  for (const row of defects) {
    const { session_id, metadata } = buildRestamp(row);
    const { error: updErr } = await supabase.from('claude_sessions').update({ metadata }).eq('session_id', session_id);
    if (updErr) { console.error(`  FAILED ${session_id}: ${updErr.message}`); continue; }
    fixed++;
  }
  console.log(`\n✅ Re-stamped ${fixed}/${defects.length} rows.`);

  // Readback
  const { data: after } = await supabase.from('claude_sessions').select('session_id, metadata').eq('status', 'active');
  const remaining = findDefectRows(after || []);
  console.log(`Readback: ${remaining.length} defect row(s) remain (expect 0).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
