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

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { publishVisionEvent, VISION_EVENTS } from '../../lib/eva/event-bus/vision-events.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: issue_patterns is a growing
// table -- an un-paginated read here would silently leave stale VGAP- patterns
// unresolved past the PostgREST 1000-row cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
// SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001: reuse the canonical rubric classifier and
// score normalizer instead of duck-typing dim.score directly (a bare-number rubric like
// eva-5dim-v1 was silently mislabeled "malformed" by that duck-typing).
import { identifyRubric, dimScoreOf, LATENCY_KEYS } from '../../lib/handoff/threshold-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Dimensions scoring below this threshold create patterns
const SCORE_THRESHOLD = 60;

// Lookback window in days for recent scores
const DEFAULT_LOOKBACK_DAYS = 30;

// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-039: SD-type-aware dimension exemptions
// Dimensions that naturally score low for certain SD types and should not create VGAP patterns.
// Key: SD type, Value: Set of dimension ID prefixes to exempt (e.g., 'V09' for strategic_governance_cascade)
export const SD_TYPE_EXEMPT_DIMENSIONS = {
  infrastructure: new Set(['V09']),
  // QF-20260816-696: was 'fix' -- not in lib/sd-type-enum.js's canonical sd_type list (the
  // real value is 'bugfix'), so this exemption never matched and bugfix SDs spawned false
  // VGAP-V09 rows. SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001 already documents 'fix' as a phantom
  // value causing UPDATE failures elsewhere; this was a second, un-retrofitted instance.
  bugfix:         new Set(['V09']),
  documentation:  new Set(['V09']),
};

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
 * @returns {Promise<{synced: number, skipped: number, errors: number, resolved: number, excluded: number, unscored: number, couldNotVerify: number}>}
 */
export async function syncVisionScoresToPatterns(supabase, options = {}) {
  const { dryRun = false, lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // QF-20260816-109: was capped .limit(100) -- a record past the cap read as silently
  // ABSENT, indistinguishable from "improved" below. Paginate like activeVgaps (id tiebreaks).
  let scores;
  try {
    scores = await fetchAllPaginated(() => supabase
      .from('eva_vision_scores')
      .select('id, sd_id, total_score, dimension_scores, threshold_action, rubric_snapshot, scored_at, vision_id, arch_plan_id')
      .lt('total_score', 70)  // Only process scores below 70 (minor_sd, gap_closure_sd, escalate)
      .gte('scored_at', since)
      .order('scored_at', { ascending: false })
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`Failed to query eva_vision_scores: ${e.message}`);
  }

  if (!scores || scores.length === 0) {
    return { synced: 0, skipped: 0, errors: 0, resolved: 0, excluded: 0, unscored: 0, couldNotVerify: 0 };
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let excluded = 0;
  let unscored = 0;

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-039: Resolve SD types for dimension exemption checks
  const sdTypeMap = {};
  const uniqueSdIds = [...new Set(scores.map(s => s.sd_id).filter(Boolean))];
  if (uniqueSdIds.length > 0) {
    const { data: sdRows } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type')
      .in('id', uniqueSdIds);
    if (sdRows) {
      for (const row of sdRows) {
        sdTypeMap[row.id] = row.sd_type;
      }
    }
  }

  // Collect per-dimension aggregates across all score records
  const dimAggregates = {};

  // QF-20260816-109: dims scoring >= SCORE_THRESHOLD this run = positive evidence of
  // improvement, vs. merely absent (paginated-away/total_score>=70/malformed).
  const improvedPatternIds = new Set();

  for (const scoreRecord of scores) {
    // SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001: a missing/non-object/empty
    // dimension_scores previously `continue`d with zero counter impact -- invisible to
    // every field on the return object. Tally all three shapes as `unscored` so /learn
    // can report them as inconclusive rather than silently absent (ship-review finding:
    // an earlier version of this fix only caught the empty-object case, leaving
    // null/non-object rows undercounted despite the CLI label claiming otherwise).
    if (!scoreRecord.dimension_scores || typeof scoreRecord.dimension_scores !== 'object') {
      unscored++;
      continue;
    }

    const dimEntries = Object.entries(scoreRecord.dimension_scores);
    if (dimEntries.length === 0) {
      unscored++;
      continue;
    }

    const visionKey = scoreRecord.rubric_snapshot?.vision_key || 'unknown';
    const archKey = scoreRecord.rubric_snapshot?.arch_key || 'unknown';

    // SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001: classify the whole record once so a
    // registered non-VGAP rubric (e.g. eva-5dim-v1's 4-12 sub-scores) is excluded from the 0-100
    // SCORE_THRESHOLD comparison below WITHOUT being mislabeled as malformed and WITHOUT being
    // removed from dimAggregates loop entry for anything that already passes today -- removing a
    // still-valid dimension from dimAggregates would falsely trigger the auto-resolve cascade
    // further down (a currently-active pattern would read as "improved" when it never was).
    // EXACT_RUBRICS is an exhaustive sorted-key-set match, so an eva-5dim-v1-classified row can
    // never mix in another (comparable) key -- that exhaustiveness is what makes whole-row
    // exclusion safe here. latency-3dim rows do NOT get whole-row exclusion (they can legitimately
    // mix a duration key with otherwise-comparable ones) -- see the per-key LATENCY_KEYS check below.
    const rubric = identifyRubric(scoreRecord.dimension_scores);
    const rowExcluded = rubric === 'eva-5dim-v1';

    for (const [dimId, dim] of dimEntries) {
      // SD-LEARN-FIX-ADDRESS-VGAP-A05EVENTBUSINT-001 / SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-
      // CLASSIFY-001: dimScoreOf reads both bare-number values (e.g. eva-5dim-v1's
      // {feasibility: 7}) and rich {score, name} objects; !Number.isFinite catches
      // null/undefined/NaN/Infinity/-Infinity in one predicate.
      const dimScore = dimScoreOf(dim);
      if (dimScore === null || !Number.isFinite(dimScore)) {
        console.warn(`  ⚠️  Skipping malformed dimension "${dimId}": score=${dimScore}, name=${dim?.name}`);
        skipped++;
        continue;
      }

      // Non-comparable scale: whole-row (eva-5dim-v1) or per-key (a duration mixed into an
      // otherwise-comparable latency-3dim row). Excluded from the threshold comparison and
      // tallied separately from `skipped` -- this dimension WAS read correctly, it just isn't
      // on a scale SCORE_THRESHOLD=60 was calibrated for.
      if (rowExcluded || LATENCY_KEYS.has(dimId)) {
        excluded++;
        continue;
      }

      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-039: Skip exempt dimensions for this SD type
      const sdType = sdTypeMap[scoreRecord.sd_id];
      const exemptDims = sdType && SD_TYPE_EXEMPT_DIMENSIONS[sdType];
      if (exemptDims) {
        const dimPrefix = dimId.replace(/[^A-Z0-9]/gi, '').substring(0, 3);
        if (exemptDims.has(dimPrefix)) {
          skipped++;
          continue;
        }
      }

      const patternId = buildPatternId(dimId);

      if (dimScore >= SCORE_THRESHOLD) {
        // QF-20260816-109: this dim WAS observed and scored fine this run -- record it as
        // positive evidence for the auto-resolve pass below.
        improvedPatternIds.add(patternId);
        skipped++;
        continue; // Only process low-scoring dimensions (AC-005)
      }

      // Extract name from dimension key if dim.name is undefined (e.g., "A05_event_bus_integration" → "event bus integration")
      const dimName = dim.name || dimId.replace(/^[A-Z]\d+_?/i, '').replace(/_/g, ' ') || dimId;

      if (!dimAggregates[patternId]) {
        dimAggregates[patternId] = {
          patternId,
          dimId,
          dimName,
          scores: [],
          sdIds: [],
          visionKey,
          archKey,
          source_section: null,
        };
      }

      dimAggregates[patternId].scores.push(dimScore);
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

    // Publish vision.gap_detected event (SD-MAN-INFRA-EVENT-BUS-BACKBONE-001)
    publishVisionEvent(VISION_EVENTS.GAP_DETECTED, {
      dimension: agg.dimName,
      patternId,
      score: avgScore,
      severity,
      threshold: 70,
      sdIds: agg.sdIds.slice(0, 5),
    });

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

  // ========================================================================
  // FEEDBACK LOOP: Auto-resolve patterns whose scores have improved
  // Without this, patterns created when scores were low remain active
  // forever even after the underlying dimension improves above threshold.
  // ========================================================================
  let resolved = 0;
  let couldNotVerify = 0;

  let activeVgaps;
  try {
    activeVgaps = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('id, pattern_id, metadata')
      .ilike('pattern_id', 'VGAP-%')
      .in('status', ['active', 'assigned'])
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { activeVgaps = []; } // prior behavior: read error ignored

  if (activeVgaps && activeVgaps.length > 0) {
    // Build set of dimension IDs that are STILL scoring low in this sync
    const stillLowDims = new Set(Object.keys(dimAggregates));

    for (const vgap of activeVgaps) {
      if (stillLowDims.has(vgap.pattern_id)) continue; // Still scoring low — keep active

      if (!improvedPatternIds.has(vgap.pattern_id)) {
        // QF-20260816-109: absent from both sets = not observed cleanly this run (SD's
        // total_score rose >=70, or malformed/skipped) -- NOT evidence of improvement.
        // status has no could_not_verify value in its CHECK constraint (active|assigned|
        // resolved|obsolete only), so stamp metadata and leave status untouched.
        if (!dryRun) {
          const { error: markError } = await supabase
            .from('issue_patterns')
            .update({
              metadata: {
                ...(vgap.metadata || {}),
                last_sync_outcome: 'could_not_verify',
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', vgap.id);

          if (markError) {
            console.error(`  Error marking ${vgap.pattern_id} could_not_verify: ${markError.message}`);
            errors++;
          } else {
            couldNotVerify++;
          }
        } else {
          console.log(`  [DRY RUN] Would mark could_not_verify: ${vgap.pattern_id} (not observed this run)`);
          couldNotVerify++;
        }
        continue;
      }

      if (!dryRun) {
        const { error: resolveError } = await supabase
          .from('issue_patterns')
          .update({
            status: 'resolved',
            severity: 'low',
            trend: 'decreasing',
            issue_summary: (vgap.metadata?.dim_name || vgap.pattern_id) +
              ' — auto-resolved: dimension no longer scores below ' + SCORE_THRESHOLD,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vgap.id);

        if (resolveError) {
          console.error(`  Error auto-resolving ${vgap.pattern_id}: ${resolveError.message}`);
          errors++;
        } else {
          resolved++;
        }
      } else {
        console.log(`  [DRY RUN] Would auto-resolve: ${vgap.pattern_id} (no longer below threshold)`);
        resolved++;
      }
    }
  }

  return { synced, skipped, errors, resolved, excluded, unscored, couldNotVerify };
}

// ============================================================================
// CLI entry point
// ============================================================================

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysIdx = args.indexOf('--days');
  const lookbackDays = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_LOOKBACK_DAYS;

  const supabase = createSupabaseServiceClient();

  console.log('\n🔄 Vision-to-Patterns Sync');
  console.log(`   Lookback: ${lookbackDays} days`);
  console.log(`   Dry Run:  ${dryRun}`);
  console.log('');

  syncVisionScoresToPatterns(supabase, { dryRun, lookbackDays })
    .then(({ synced, skipped, errors, resolved, excluded, unscored }) => {
      console.log('\n✅ Sync complete');
      console.log(`   Synced:    ${synced} dimension patterns`);
      console.log(`   Skipped:   ${skipped} dimensions (malformed, exempt, or high-scoring)`);
      console.log(`   Excluded:  ${excluded || 0} dimensions (non-comparable rubric/duration scale)`);
      console.log(`   Unscored:  ${unscored || 0} records with no dimension data`);
      console.log(`   Resolved:  ${resolved || 0} patterns (feedback loop)`);
      console.log(`   Errors:    ${errors}`);
      if (dryRun) console.log('\n   [DRY RUN] No DB writes made');
    })
    .catch((err) => {
      console.error(`\n❌ Sync failed: ${err.message}`);
      process.exit(1);
    });
}
