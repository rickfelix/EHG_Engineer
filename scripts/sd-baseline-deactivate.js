#!/usr/bin/env node

/**
 * SD Baseline Deactivate
 *
 * Deactivates the current active baseline, allowing the fallback queue
 * to show all available SDs regardless of baseline membership.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}SD BASELINE DEACTIVATION${colors.reset}\n`);

  // Find active baseline
  const { data: baseline, error } = await supabase
    .from('sd_execution_baselines')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !baseline) {
    console.log(`${colors.yellow}No active baseline found.${colors.reset}`);
    console.log(`${colors.dim}Nothing to deactivate.${colors.reset}\n`);
    process.exit(0);
  }

  // Get baseline items
  const { data: items } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, track')
    .eq('baseline_id', baseline.id);

  // Count completed vs non-completed
  let completedCount = 0;
  let activeCount = 0;

  for (const item of items || []) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .eq('legacy_id', item.sd_id)
      .single();

    if (sd?.status === 'completed') {
      completedCount++;
    } else {
      activeCount++;
    }
  }

  console.log(`${colors.bold}Current Active Baseline:${colors.reset}`);
  console.log(`  ID: ${baseline.id.substring(0, 8)}...`);
  console.log(`  Created: ${new Date(baseline.created_at).toLocaleDateString()}`);
  console.log(`  Total SDs: ${items?.length || 0}`);
  console.log(`  ${colors.green}Completed: ${completedCount}${colors.reset}`);
  console.log(`  ${activeCount > 0 ? colors.yellow : colors.dim}Active: ${activeCount}${colors.reset}\n`);

  if (activeCount > 0) {
    console.log(`${colors.yellow}⚠️  Warning: This baseline has ${activeCount} non-completed SD(s).${colors.reset}`);
    console.log(`${colors.dim}Deactivating will remove them from the prioritized queue.${colors.reset}\n`);
  }

  // Check for --force flag
  if (process.argv.includes('--force') || process.argv.includes('-f')) {
    await deactivateBaseline(baseline.id);
    return;
  }

  // Interactive confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Deactivate this baseline? [y/N]: ', async (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      await deactivateBaseline(baseline.id);
    } else {
      console.log(`\n${colors.dim}Cancelled. Baseline remains active.${colors.reset}\n`);
    }
  });
}

async function deactivateBaseline(baselineId) {
  const { error } = await supabase
    .from('sd_execution_baselines')
    .update({ is_active: false })
    .eq('id', baselineId);

  if (error) {
    console.log(`${colors.red}Error deactivating baseline: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.green}✓ Baseline deactivated successfully.${colors.reset}`);
  console.log(`${colors.dim}Run 'npm run sd:next' to see all available SDs.${colors.reset}`);
  console.log(`${colors.dim}Run 'npm run sd:baseline' to create a new baseline.${colors.reset}\n`);
}

main().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
