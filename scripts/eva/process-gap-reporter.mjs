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

// Keywords that indicate a process gap (systemic enforcement issue, not SD-specific)
const PROCESS_GAP_KEYWORDS = [
  'gate', 'routing', 'escalation', 'dashboard', 'enforcement',
  'protocol', 'workflow', 'guardrail', 'validation', 'oversight',
  'review_process', 'approval', 'governance',
];

/**
 * Classify a dimension gap as dimension_gap or process_gap.
 * Pure function — deterministic, no side effects. (US-001)
 *
 * @param {{ name: string, score: number }} dim - Dimension info
 * @returns {{ type: 'dimension_gap'|'process_gap', reason: string }}
 */
export function classifyGap(dim) {
  const nameLower = (dim.name || '').toLowerCase();
  const matchedKeyword = PROCESS_GAP_KEYWORDS.find(kw => nameLower.includes(kw));
  if (matchedKeyword) {
    return {
      type: 'process_gap',
      reason: `Dimension '${dim.name}' contains process keyword '${matchedKeyword}' — systemic protocol gap`,
    };
  }
  return {
    type: 'dimension_gap',
    reason: `Dimension '${dim.name}' is SD-specific — routes to corrective SD path`,
  };
}

/**
 * Insert a process gap into the feedback table (enhancement) and
 * protocol_improvement_queue. Fails silently — never blocks the reporter.
 * SD: SD-LEO-INFRA-VISION-PROCESS-GAP-FEEDBACK-001 (US-002)
 *
 * @param {object} supabase
 * @param {{ dimension: string, avgScore: number, severity: string, description: string, sdIds: string[] }} gap
 * @param {boolean} dryRun
 */
async function insertProcessGapToFeedbackAndQueue(supabase, gap, dryRun) {
  const title = `[Vision Process Gap] Low alignment on '${gap.dimension}' dimension (avg ${gap.avgScore}/100)`;
  const feedbackDescription = `${gap.description}. Affects ${gap.sdIds.length} SD(s). This is a systemic LEO process gap — the protocol does not adequately enforce or guide this dimension.`;

  if (dryRun) {
    console.log(`  [DRY RUN] Would insert feedback + queue entry for process gap: ${gap.dimension}`);
    return;
  }

  try {
    // 1. Insert to feedback table as enhancement
    const { data: fb, error: fbErr } = await supabase
      .from('feedback')
      .insert({
        type: 'enhancement',
        source_application: 'EHG_Engineer',
        source_type: 'auto_capture',
        title,
        description: feedbackDescription,
        severity: gap.severity,
        value_estimate: 'high',
        effort_estimate: 'medium',
        status: 'new',
        metadata: {
          dimension: gap.dimension,
          avg_score: gap.avgScore,
          affected_sd_ids: gap.sdIds.slice(0, 10),
          gap_type: 'process_gap',
          source: 'vision-process-gap-reporter',
        },
      })
      .select('id')
      .single();

    if (fbErr) {
      console.error(`  [ProcessGapReporter] Feedback insert failed for ${gap.dimension}: ${fbErr.message}`);
    } else {
      console.log(`  [ProcessGapReporter] Feedback inserted: ${fb.id} for ${gap.dimension}`);
    }

    // 2. Insert to protocol_improvement_queue
    const { error: qErr } = await supabase
      .from('protocol_improvement_queue')
      .insert({
        source_type: 'SD_COMPLETION',
        improvement_type: 'PROTOCOL_SECTION',
        target_table: 'leo_validation_rules',
        target_operation: 'INSERT',
        description: `Add validation rule or checklist for vision dimension '${gap.dimension}' — currently under-enforced in LEO protocol`,
        payload: {
          category: 'vision_alignment',
          dimension: gap.dimension,
          avg_score: gap.avgScore,
          severity: gap.severity,
          impact: `Vision dimension '${gap.dimension}' scored avg ${gap.avgScore}/100 across ${gap.sdIds.length} SDs — protocol does not enforce this dimension`,
          improvement: `Add a LEO protocol rule or checklist item to ensure '${gap.dimension}' is addressed during SD planning`,
          evidence: gap.description,
          affected_phase: 'ALL',
          affected_sd_ids: gap.sdIds.slice(0, 5),
        },
        status: 'PENDING',
        target_phase: 'ALL',
        risk_tier: 'GOVERNED',
        auto_applicable: false,
      });

    if (qErr) {
      console.error(`  [ProcessGapReporter] Queue insert failed for ${gap.dimension}: ${qErr.message}`);
    } else {
      console.log(`  [ProcessGapReporter] Protocol improvement queued for dimension: ${gap.dimension}`);
    }
  } catch (err) {
    // Fail silently — process gap reporting is best-effort
    console.error(`  [ProcessGapReporter] Unexpected error inserting gap for ${gap.dimension}: ${err.message}`);
  }
}

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

      // Classify: process_gap vs dimension_gap (US-001)
      const classification = classifyGap({ name: dimension, score: avgScore });
      console.log(`[ProcessGapReporter] ${classification.type}: ${dimension} (avg=${avgScore}, sds=${uniqueSDs.length}, severity=${severity})`);
      console.log(`  → ${classification.reason}`);

      if (classification.type === 'process_gap') {
        // US-002: Insert process gaps to feedback table + protocol_improvement_queue
        await insertProcessGapToFeedbackAndQueue(supabase, {
          dimension,
          avgScore,
          severity,
          description,
          sdIds: uniqueSDs.slice(0, 10),
        }, dryRun);
      }

      // Always publish event (both gap types get the event for observability)
      if (!dryRun) {
        publishVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, {
          gapType: classification.type,
          dimension,
          description,
          severity,
          avgScore,
          sdIds: uniqueSDs.slice(0, 10),
          supabase,
        });
        eventsPublished++;
      } else {
        console.log(`  [DRY RUN] Would publish vision.process_gap_detected (${classification.type}) for ${dimension}`);
      }
    }
  }

  console.log(`[ProcessGapReporter] Complete: ${gapsFound} gap(s) found, ${eventsPublished} event(s) published`);
  return { gapsFound, eventsPublished };
}

/**
 * Alias for reportProcessGaps — expected by eva-master-scheduler.js dynamic import. (US-003)
 * Called from lib/eva/eva-master-scheduler.js _runProcessGapReporter().
 *
 * @param {object} supabase
 * @param {{ dryRun?: boolean, lookbackDays?: number }} [options]
 * @returns {Promise<{ gapsFound: number, eventsPublished: number }>}
 */
export async function syncProcessGaps(supabase, options = {}) {
  return reportProcessGaps(supabase, options);
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
