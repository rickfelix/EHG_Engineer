#!/usr/bin/env node

/**
 * 🎯 VWC Strategic Directives Sequence Rank Optimizer
 *
 * OBJECTIVE: Set optimal sequence_rank values based on:
 * - Legal compliance (ADA/Section 508)
 * - Business value (ROI - time savings)
 * - User experience impact
 * - Dependencies
 *
 * IDEMPOTENT: Safe to run multiple times
 *
 * TASKS:
 * 1. Update sequence_rank for all 6 VWC SDs
 * 2. Verify PHASE1 completion (dependency check)
 * 3. Investigate PHASE4 progress anomaly (45% despite draft status)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * Optimal sequence rank configuration
 * Lower rank = higher priority
 */
const SEQUENCE_UPDATES = [
  // TIER 1: CRITICAL (Legal compliance + High ROI)
  { id: 'SD-VWC-A11Y-001', rank: 1061, tier: 'CRITICAL', rationale: 'Legal compliance (ADA/Section 508)' },
  { id: 'SD-VWC-PARENT-001', rank: 1062, tier: 'CRITICAL', rationale: 'Parent tracking (maintain sequence)' },
  { id: 'SD-VWC-PRESETS-001', rank: 1063, tier: 'CRITICAL', rationale: '40% time savings (high ROI)' },

  // TIER 2: HIGH VALUE (UX enhancements)
  { id: 'SD-VWC-PHASE3-001', rank: 1064, tier: 'HIGH_VALUE', rationale: 'Advanced UX features' },
  { id: 'SD-VWC-PHASE4-001', rank: 1065, tier: 'HIGH_VALUE', rationale: 'Analytics & optimization' },

  // TIER 3: NICE TO HAVE (Polish)
  { id: 'SD-VWC-ERRORS-001', rank: 1066, tier: 'NICE_TO_HAVE', rationale: 'Error message polish' },
];

/**
 * Fetch current state of VWC SDs
 */
async function getCurrentState() {
  console.log('📊 Fetching current state of VWC Strategic Directives...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress_percentage, current_phase, sequence_rank, updated_at')
    .like('id', 'SD-VWC-%')
    .order('sequence_rank', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch VWC SDs: ${error.message}`);
  }

  return data || [];
}

/**
 * Update sequence ranks (one at a time for safety)
 */
async function updateSequenceRanks() {
  console.log('🎯 Updating sequence ranks (TIER 1 → TIER 2 → TIER 3)...\n');

  const results = [];

  for (const update of SEQUENCE_UPDATES) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({ sequence_rank: update.rank })
      .eq('id', update.id)
      .select('id, title, sequence_rank');

    if (error) {
      console.error(`❌ Error updating ${update.id}:`, error.message);
      results.push({
        ...update,
        success: false,
        error: error.message
      });
    } else if (data && data.length > 0) {
      console.log(`✅ ${update.tier} [${update.rank}] ${data[0].id}`);
      console.log(`   ${data[0].title}`);
      console.log(`   Rationale: ${update.rationale}\n`);
      results.push({
        ...update,
        success: true,
        title: data[0].title
      });
    } else {
      console.warn(`⚠️  SD not found: ${update.id}\n`);
      results.push({
        ...update,
        success: false,
        error: 'SD not found'
      });
    }
  }

  return results;
}

/**
 * Verify PHASE1 dependency
 */
async function verifyPhase1Dependency() {
  console.log('🔍 Verifying PHASE1 dependency (SD-VWC-PRESETS-001 prerequisite)...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress_percentage, current_phase')
    .eq('id', 'SD-VWC-PHASE1-001')
    .single();

  if (error) {
    console.error(`❌ Error fetching PHASE1: ${error.message}\n`);
    return null;
  }

  if (!data) {
    console.warn('⚠️  SD-VWC-PHASE1-001 not found!\n');
    return null;
  }

  console.log('📋 PHASE1 Status:');
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Progress: ${data.progress_percentage}%`);
  console.log(`   Phase: ${data.current_phase}`);

  if (data.status === 'completed' && data.progress_percentage === 100) {
    console.log('   ✅ PHASE1 COMPLETED - Dependency satisfied!\n');
  } else {
    console.log('   ⚠️  PHASE1 NOT COMPLETED - PRESETS-001 should wait!\n');
  }

  return data;
}

/**
 * Investigate PHASE4 progress anomaly
 */
async function investigatePhase4Anomaly() {
  console.log('🔬 Investigating PHASE4 progress anomaly (45% despite draft status)...\n');

  // Get full PHASE4 record
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VWC-PHASE4-001')
    .single();

  if (sdError) {
    console.error(`❌ Error fetching PHASE4: ${sdError.message}\n`);
    return null;
  }

  if (!sd) {
    console.warn('⚠️  SD-VWC-PHASE4-001 not found!\n');
    return null;
  }

  console.log('📋 PHASE4 Full Record:');
  console.log(`   ID: ${sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Status: ${sd.status}`);
  console.log(`   Progress: ${sd.progress_percentage}%`);
  console.log(`   Phase: ${sd.current_phase}`);
  console.log(`   Created: ${sd.created_at}`);
  console.log(`   Updated: ${sd.updated_at}`);
  console.log(`   Metadata: ${JSON.stringify(sd.metadata, null, 2)}\n`);

  // Check handoffs
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', 'SD-VWC-PHASE4-001')
    .order('created_at', { ascending: false });

  if (handoffError) {
    console.error(`❌ Error fetching handoffs: ${handoffError.message}\n`);
  } else {
    console.log(`📬 Handoffs Count: ${handoffs?.length || 0}`);
    if (handoffs && handoffs.length > 0) {
      handoffs.forEach((h, i) => {
        console.log(`   [${i + 1}] ${h.from_phase} → ${h.to_phase} (${h.created_at})`);
      });
      console.log();
    }
  }

  // Check PRDs
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', 'SD-VWC-PHASE4-001')
    .order('created_at', { ascending: false });

  if (prdError) {
    console.error(`❌ Error fetching PRDs: ${prdError.message}\n`);
  } else {
    console.log(`📝 PRDs Count: ${prds?.length || 0}`);
    if (prds && prds.length > 0) {
      prds.forEach((p, i) => {
        console.log(`   [${i + 1}] ${p.id} - ${p.title || 'Untitled'}`);
        console.log(`       Status: ${p.status}, Created: ${p.created_at}`);
      });
      console.log();
    }
  }

  // Diagnosis
  console.log('🔍 Diagnosis:');
  if (sd.progress_percentage > 0 && sd.status === 'draft') {
    console.log(`   ⚠️  ANOMALY DETECTED: ${sd.progress_percentage}% progress on draft SD`);
    console.log('   Possible causes:');
    console.log('   - Work started but not properly tracked');
    console.log('   - Manual progress update without status change');
    console.log('   - Leftover data from previous iteration');

    if (handoffs && handoffs.length > 0) {
      console.log(`   - ${handoffs.length} handoff(s) exist - work has begun!`);
    }
    if (prds && prds.length > 0) {
      console.log(`   - ${prds.length} PRD(s) exist - planning completed!`);
    }
    console.log();
  }

  return {
    sd,
    handoffs: handoffs || [],
    prds: prds || []
  };
}

/**
 * Generate before/after comparison table
 */
function generateComparisonTable(beforeState, afterResults) {
  console.log('📊 BEFORE/AFTER COMPARISON TABLE:\n');
  console.log('┌─────────────────────┬───────────┬────────────┬──────────────────────────────┐');
  console.log('│ SD ID               │ Old Rank  │ New Rank   │ Rationale                    │');
  console.log('├─────────────────────┼───────────┼────────────┼──────────────────────────────┤');

  afterResults.forEach(result => {
    const before = beforeState.find(sd => sd.id === result.id);
    const oldRank = before?.sequence_rank?.toString() || 'NULL';
    const newRank = result.success ? result.rank.toString() : 'FAILED';
    const status = result.success ? '✅' : '❌';

    console.log(
      `│ ${status} ${result.id.padEnd(17)} │ ${oldRank.padEnd(9)} │ ${newRank.padEnd(10)} │ ${result.rationale.padEnd(28).substring(0, 28)} │`
    );
  });

  console.log('└─────────────────────┴───────────┴────────────┴──────────────────────────────┘');
  console.log();
}

/**
 * Generate recommendation based on findings
 */
function generateRecommendation(phase1Data, phase4Data) {
  console.log('💡 RECOMMENDATIONS:\n');

  // PHASE1 dependency check
  if (phase1Data) {
    if (phase1Data.status === 'completed' && phase1Data.progress_percentage === 100) {
      console.log('✅ PHASE1 Dependency: SATISFIED');
      console.log('   → SD-VWC-PRESETS-001 can proceed immediately\n');
    } else {
      console.log('⚠️  PHASE1 Dependency: NOT SATISFIED');
      console.log(`   → Current status: ${phase1Data.status} (${phase1Data.progress_percentage}%)`);
      console.log('   → Recommendation: Complete PHASE1 before starting PRESETS-001\n');
    }
  }

  // PHASE4 priority adjustment
  if (phase4Data && phase4Data.sd) {
    const { sd, handoffs, prds } = phase4Data;

    if (sd.progress_percentage > 0 || handoffs.length > 0 || prds.length > 0) {
      console.log('⚡ PHASE4 Priority Adjustment: RECOMMENDED');
      console.log('   → Current rank: 1065 (TIER 2 - HIGH VALUE)');
      console.log('   → Evidence of work in progress:');
      console.log(`      • Progress: ${sd.progress_percentage}%`);
      console.log(`      • Handoffs: ${handoffs.length}`);
      console.log(`      • PRDs: ${prds.length}`);
      console.log('   → Recommendation: Consider moving PHASE4 to rank 1063-1064');
      console.log('      to complete started work before context is lost\n');
    } else {
      console.log('✅ PHASE4 Priority: OPTIMAL');
      console.log('   → Current rank: 1065 (TIER 2 - HIGH VALUE)');
      console.log('   → No work in progress, sequence is appropriate\n');
    }
  }

  // Overall strategy
  console.log('📋 Recommended Execution Order:');
  console.log('   1. SD-VWC-A11Y-001 (1061) - Legal compliance FIRST');
  console.log('   2. SD-VWC-PARENT-001 (1062) - Keep in sequence');
  console.log('   3. SD-VWC-PRESETS-001 (1063) - High ROI (40% time savings)');
  console.log('   4. SD-VWC-PHASE3-001 (1064) - Advanced UX');
  console.log('   5. SD-VWC-PHASE4-001 (1065) - Analytics (adjust if work started)');
  console.log('   6. SD-VWC-ERRORS-001 (1066) - Polish\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 VWC Strategic Directives Sequence Rank Optimizer\n');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Task 1: Get current state
    const beforeState = await getCurrentState();
    console.log(`✅ Found ${beforeState.length} VWC Strategic Directives\n`);
    console.log('═══════════════════════════════════════════════════\n');

    // Task 2: Update sequence ranks
    const afterResults = await updateSequenceRanks();
    console.log('═══════════════════════════════════════════════════\n');

    // Task 3: Generate comparison table
    generateComparisonTable(beforeState, afterResults);
    console.log('═══════════════════════════════════════════════════\n');

    // Task 4: Verify PHASE1 dependency
    const phase1Data = await verifyPhase1Dependency();
    console.log('═══════════════════════════════════════════════════\n');

    // Task 5: Investigate PHASE4 anomaly
    const phase4Data = await investigatePhase4Anomaly();
    console.log('═══════════════════════════════════════════════════\n');

    // Task 6: Generate recommendations
    generateRecommendation(phase1Data, phase4Data);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('✨ VWC Sequence Rank Optimization Complete!\n');

    // Summary
    const successCount = afterResults.filter(r => r.success).length;
    const failCount = afterResults.filter(r => !r.success).length;

    console.log('📊 SUMMARY:');
    console.log(`   ✅ Successful updates: ${successCount}`);
    console.log(`   ❌ Failed updates: ${failCount}`);
    console.log(`   📋 Total SDs processed: ${afterResults.length}\n`);

    if (failCount > 0) {
      console.error('⚠️  Some updates failed. Check error messages above.');
      process.exit(1);
    }

    process.exit(0);

  } catch (_error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute
main();
