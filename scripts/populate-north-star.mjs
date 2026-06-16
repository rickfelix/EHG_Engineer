#!/usr/bin/env node
/**
 * populate-north-star.mjs — SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001 (FR-1 data step)
 *
 * Idempotently upserts the SINGLE canonical chairman-ratified north_star record from the
 * chairman's durably-recorded ratification (SD metadata.north_star_ratification). Kept separate
 * from the additive DDL migration so the migration stays purely TIER-1.
 *
 * Source of authority: the chairman ratified via AskUserQuestion 2026-06-16 (CONST-002) —
 * EHG monthly net profit ≥ $18,000/mo, sustained 6 consecutive months.
 *
 * Usage: node scripts/populate-north-star.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const SD_KEY = 'SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001';

function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/** PURE — build the canonical record from the durable ratification metadata. */
export function buildRecord(ratification) {
  if (!ratification || ratification.status !== 'chairman_ratified') {
    throw new Error('north_star_ratification missing or not chairman_ratified — refusing to fabricate');
  }
  if (!ratification.target || typeof ratification.target.amount !== 'number') {
    throw new Error('north_star_ratification.target.amount missing — refusing to persist a record with no target');
  }
  return {
    definition: `EHG income-replacement: monthly ${ratification.metric} of $${ratification.target.amount}/${(ratification.target.unit || '$/mo').replace('$/', '')} net, sustained ${ratification.sustain}. Leading sub-target: ${ratification.leading_sub_target}.`,
    metric: ratification.metric,
    target: ratification.target,
    sustain: ratification.sustain,
    measurement_source: 'income_capture_monthly (net profit; honest until instrumented)',
    cadence: 'monthly',
    status: 'chairman_ratified',
    provenance: {
      decided_at: ratification.decided_at,
      decided_via: ratification.decided_via,
      sub_targets: { venture_count: ratification.leading_sub_target },
      source_sd: SD_KEY,
    },
  };
}

async function main() {
  const db = client();
  const { data: sd, error: e0 } = await db.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', SD_KEY).single();
  if (e0) throw new Error(`load SD failed: ${e0.message}`);
  const ratification = sd?.metadata?.north_star_ratification;
  const record = buildRecord(ratification);

  if (DRY) {
    console.log('[dry-run] would upsert north_star record:\n', JSON.stringify(record, null, 2));
    return;
  }

  // Idempotent: if a chairman_ratified row exists, update it; else insert.
  const { data: existing } = await db.from('north_star')
    .select('id').eq('status', 'chairman_ratified').limit(1);
  let res;
  if (existing && existing[0]) {
    res = await db.from('north_star')
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id).select('id').single();
  } else {
    res = await db.from('north_star').insert(record).select('id').single();
  }
  if (res.error) throw new Error(`upsert failed: ${res.error.message}`);
  console.log(`✅ north_star canonical record ${existing && existing[0] ? 'updated' : 'inserted'}: ${res.data.id}`);
}

// Entry-point guard: run main() ONLY as a CLI, never on import. Without this, importing
// buildRecord (e.g. from the test suite) would execute main() and write to the production
// north_star table. (Adversarial-review CRITICAL.)
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
