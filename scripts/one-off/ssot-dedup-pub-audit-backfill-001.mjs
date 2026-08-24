#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 FR-3(b) -- backfill the 22 currently-unclassified
 * leo_protocol_sections rows (all Adam/Solomon/Coordinator manual/provenance/role-contract
 * content) with an explicit metadata.publication_status, now that FR-3(a)'s write-side fix
 * (improvement-appliers.js) prevents new rows from landing unclassified.
 *
 * Every row here is live, current governance content (not superseded) -- classified 'file'.
 * Rows with a null target_file additionally get a publication_note so
 * protocol-publication-audit.cjs's advisory darkUnreviewed check stays clean too, even though
 * that check does not gate the audit's own pass/fail exit code.
 *
 * Usage: node scripts/one-off/ssot-dedup-pub-audit-backfill-001.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const { data: rows, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, section_type, target_file, metadata');
  if (error) { console.error('FETCH ERR', error.message); process.exit(1); }

  const unclassified = rows.filter((r) => !(r.metadata && r.metadata.publication_status));
  console.log(`Found ${unclassified.length} unclassified rows.`);

  let updated = 0;
  for (const row of unclassified) {
    const existingMeta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? row.metadata : {};
    const newMetadata = {
      ...existingMeta,
      publication_status: 'file',
      ...(row.target_file ? {} : { publication_note: `Live governance content (${row.section_type}); no target_file but not superseded -- classified during SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001's FR-3(b) backfill.` }),
    };
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Row ${row.id} (${row.section_type}): publication_status -> file`);
    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .from('leo_protocol_sections')
        .update({ metadata: newMetadata })
        .eq('id', row.id);
      if (updErr) {
        console.error(`FAILED row ${row.id}: ${updErr.message}`);
        continue;
      }
    }
    updated++;
  }
  console.log(`${DRY_RUN ? 'Would classify' : 'Classified'} ${updated}/${unclassified.length} rows.`);
}

if (isMainModule(import.meta.url)) main();
