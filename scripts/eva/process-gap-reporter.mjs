#!/usr/bin/env node

/**
 * Vision Process Gap Reporter
 * SD: SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Detects process gaps from eva_vision_scores and publishes
 * vision.process_gap_detected events via the event bus.
 *
 * A "process gap" is a dimension that consistently scores low
 * across multiple SDs — indicating a systemic process failure,
 * not just a single SD misalignment.
 *
 * Usage:
 *   node scripts/eva/process-gap-reporter.mjs
 *   node scripts/eva/process-gap-reporter.mjs --dry-run
 *   node scripts/eva/process-gap-reporter.mjs --days 60
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { publishVisionEvent, subscribeVisionEvent, VISION_EVENTS, registerVisionProcessGapDetectedHandlers } from '../../lib/eva/event-bus/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SCORE_THRESHOLD = 60;      // Dimensions below this are "process gaps"
const MIN_OCCURRENCES = 2;       // Must appear in at least N SDs to be systemic

/**
 * Scan eva_vision_scores for systemic process gaps and publish events.
 *
 * @param {object} supabase
 * @param {{ dryRun?: boolean, lookbackDays?: number }} options
 * @returns {Promise<{ gapsFound: number, eventsPublished: number }>}
 */
export async function reportProcessGaps(supabase, options = {}) {
  const { dryRun = false, lookbackDays = 30 } = options;

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data: scores, error } = await supabase
    .from('eva_vision_scores')
    .select('sd_id, dimension_scores, scored_at')
    .gte('scored_at', since.toISOString())
    .not('dimension_scores', 'is', null);

  if (error) {
    console.error(`[ProcessGapReporter] Failed to load scores: ${error.message}`);
    return { gapsFound: 0, eventsPublished: 0 };
  }

  if (!scores || scores.length === 0) {
    console.log('[ProcessGapReporter] No vision scores found in lookback window');
    return { gapsFound: 0, eventsPublished: 0 };
  }

  // Aggregate dimension scores across all SDs
  const dimAggregates = {};
  for (const scoreRecord of scores) {
    const dims = Array.isArray(scoreRecord.dimension_scores) ? scoreRecord.dimension_scores : [];
    for (const dim of dims) {
      if (typeof dim.score !== 'number') continue;
      const key = dim.dimension || dim.name || 'unknown';
      if (!dimAggregates[key]) dimAggregates[key] = { scores: [], sdIds: [] };
      dimAggregates[key].scores.push(dim.score);
      if (scoreRecord.sd_id) dimAggregates[key].sdIds.push(scoreRecord.sd_id);
    }
  }

  let gapsFound = 0;
  let eventsPublished = 0;

  for (const [dimension, agg] of Object.entries(dimAggregates)) {
    const avgScore = Math.round(agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length);
    const uniqueSDs = [...new Set(agg.sdIds)];

    if (avgScore < SCORE_THRESHOLD && uniqueSDs.length >= MIN_OCCURRENCES) {
      gapsFound++;
      const severity = avgScore < 40 ? 'high' : 'medium';
      const description = `Dimension '${dimension}' averaged ${avgScore}/100 across ${uniqueSDs.length} SDs in last ${lookbackDays}d`;

      console.log(`[ProcessGapReporter] Process gap: ${dimension} (avg=${avgScore}, sds=${uniqueSDs.length}, severity=${severity})`);

      if (!dryRun) {
        publishVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, {
          gapType: 'dimension_systemic',
          dimension,
          description,
          severity,
          avgScore,
          sdIds: uniqueSDs.slice(0, 10),
          supabase,
        });
        eventsPublished++;
      } else {
        console.log(`  [DRY RUN] Would publish vision.process_gap_detected for ${dimension}`);
      }
    }
  }

  console.log(`[ProcessGapReporter] Complete: ${gapsFound} gap(s) found, ${eventsPublished} event(s) published`);
  return { gapsFound, eventsPublished };
}

// CLI entry point
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysArg = args.find(a => a.startsWith('--days=')) || args.find((a, i) => a === '--days' && args[i + 1]);
  const lookbackDays = daysArg ? parseInt(daysArg.replace('--days=', '') || args[args.indexOf('--days') + 1]) : 30;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Register process gap handlers for logging
  registerVisionProcessGapDetectedHandlers();

  reportProcessGaps(supabase, { dryRun, lookbackDays })
    .then(({ gapsFound, eventsPublished }) => {
      process.exit(gapsFound > 0 ? 0 : 0);
    })
    .catch(err => {
      console.error('[ProcessGapReporter] Fatal:', err.message);
      process.exit(1);
    });
}
