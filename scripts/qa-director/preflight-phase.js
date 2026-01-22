/**
 * QA Engineering Director - Pre-flight Phase
 * User stories, build, migrations, dependencies, integration checks
 */

import { validateBuild } from '../modules/qa/build-validator.js';
import { verifyDatabaseMigrations } from '../modules/qa/migration-verifier.js';
import { verifyComponentIntegration, findNewComponents } from '../modules/qa/integration-checker.js';
import { checkCrossSDDependencies } from '../modules/qa/dependency-checker.js';
import { executePendingMigrations } from '../modules/qa/migration-executor.js';
import { isUISD } from './helpers.js';

/**
 * Execute pre-flight phase checks
 * @param {Object} supabase - Supabase client
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Pre-flight results or blocker info
 */
export async function executePreflightPhase(supabase, sd_id, sd, options) {
  const { targetApp, skipBuild, skipMigrations, autoExecuteMigrations } = options;
  const preFlightResults = {};

  console.log('📋 PHASE 1: PRE-FLIGHT CHECKS');
  console.log('───────────────────────────────────────────────────────────\n');

  // 1.0: MANDATORY User Story Validation
  console.log('📝 Checking user stories (MANDATORY)...');
  const { data: userStories, error: userStoriesError } = await supabase
    .from('user_stories')
    .select('story_key, title, status')
    .eq('sd_id', sd_id);

  if (userStoriesError) {
    console.log('   ❌ Error querying user stories:', userStoriesError.message);
    return {
      blocked: true,
      blocker: 'User story validation failed',
      error: userStoriesError.message,
      preFlightResults
    };
  }

  if (!userStories || userStories.length === 0) {
    console.log('   ❌ BLOCKED: No user stories found');
    console.log('   📋 Product Requirements Expert must run first');
    console.log('   💡 User stories are MANDATORY before testing\n');

    preFlightResults.user_stories = {
      verdict: 'BLOCKED',
      stories_count: 0,
      message: 'No user stories found. Product Requirements Expert sub-agent must generate user stories before testing can proceed.',
      recommendation: 'Trigger Product Requirements Expert sub-agent to generate user stories from PRD'
    };

    return {
      blocked: true,
      blocker: 'No user stories found - Product Requirements Expert must run first',
      preFlightResults,
      recommendations: [{
        type: 'USER_STORIES',
        priority: 'CRITICAL',
        message: 'Generate user stories via Product Requirements Expert sub-agent before proceeding with testing'
      }]
    };
  }

  console.log(`   ✅ User stories found: ${userStories.length}`);
  const completedStories = userStories.filter(s => s.status === 'completed').length;
  console.log(`   📊 Status: ${completedStories}/${userStories.length} completed\n`);

  preFlightResults.user_stories = {
    verdict: 'PASS',
    stories_count: userStories.length,
    completed_count: completedStories,
    stories: userStories.map(s => ({ key: s.story_key, title: s.title, status: s.status }))
  };

  // 1.1: Build Validation
  if (!skipBuild) {
    console.log('🔨 Running build validation...');
    const buildResult = await validateBuild(targetApp);
    preFlightResults.build = buildResult;

    if (buildResult.verdict === 'BLOCKED') {
      console.log('   ❌ Build FAILED - blocking test execution');
      console.log(`   Errors: ${buildResult.errors_count}`);
      console.log(`   Time saved: ${buildResult.time_saved}\n`);

      return {
        blocked: true,
        blocker: 'Build validation failed',
        preFlightResults,
        recommendations: buildResult.recommendations
      };
    }

    console.log(`   ✅ Build PASSED (${buildResult.time_saved} saved)\n`);
  }

  // 1.2: Database Migration Verification
  if (!skipMigrations) {
    console.log('🗄️  Checking database migrations...');
    const migrationResult = await verifyDatabaseMigrations(sd_id, targetApp);
    preFlightResults.migrations = migrationResult;

    if (migrationResult.verdict === 'BLOCKED') {
      console.log('   ⚠️  Pending migrations detected');
      console.log(`   Pending: ${migrationResult.pending_migrations.length}`);

      if (autoExecuteMigrations) {
        console.log('   🚀 Auto-executing migrations...');
        const executionResult = await executePendingMigrations(
          migrationResult.pending_migrations.map(filename => ({
            filename,
            filepath: migrationResult.instructions.file_location
          })),
          targetApp
        );

        preFlightResults.migration_execution = executionResult;

        if (executionResult.verdict === 'FAILED') {
          console.log('   ❌ Migration execution FAILED');
          return {
            blocked: true,
            blocker: 'Database migrations failed to execute',
            preFlightResults
          };
        }

        console.log(`   ✅ Migrations applied (${executionResult.time_saved} saved)\n`);
      } else {
        console.log('   ℹ️  Manual migration required');
        console.log(`   Instructions: ${migrationResult.instructions.manual_cli}\n`);

        return {
          blocked: true,
          blocker: 'Database migrations not applied',
          preFlightResults,
          instructions: migrationResult.instructions
        };
      }
    } else if (migrationResult.verdict === 'PASS') {
      console.log('   ✅ All migrations applied\n');
    } else {
      console.log(`   ℹ️  No migrations found for ${sd_id}\n`);
    }
  }

  // 1.3: Cross-SD Dependency Check
  console.log('🔗 Checking cross-SD dependencies...');
  const dependencyResult = await checkCrossSDDependencies(sd_id, targetApp);
  preFlightResults.dependencies = dependencyResult;

  if (dependencyResult.verdict === 'WARNING') {
    console.log(`   ⚠️  ${dependencyResult.conflicts_count} potential conflict(s) detected`);
    console.log('   Recommendations provided in summary\n');
  } else {
    console.log('   ✅ No dependency conflicts\n');
  }

  // 1.4: Component Integration Check (if UI SD)
  if (isUISD(sd)) {
    console.log('🧩 Checking component integration...');
    const newComponents = await findNewComponents(targetApp);

    if (newComponents.length > 0) {
      const integrationResult = await verifyComponentIntegration(newComponents, targetApp);
      preFlightResults.integration = integrationResult;

      if (integrationResult.verdict === 'WARNING') {
        console.log(`   ⚠️  ${integrationResult.warnings_count} component(s) not integrated`);
        console.log('   See details in summary\n');
      } else {
        console.log(`   ✅ All components integrated (${integrationResult.integrations_found}/${integrationResult.components_checked})\n`);
      }
    } else {
      console.log('   ℹ️  No new components found\n');
    }
  }

  return { blocked: false, preFlightResults };
}
