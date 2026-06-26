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
import { computeMinTierRank } from '../lib/fleet/sd-tier-rank.mjs';

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
  const cols = 'sd_key, sd_type, title, description, scope, strategic_intent, metadata, estimated_loc';

  if (all) {
    const { data, error } = await sb
      .from('strategic_directives_v2')
      .select(cols)
      .not('status', 'in', '(completed,cancelled,deferred)');
    if (error) throw new Error(error.message);
    const todo = (data || []).filter((sd) => !(sd.metadata && Number.isFinite(Number(sd.metadata.min_tier_rank))));
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

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
