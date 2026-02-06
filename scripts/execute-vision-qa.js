#!/usr/bin/env node

/**
 * Vision QA Execution Wrapper
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
 *
 * Called by leo-continuous.js commandMap entry for 'vision-qa'.
 * Loads the current working SD and runs the Vision QA pipeline.
 *
 * Usage:
 *   node scripts/execute-vision-qa.js              # Run for current working SD
 *   node scripts/execute-vision-qa.js --sd-id UUID  # Run for specific SD
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const args = process.argv.slice(2);

  let sdId = null;
  const sdIdIdx = args.indexOf('--sd-id');
  if (sdIdIdx >= 0 && args[sdIdIdx + 1]) {
    sdId = args[sdIdIdx + 1];
  }

  // Find the SD to test
  let sd;
  if (sdId) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !data) {
      console.error(`SD not found: ${sdId}`);
      process.exit(1);
    }
    sd = data;
  } else {
    // Find the currently-working SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('is_working_on', true)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      console.error('No active working SD found. Use --sd-id to specify one.');
      process.exit(1);
    }
    sd = data;
  }

  console.log(`Vision QA target: ${sd.sd_key} (${sd.title})`);

  // Dynamic import to avoid loading pipeline at module level
  const { executeVisionQAPipeline } = await import('../lib/testing/vision-qa-pipeline.js');

  const result = await executeVisionQAPipeline(sd, {
    supabase,
    autoProceed: true
  });

  if (result.executed) {
    console.log(`\nVision QA completed: ${result.clean_pass ? 'CLEAN PASS' : 'ISSUES FOUND'}`);
    process.exit(result.clean_pass ? 0 : 1);
  } else {
    console.log(`\nVision QA skipped: ${result.reason}`);
    process.exit(0); // Skip is not an error
  }
}

main().catch(err => {
  console.error('Vision QA execution failed:', err.message);
  process.exit(1);
});
