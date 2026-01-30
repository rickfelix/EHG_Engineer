#!/usr/bin/env node
/**
 * Heal Empty Success Metrics
 *
 * Populates empty success_metrics arrays with sensible defaults
 * based on SD type and status to satisfy database constraints.
 *
 * Root Cause Fix: PAT-JSONB-STRING-TYPE (RCA 2026-01-30)
 *
 * Usage:
 *   node scripts/heal-empty-metrics.js           # Check only
 *   node scripts/heal-empty-metrics.js --fix     # Check and fix issues
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FIX_MODE = process.argv.includes('--fix');

// Default metrics by SD type
const TYPE_METRICS = {
  orchestrator: [
    { metric: 'All child SDs completed', target: '100%', type: 'completion' }
  ],
  feature: [
    { metric: 'Feature implemented and tested', target: 'Pass', type: 'quality' },
    { metric: 'Code coverage', target: '≥80%', type: 'coverage' }
  ],
  infrastructure: [
    { metric: 'Infrastructure deployed', target: 'Pass', type: 'deployment' },
    { metric: 'No breaking changes', target: '0 regressions', type: 'stability' }
  ],
  fix: [
    { metric: 'Bug resolved', target: 'Pass', type: 'quality' },
    { metric: 'No regressions introduced', target: '0 failures', type: 'stability' }
  ],
  documentation: [
    { metric: 'Documentation updated', target: 'Pass', type: 'completion' }
  ],
  security: [
    { metric: 'Security issue resolved', target: 'Pass', type: 'security' },
    { metric: 'No new vulnerabilities', target: '0 new', type: 'security' }
  ],
  refactor: [
    { metric: 'Refactoring complete', target: 'Pass', type: 'quality' },
    { metric: 'All tests passing', target: '100%', type: 'testing' }
  ],
  enhancement: [
    { metric: 'Enhancement implemented', target: 'Pass', type: 'quality' }
  ],
  discovery_spike: [
    { metric: 'Research completed', target: 'Pass', type: 'completion' },
    { metric: 'Findings documented', target: 'Yes', type: 'documentation' }
  ]
};

// Default for completed SDs
const COMPLETED_METRIC = [
  { metric: 'SD completed successfully', target: 'Complete', type: 'completion' }
];

// Default fallback
const DEFAULT_METRIC = [
  { metric: 'Work completed per SD scope', target: 'Pass', type: 'completion' }
];

async function healEmptyMetrics() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HEAL EMPTY SUCCESS METRICS');
  console.log('  Root Cause Fix: PAT-JSONB-STRING-TYPE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Mode: ${FIX_MODE ? '🔧 FIX' : '🔍 CHECK ONLY'}`);
  console.log('');

  // Fetch SDs with empty success_metrics
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, success_metrics')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching SDs:', error.message);
    process.exit(1);
  }

  // Filter to SDs with empty success_metrics
  const emptyMetricsSDs = sds.filter(sd => {
    const metrics = sd.success_metrics;
    // Check for empty array or null
    return !metrics || (Array.isArray(metrics) && metrics.length === 0);
  });

  console.log(`Total active SDs: ${sds.length}`);
  console.log(`SDs with empty success_metrics: ${emptyMetricsSDs.length}`);
  console.log('');

  if (emptyMetricsSDs.length === 0) {
    console.log('✅ No SDs with empty success_metrics found!');
    return;
  }

  // Group by status for reporting
  const byStatus = {};
  emptyMetricsSDs.forEach(sd => {
    byStatus[sd.status] = byStatus[sd.status] || [];
    byStatus[sd.status].push(sd);
  });

  console.log('By Status:');
  for (const [status, sdList] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${sdList.length}`);
  }
  console.log('');

  // Show sample of affected SDs
  console.log('Sample affected SDs (first 10):');
  emptyMetricsSDs.slice(0, 10).forEach(sd => {
    console.log(`  - ${sd.id} (${sd.sd_type || 'unknown'}, ${sd.status})`);
  });
  if (emptyMetricsSDs.length > 10) {
    console.log(`  ... and ${emptyMetricsSDs.length - 10} more`);
  }
  console.log('');

  if (!FIX_MODE) {
    console.log('💡 Run with --fix to heal empty metrics:');
    console.log('   node scripts/heal-empty-metrics.js --fix');
    return;
  }

  // Fix mode
  console.log('🔧 HEALING EMPTY METRICS...');
  console.log('');

  let fixed = 0;
  let failed = 0;

  for (const sd of emptyMetricsSDs) {
    // Determine appropriate default metrics
    let defaultMetrics;

    if (['completed', 'cancelled', 'rejected'].includes(sd.status)) {
      defaultMetrics = COMPLETED_METRIC;
    } else if (sd.sd_type && TYPE_METRICS[sd.sd_type]) {
      defaultMetrics = TYPE_METRICS[sd.sd_type];
    } else {
      defaultMetrics = DEFAULT_METRIC;
    }

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ success_metrics: defaultMetrics })
      .eq('id', sd.id);

    if (updateError) {
      console.log(`   ❌ ${sd.id}: ${updateError.message}`);
      failed++;
    } else {
      console.log(`   ✅ ${sd.id}: Added ${defaultMetrics.length} metric(s)`);
      fixed++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${fixed} SDs healed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');
}

healEmptyMetrics().catch(console.error);
