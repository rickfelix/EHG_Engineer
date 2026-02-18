#!/usr/bin/env node

/**
 * Vision-to-Patterns Sync
 * SD: SD-MAN-INFRA-EXTEND-LEARN-COMMAND-001
 *
 * Reads recent low-scoring vision alignment results from eva_vision_scores
 * and upserts them as actionable issue_patterns so /learn can surface
 * vision gaps alongside other protocol issues.
 *
 * Each dimension scoring < SCORE_THRESHOLD creates/updates a pattern with:
 *   - pattern_id: VISION-DIM-{dimension_name_slug}
 *   - source: 'vision_scorer'
 *   - severity: high (<40), medium (40-59)
 *   - occurrence_count: incremented on each sync
 *
 * Usage:
 *   node scripts/eva/vision-to-patterns.js
 *   node scripts/eva/vision-to-patterns.js --dry-run
 *   node scripts/eva/vision-to-patterns.js --days 60  (lookback window, default: 30)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Dimensions scoring below this threshold create patterns
const SCORE_THRESHOLD = 60;

// Lookback window in days for recent scores
const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Build a compact pattern_id from dimension ID that fits varchar(20).
 * e.g. "V01" -> "VGAP-V01" (8 chars)
 * e.g. "A03" -> "VGAP-A03" (8 chars)
 */
function buildPatternId(dimId) {
  // VGAP-{dimId} format: max 20 chars (VGAP- = 5, dimId = up to 15)
  const safe = dimId.replace(/[^A-Z0-9]/gi, '').substring(0, 14);
  return `VGAP-${safe}`;
}

/**
 * Classify severity based on dimension score.
 */
function classifySeverity(score) {
  if (score < 40) return 'high';
  return 'medium';
}

/**
 * Build a human-readable issue summary from dimension data.
 */
function buildIssueSummary(dimName, score, reasoning) {
  const truncated = reasoning ? reasoning.substring(0, 200) : '';
  return `Vision gap: ${dimName} scored ${score}/100 — ${truncated}`;
}

/**
 * Sync vision scoring gaps to issue_patterns.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Skip DB writes
 * @param {number} [options.lookbackDays=30] - Days of history to scan
 * @returns {Promise<{synced: number, skipped: number, errors: number}>}
 */
export async function syncVisionScoresToPatterns(supabase, options = {}) {
  const { dryRun = false, lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Query recent low-scoring vision alignment records
  const { data: scores, error: scoresError } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, dimension_scores, threshold_action, rubric_snapshot, scored_at, vision_id, arch_plan_id')
    .lt('total_score', 70)  // Only process scores below 70 (minor_sd, gap_closure_sd, escalate)
    .gte('scored_at', since)
    .order('scored_at', { ascending: false })
    .limit(100);

  if (scoresError) {
    throw new Error(`Failed to query eva_vision_scores: ${scoresError.message}`);
  }

  if (!scores || scores.length === 0) {
    return { synced: 0, skipped: 0, errors: 0 };
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Collect per-dimension aggregates across all score records
  const dimAggregates = {};

  for (const scoreRecord of scores) {
    if (!scoreRecord.dimension_scores || typeof scoreRecord.dimension_scores !== 'object') continue;

    const visionKey = scoreRecord.rubric_snapshot?.vision_key || 'unknown';
    const archKey = scoreRecord.rubric_snapshot?.arch_key || 'unknown';

    for (const [dimId, dim] of Object.entries(scoreRecord.dimension_scores)) {
      if (dim.score >= SCORE_THRESHOLD) {
        skipped++;
        continue; // Only process low-scoring dimensions (AC-005)
      }

      const patternId = buildPatternId(dimId);

      if (!dimAggregates[patternId]) {
        dimAggregates[patternId] = {
          patternId,
          dimId,
          dimName: dim.name,
          scores: [],
          sdIds: [],
          visionKey,
          archKey,
          source_section: null,
        };
      }

      dimAggregates[patternId].scores.push(dim.score);
      if (scoreRecord.sd_id) dimAggregates[patternId].sdIds.push(scoreRecord.sd_id);
    }
  }

  // Upsert each aggregated dimension pattern
  for (const [patternId, agg] of Object.entries(dimAggregates)) {
    const avgScore = Math.round(agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length);
    const severity = classifySeverity(avgScore);
    const issueSummary = buildIssueSummary(agg.dimName, avgScore, `${agg.scores.length} occurrences in last ${lookbackDays}d`);

    // Check for existing pattern (source not used — check constraint limits values)
    const { data: existing, error: lookupError } = await supabase
      .from('issue_patterns')
      .select('id, occurrence_count')
      .eq('pattern_id', patternId)
      .limit(1);

    if (lookupError) {
      console.error(`  Error looking up pattern ${patternId}: ${lookupError.message}`);
      errors++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would ${existing?.length ? 'UPDATE' : 'INSERT'} pattern: ${patternId} (score: ${avgScore}, severity: ${severity})`);
      synced++;
      continue;
    }

    if (existing && existing.length > 0) {
      // UPDATE existing pattern
      const newCount = (existing[0].occurrence_count || 1) + agg.scores.length;
      const { error: updateError } = await supabase
        .from('issue_patterns')
        .update({
          severity,
          issue_summary: issueSummary,
          occurrence_count: newCount,
          trend: newCount > 3 ? 'increasing' : 'stable',
          updated_at: new Date().toISOString(),
          metadata: {
            vision_key: agg.visionKey,
            arch_key: agg.archKey,
            avg_score: avgScore,
            sample_sd_ids: agg.sdIds.slice(0, 5),
            last_sync: new Date().toISOString(),
          },
        })
        .eq('id', existing[0].id);

      if (updateError) {
        console.error(`  Error updating pattern ${patternId}: ${updateError.message}`);
        errors++;
      } else {
        synced++;
      }
    } else {
      // INSERT new pattern
      // Note: source column has check constraint — use metadata.type for vision_scorer tag
      const { error: insertError } = await supabase
        .from('issue_patterns')
        .insert({
          pattern_id: patternId,
          category: 'infrastructure',
          severity,
          issue_summary: issueSummary,
          occurrence_count: agg.scores.length,
          trend: 'stable',
          status: 'active',
          proven_solutions: [
            `Address ${agg.dimName} in SD scope definition`,
            `Review vision dimension: ${agg.visionKey} — ${agg.dimName}`,
          ],
          metadata: {
            type: 'vision_scorer',
            dim_name: agg.dimName,
            vision_key: agg.visionKey,
            arch_key: agg.archKey,
            avg_score: avgScore,
            sample_sd_ids: agg.sdIds.slice(0, 5),
            last_sync: new Date().toISOString(),
          },
        });

      if (insertError) {
        console.error(`  Error inserting pattern ${patternId}: ${insertError.message}`);
        errors++;
      } else {
        synced++;
      }
    }
  }

  return { synced, skipped, errors };
}

// ============================================================================
// CLI entry point
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysIdx = args.indexOf('--days');
  const lookbackDays = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_LOOKBACK_DAYS;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`\n🔄 Vision-to-Patterns Sync`);
  console.log(`   Lookback: ${lookbackDays} days`);
  console.log(`   Dry Run:  ${dryRun}`);
  console.log('');

  syncVisionScoresToPatterns(supabase, { dryRun, lookbackDays })
    .then(({ synced, skipped, errors }) => {
      console.log(`\n✅ Sync complete`);
      console.log(`   Synced:  ${synced} dimension patterns`);
      console.log(`   Skipped: ${skipped} high-scoring dimensions`);
      console.log(`   Errors:  ${errors}`);
      if (dryRun) console.log('\n   [DRY RUN] No DB writes made');
    })
    .catch((err) => {
      console.error(`\n❌ Sync failed: ${err.message}`);
      process.exit(1);
    });
}
