#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ROADMAP-CORPUS-HYGIENE-001 — FR-2
 *
 * Consumes the census report (FR-1) and cures every family-cure + standalone-curable
 * row by setting item_disposition='dropped' — the pre-existing AFTER UPDATE OF
 * item_disposition trigger (trg_stamp_plan_of_record_remainder_state,
 * database/migrations/20260719a_plan_of_record_remainder_view.sql:93-104) fires
 * automatically and derives remainder_state='void' via the canonical
 * stamp_plan_of_record_remainder_state() function. remainder_state is NEVER written
 * directly by this script.
 *
 * metadata.corpus_hygiene provenance is added additively (existing metadata spread,
 * never overwritten).
 *
 * Dry-run by default — pass --execute to actually write.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { lazyServiceClient } from '../lib/supabase-client.js';
import { runCensus } from './roadmap-corpus-hygiene-census.mjs';

const SD_KEY = 'SD-LEO-INFRA-ROADMAP-CORPUS-HYGIENE-001';

export async function cureRow(supabase, row, classification) {
  const { data: existing, error: readErr } = await supabase
    .from('roadmap_wave_items')
    .select('metadata')
    .eq('id', row.id)
    .single();
  if (readErr) throw readErr;

  const metadata = {
    ...(existing.metadata || {}),
    corpus_hygiene: {
      sd_key: SD_KEY,
      cured_at: new Date().toISOString(),
      classification,
      canonical_member_id: row.canonical_member_id || null,
    },
  };

  const { error } = await supabase
    .from('roadmap_wave_items')
    .update({ item_disposition: 'dropped', metadata })
    .eq('id', row.id);
  if (error) throw error;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const supabase = lazyServiceClient();
  const report = await runCensus(supabase);

  console.log(`Census: ${report.family_cure_count} family-cure, ${report.standalone_curable_count} standalone-curable`);
  if (report.standalone_unclassified_count > 0) {
    console.log(`⚠️  ${report.standalone_unclassified_count} standalone rows are NOT classified (new since PRD authoring) — skipping them, not curing.`);
  }

  const onlyFamily = process.argv.includes('--only-family');
  const toCure = [
    ...report.family_cure.map((r) => ({ ...r, classification: 'family-cure' })),
    ...(onlyFamily ? [] : report.standalone_curable.map((r) => ({ ...r, classification: 'standalone-non-buildable' }))),
  ];
  if (onlyFamily) {
    console.log(`--only-family: excluding ${report.standalone_curable_count} standalone-curable rows from this run.`);
  }

  if (!execute) {
    console.log(`\nDRY RUN — would cure ${toCure.length} rows. Pass --execute to apply.`);
    return;
  }

  let cured = 0;
  for (const row of toCure) {
    await cureRow(supabase, row, row.classification);
    cured++;
    if (cured % 50 === 0) console.log(`  ...${cured}/${toCure.length}`);
  }
  console.log(`\n✅ Cured ${cured} rows.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
