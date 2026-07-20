#!/usr/bin/env node
// Stamp strategic_directives_v2.metadata.min_tier_rank for one SD (or every active SD that
// lacks it) using the FR-1 rubric. SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001.
//
//   node scripts/stamp-sd-tier-rank.mjs <SD-KEY>     # stamp one SD
//   node scripts/stamp-sd-tier-rank.mjs --all         # stamp all unstamped active SDs
//   node scripts/stamp-sd-tier-rank.mjs <SD-KEY> --dry # compute + print, do not write
//
// Additive: writes only the metadata.min_tier_rank JSONB key (no schema change). Idempotent.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { computeMinTierRank } from '../lib/fleet/sd-tier-rank.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

// SD-LEO-INFRA-TIER-RANK-STARVATION-DURABLE-FIX-001 (FR-1): the SELECT columns for the stamper.
// estimated_loc is NOT a column on strategic_directives_v2 — selecting it errored on EVERY SD (PostgREST
// "column does not exist"), so no SD ever got stamped -> min_tier_rank=UNDEFINED -> the 6cf5c558 tier-idle
// bug treated every SD as above-rung -> the fleet starved on unclaimable work (RCA: Adam 47b15430).
// computeMinTierRank already falls back to metadata.estimated_loc (sd-tier-rank.mjs:64), so the LOC
// contribution still works for SDs that carry it in metadata. Exported so a regression test can pin it to
// real columns and fail loudly if a phantom column is ever re-added.
export const STAMP_SELECT_COLS = 'sd_key, sd_type, title, description, scope, strategic_intent, metadata';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function stampOne(sb, sd, dry) {
  const rank = computeMinTierRank(sd);
  if (dry) {
    console.log(`[dry] ${sd.sd_key}: min_tier_rank=${rank}`);
    return rank;
  }
  const metadata = { ...(sd.metadata || {}), min_tier_rank: rank };
  const { error } = await sb.from('strategic_directives_v2').update({ metadata }).eq('sd_key', sd.sd_key);
  if (error) throw new Error(`update ${sd.sd_key} failed: ${error.message}`);
  console.log(`✓ ${sd.sd_key}: min_tier_rank=${rank}`);
  return rank;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const all = args.includes('--all');
  const key = args.find((a) => !a.startsWith('--'));
  if (!all && !key) {
    console.error('Usage: stamp-sd-tier-rank.mjs <SD-KEY> | --all [--dry]');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const cols = STAMP_SELECT_COLS;

  if (all) {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 grows
    // unbounded; small today, but not provably <1000 long-term. Paginate.
    let data;
    try {
      data = await fetchAllPaginated(() => sb
        .from('strategic_directives_v2')
        .select(cols)
        .not('status', 'in', '(completed,cancelled,deferred)')
        .order('sd_key', { ascending: true }));
    } catch (e) {
      throw new Error(e.message);
    }
    const todo = data.filter((sd) => !(sd.metadata && Number.isFinite(Number(sd.metadata.min_tier_rank))));
    console.log(`Stamping ${todo.length} unstamped active SD(s)...`);
    for (const sd of todo) await stampOne(sb, sd, dry);
    return;
  }

  const { data: sd, error } = await sb.from('strategic_directives_v2').select(cols).eq('sd_key', key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!sd) {
    console.error(`SD not found: ${key}`);
    process.exit(1);
  }
  await stampOne(sb, sd, dry);
}

// SD-LEO-INFRA-TIER-RANK-STARVATION-DURABLE-FIX-001 (FR-1): run main() ONLY when invoked directly, so a
// test can import STAMP_SELECT_COLS (and the helpers) without triggering a DB run / process.exit.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
