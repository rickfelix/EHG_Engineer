#!/usr/bin/env node
/**
 * DETECT STALE PATTERNS
 * LEO Protocol v4.3.2 Enhancement
 *
 * Analyzes issue_patterns table and:
 * - Updates trend to 'decreasing' for patterns not seen in 90 days
 * - Updates status to 'obsolete' for patterns not seen in 180 days
 * - Reports on pattern health and recommends cleanup
 *
 * Run weekly via cron or manually: node scripts/detect-stale-patterns.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Configuration
 */
const CONFIG = {
  DECREASING_THRESHOLD_DAYS: 90,   // Mark as 'decreasing' after 90 days
  OBSOLETE_THRESHOLD_DAYS: 180,    // Mark as 'obsolete' after 180 days
  DRY_RUN: process.argv.includes('--dry-run')
};

/**
 * Get days since last update
 */
function getDaysSince(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

/**
 * Analyze patterns and determine status updates
 */
async function analyzePatterns() {
  console.log('\n🔍 PATTERN STALENESS DETECTION');
  console.log('═'.repeat(60));
  console.log(`Mode: ${CONFIG.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Decreasing threshold: ${CONFIG.DECREASING_THRESHOLD_DAYS} days`);
  console.log(`Obsolete threshold: ${CONFIG.OBSOLETE_THRESHOLD_DAYS} days`);

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: issue_patterns is an unbounded
  // growing table and every row is iterated + potentially acted on below — paginate to
  // completion. Error policy preserved: catch, report, and return.
  let patterns;
  try {
    patterns = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('*')
      .order('updated_at', { ascending: true })
      .order('pattern_id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) {
    console.error('❌ Error fetching patterns:', e.message);
    return;
  }

  if (!patterns || patterns.length === 0) {
    console.log('\nℹ️  No patterns found in database');
    return;
  }

  console.log(`\n📊 Analyzing ${patterns.length} patterns...\n`);

  const stats = {
    total: patterns.length,
    active: 0,
    decreasing: 0,
    obsolete: 0,
    resolved: 0,
    toMarkDecreasing: [],
    toMarkObsolete: [],
    healthy: []
  };

  for (const pattern of patterns) {
    const daysSinceUpdate = getDaysSince(pattern.updated_at);
    const currentStatus = pattern.status;
    const currentTrend = pattern.trend;

    // Skip already resolved patterns
    if (currentStatus === 'resolved') {
      stats.resolved++;
      continue;
    }

    // Check for obsolete (180+ days)
    if (daysSinceUpdate >= CONFIG.OBSOLETE_THRESHOLD_DAYS && currentStatus !== 'obsolete') {
      stats.toMarkObsolete.push({
        pattern_id: pattern.pattern_id,
        category: pattern.category,
        days_stale: daysSinceUpdate,
        current_status: currentStatus,
        occurrence_count: pattern.occurrence_count
      });
      stats.obsolete++;
    }
    // Check for decreasing (90-180 days)
    else if (daysSinceUpdate >= CONFIG.DECREASING_THRESHOLD_DAYS && currentTrend !== 'decreasing' && currentStatus === 'active') {
      stats.toMarkDecreasing.push({
        pattern_id: pattern.pattern_id,
        category: pattern.category,
        days_stale: daysSinceUpdate,
        current_trend: currentTrend,
        occurrence_count: pattern.occurrence_count
      });
      stats.decreasing++;
    }
    // Healthy/active patterns
    else if (currentStatus === 'active') {
      stats.active++;
      if (daysSinceUpdate < 30) {
        stats.healthy.push(pattern.pattern_id);
      }
    }
  }

  // Report findings
  console.log('📊 PATTERN HEALTH SUMMARY');
  console.log('─'.repeat(60));
  console.log(`Total patterns:     ${stats.total}`);
  console.log(`Active & healthy:   ${stats.active} (${Math.round(stats.active / stats.total * 100)}%)`);
  console.log(`Already resolved:   ${stats.resolved}`);
  console.log(`Need trend update:  ${stats.toMarkDecreasing.length}`);
  console.log(`Need obsolete mark: ${stats.toMarkObsolete.length}`);

  // Show patterns to mark as decreasing
  if (stats.toMarkDecreasing.length > 0) {
    console.log('\n📉 PATTERNS TO MARK AS DECREASING (90+ days stale)');
    console.log('─'.repeat(60));
    for (const p of stats.toMarkDecreasing) {
      console.log(`  ${p.pattern_id} | ${p.category.padEnd(15)} | ${p.days_stale} days | count: ${p.occurrence_count}`);
    }
  }

  // Show patterns to mark as obsolete
  if (stats.toMarkObsolete.length > 0) {
    console.log('\n🗄️  PATTERNS TO MARK AS OBSOLETE (180+ days stale)');
    console.log('─'.repeat(60));
    for (const p of stats.toMarkObsolete) {
      console.log(`  ${p.pattern_id} | ${p.category.padEnd(15)} | ${p.days_stale} days | count: ${p.occurrence_count}`);
    }
  }

  // Apply updates if not dry run
  if (!CONFIG.DRY_RUN) {
    console.log('\n🔄 APPLYING UPDATES...');

    // Update decreasing patterns
    for (const p of stats.toMarkDecreasing) {
      const { error: updateError } = await supabase
        .from('issue_patterns')
        .update({ trend: 'decreasing', updated_at: new Date().toISOString() })
        .eq('pattern_id', p.pattern_id);

      if (updateError) {
        console.error(`   ❌ Failed to update ${p.pattern_id}: ${updateError.message}`);
      } else {
        console.log(`   ✅ Marked ${p.pattern_id} as 'decreasing'`);
      }
    }

    // Update obsolete patterns
    for (const p of stats.toMarkObsolete) {
      const { error: updateError } = await supabase
        .from('issue_patterns')
        .update({ status: 'obsolete', trend: 'decreasing', updated_at: new Date().toISOString() })
        .eq('pattern_id', p.pattern_id);

      if (updateError) {
        console.error(`   ❌ Failed to update ${p.pattern_id}: ${updateError.message}`);
      } else {
        console.log(`   ✅ Marked ${p.pattern_id} as 'obsolete'`);
      }
    }

    console.log('\n✅ Updates applied successfully');
  } else {
    console.log('\n⚠️  DRY RUN - No changes made');
    console.log('   Run without --dry-run to apply updates');
  }

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('─'.repeat(60));

  if (stats.toMarkObsolete.length > 0) {
    console.log(`  • Review ${stats.toMarkObsolete.length} obsolete patterns - consider deleting if truly resolved`);
  }

  if (stats.active < stats.total * 0.5) {
    console.log('  • Less than 50% of patterns are active - consider cleaning up old patterns');
  }

  if (stats.healthy.length < 5) {
    console.log('  • Few recent patterns - knowledge capture may be declining');
  }

  return stats;
}

// Run
analyzePatterns()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
