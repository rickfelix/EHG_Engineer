#!/usr/bin/env node
/**
 * Feedback Clusterer
 *
 * Promotes recurring feedback items and quick_fixes to issue patterns.
 * Bridges the gap between raw feedback intake and curated pattern knowledge.
 *
 * SD: SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
 * SD: SD-LEO-ENH-QUICK-FIX-PATTERN-001 (quick_fix integration)
 *
 * Key Features:
 * - Groups feedback by error_hash
 * - Groups quick_fixes by title similarity
 * - Promotes clusters meeting threshold to draft patterns
 * - Prevents duplicate pattern creation via similarity check
 * - Supports dry-run mode for testing
 */

import { createClient } from '@supabase/supabase-js';
import { IssueKnowledgeBase } from './issue-knowledge-base.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const kb = new IssueKnowledgeBase();

// Promotion thresholds (from triangulation consensus)
const THRESHOLDS = {
  MIN_OCCURRENCES: 5,           // Standard: ≥5 occurrences
  TIME_WINDOW_DAYS: 14,         // Within 14 days
  CRITICAL_MIN_OCCURRENCES: 3,  // Critical severity: ≥3 occurrences (immediate)
  SIMILARITY_THRESHOLD: 0.5,    // Prevent duplicates if >50% similar
  MIN_SOURCE_DIVERSITY: 2,      // ≥2 different SDs/sources (optional)
  QUICK_FIX_MIN_OCCURRENCES: 3  // Quick fixes: lower threshold (3+)
};

/**
 * Find feedback clusters that are promotable to patterns
 */
async function findPromotableClusters() {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - THRESHOLDS.TIME_WINDOW_DAYS);

  // Query feedback grouped by error_hash
  const { data: clusters, error } = await supabase
    .from('feedback')
    .select('error_hash, category, description, title, severity, sd_id, id, created_at')
    .in('status', ['new', 'triaged'])
    .is('cluster_processed_at', null)
    .gte('created_at', windowStart.toISOString())
    .not('error_hash', 'is', null);

  if (error) {
    console.error('Error querying feedback:', error);
    throw error;
  }

  if (!clusters || clusters.length === 0) {
    console.log('  ℹ️  No unprocessed feedback found');
    return [];
  }

  // Group by error_hash
  const grouped = {};
  for (const item of clusters) {
    if (!grouped[item.error_hash]) {
      grouped[item.error_hash] = {
        error_hash: item.error_hash,
        items: [],
        categories: new Set(),
        sds: new Set(),
        severities: new Set()
      };
    }
    grouped[item.error_hash].items.push(item);
    grouped[item.error_hash].categories.add(item.category);
    grouped[item.error_hash].sds.add(item.sd_id);
    if (item.severity) grouped[item.error_hash].severities.add(item.severity);
  }

  // Evaluate each cluster for promotion
  const promotable = [];
  for (const [hash, cluster] of Object.entries(grouped)) {
    const evaluation = evaluateForPromotion(cluster);
    if (evaluation.shouldPromote) {
      promotable.push({
        error_hash: hash,
        ...cluster,
        ...evaluation,
        categories: Array.from(cluster.categories),
        sds: Array.from(cluster.sds),
        severities: Array.from(cluster.severities)
      });
    }
  }

  return promotable;
}

/**
 * Find quick_fix clusters that are promotable to patterns
 * SD-LEO-ENH-QUICK-FIX-PATTERN-001: Quick fix to pattern bridge
 */
async function findPromotableQuickFixClusters() {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - THRESHOLDS.TIME_WINDOW_DAYS);

  // Query quick_fixes - group by title similarity
  const { data: quickFixes, error } = await supabase
    .from('quick_fixes')
    .select('id, title, type, severity, description, escalated_to_sd_id, created_at')
    .in('status', ['open', 'completed'])
    .gte('created_at', windowStart.toISOString());

  if (error) {
    console.error('Error querying quick_fixes:', error);
    throw error;
  }

  if (!quickFixes || quickFixes.length === 0) {
    console.log('  ℹ️  No quick_fixes found in time window');
    return [];
  }

  // Group by normalized title (lowercase, trimmed)
  const grouped = {};
  for (const qf of quickFixes) {
    const normalizedTitle = qf.title.toLowerCase().trim();
    if (!grouped[normalizedTitle]) {
      grouped[normalizedTitle] = {
        title: qf.title,
        items: [],
        types: new Set(),
        severities: new Set()
      };
    }
    grouped[normalizedTitle].items.push(qf);
    grouped[normalizedTitle].types.add(qf.type);
    if (qf.severity) grouped[normalizedTitle].severities.add(qf.severity);
  }

  // Evaluate each cluster for promotion
  const promotable = [];
  for (const [key, cluster] of Object.entries(grouped)) {
    const count = cluster.items.length;

    // Quick fixes have lower threshold (3+)
    if (count >= THRESHOLDS.QUICK_FIX_MIN_OCCURRENCES) {
      promotable.push({
        title_key: key,
        ...cluster,
        types: Array.from(cluster.types),
        severities: Array.from(cluster.severities),
        shouldPromote: true,
        reason: `${count} quick_fixes with similar title (threshold: ${THRESHOLDS.QUICK_FIX_MIN_OCCURRENCES})`,
        promotionType: 'quick_fix',
        source: 'quick_fix_cluster'
      });
    }
  }

  return promotable;
}

/**
 * Create a draft pattern from a quick_fix cluster
 * SD-LEO-ENH-QUICK-FIX-PATTERN-001
 */
async function createQuickFixDraftPattern(cluster) {
  const firstItem = cluster.items[0];
  const representativeText = firstItem.title + (firstItem.description ? ': ' + firstItem.description : '');
  const category = cluster.types[0] || 'general';
  const severity = cluster.severities.has('critical') ? 'critical' :
                   cluster.severities.has('high') ? 'high' : 'medium';

  // Check for similar existing patterns
  const similar = await kb.search(representativeText, { limit: 1 });
  if (similar.length > 0 && similar[0].similarity > THRESHOLDS.SIMILARITY_THRESHOLD) {
    console.log(`  ⚠️  Similar pattern exists: ${similar[0].pattern_id} (${Math.round(similar[0].similarity * 100)}% match)`);
    return {
      exists: true,
      pattern_id: similar[0].pattern_id,
      similarity: similar[0].similarity
    };
  }

  // Create pattern with quick_fix_cluster source
  const pattern = await kb.createDraftPattern({
    issue_summary: representativeText,
    category,
    severity,
    source: 'quick_fix_cluster',
    source_feedback_ids: cluster.items.map(i => i.id),
    occurrence_count: cluster.items.length
  });

  return {
    created: true,
    pattern_id: pattern.pattern_id,
    occurrence_count: cluster.items.length
  };
}

/**
 * Evaluate if a cluster should be promoted to a pattern
 */
function evaluateForPromotion(cluster) {
  const count = cluster.items.length;
  const hasCritical = cluster.severities.has('critical');
  const sourceCount = cluster.sds.size;

  // Critical severity: lower threshold (immediate)
  if (hasCritical && count >= THRESHOLDS.CRITICAL_MIN_OCCURRENCES) {
    return {
      shouldPromote: true,
      reason: `Critical severity with ${count} occurrences (threshold: ${THRESHOLDS.CRITICAL_MIN_OCCURRENCES})`,
      promotionType: 'critical'
    };
  }

  // Standard threshold
  if (count >= THRESHOLDS.MIN_OCCURRENCES) {
    return {
      shouldPromote: true,
      reason: `${count} occurrences in ${THRESHOLDS.TIME_WINDOW_DAYS} days (threshold: ${THRESHOLDS.MIN_OCCURRENCES})`,
      promotionType: 'standard',
      sourceCount
    };
  }

  return {
    shouldPromote: false,
    reason: `Only ${count} occurrences (need ${THRESHOLDS.MIN_OCCURRENCES})`,
    count
  };
}

/**
 * Create a draft pattern from a feedback cluster
 */
async function createDraftPattern(cluster) {
  // Get representative feedback text (title + description)
  const firstItem = cluster.items[0];
  const representativeText = firstItem.title + (firstItem.description ? ': ' + firstItem.description : '');
  const category = cluster.categories[0] || 'general';
  const severity = cluster.severities.has('critical') ? 'critical' :
                   cluster.severities.has('high') ? 'high' : 'medium';

  // Check for similar existing patterns (prevent duplicates)
  const similar = await kb.search(representativeText, { limit: 1 });
  if (similar.length > 0 && similar[0].similarity > THRESHOLDS.SIMILARITY_THRESHOLD) {
    console.log(`  ⚠️  Similar pattern exists: ${similar[0].pattern_id} (${Math.round(similar[0].similarity * 100)}% match)`);
    return {
      exists: true,
      pattern_id: similar[0].pattern_id,
      similarity: similar[0].similarity
    };
  }

  // Use the createDraftPattern method from IssueKnowledgeBase
  const pattern = await kb.createDraftPattern({
    issue_summary: representativeText,
    category,
    severity,
    sd_id: cluster.sds.values().next().value,
    source: 'feedback_cluster',
    source_feedback_ids: cluster.items.map(i => i.id),
    occurrence_count: cluster.items.length
  });

  return {
    created: true,
    pattern_id: pattern.pattern_id,
    occurrence_count: cluster.items.length
  };
}

/**
 * Mark feedback items as processed
 */
async function markProcessed(feedbackIds) {
  const { error } = await supabase
    .from('feedback')
    .update({ cluster_processed_at: new Date().toISOString() })
    .in('id', feedbackIds);

  if (error) {
    console.error('Error marking feedback as processed:', error);
    throw error;
  }

  return feedbackIds.length;
}

/**
 * Main clustering job entry point
 */
async function runClusteringJob(options = {}) {
  const { dryRun = false, _verbose = true } = options;

  console.log('\n📊 FEEDBACK & QUICK-FIX CLUSTERING JOB');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Feedback threshold: ${THRESHOLDS.MIN_OCCURRENCES} occurrences in ${THRESHOLDS.TIME_WINDOW_DAYS} days`);
  console.log(`Quick-fix threshold: ${THRESHOLDS.QUICK_FIX_MIN_OCCURRENCES} occurrences`);
  console.log(`Critical threshold: ${THRESHOLDS.CRITICAL_MIN_OCCURRENCES} occurrences\n`);

  const results = {
    promoted: 0,
    skipped: 0,
    processed: 0,
    patterns: [],
    quickFixPromoted: 0,
    quickFixSkipped: 0
  };

  // Part 1: Find promotable feedback clusters
  console.log('─'.repeat(60));
  console.log('PART 1: FEEDBACK CLUSTERS');
  console.log('─'.repeat(60));
  const feedbackClusters = await findPromotableClusters();

  if (feedbackClusters.length === 0) {
    console.log('✅ No feedback clusters ready for promotion');
  } else {
    console.log(`Found ${feedbackClusters.length} feedback cluster(s) ready for promotion:\n`);

    for (const cluster of feedbackClusters) {
      console.log(`\n📦 Cluster: ${cluster.error_hash.substring(0, 20)}...`);
      console.log(`   Items: ${cluster.items.length}`);
      console.log(`   Categories: ${cluster.categories.join(', ')}`);
      console.log(`   SDs: ${cluster.sds.length}`);
      console.log(`   Reason: ${cluster.reason}`);

      if (dryRun) {
        console.log('   [DRY RUN] Would create draft pattern');
        results.promoted++;
        continue;
      }

      try {
        const patternResult = await createDraftPattern(cluster);

        if (patternResult.exists) {
          console.log(`   ⏭️  Skipped (similar pattern ${patternResult.pattern_id} exists)`);
          results.skipped++;
        } else if (patternResult.created) {
          console.log(`   ✅ Created draft pattern: ${patternResult.pattern_id}`);
          results.promoted++;
          results.patterns.push(patternResult.pattern_id);
        }

        // Mark feedback items as processed
        const feedbackIds = cluster.items.map(i => i.id);
        await markProcessed(feedbackIds);
        results.processed += feedbackIds.length;

      } catch (error) {
        console.error(`   ❌ Error processing cluster: ${error.message}`);
      }
    }
  }

  // Part 2: Find promotable quick_fix clusters (SD-LEO-ENH-QUICK-FIX-PATTERN-001)
  console.log('\n' + '─'.repeat(60));
  console.log('PART 2: QUICK-FIX CLUSTERS');
  console.log('─'.repeat(60));

  try {
    const quickFixClusters = await findPromotableQuickFixClusters();

    if (quickFixClusters.length === 0) {
      console.log('✅ No quick-fix clusters ready for promotion');
    } else {
      console.log(`Found ${quickFixClusters.length} quick-fix cluster(s) ready for promotion:\n`);

      for (const cluster of quickFixClusters) {
        console.log(`\n🔧 Quick-Fix Cluster: "${cluster.title.substring(0, 40)}..."`);
        console.log(`   Items: ${cluster.items.length}`);
        console.log(`   Types: ${cluster.types.join(', ')}`);
        console.log(`   Severities: ${cluster.severities.join(', ')}`);
        console.log(`   Reason: ${cluster.reason}`);

        if (dryRun) {
          console.log('   [DRY RUN] Would create draft pattern');
          results.quickFixPromoted++;
          continue;
        }

        try {
          const patternResult = await createQuickFixDraftPattern(cluster);

          if (patternResult.exists) {
            console.log(`   ⏭️  Skipped (similar pattern ${patternResult.pattern_id} exists)`);
            results.quickFixSkipped++;
          } else if (patternResult.created) {
            console.log(`   ✅ Created draft pattern: ${patternResult.pattern_id}`);
            results.quickFixPromoted++;
            results.patterns.push(patternResult.pattern_id);
          }
        } catch (error) {
          console.error(`   ❌ Error processing quick-fix cluster: ${error.message}`);
        }
      }
    }
  } catch (qfError) {
    console.warn(`   ⚠️ Quick-fix clustering skipped: ${qfError.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 CLUSTERING JOB COMPLETE');
  console.log(`   Feedback patterns created: ${results.promoted}`);
  console.log(`   Feedback clusters skipped: ${results.skipped}`);
  console.log(`   Feedback items processed: ${results.processed}`);
  console.log(`   Quick-fix patterns created: ${results.quickFixPromoted}`);
  console.log(`   Quick-fix clusters skipped: ${results.quickFixSkipped}`);
  console.log(`   Total patterns: ${results.patterns.length}`);

  return results;
}

/**
 * CLI usage
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = !args.includes('--quiet');

  try {
    const results = await runClusteringJob({ dryRun, verbose });
    console.log('\n' + JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for programmatic use
export {
  runClusteringJob,
  findPromotableClusters,
  findPromotableQuickFixClusters,
  evaluateForPromotion,
  createDraftPattern,
  createQuickFixDraftPattern,
  markProcessed,
  THRESHOLDS
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('feedback-clusterer.js')) {
  main();
}
