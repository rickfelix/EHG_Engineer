#!/usr/bin/env node

/**
 * Backfill Quality Scores for Existing Feedback
 * SD-FDBK-ENH-ADD-QUALITY-SCORING-001
 *
 * Processes existing feedback rows that have no rubric_score,
 * runs them through the quality scorer, and persists results
 * to the rubric_score and quality_assessment columns.
 *
 * Usage:
 *   node scripts/backfill-quality-scores.js [--batch-size 50] [--dry-run]
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Try worktree root first, then main repo root (worktrees don't have .env)
const envPath = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '.env')
].find(p => fs.existsSync(p));
dotenv.config({ path: envPath });
import { calculateQualityScore, getQualityTier, generateImprovementSuggestions } from '../lib/quality/quality-scorer.js';

const BATCH_SIZE = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--batch-size') || '50', 10);
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  console.log(`[Backfill] Starting quality score backfill (batch=${BATCH_SIZE}, dry-run=${DRY_RUN})`);

  // Count total unscored rows
  const { count, error: countErr } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .is('rubric_score', null);

  if (countErr) {
    console.error('[Backfill] Failed to count rows:', countErr.message);
    process.exit(1);
  }

  console.log(`[Backfill] Found ${count} feedback rows without quality scores`);
  if (count === 0) {
    console.log('[Backfill] Nothing to backfill. Done.');
    return;
  }

  let processed = 0;
  let scored = 0;
  let failed = 0;
  let offset = 0;

  while (offset < count) {
    const { data: batch, error: fetchErr } = await supabase
      .from('feedback')
      .select('id, title, description, type, source_type')
      .is('rubric_score', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchErr) {
      console.error(`[Backfill] Fetch error at offset ${offset}:`, fetchErr.message);
      break;
    }

    if (!batch || batch.length === 0) break;

    for (const row of batch) {
      processed++;
      try {
        const feedbackForScoring = {
          title: row.title || '',
          description: row.description || '',
          type: row.type,
          source_type: row.source_type
        };

        const qualityScore = await calculateQualityScore(feedbackForScoring);
        const tier = getQualityTier(qualityScore.score);
        const suggestions = tier === 'low'
          ? generateImprovementSuggestions(qualityScore.dimensions)
          : null;

        const qualityAssessment = {
          score: qualityScore.score,
          tier,
          dimensions: qualityScore.dimensions,
          suggestions
        };

        if (!DRY_RUN) {
          const { error: updateErr } = await supabase
            .from('feedback')
            .update({
              rubric_score: qualityScore.score,
              quality_assessment: qualityAssessment
            })
            .eq('id', row.id);

          if (updateErr) {
            console.error(`[Backfill] Update failed for ${row.id}:`, updateErr.message);
            failed++;
            continue;
          }
        }

        scored++;
        if (scored % 10 === 0) {
          console.log(`[Backfill] Progress: ${scored}/${count} scored (${failed} failed)`);
        }
      } catch (err) {
        console.error(`[Backfill] Score failed for ${row.id}:`, err.message);
        failed++;
      }
    }

    // Use fixed offset increment since we're querying IS NULL rows
    // that get updated (no longer NULL) after each batch
    if (DRY_RUN) {
      offset += BATCH_SIZE;
    }
    // When not dry-run, offset stays at 0 because scored rows drop out of the IS NULL filter
  }

  console.log('');
  console.log('[Backfill] Complete!');
  console.log(`  Processed: ${processed}`);
  console.log(`  Scored:    ${scored}`);
  console.log(`  Failed:    ${failed}`);
  if (DRY_RUN) console.log('  (DRY RUN - no changes written)');
}

backfill().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
