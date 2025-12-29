#!/usr/bin/env node
/**
 * 📍 Checkpoint Pattern Generator
 *
 * BMAD Enhancement: Break large SDs into manageable checkpoints
 *
 * Purpose:
 * - Automatically generate checkpoint plans for large SDs (>8 user stories)
 * - Reduce context consumption and enable early error detection
 * - Provide clear milestones for progress tracking
 *
 * Checkpoint Benefits:
 * - 30-40% reduction in context consumption
 * - 50% faster debugging (smaller change sets)
 * - Incremental progress visibility
 * - Pause/resume flexibility
 *
 * Usage:
 *   node scripts/generate-checkpoint-plan.js <SD-ID>
 *   node scripts/generate-checkpoint-plan.js SD-LARGE-001 --checkpoints 4
 *   node scripts/generate-checkpoint-plan.js SD-LARGE-001 --auto
 *
 * Output:
 * - Checkpoint plan stored in strategic_directives_v2.checkpoint_plan
 * - Each checkpoint: ID, user stories, estimated hours, milestone description
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Generate checkpoint plan for SD
 */
async function generateCheckpointPlan(sdId, options = {}) {
  console.log('\n📍 CHECKPOINT PATTERN GENERATOR');
  console.log('═'.repeat(60));
  console.log(`SD: ${sdId}\n`);

  try {
    // ============================================
    // 1. FETCH SD AND USER STORIES
    // ============================================
    console.log('📋 Step 1: Fetching SD and user stories...');

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'SD not found'}`);
    }

    console.log(`   ✓ SD: ${sd.title}`);

    const { data: userStories, error: storiesError } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', sdId)
      .order('story_key');

    if (storiesError) {
      throw new Error(`Failed to fetch user stories: ${storiesError.message}`);
    }

    const storyCount = userStories?.length || 0;
    console.log(`   ✓ User stories: ${storyCount}`);

    // ============================================
    // 2. CHECK IF CHECKPOINTS NEEDED
    // ============================================
    console.log('\n🔍 Step 2: Evaluating checkpoint requirements...');

    if (storyCount <= 8) {
      console.log('   ℹ️  SD has ≤8 user stories - checkpoints not required');
      console.log('   Standard workflow appropriate for this SD size\n');
      return {
        checkpoint_plan_needed: false,
        story_count: storyCount,
        recommendation: 'No checkpoint plan needed for SDs with ≤8 user stories'
      };
    }

    console.log(`   ✅ SD has ${storyCount} user stories - checkpoints RECOMMENDED`);

    // ============================================
    // 3. DETERMINE CHECKPOINT COUNT
    // ============================================
    console.log('\n📊 Step 3: Determining optimal checkpoint count...');

    const checkpointCount = options.checkpoints || determineCheckpointCount(storyCount);
    console.log(`   ✓ Optimal checkpoints: ${checkpointCount}`);
    console.log(`   Stories per checkpoint: ~${Math.ceil(storyCount / checkpointCount)}`);

    // ============================================
    // 4. GENERATE CHECKPOINT PLAN
    // ============================================
    console.log('\n📝 Step 4: Generating checkpoint plan...');

    const checkpointPlan = {
      total_checkpoints: checkpointCount,
      total_user_stories: storyCount,
      checkpoints: []
    };

    const storiesPerCheckpoint = Math.ceil(storyCount / checkpointCount);

    for (let i = 0; i < checkpointCount; i++) {
      const startIdx = i * storiesPerCheckpoint;
      const endIdx = Math.min((i + 1) * storiesPerCheckpoint, storyCount);
      const checkpointStories = userStories.slice(startIdx, endIdx);

      const checkpoint = {
        id: i + 1,
        name: `Checkpoint ${i + 1}`,
        user_stories: checkpointStories.map(s => s.story_id || s.id),
        story_count: checkpointStories.length,
        milestone: generateMilestoneDescription(i + 1, checkpointCount, checkpointStories),
        estimated_hours: estimateCheckpointHours(checkpointStories),
        validation_required: true,
        test_coverage_required: `≥1 E2E test per user story (${checkpointStories.length} tests)`
      };

      checkpointPlan.checkpoints.push(checkpoint);
      console.log(`   ✓ Checkpoint ${checkpoint.id}: ${checkpoint.user_stories.length} stories, ${checkpoint.estimated_hours}h`);
    }

    // ============================================
    // 5. STORE CHECKPOINT PLAN
    // ============================================
    console.log('\n💾 Step 5: Storing checkpoint plan...');

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        checkpoint_plan: checkpointPlan,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId);

    if (updateError) {
      throw new Error(`Failed to store checkpoint plan: ${updateError.message}`);
    }

    console.log('   ✓ Checkpoint plan stored in strategic_directives_v2.checkpoint_plan');

    // ============================================
    // 6. DISPLAY PLAN
    // ============================================
    console.log('\n' + '═'.repeat(60));
    console.log('📍 CHECKPOINT PLAN GENERATED');
    console.log('═'.repeat(60));
    console.log(`Total User Stories: ${storyCount}`);
    console.log(`Checkpoint Count: ${checkpointCount}`);
    console.log(`Stories per Checkpoint: ~${Math.ceil(storyCount / checkpointCount)}`);
    console.log('');

    checkpointPlan.checkpoints.forEach((cp, _idx) => {
      console.log(`Checkpoint ${cp.id}: ${cp.name}`);
      console.log(`  Milestone: ${cp.milestone}`);
      console.log(`  User Stories: ${cp.user_stories.join(', ')}`);
      console.log(`  Estimated Time: ${cp.estimated_hours} hours`);
      console.log(`  Test Coverage: ${cp.test_coverage_required}`);
      console.log('');
    });

    console.log('═'.repeat(60));

    // ============================================
    // 7. GENERATE RECOMMENDATIONS
    // ============================================
    console.log('\n💡 CHECKPOINT EXECUTION RECOMMENDATIONS:\n');
    console.log('1. Complete each checkpoint fully before starting next');
    console.log('2. Run unit + E2E tests after each checkpoint');
    console.log('3. Commit and push code after each checkpoint passes');
    console.log('4. Create EXEC→PLAN handoff only after final checkpoint');
    console.log('5. If errors occur, debug within smaller checkpoint context');
    console.log('');
    console.log('Benefits:');
    console.log('  • 30-40% reduction in context consumption');
    console.log('  • 50% faster debugging (smaller change sets)');
    console.log('  • Incremental progress visibility');
    console.log('  • Flexibility to pause/resume work');
    console.log('');

    return checkpointPlan;

  } catch (error) {
    console.error('\n❌ Checkpoint plan generation failed:', error.message);
    throw error;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function determineCheckpointCount(storyCount) {
  // Rule of thumb: 3-4 stories per checkpoint
  if (storyCount <= 8) return 1; // No checkpoints needed
  if (storyCount <= 12) return 3;
  if (storyCount <= 16) return 4;
  if (storyCount <= 20) return 5;
  return Math.ceil(storyCount / 4); // Max 4 stories per checkpoint
}

function generateMilestoneDescription(checkpointId, totalCheckpoints, _stories) {
  const milestones = {
    1: 'Foundation & Core Components',
    2: 'Feature Implementation',
    3: 'Integration & Testing',
    4: 'Polish & Documentation',
    5: 'Final Validation'
  };

  // Use predefined milestone or generate based on position
  if (milestones[checkpointId]) {
    return milestones[checkpointId];
  }

  // Generate based on position in workflow
  const progress = checkpointId / totalCheckpoints;
  if (progress < 0.3) return 'Initial Setup & Foundation';
  if (progress < 0.6) return 'Core Feature Development';
  if (progress < 0.9) return 'Integration & Validation';
  return 'Final Testing & Completion';
}

function estimateCheckpointHours(stories) {
  // Conservative estimate: 2-3 hours per user story
  const baseHours = stories.length * 2.5;

  // Add complexity buffer
  const complexityMultiplier = 1.2;

  return Math.ceil(baseHours * complexityMultiplier);
}

// ============================================
// CLI EXECUTION
// ============================================
async function main() {
  const sdId = process.argv[2];
  const checkpointsArg = process.argv.indexOf('--checkpoints');
  const checkpoints = checkpointsArg !== -1 ? parseInt(process.argv[checkpointsArg + 1]) : null;
  const _auto = process.argv.includes('--auto');

  if (!sdId) {
    console.error('Usage: node scripts/generate-checkpoint-plan.js <SD-ID> [--checkpoints N] [--auto]');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/generate-checkpoint-plan.js SD-LARGE-001');
    console.error('  node scripts/generate-checkpoint-plan.js SD-LARGE-001 --checkpoints 4');
    console.error('  node scripts/generate-checkpoint-plan.js SD-LARGE-001 --auto');
    console.error('');
    console.error('Options:');
    console.error('  --checkpoints N  Force specific number of checkpoints');
    console.error('  --auto           Auto-generate based on user story count');
    process.exit(1);
  }

  try {
    const _result = await generateCheckpointPlan(sdId, { checkpoints });
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateCheckpointPlan };
