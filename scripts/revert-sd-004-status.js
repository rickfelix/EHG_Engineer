#!/usr/bin/env node

/**
 * Revert SD-004 from falsely completed status back to active
 * Emergency fix for LEO orchestrator false completion bug
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function revertSD004() {
  console.log(chalk.red.bold('=== EMERGENCY: REVERTING SD-004 FALSE COMPLETION ===\n'));

  try {
    // Check current status
    const { data: current, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-004')
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch SD-004: ${fetchError.message}`);
    }

    console.log(chalk.yellow('Current Status:'));
    console.log(`  Status: ${current.status}`);
    console.log(`  Phase: ${current.current_phase}`);
    console.log(`  Progress: ${current.progress}%`);
    console.log(`  Working On: ${current.is_working_on}`);
    console.log(`  Completion Date: ${current.completion_date}`);

    if (current.status !== 'completed') {
      console.log(chalk.green('\n✅ SD-004 is not marked as completed. No reversion needed.'));
      return;
    }

    // Revert to active status
    const { data: updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'active',
        is_working_on: false,
        current_phase: 'PLAN_DESIGN',
        progress: 60, // Back to planning stage
        completion_date: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...current.metadata,
          reverted_from_false_completion: true,
          reverted_at: new Date().toISOString(),
          original_false_completion: current.completion_date,
          reversion_reason: 'LEO orchestrator marked complete without actual implementation'
        }
      })
      .eq('id', 'SD-004')
      .select();

    if (updateError) {
      throw new Error(`Failed to update SD-004: ${updateError.message}`);
    }

    console.log(chalk.green('\n✅ SD-004 successfully reverted!'));
    console.log(chalk.cyan('New Status:'));
    console.log(`  Status: ${updated[0].status}`);
    console.log(`  Phase: ${updated[0].current_phase}`);
    console.log(`  Progress: ${updated[0].progress}%`);
    console.log(`  Reverted At: ${updated[0].metadata.reverted_at}`);

    // Also revert associated PRDs
    const { data: prds, error: prdError } = await supabase
      .from('product_requirements_v2')
      .update({
        status: 'draft',
        progress: 60,
        updated_at: new Date().toISOString()
      })
      .eq('sd_id', 'SD-004')
      .select();

    if (prdError) {
      console.log(chalk.yellow(`⚠️  Could not revert PRDs: ${prdError.message}`));
    } else {
      console.log(chalk.green(`✅ ${prds?.length || 0} associated PRDs reverted to draft status`));
    }

    console.log(chalk.blue.bold('\n📋 SD-004 is now ready for proper implementation!'));
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('1. Review PRD requirements'));
    console.log(chalk.gray('2. Navigate to /mnt/c/_EHG/EHG/ for implementation'));
    console.log(chalk.gray('3. Make actual code changes'));
    console.log(chalk.gray('4. Only mark complete after real implementation'));

  } catch (error) {
    console.error(chalk.red('\n❌ Reversion failed:'), error.message);
    process.exit(1);
  }
}

revertSD004()
  .then(() => {
    console.log(chalk.green.bold('\n🎉 Reversion complete!'));
    process.exit(0);
  })
  .catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });