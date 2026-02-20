#!/usr/bin/env node
/**
 * Batch Rescore Round 2 Vision Improvement Children
 * SD: SD-MAN-INFRA-VISION-RESCORE-ROUND2-CHILDREN-001
 *
 * Scores all Round 2 children of SD-MAN-ORCH-EVA-VISION-IMPROVEMENT-001
 * that have zero vision scores or only test/sync scores.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { scoreSD } from './vision-scorer.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

// Round 2 SDs with no score or only test/invalid scores
const ROUND2_SD_KEYS = [
  'SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001',
  'SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001',
  'SD-MAN-INFRA-STATELESS-SHARED-SERVICES-001',
  'SD-LEO-INFRA-VISION-PROCESS-GAP-FEEDBACK-001',
  'SD-MAN-INFRA-PRIORITY-QUEUE-ROUTING-001',
];

async function main() {
  console.log(`\n🔄 Batch Rescore Round 2 Vision Improvement Children${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Target: ${ROUND2_SD_KEYS.length} SDs (those with no organic score)\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (const sdKey of ROUND2_SD_KEYS) {
    console.log('\n──────────────────────────────────────────');
    console.log(`Scoring: ${sdKey}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would score ${sdKey}`);
      results.skipped.push(sdKey);
      continue;
    }

    try {
      const score = await scoreSD({
        sdKey,
        visionKey: 'VISION-EHG-L1-001',
        archKey: 'ARCH-EHG-L1-001',
      });
      console.log(`  ✅ Score: ${score.total_score}/100 (${score.action}) | Dims: ${Object.keys(score.dimension_scores || {}).length}`);
      results.success.push({ sdKey, score: score.total_score });
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      results.failed.push({ sdKey, error: err.message });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log('ROUND 2 RESCORE COMPLETE');
  console.log(`  ✅ Success: ${results.success.length}/${ROUND2_SD_KEYS.length}`);
  console.log(`  ❌ Failed:  ${results.failed.length}`);
  console.log(`  ⏭  Skipped: ${results.skipped.length}`);

  if (results.success.length > 0) {
    const avg = Math.round(results.success.reduce((s, r) => s + r.score, 0) / results.success.length);
    console.log(`  📊 Avg score (successful): ${avg}/100`);
  }

  if (results.failed.length > 0) {
    console.log('\nFailed SDs:');
    results.failed.forEach(f => console.log(`  • ${f.sdKey}: ${f.error}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
