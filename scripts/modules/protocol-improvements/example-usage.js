#!/usr/bin/env node
/**
 * Example Usage - Protocol Improvements Module
 *
 * Demonstrates how to use the protocol improvements API
 */

import {
  extractAndQueueAll,
  applyAllAutoApplicable,
  trackAllUnscored,
  getEffectivenessReport,
  getImprovementStatus,
  getTopPriorityImprovements,
  runFullImprovementCycle
} from './index.js';

async function main() {
  console.log('=== Protocol Improvements Module - Example Usage ===\n');

  try {
    // Example 1: Check current status
    console.log('1. Checking improvement queue status...');
    const status = await getImprovementStatus();
    console.log(JSON.stringify(status, null, 2));
    console.log('');

    // Example 2: Get top priority improvements
    console.log('2. Getting top 5 priority improvements...');
    const topPriority = await getTopPriorityImprovements(5);
    topPriority.forEach((imp, idx) => {
      console.log(`   ${idx + 1}. [Pri: ${imp.priority}, Evidence: ${imp.evidence_count}] ${imp.improvement_text.substring(0, 60)}...`);
    });
    console.log('');

    // Example 3: Extract improvements (from last 30 days)
    console.log('3. Extracting improvements from recent retrospectives...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const queuedCount = await extractAndQueueAll(thirtyDaysAgo);
    console.log(`   ✅ Queued ${queuedCount} new improvements\n`);

    // Example 4: Apply auto-applicable improvements (evidence >= 3)
    console.log('4. Applying auto-applicable improvements (evidence >= 3)...');
    console.log('   [Set to false to skip - change to true to apply]');
    const shouldApply = false; // Change to true to actually apply
    
    if (shouldApply) {
      const applyResults = await applyAllAutoApplicable(3);
      console.log(`   ✅ Applied: ${applyResults.summary.applied}`);
      console.log(`   ❌ Errors: ${applyResults.summary.errors}\n`);
    } else {
      console.log('   Skipped (set shouldApply = true to run)\n');
    }

    // Example 5: Track effectiveness (for improvements applied >7 days ago)
    console.log('5. Tracking effectiveness of applied improvements...');
    console.log('   [Set to false to skip - change to true to track]');
    const shouldTrack = false; // Change to true to actually track
    
    if (shouldTrack) {
      const trackResults = await trackAllUnscored();
      console.log(`   ✅ Effective: ${trackResults.summary.effective}`);
      console.log(`   ⚠️  Moderate: ${trackResults.summary.moderate}`);
      console.log(`   ❌ Ineffective: ${trackResults.summary.ineffective}\n`);
    } else {
      console.log('   Skipped (set shouldTrack = true to run)\n');
    }

    // Example 6: Get effectiveness report
    console.log('6. Getting effectiveness report...');
    const report = await getEffectivenessReport();
    console.log('   (Report displayed above)\n');

    // Example 7: Run full cycle (extract → apply → track)
    console.log('7. Full improvement cycle example:');
    console.log('   [Commented out - uncomment to run]\n');
    /*
    const results = await runFullImprovementCycle({
      sinceDate: thirtyDaysAgo,
      evidenceThreshold: 3,
      autoApply: true,
      trackEffectiveness: true,
      effectivenessThreshold: 40
    });
    console.log(JSON.stringify(results, null, 2));
    */

    console.log('\n=== Example Complete ===');
    console.log('Review the output above to understand the module API.');
    console.log('Modify shouldApply and shouldTrack flags to test actual operations.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
