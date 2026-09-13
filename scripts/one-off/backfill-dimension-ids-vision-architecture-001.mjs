#!/usr/bin/env node
/**
 * Backfill stable dimension ids into existing eva_vision_documents /
 * eva_architecture_plans rows. SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 (FR-4).
 *
 * Dry-run by default (report only, zero writes). Pass --execute to persist.
 * On write, appends one {event:'dimension_id_backfill', timestamp, mapping}
 * entry to the row's own addendums (existing append-only log column) naming
 * the position-to-id mapping, so a historical V-/A-code citation stays
 * resolvable by reading that row's addendums.
 *
 * Usage:
 *   node scripts/one-off/backfill-dimension-ids-vision-architecture-001.mjs
 *   node scripts/one-off/backfill-dimension-ids-vision-architecture-001.mjs --execute
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { assignDimensionIds } from '../../lib/eva/dimension-ids.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');

const TABLES = [
  { table: 'eva_vision_documents', prefix: 'V', keyCol: 'vision_key' },
  { table: 'eva_architecture_plans', prefix: 'A', keyCol: 'plan_key' },
];

export function buildPositionalMapping(enrichedDimensions, prefix) {
  return enrichedDimensions.map((d, i) => ({
    position: i,
    positional_code: `${prefix}${String(i + 1).padStart(2, '0')}`,
    id: d.id,
  }));
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let totalRows = 0;
  let totalDimsAssigned = 0;
  let totalCollisions = 0;
  let touchedEhg = false;

  for (const { table, prefix, keyCol } of TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id, ${keyCol}, extracted_dimensions, addendums`)
      .not('extracted_dimensions', 'is', null);

    if (error) {
      console.error(`[backfill] ${table} query failed: ${error.message}`);
      process.exitCode = 1;
      continue;
    }

    for (const row of rows || []) {
      const dims = row.extracted_dimensions;
      if (!Array.isArray(dims) || dims.length === 0) continue;
      const missing = dims.filter((d) => !d?.id);
      if (missing.length === 0) continue;

      totalRows++;
      const enriched = assignDimensionIds(dims);
      const ids = enriched.map((d) => d.id);
      const uniqueIds = new Set(ids);
      const collisions = ids.length - uniqueIds.size;
      totalCollisions += collisions;
      totalDimsAssigned += missing.length;

      const keyVal = row[keyCol];
      console.log(
        `[backfill] ${table} ${keyVal}: ${missing.length}/${dims.length} dimension(s) assigned ids` +
        (collisions ? ` (⚠️ ${collisions} COLLISIONS)` : ''),
      );

      if (String(keyVal).toUpperCase().includes('EHG')) touchedEhg = true;

      if (EXECUTE) {
        const mapping = buildPositionalMapping(enriched, prefix);
        const addendums = [
          ...(row.addendums || []),
          { event: 'dimension_id_backfill', timestamp: new Date().toISOString(), mapping },
        ];
        const { error: updateError } = await supabase
          .from(table)
          .update({ extracted_dimensions: enriched, addendums })
          .eq('id', row.id);
        if (updateError) {
          console.error(`[backfill] ${table} ${keyVal}: WRITE FAILED: ${updateError.message}`);
          process.exitCode = 1;
        }
      }
    }
  }

  console.log('');
  console.log(
    `[backfill] ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'} summary: ${totalRows} row(s) touched, ` +
    `${totalDimsAssigned} dimension(s) assigned new ids, ${totalCollisions} collision(s).`,
  );
  if (!EXECUTE) {
    console.log('[backfill] Dry-run made zero writes. Re-run with --execute to persist.');
  } else if (touchedEhg) {
    console.log(
      '[backfill] ⚠️  EHG vision/arch document(s) were backfilled. Regenerate ' +
      'tests/fixtures/ehg-baseline-score.json (see tests/unit/eva/ehg-self-scoring-regression-pin.test.js) ' +
      'before relying on its default-skipped LIVE mode.',
    );
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[backfill] FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
