#!/usr/bin/env node
/**
 * One-off backfill: set metadata.is_fallback=true on the 9 PrivacyPatrol AI
 * Stage 18 marketing artifacts that pre-date the SD-LEO-FIX-STAGE18-SILENT-
 * FALLBACK-001 fix.
 *
 * Scope: venture_id=08d20036-03c9-4a26-bbc5-f37a18dfdf23 only (NOT a blanket
 * UPDATE — per VALIDATION evidence 9437fdb4-... and DATABASE evidence
 * c77d3635-...). Idempotent (jsonb || merge overwrites is_fallback to true on
 * re-run). Writes a single audit_log row with row_count=9.
 *
 * Why text-pattern detection is acceptable here (and only here): runtime
 * write paths in server/routes/stage18.js write metadata.is_fallback
 * directly. This script is the one-time cleanup of 9 rows that pre-date
 * that write path. Substring "[Fallback —" is the visible marker
 * buildFallbackCopy emits at lib/eva/stage-templates/analysis-steps/
 * stage-18-marketing-copy.js:354-361.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const VENTURE_ID = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';
const SD_KEY = 'SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001';
const PRD_ID = 'PRD-' + SD_KEY;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error: selErr } = await supabase
  .from('venture_artifacts')
  .select('id, artifact_type, metadata, artifact_data')
  .eq('venture_id', VENTURE_ID)
  .like('artifact_type', 'marketing_%')
  .eq('is_current', true);

if (selErr) {
  console.error('select failed:', selErr.message);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.log('no candidate rows for venture', VENTURE_ID, '— nothing to backfill');
  process.exit(0);
}

const matches = rows.filter((r) => {
  const txt = JSON.stringify(r.artifact_data || {});
  return txt.includes('[Fallback');
});

console.log(`scope: ${rows.length} marketing_* rows; fallback-matched by substring: ${matches.length}`);

let updated = 0;
for (const r of matches) {
  const merged = { ...(r.metadata || {}), is_fallback: true };
  const { error: updErr } = await supabase
    .from('venture_artifacts')
    .update({ metadata: merged })
    .eq('id', r.id);
  if (updErr) {
    console.error('update failed for', r.id, ':', updErr.message);
    process.exit(1);
  }
  updated++;
}

const { error: auditErr } = await supabase.from('audit_log').insert({
  event_type: 'stage18_marketing_fallback_backfill',
  entity_type: 'venture_artifact_batch',
  entity_id: VENTURE_ID,
  new_value: { row_count: updated, is_fallback_set_to: true },
  metadata: {
    sd_key: SD_KEY,
    prd_id: PRD_ID,
    fr: 'FR-5',
    ac: 'AC-3',
    venture_id: VENTURE_ID,
    artifact_type_filter: 'marketing_%',
    is_current_filter: true,
    executed_via: 'scripts/one-off/backfill-stage18-marketing-fallback-flag.mjs'
  },
  severity: 'info',
  created_by: `backfill:${SD_KEY}`
});

if (auditErr) {
  console.warn('audit_log insert failed (non-fatal):', auditErr.message);
}

console.log(`backfilled ${updated} of ${matches.length} fallback-matched rows; audit_log written: ${!auditErr}`);
