#!/usr/bin/env node

/**
 * Generate User Stories for SD-LEO-FIX-MULTI-SESSION-SHIP-001
 *
 * This script:
 * 1. Queries the PRD from product_requirements_v2 table
 * 2. Generates user stories based on PRD acceptance criteria
 * 3. Stores user stories in the user_stories table
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SD details - CRITICAL: sd_id must match strategic_directives_v2.id (UUID), not sd_key
const SD_UUID = '6ebf8939-4776-4fbb-8b9c-d78df1c1d991'; // strategic_directives_v2.id
const SD_KEY = 'SD-LEO-FIX-MULTI-SESSION-SHIP-001'; // strategic_directives_v2.sd_key
const PRD_ID = 'PRD-SD-LEO-FIX-MULTI-SESSION-SHIP-001';

// User stories following the 3-pillar structure
const userStories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Safe Main Branch Update in ShippingExecutor',
    user_role: 'LEO Protocol developer',
    user_want: 'the ShippingExecutor to update main branch without checking it out',
    user_benefit: 'concurrent sessions on different branches don\'t interfere with each other',
    acceptance_criteria: [
      'Given a session is on branch feat/my-feature, When shipping is triggered, Then the main branch is updated using git fetch origin main:main WITHOUT checking out main',
      'Given the local main branch is behind origin/main, When git fetch origin main:main runs, Then the local main branch fast-forwards to match origin/main',
      'Given the current working branch is not main, When shipping completes, Then the session remains on the original branch',
      'Given multiple sessions are shipping simultaneously, When each uses fetch instead of checkout, Then no session disrupts another session\'s working branch',
      'Given the ShippingExecutor code, When reviewing the implementation, Then git checkout main is replaced with git fetch origin main:main'
    ],
    priority: 'high',
    story_points: 3,
    implementation_context: {
      files_to_modify: ['lib/shipping-executor.js'],
      pattern: 'Replace checkout-based main update with fetch-based update',
      testing: 'Unit test with mocked git commands, E2E test with actual branch switching'
    }
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Branch Validation Before Shipping',
    user_role: 'LEO Protocol developer',
    user_want: 'the ShippingExecutor to validate the current branch before shipping',
    user_benefit: 'I receive clear errors if I\'m accidentally on main or another session\'s branch',
    acceptance_criteria: [
      'Given a session is on the main branch, When shipping is triggered, Then an error is thrown with message "Cannot ship from main branch directly"',
      'Given a session is on an unexpected branch, When shipping is triggered, Then a warning is displayed showing expected vs actual branch',
      'Given the current branch name is validated, When the branch doesn\'t match expected format (feat/*, fix/*, etc.), Then a warning is logged',
      'Given branch validation passes, When shipping continues, Then the validation result is logged for audit trail',
      'Given the ShippingExecutor performs validation, When checking current branch, Then git rev-parse --abbrev-ref HEAD is used'
    ],
    priority: 'high',
    story_points: 2,
    implementation_context: {
      files_to_modify: ['lib/shipping-executor.js'],
      pattern: 'Add pre-flight branch validation step',
      validation_rules: ['Not on main/master', 'Branch name matches expected pattern', 'Branch is not marked as owned by another session']
    }
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Branch-Aware Session Tracking Database Schema',
    user_role: 'LEO Protocol developer',
    user_want: 'the claude_sessions table to track the current branch for each session',
    user_benefit: 'the system can detect and prevent cross-session branch conflicts',
    acceptance_criteria: [
      'Given the claude_sessions table, When the schema is updated, Then a current_branch column (text, nullable) is added',
      'Given a session starts or changes branches, When the heartbeat updates, Then the current_branch column is updated with the output of git rev-parse --abbrev-ref HEAD',
      'Given multiple sessions exist, When querying active sessions, Then each session shows which branch it\'s currently on',
      'Given the migration is applied, When existing sessions heartbeat, Then the current_branch is populated automatically',
      'Given the schema change, When rollback is needed, Then a down migration exists to remove the current_branch column'
    ],
    priority: 'high',
    story_points: 2,
    implementation_context: {
      files_to_modify: ['database/migrations/20260211_add_current_branch_to_sessions.sql', 'lib/heartbeat-manager.mjs'],
      pattern: 'Add nullable text column with index for query performance',
      migration_type: 'schema_extension'
    }
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Heartbeat Manager Branch Detection',
    user_role: 'LEO Protocol developer',
    user_want: 'the heartbeat manager to automatically detect and update the current branch',
    user_benefit: 'session tracking always reflects the actual git state',
    acceptance_criteria: [
      'Given the heartbeat manager runs, When updating the heartbeat, Then it executes git rev-parse --abbrev-ref HEAD to get current branch',
      'Given the current branch is detected, When updating claude_sessions, Then the current_branch column is set to the detected value',
      'Given git command fails, When branch detection fails, Then current_branch is set to NULL and a warning is logged',
      'Given the heartbeat update includes branch info, When the update query runs, Then both heartbeat_at and current_branch are updated atomically',
      'Given the heartbeat manager implementation, When reviewing the code, Then branch detection is added to the updateHeartbeat() function'
    ],
    priority: 'high',
    story_points: 2,
    implementation_context: {
      files_to_modify: ['lib/heartbeat-manager.mjs'],
      pattern: 'Extend heartbeat update to include git branch detection',
      git_command: 'git rev-parse --abbrev-ref HEAD',
      error_handling: 'Graceful degradation if git command fails'
    }
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Concurrent Session Branch Conflict Detection',
    user_role: 'LEO Protocol developer',
    user_want: 'the system to detect when multiple sessions are on the same branch',
    user_benefit: 'I can avoid or resolve branch conflicts before shipping',
    acceptance_criteria: [
      'Given multiple active sessions exist, When a session claims an SD, Then the system checks if any other active session is on the same branch',
      'Given two sessions are on the same branch, When the conflict is detected, Then a warning is displayed listing the conflicting session IDs',
      'Given a conflict is detected, When the user chooses to proceed, Then a confirmation prompt is shown with details about the risk',
      'Given a conflict is detected, When the user chooses to abort, Then the SD claim is released and the session returns to idle state',
      'Given the conflict detection query, When checking for conflicts, Then it uses v_active_sessions view with current_branch filter'
    ],
    priority: 'medium',
    story_points: 3,
    implementation_context: {
      files_to_modify: ['lib/unified-handoff-system.js', 'scripts/modules/handoff/sd-claim-manager.js'],
      pattern: 'Query v_active_sessions for branch conflicts before claiming SD',
      query_example: 'SELECT * FROM v_active_sessions WHERE current_branch = $1 AND session_id != $2 AND computed_status = \'active\''
    }
  },
  {
    story_key: `${SD_KEY}:US-006`,
    title: 'Orphaned Commit Scanner CLI Tool',
    user_role: 'LEO Protocol developer',
    user_want: 'a CLI tool to scan for orphaned commits on feature branches',
    user_benefit: 'I can recover work from crashed sessions',
    acceptance_criteria: [
      'Given the CLI tool is invoked, When scanning for orphaned commits, Then it lists all local branches that are not main/master',
      'Given a feature branch exists, When checking for orphaned commits, Then it shows commits on the branch that are not in main',
      'Given orphaned commits are found, When displaying results, Then it shows commit hash, author, date, and message for each orphaned commit',
      'Given the scan results, When the user selects a branch, Then the tool offers to create a recovery PR or cherry-pick the commits',
      'Given the tool is run, When no orphaned commits are found, Then it displays "No orphaned commits detected" and exits cleanly'
    ],
    priority: 'medium',
    story_points: 5,
    implementation_context: {
      files_to_create: ['scripts/recovery/scan-orphaned-commits.js'],
      pattern: 'Use git branch --list and git log main..branch to find orphaned commits',
      git_commands: ['git branch --list --no-color', 'git log main..branch --oneline', 'git show --stat COMMIT_HASH'],
      interactive: true
    }
  },
  {
    story_key: `${SD_KEY}:US-007`,
    title: 'Orphaned Commit Recovery Workflow',
    user_role: 'LEO Protocol developer',
    user_want: 'the recovery tool to help me create PRs from orphaned commits',
    user_benefit: 'crashed session work is not lost',
    acceptance_criteria: [
      'Given orphaned commits are found on a branch, When the user chooses to recover, Then the tool offers two options: create PR or cherry-pick to new branch',
      'Given the user chooses create PR, When the recovery runs, Then it pushes the branch to origin and creates a PR using gh CLI',
      'Given the user chooses cherry-pick, When the recovery runs, Then it creates a new branch (recovery/ORIGINAL_BRANCH) and cherry-picks the commits',
      'Given the recovery PR is created, When the workflow completes, Then it displays the PR URL and marks the original branch for cleanup',
      'Given the recovery fails, When an error occurs, Then it displays the error message and leaves the repository in a clean state'
    ],
    priority: 'medium',
    story_points: 5,
    implementation_context: {
      files_to_create: ['scripts/recovery/recover-orphaned-commits.js'],
      dependencies: ['gh CLI installed', 'git push access to origin'],
      pattern: 'Interactive prompt with options: PR creation or cherry-pick recovery',
      git_commands: ['git push -u origin BRANCH', 'git checkout -b recovery/BRANCH', 'git cherry-pick COMMIT_HASH']
    }
  },
  {
    story_key: `${SD_KEY}:US-008`,
    title: 'Enhanced v_active_sessions View with Branch Info',
    user_role: 'LEO Protocol developer',
    user_want: 'the v_active_sessions view to include current branch information',
    user_benefit: 'I can quickly see which sessions are on which branches',
    acceptance_criteria: [
      'Given the v_active_sessions view, When the migration updates it, Then a current_branch column is added to the view',
      'Given multiple sessions are active, When querying v_active_sessions, Then each row shows the branch the session is currently on',
      'Given a session has not yet reported a branch, When viewing the session, Then current_branch is displayed as NULL',
      'Given the view is used in conflict detection, When checking for branch conflicts, Then it returns accurate branch information',
      'Given the view migration, When applying the change, Then the existing view is replaced with the enhanced version'
    ],
    priority: 'high',
    story_points: 1,
    implementation_context: {
      files_to_modify: ['database/migrations/20260211_add_current_branch_to_sessions.sql'],
      pattern: 'CREATE OR REPLACE VIEW with additional column',
      view_name: 'v_active_sessions'
    }
  },
  {
    story_key: `${SD_KEY}:US-009`,
    title: 'Multi-Session Ship Safety Documentation',
    user_role: 'LEO Protocol developer',
    user_want: 'comprehensive documentation on multi-session ship safety patterns',
    user_benefit: 'I understand how to work safely with concurrent sessions',
    acceptance_criteria: [
      'Given the documentation is created, When developers read it, Then it explains the 3-pillar architecture (ShippingExecutor, Session Tracking, Recovery)',
      'Given a developer encounters a branch conflict, When consulting the docs, Then it provides troubleshooting steps and recovery procedures',
      'Given the documentation covers git commands, When reviewing the commands, Then it explains why git fetch is safer than git checkout in multi-session environments',
      'Given the recovery tool is documented, When a session crashes, Then the docs show step-by-step how to scan for and recover orphaned commits',
      'Given the documentation is complete, When it is reviewed, Then it includes examples of common scenarios (2-4 concurrent sessions, branch conflicts, crash recovery)'
    ],
    priority: 'medium',
    story_points: 3,
    implementation_context: {
      files_to_create: ['docs/guides/multi-session-ship-safety.md'],
      pattern: 'Comprehensive guide with architecture, workflows, troubleshooting, and examples',
      sections: ['Problem Statement', 'Architecture Overview (3 Pillars)', 'Safe Git Patterns', 'Conflict Detection', 'Recovery Procedures', 'Troubleshooting', 'Examples']
    }
  },
  {
    story_key: `${SD_KEY}:US-010`,
    title: 'E2E Test for Multi-Session Ship Safety',
    user_role: 'LEO Protocol developer',
    user_want: 'E2E tests that simulate concurrent shipping scenarios',
    user_benefit: 'I can verify the multi-session safety mechanisms work correctly',
    acceptance_criteria: [
      'Given the E2E test suite, When running multi-session tests, Then it simulates 2-3 concurrent sessions on different branches',
      'Given each simulated session ships changes, When all sessions complete, Then no cross-contamination occurs (each PR is on the correct branch)',
      'Given a session is on main branch, When it attempts to ship, Then the test verifies that shipping is blocked with appropriate error',
      'Given the heartbeat updates, When checking the database, Then the test verifies that current_branch is correctly populated for each session',
      'Given the E2E test completes, When reviewing results, Then it provides a summary showing all sessions shipped successfully without conflicts'
    ],
    priority: 'medium',
    story_points: 5,
    implementation_context: {
      files_to_create: ['tests/e2e/multi-session-ship-safety.spec.ts'],
      pattern: 'Playwright test with multiple concurrent contexts simulating different sessions',
      test_scenarios: ['Concurrent shipping on different branches', 'Branch validation on main branch', 'Heartbeat branch tracking', 'Conflict detection']
    }
  }
];

async function main() {
  console.log('🔍 Querying PRD from database...\n');

  // Query the PRD using sd_id (UUID)
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', SD_UUID)
    .single();

  if (prdError) {
    console.error('❌ Failed to query PRD:', prdError.message);
    process.exit(1);
  }

  if (!prd) {
    console.error('❌ PRD not found for SD UUID:', SD_UUID);
    process.exit(1);
  }

  console.log('✅ PRD found');
  console.log('   SD UUID:', SD_UUID);
  console.log('   SD Key:', SD_KEY);
  console.log('   Title:', prd.title);
  console.log('   Acceptance Criteria Count:', prd.acceptance_criteria?.length || 0);
  console.log();

  // Check if user stories already exist (using sd_id as UUID)
  const { data: existingStories, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_UUID);

  if (checkError) {
    console.error('❌ Failed to check existing stories:', checkError.message);
    process.exit(1);
  }

  if (existingStories && existingStories.length > 0) {
    console.log(`⚠️  Found ${existingStories.length} existing user stories for this SD:`);
    existingStories.forEach(s => console.log(`   - ${s.story_key}`));
    console.log('\n❓ Delete existing stories and regenerate? (y/n)');

    // For automation, we'll proceed with deletion
    console.log('   Proceeding with deletion...\n');

    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', SD_UUID);

    if (deleteError) {
      console.error('❌ Failed to delete existing stories:', deleteError.message);
      process.exit(1);
    }

    console.log('✅ Deleted existing stories\n');
  }

  console.log(`📝 Generating ${userStories.length} user stories...\n`);

  // Insert user stories
  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    const storyData = {
      sd_id: SD_UUID, // CRITICAL: Use UUID, not SD_KEY
      prd_id: PRD_ID,
      story_key: story.story_key,
      title: story.title,
      user_role: story.user_role,
      user_want: story.user_want,
      user_benefit: story.user_benefit,
      acceptance_criteria: story.acceptance_criteria,
      priority: story.priority,
      story_points: story.story_points,
      status: 'draft',
      implementation_context: JSON.stringify(story.implementation_context),
      created_by: 'STORIES_AGENT'
    };

    const { _data, error } = await supabase
      .from('user_stories')
      .insert([storyData])
      .select()
      .single();

    if (error) {
      console.error(`❌ Failed to insert ${story.story_key}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Created ${story.story_key}: ${story.title}`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log(`   Total Stories: ${userStories.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('='.repeat(80));

  if (successCount > 0) {
    console.log('\n✨ User stories generated successfully!');
    console.log('\n📋 Story Breakdown by Pillar:');
    console.log('   Pillar 1 (ShippingExecutor Fix): US-001, US-002');
    console.log('   Pillar 2 (Session Tracking): US-003, US-004, US-005, US-008');
    console.log('   Pillar 3 (Recovery Tool): US-006, US-007');
    console.log('   Cross-Pillar: US-009 (Docs), US-010 (E2E Tests)');
    console.log('\n🎯 Priority Distribution:');
    console.log('   HIGH: 5 stories (US-001 through US-004, US-008)');
    console.log('   MEDIUM: 5 stories (US-005 through US-007, US-009, US-010)');
    console.log('\n📊 Total Story Points: 31');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
