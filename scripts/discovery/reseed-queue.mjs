#!/usr/bin/env node
/**
 * Archive-first reversible reseed of the opportunity_blueprints queue.
 * SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001 (FR-2)
 *
 * Classifies the stale queue rows (E2E fixtures vs real ideas) and archives
 * ALL of them via IN-TABLE reversibility: is_active=false + metadata
 * archive stamps. NOT retention_archive — keeps live queryability + FKs
 * (PURGE-UNDO ≠ DR). Reversal = flip is_active back to true.
 *
 * Reseed happens at the FIRST LIVE SCAN (explicit chairman/CLI invocation —
 * out of scope here); this script leaves the active queue empty and ready.
 *
 * Usage:
 *   node scripts/discovery/reseed-queue.mjs            # dry-run (default)
 *   node scripts/discovery/reseed-queue.mjs --apply    # archive for real
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — this script's own docstring
// promises to archive ALL active rows; a PostgREST-capped read would silently leave rows
// beyond the cap un-archived while reporting "reseed-ready". Paginate to completion.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const SD_KEY = 'SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001';

export function classify(row) {
  // Validation-enumerated sentinels: fixtures carry the 'E2E Test:' title
  // prefix and source_type='manual'; real ideas are ai_generated.
  if (/^E2E Test:/i.test(row.title || '') || row.source_type === 'manual') return 'e2e_fixture';
  return 'real_idea';
}

/**
 * Pure: does this row represent realized, consumed calibration ground truth that must be
 * excluded from the archival sweep? SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 (VALIDATION
 * finding, evidence cf18a4ae): without this, every is_active=true row -- including one already
 * read by the calibration cohort -- was archived unconditionally, silently re-zeroing the
 * vision gauge's "Calibrate the gates" probe on the next --apply run.
 * @param {object} row - {metadata}
 * @returns {boolean}
 */
export function isCalibrationProtected(row) {
  return Boolean(row?.metadata?.calibration_read_at);
}

/** Pure: split rows into {protected, sweepable} per isCalibrationProtected(). */
export function partitionByCalibration(rows) {
  const protectedRows = [];
  const sweepable = [];
  for (const row of (rows || [])) {
    (isCalibrationProtected(row) ? protectedRows : sweepable).push(row);
  }
  return { protectedRows, sweepable };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
  const db = createClient(url, key);

  let rows;
  try {
    rows = await fetchAllPaginated(() => db
      .from('opportunity_blueprints')
      .select('id, title, source_type, is_active, metadata')
      .eq('is_active', true)
      .order('id', { ascending: true }));
  } catch (e) { console.error('read failed:', e.message); process.exit(1); }

  // SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 (VALIDATION finding, evidence cf18a4ae):
  // this sweep previously archived EVERY is_active=true row unconditionally, regardless of
  // source_type/classify() -- one --apply run would silently re-zero the vision gauge's
  // "Calibrate the gates" probe (lib/vision/vdr-registry.js), which counts opportunity_blueprints
  // where is_active=true AND metadata.calibration_read_at is set. A row that has already been
  // read by the calibration cohort (lib/discovery/calibration-cohort-reader.js) is EXCLUDED from
  // this sweep -- it represents realized, consumed calibration ground truth, not a stale/fixture
  // row this script exists to clear.
  const { protectedRows, sweepable } = partitionByCalibration(rows);
  if (protectedRows.length) {
    console.log(`Protected (already calibrated, excluded from sweep): ${protectedRows.length} row(s)`);
    for (const r of protectedRows) console.log(`  [calibrated] ${r.id}  ${r.title}`);
  }
  rows = sweepable;

  if (!rows?.length) {
    console.log('Active queue already empty — nothing to archive (reseed-ready).');
    return;
  }

  console.log(`${APPLY ? 'ARCHIVING' : 'DRY-RUN'}: ${rows.length} active row(s)\n`);
  const archivedAt = new Date().toISOString();
  let failed = 0;

  for (const row of rows) {
    const kind = classify(row);
    console.log(`  [${kind}] ${row.id}  ${row.title}`);
    if (!APPLY) continue;
    const { error: upErr } = await db
      .from('opportunity_blueprints')
      .update({
        is_active: false,
        metadata: {
          ...(row.metadata || {}),
          archived_at: archivedAt,
          archived_by: SD_KEY,
          archive_reason: `pre-revival queue reseed (${kind}); reversible — flip is_active=true to restore`,
          archive_classification: kind,
        },
      })
      .eq('id', row.id);
    if (upErr) { console.error(`    ✗ ${upErr.message}`); failed++; }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to archive (0 deletes, reversible).');
  } else {
    console.log(`\nDone: ${rows.length - failed} archived, ${failed} failed, 0 deleted. Queue is reseed-ready.`);
    if (failed > 0) process.exit(1);
  }
}

// ESM entrypoint guard -- importing this module for classify()/isCalibrationProtected()/
// partitionByCalibration() (e.g. from a unit test) must not trigger a live DB run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
