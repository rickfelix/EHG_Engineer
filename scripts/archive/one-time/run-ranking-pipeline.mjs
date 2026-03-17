/**
 * Standalone Ranking Pipeline Runner
 *
 * Entry point for cron/scheduled execution of the app rankings pipeline.
 * Initializes Supabase client and runs all ranking data pollers.
 *
 * Usage: node scripts/run-ranking-pipeline.mjs
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-APP-RANKINGS-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { runRankingPipeline } from '../lib/eva/stage-zero/ranking-pipeline.js';

dotenv.config();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[RankingPipeline] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  console.log('═══════════════════════════════════════════════');
  console.log('  APP RANKINGS PIPELINE');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log();

  try {
    const result = await runRankingPipeline({
      supabase,
      logger: console,
      apiToken: process.env.PRODUCT_HUNT_API_TOKEN,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log();
    console.log('═══════════════════════════════════════════════');
    console.log('  PIPELINE SUMMARY');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Total records collected: ${result.totalNewRecords}`);
    console.log(`  Duration: ${elapsed}s`);
    console.log(`  Status: ✅ Complete`);
    console.log('═══════════════════════════════════════════════');
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error();
    console.error(`  ❌ Pipeline failed after ${elapsed}s: ${err.message}`);
    process.exit(1);
  }
}

main();
