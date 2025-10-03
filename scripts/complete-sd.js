#!/usr/bin/env node

/**
 * COMPLETE STRATEGIC DIRECTIVE
 * One-command workflow to properly complete an SD
 * Runs all required sub-agents and validations
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function completeSD(sdId) {
  console.log(`\n🎯 COMPLETE STRATEGIC DIRECTIVE`);
  console.log(`═`.repeat(60));

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD not found: ${sdId}`);
    process.exit(1);
  }

  console.log(`SD: ${sd.sd_key} - ${sd.title}`);
  console.log(`Current Status: ${sd.status}`);
  console.log(`Progress: ${sd.progress}%`);

  // Step 1: Run required sub-agents
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`STEP 1: Running Required Sub-Agents`);
  console.log(`${'═'.repeat(60)}`);

  try {
    const { stdout: subagentOutput } = await execAsync(
      `node scripts/auto-run-subagents.js SD_STATUS_COMPLETED ${sdId} --comprehensive`
    );
    console.log(subagentOutput);
  } catch (error) {
    console.error(`\n❌ Sub-agents failed:\n${error.stdout || error.message}`);
    console.log(`\n⚠️  Fix errors above before proceeding`);
    process.exit(1);
  }

  // Step 2: Run approval checklist
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`STEP 2: Validating Completion Requirements`);
  console.log(`${'═'.repeat(60)}`);

  try {
    const { stdout: checklistOutput } = await execAsync(
      `node scripts/lead-approval-checklist.js ${sdId}`
    );
    console.log(checklistOutput);
  } catch (error) {
    console.error(`\n❌ Validation failed:\n${error.stdout || error.message}`);
    console.log(`\n⚠️  SD not ready for approval - fix issues above`);
    process.exit(1);
  }

  // Step 3: Summary and next steps
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ SD READY FOR COMPLETION`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`\n📋 Summary:`);
  console.log(`   ✅ All required sub-agents executed`);
  console.log(`   ✅ Retrospective generated`);
  console.log(`   ✅ DevOps verification complete`);
  console.log(`   ✅ All validation checks passed`);
  console.log(`\n🎯 Next Steps:`);
  console.log(`   1. Review the output above`);
  console.log(`   2. Mark SD as "completed" in dashboard`);
  console.log(`   3. Request LEAD approval`);
  console.log(`\n${sd.sd_key} is ready for final approval! 🎉\n`);
}

// CLI usage
async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log('Usage: node complete-sd.js <SD_UUID>');
    console.log('');
    console.log('Example:');
    console.log('  node complete-sd.js ccf6484d-9182-4879-a36a-33c7bbb1796c');
    console.log('');
    console.log('This script will:');
    console.log('  1. Run all required sub-agents (retrospective, DevOps, etc.)');
    console.log('  2. Validate all completion requirements');
    console.log('  3. Confirm SD is ready for LEAD approval');
    console.log('');
    process.exit(1);
  }

  try {
    await completeSD(sdId);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
