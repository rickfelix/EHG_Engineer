#!/usr/bin/env node
/**
 * Batch Rescore Round 1 Vision Governance Children
 * SD: SD-MAN-INFRA-VISION-RESCORE-ROUND1-CHILDREN-001
 *
 * Scores all 14 children of SD-MAN-ORCH-EVA-VISION-GOVERNANCE-001
 * that lack organic post-implementation vision scores.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
import { scoreSD } from './vision-scorer.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const DRY_RUN = process.argv.includes('--dry-run');

// All 14 Round 1 children - hardcoded from DB query
const ROUND1_SD_KEYS = [
  'SD-MAN-INFRA-VISION-GOVERNANCE-DATABASE-001',
  'SD-MAN-INFRA-SEED-VISION-EXISTING-001',
  'SD-MAN-INFRA-DYNAMIC-VISION-ALIGNMENT-001',
  'SD-MAN-INFRA-CORRECTIVE-GENERATION-VISION-001',
  'SD-MAN-INFRA-EVA-VISION-COMMAND-001',
  'SD-MAN-INFRA-EVA-SCORE-COMMAND-001',
  'SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001',
  'SD-MAN-INFRA-EVA-RESEARCH-COMMAND-001',
  'SD-MAN-INFRA-EXTEND-LEARN-COMMAND-001',
  'SD-MAN-INFRA-VISION-SCORE-GATE-001',
  'SD-MAN-INFRA-VISION-SCORE-BADGE-001',
  'SD-MAN-INFRA-VISION-SCORE-NOTIFICATIONS-001',
  'SD-MAN-INFRA-TELEGRAM-ADAPTER-VISION-001',
  'SD-FIX-EVA-CORRECTIVE-QUALITY-001',
];

async function main() {
  console.log(`\n🔄 Batch Rescore Round 1 Vision Governance Children${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Target: ${ROUND1_SD_KEYS.length} SDs\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (const sdKey of ROUND1_SD_KEYS) {
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

    // Brief pause to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log('ROUND 1 RESCORE COMPLETE');
  console.log(`  ✅ Success: ${results.success.length}/${ROUND1_SD_KEYS.length}`);
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
