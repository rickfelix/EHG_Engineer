#!/usr/bin/env node

/**
 * Check Story Release Gates
 * Verifies the status of user story verification and release readiness
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkStoryGates() {
  console.log('🔍 Checking Story Release Gates\n');
  console.log('=' .repeat(60));

  try {
    // Check if views exist
    const { data: _stories, error: storiesError } = await supabase
      .from('v_story_verification_status')
      .select('*')
      .limit(1);

    if (storiesError) {
      if (storiesError.message.includes('relation') || storiesError.message.includes('does not exist')) {
        console.log('❌ Story views not found. Migration may not be applied.');
        console.log('   Run: database/migrations/2025-01-17-user-stories.sql');
        return;
      }
      throw storiesError;
    }

    // Get release gate summary
    const { data: gates, error: gatesError } = await supabase
      .from('v_sd_release_gate')
      .select('*')
      .order('sd_key');

    if (gatesError && !gatesError.message.includes('relation')) {
      throw gatesError;
    }

    if (!gates || gates.length === 0) {
      console.log('📊 No Strategic Directives with stories found.\n');
      console.log('To add stories:');
      console.log('1. Ensure an SD has a PRD with acceptance_criteria');
      console.log('2. Call POST /api/stories/generate');
      return;
    }

    // Display gate status
    console.log('📊 Release Gate Status:\n');
    console.log('SD Key'.padEnd(20), 'Stories', 'Pass', 'Fail', 'Skip', 'Ready?', 'Coverage');
    console.log('-'.repeat(70));

    let readyCount = 0;
    let totalSDs = gates.length;

    gates.forEach(gate => {
      const ready = gate.ready ? '✅ YES' : '❌ NO';
      const coverage = gate.passing_pct ? `${gate.passing_pct}%` : '0%';

      console.log(
        gate.sd_key.padEnd(20),
        String(gate.total_stories).padEnd(7),
        String(gate.passing_count).padEnd(4),
        String(gate.failing_count).padEnd(4),
        String(gate.not_run_count).padEnd(4),
        ready.padEnd(7),
        coverage
      );

      if (gate.ready) readyCount++;
    });

    console.log('-'.repeat(70));

    // Summary statistics
    console.log('\n📈 Summary:');
    console.log(`  Total SDs with stories: ${totalSDs}`);
    console.log(`  Ready for release: ${readyCount} (${Math.round(readyCount/totalSDs*100)}%)`);
    console.log(`  Blocked: ${totalSDs - readyCount}`);

    // Get detailed story status for non-ready SDs
    const blockedGates = gates.filter(g => !g.ready);
    if (blockedGates.length > 0) {
      console.log('\n⚠️  Blocked SDs (not all stories passing):');

      for (const gate of blockedGates) {
        const { data: failingStories } = await supabase
          .from('v_story_verification_status')
          .select('story_key, story_title, status')
          .eq('sd_key', gate.sd_key)
          .in('status', ['failing', 'not_run'])
          .limit(3);

        console.log(`\n  ${gate.sd_key}:`);
        if (failingStories && failingStories.length > 0) {
          failingStories.forEach(story => {
            const statusIcon = story.status === 'failing' ? '❌' : '⏸️';
            console.log(`    ${statusIcon} ${story.story_key}: ${story.story_title}`);
          });
          if (gate.failing_count + gate.not_run_count > 3) {
            console.log(`    ... and ${gate.failing_count + gate.not_run_count - 3} more`);
          }
        }
      }
    }

    // Check for recent verifications
    console.log('\n🕐 Recent Verifications:');
    const { data: recentVerifications } = await supabase
      .from('v_story_verification_status')
      .select('story_key, status, last_run_at, coverage_pct')
      .not('last_run_at', 'is', null)
      .order('last_run_at', { ascending: false })
      .limit(5);

    if (recentVerifications && recentVerifications.length > 0) {
      recentVerifications.forEach(v => {
        const statusIcon = v.status === 'passing' ? '✅' : v.status === 'failing' ? '❌' : '⏸️';
        const coverage = v.coverage_pct ? `${v.coverage_pct}%` : 'N/A';
        const runTime = new Date(v.last_run_at).toLocaleString();
        console.log(`  ${statusIcon} ${v.story_key} - Coverage: ${coverage} - ${runTime}`);
      });
    } else {
      console.log('  No recent verifications found');
    }

    // Feature flag status
    console.log('\n🚦 Feature Flag Status:');
    const flags = {
      FEATURE_AUTO_STORIES: process.env.FEATURE_AUTO_STORIES === 'true',
      FEATURE_STORY_UI: process.env.FEATURE_STORY_UI === 'true',
      FEATURE_STORY_AGENT: process.env.FEATURE_STORY_AGENT === 'true',
      FEATURE_STORY_GATES: process.env.FEATURE_STORY_GATES === 'true'
    };

    Object.entries(flags).forEach(([key, value]) => {
      const icon = value ? '✅' : '⭕';
      console.log(`  ${icon} ${key}: ${value ? 'ENABLED' : 'DISABLED'}`);
    });

    console.log('\n' + '='.repeat(60));

    // Exit code based on readiness
    if (readyCount === totalSDs && totalSDs > 0) {
      console.log('✅ All SDs ready for release!');
      process.exit(0);
    } else if (readyCount > 0) {
      console.log(`⚠️  ${readyCount}/${totalSDs} SDs ready for release`);
      process.exit(1);
    } else {
      console.log('❌ No SDs ready for release');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error checking story gates:', error.message);
    process.exit(1);
  }
}

// Run the check
checkStoryGates().catch(console.error);