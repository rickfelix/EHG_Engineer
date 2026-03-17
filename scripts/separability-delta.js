#!/usr/bin/env node
/**
 * separability-delta.js — Capture and compare venture separability snapshots.
 *
 * SD: SD-LEO-FEAT-ACQUISITION-READINESS-GAP-001 (ARG04:US-004)
 *
 * Usage:
 *   npm run separability:delta -- --venture-id=<uuid>
 *   npm run separability:delta -- --venture-id=<uuid> --type=post_sd --triggered-by="SD-XXX-001"
 *
 * Uses the existing separation-rehearsal.js engine (no duplication).
 * Stores snapshots in venture_separability_snapshots table.
 * On subsequent runs, shows delta comparison against previous snapshot.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { rehearseSeparation, DIMENSIONS, PASS_THRESHOLD } from '../lib/eva/exit/separation-rehearsal.js';

const supabase = createSupabaseServiceClient();

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    args[key.replace(/-/g, '_')] = rest.join('=') || true;
  }
  return args;
}

function formatDelta(current, previous) {
  if (previous === null || previous === undefined) return '';
  const diff = current - previous;
  if (diff === 0) return ' (=)';
  const sign = diff > 0 ? '+' : '';
  return ` (${sign}${diff.toFixed(1)})`;
}

function scoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

async function main() {
  const args = parseArgs();

  if (!args.venture_id) {
    console.error('Usage: npm run separability:delta -- --venture-id=<uuid>');
    process.exit(1);
  }

  const ventureId = args.venture_id;
  const snapshotType = args.type || 'manual';
  const triggeredBy = args.triggered_by || null;

  // Verify venture exists
  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('id', ventureId)
    .single();

  if (ventureError || !venture) {
    console.error(`Venture not found: ${ventureId}`);
    process.exit(1);
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  SEPARABILITY DELTA: ${venture.name}`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // Run rehearsal to get current scores
  console.log('  Running separation rehearsal (dry_run)...\n');
  const result = await rehearseSeparation(ventureId, 'dry_run', supabase);

  // Build dimension scores object
  const dimensionScores = {};
  for (const dr of result.dimension_results) {
    dimensionScores[dr.dimension] = dr.score;
  }

  // Fetch previous snapshot for comparison
  const { data: prevSnapshot } = await supabase
    .from('venture_separability_snapshots')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const prevScores = prevSnapshot?.dimension_scores || {};
  const prevOverall = prevSnapshot?.overall_score ?? null;

  // Display current scores with delta
  console.log('  Dimension Scores:');
  console.log('  ─────────────────────────────────────────────────');
  for (const dim of DIMENSIONS) {
    const score = dimensionScores[dim] ?? 0;
    const prev = prevScores[dim] ?? null;
    const delta = formatDelta(score, prev);
    const bar = scoreBar(score);
    const label = dim.padEnd(14);
    console.log(`  ${label} ${bar} ${score.toFixed(1)}%${delta}`);
  }
  console.log('  ─────────────────────────────────────────────────');
  const overallDelta = formatDelta(result.overall_score, prevOverall);
  const passLabel = result.overall_score >= PASS_THRESHOLD ? '✅ PASS' : '❌ BELOW THRESHOLD';
  console.log(`  OVERALL        ${scoreBar(result.overall_score)} ${result.overall_score.toFixed(1)}%${overallDelta}  ${passLabel}`);
  console.log(`  Threshold: ${PASS_THRESHOLD}%`);

  if (prevSnapshot) {
    const prevDate = new Date(prevSnapshot.created_at).toLocaleDateString();
    console.log(`\n  Previous snapshot: ${prevDate} (${prevSnapshot.snapshot_type})`);
  } else {
    console.log('\n  No previous snapshot — this is the first capture.');
  }

  // Store new snapshot
  const { data: newSnapshot, error: insertError } = await supabase
    .from('venture_separability_snapshots')
    .insert({
      venture_id: ventureId,
      dimension_scores: dimensionScores,
      overall_score: result.overall_score,
      snapshot_type: snapshotType,
      triggered_by: triggeredBy,
    })
    .select('id, created_at')
    .single();

  if (insertError) {
    console.error(`\n  ❌ Failed to store snapshot: ${insertError.message}`);
    process.exit(1);
  }

  console.log(`\n  ✅ Snapshot saved: ${newSnapshot.id}`);
  console.log(`     Created: ${new Date(newSnapshot.created_at).toISOString()}`);

  if (result.warnings.length > 0) {
    console.log(`\n  ⚠️  Warnings:`);
    for (const w of result.warnings) {
      console.log(`     - ${w}`);
    }
  }

  console.log(`\n══════════════════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
