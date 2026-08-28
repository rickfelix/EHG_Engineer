#!/usr/bin/env node

/**
 * Variant Scoring Bridge Status CLI
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-7)
 *
 * Chairman-facing inspection surface for the creative_asset_variant_scores bridge, per
 * venture. This IS the UI for this SD -- target_application=EHG_Engineer has no React
 * application surface at all (DESIGN sub-agent finding, evidence
 * 38a6c88b-1e7f-4ab4-838c-c2db1e7f32ba), so a CLI-first surface is the correct Q7 answer
 * rather than standing up the repo's first .tsx file.
 *
 * Renders 4 distinct empty/error states -- never collapsing them into a silent empty table
 * (G2/G6, TESTING evidence d82e9679-c331-4225-b36d-9cf3bb5d9116):
 *   query_error      -- a read failed (DB/RLS/schema-cache) -- NOT the same as confirmed-empty
 *   no_bridged_rows  -- venture is S23-approved but has zero creative_asset_variant_scores rows
 *   gate_excluded    -- venture has not cleared the S23+S24 taste-gate (asset-view-gate.js)
 *   no_writer_yet    -- bridged+approved rows exist but daily_rollups supplies no outcome data
 *                       (token reused VERBATIM from lib/telemetry/cpa-gauge.mjs for this one
 *                       state only -- the other 3 states have no cpa-gauge.mjs equivalent)
 * ...plus the populated render path when a selection succeeds.
 *
 * Usage:
 *   npm run eva:variant-scoring:status -- --venture <venture-id>
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { selectAssetVariant } from '../../lib/creative/variant-scoring-bridge.js';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

// Pure, exported render function (the test seam) -- separate from main()'s I/O, matching
// scripts/eva-idea-status.js's renderSyncState() shape exactly (G5, DESIGN evidence
// 38a6c88b-1e7f-4ab4-838c-c2db1e7f32ba).
//
// TESTING finding D2 (evidence f9247bbd-7d82-47c0-86cf-69f641af7e7f): the bridge's
// 'no_outcome_data' status is translated to this CLI's 'no_writer_yet' render token HERE,
// inside the tested render seam -- not in main(), where it was previously unreachable by any
// test and could silently break (deleting the translation left all 44 tests green while the
// live 'no_outcome_data' state -- the one production is permanently in per FR-6 -- would have
// printed "UNRECOGNIZED status").
export function renderScoringState(rawResult, ventureId) {
  const result = rawResult.status === 'no_outcome_data' ? { ...rawResult, status: 'no_writer_yet' } : rawResult;
  const lines = [`  Venture: ${ventureId}`];

  switch (result.status) {
    case 'query_error':
      lines.push(`    ERROR: query failed — ${result.error} (scoring state unavailable, NOT confirmed empty) [query_error]`);
      break;
    case 'gate_excluded':
      lines.push(`    Excluded from scoring: taste-gate not cleared (reason: ${result.reason}) [gate_excluded]`);
      lines.push('    -> Chairman action: review/approve at S23, or wait for S24 lifecycle advancement.');
      break;
    case 'no_bridged_rows':
      lines.push('    No creative_asset_variant_scores rows for this venture yet [no_bridged_rows]');
      break;
    case 'no_writer_yet':
      lines.push(`    Bridged + approved (${result.candidateCount} candidate variant(s)), but daily_rollups supplies no outcome data yet [no_writer_yet]`);
      lines.push('    -> This is expected until a successor SD wires daily_rollups ingestion (FR-6, out of scope here).');
      break;
    case 'selected':
      lines.push(`    Candidates: ${result.candidateCount}`);
      lines.push(`    Selected variant: ${result.selection.variantId} (creative_asset: ${result.selection.creativeAssetId ?? 'unknown'})`);
      lines.push(`    posteriorMean=${result.selection.posteriorMean.toFixed(4)}  selectionReason=${result.selection.selectionReason}`);
      break;
    default:
      lines.push(`    UNRECOGNIZED status: ${JSON.stringify(result)}`);
  }

  return lines;
}

async function main() {
  const ventureArgIdx = process.argv.indexOf('--venture');
  const ventureId = ventureArgIdx >= 0 ? process.argv[ventureArgIdx + 1] : null;

  console.log('');
  console.log('='.repeat(60));
  console.log('Variant Scoring Bridge Status');
  console.log('  (queries under SUPABASE_SERVICE_ROLE_KEY -- bypasses RLS; NOT an RLS verification tool)');
  console.log('='.repeat(60));
  console.log('');

  if (!ventureId) {
    console.log('  Usage: npm run eva:variant-scoring:status -- --venture <venture-id>');
    console.log('');
    console.log('='.repeat(60));
    return;
  }

  const supabase = createSupabaseServiceClient();
  const result = await selectAssetVariant({ supabase, ventureId });

  for (const line of renderScoringState(result, ventureId)) {
    console.log(line);
  }

  console.log('');
  console.log('='.repeat(60));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
