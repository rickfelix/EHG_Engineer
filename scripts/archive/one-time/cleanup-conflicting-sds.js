#!/usr/bin/env node

/**
 * Cleanup Conflicting Strategic Directives
 *
 * Per the SD Cleanup Plan for EHG Stages 1-6 Vision alignment:
 * - ARCHIVE 13 SDs (consolidated into new vision hierarchy)
 * - CANCEL 4 SDs (vague scope, no clear deliverables)
 * - KEEP 2 SDs (testing/compliance infrastructure)
 *
 * Created: 2025-11-26 (EHG Stages 1-6 Vision Alignment)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SDs to ARCHIVE (consolidated into new vision hierarchy)
const sdsToArchive = [
  {
    id: 'SD-VENTURE-IDEATION-MVP-001',
    reason: 'Consolidated into SD-IDEATION-VISION-001 parent hierarchy'
  },
  {
    id: 'SD-CREWAI-ARCHITECTURE-001',
    reason: 'Consolidated into SD-IDEATION-AGENTS-001 (CrewAI infrastructure)'
  },
  {
    id: 'SD-STAGE1-ENHANCEMENT-001',
    reason: 'Replaced by SD-IDEATION-STAGE1-001'
  },
  {
    id: 'SD-STAGE2-AIAGENTS-001',
    reason: 'Replaced by SD-IDEATION-STAGE2-001'
  },
  {
    id: 'SD-STAGE3-VALIDATION-001',
    reason: 'Replaced by SD-IDEATION-STAGE3-001'
  },
  {
    id: 'SD-STAGE4-COMPETITIVE-001',
    reason: 'Replaced by SD-IDEATION-STAGE4-001'
  },
  {
    id: 'SD-STAGE5-PROFITABILITY-001',
    reason: 'Replaced by SD-IDEATION-STAGE5-001'
  },
  {
    id: 'SD-STAGE6-RISK-001',
    reason: 'Replaced by SD-IDEATION-STAGE6-001'
  },
  {
    id: 'SD-VIF-PARENT-001',
    reason: 'Superseded by SD-IDEATION-VISION-001'
  },
  {
    id: 'SD-VIF-TIER-001',
    reason: 'Consolidated into SD-IDEATION-PATTERNS-001 (archetypes/tiers)'
  },
  {
    id: 'SD-VIF-INTEL-001',
    reason: 'Consolidated into SD-IDEATION-AGENTS-001'
  },
  {
    id: 'SD-VIF-REFINE-001',
    reason: 'Consolidated into SD-IDEATION-PATTERNS-001 (recursion engine)'
  },
  {
    id: 'SD-AGENT-PLATFORM-001',
    reason: 'Consolidated into SD-IDEATION-AGENTS-001'
  }
];

// SDs to CANCEL (vague scope, no clear deliverables)
const sdsToCancel = [
  {
    id: 'SD-CHAIRMAN-ANALYTICS-001',
    reason: 'Vague scope - needs specific requirements before revival'
  },
  {
    id: 'SD-EVA-ENHANCEMENT-001',
    reason: 'Overlaps with Stage 1 EVA integration - revisit post-Stages 1-6'
  },
  {
    id: 'SD-PORTFOLIO-SYNERGY-001',
    reason: 'Premature - requires completed Stage 4 for portfolio context'
  },
  {
    id: 'SD-VENTURE-TEMPLATES-001',
    reason: 'Consolidated into SD-IDEATION-PATTERNS-001 (venture archetypes)'
  }
];

// SDs to KEEP (testing/compliance infrastructure)
const sdsToKeep = [
  'SD-TEST-INFRASTRUCTURE-001',
  'SD-COMPLIANCE-FRAMEWORK-001'
];

async function cleanupConflictingSDs() {
  console.log('========================================================');
  console.log('🧹 Cleaning Up Conflicting Strategic Directives');
  console.log('========================================================\n');

  const results = {
    archived: [],
    cancelled: [],
    not_found: [],
    errors: []
  };

  // Archive SDs
  console.log('📦 ARCHIVING SDs (consolidated into new vision hierarchy)...\n');
  for (const { id, reason } of sdsToArchive) {
    console.log(`   Processing: ${id}`);
    try {
      // Check if SD exists
      const { data: existing, error: findError } = await supabase
        .from('strategic_directives_v2')
        .select('id, status, title, metadata')
        .eq('id', id)
        .single();

      if (findError || !existing) {
        console.log('   ⏭️  Not found (may already be archived or doesn\'t exist)');
        results.not_found.push(id);
        continue;
      }

      // Update to deferred status (used for archived/superseded SDs)
      // Valid statuses: draft, in_progress, active, pending_approval, completed, deferred, cancelled
      const archiveMetadata = {
        ...(existing.metadata || {}),
        archived_at: new Date().toISOString(),
        archive_reason: reason,
        successor_sd: 'SD-IDEATION-VISION-001 hierarchy'
      };

      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'deferred',  // Using 'deferred' as 'archived' equivalent
          metadata: archiveMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateError) throw updateError;

      console.log(`   ✅ Archived: ${existing.title}`);
      results.archived.push({ id, title: existing.title, reason });
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.errors.push({ id, error: err.message });
    }
  }

  // Cancel SDs
  console.log('\n❌ CANCELING SDs (vague scope, no clear deliverables)...\n');
  for (const { id, reason } of sdsToCancel) {
    console.log(`   Processing: ${id}`);
    try {
      const { data: existing, error: findError } = await supabase
        .from('strategic_directives_v2')
        .select('id, status, title')
        .eq('id', id)
        .single();

      if (findError || !existing) {
        console.log('   ⏭️  Not found (may already be cancelled or doesn\'t exist)');
        results.not_found.push(id);
        continue;
      }

      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (updateError) throw updateError;

      console.log(`   ✅ Cancelled: ${existing.title}`);
      results.cancelled.push({ id, title: existing.title, reason });
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.errors.push({ id, error: err.message });
    }
  }

  // Summary
  console.log('\n========================================================');
  console.log('📊 CLEANUP SUMMARY');
  console.log('========================================================');
  console.log(`📦 Archived: ${results.archived.length}`);
  results.archived.forEach(({ id, reason }) => console.log(`   - ${id}: ${reason}`));
  console.log(`❌ Cancelled: ${results.cancelled.length}`);
  results.cancelled.forEach(({ id, reason }) => console.log(`   - ${id}: ${reason}`));
  console.log(`⏭️  Not found: ${results.not_found.length}`);
  results.not_found.forEach(id => console.log(`   - ${id}`));
  console.log(`⚠️  Errors: ${results.errors.length}`);
  results.errors.forEach(({ id, error }) => console.log(`   - ${id}: ${error}`));

  console.log('\n✅ SDs to KEEP (unchanged):');
  sdsToKeep.forEach(id => console.log(`   - ${id}`));

  // Verify final state
  console.log('\n========================================================');
  console.log('🔍 VERIFICATION: Active Critical/High SDs');
  console.log('========================================================');

  const { data: activeSDs, error: verifyError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, parent_sd_id')
    .in('priority', ['critical', 'high'])
    .eq('status', 'active')
    .order('priority')
    .order('id');

  if (verifyError) {
    console.log(`Error verifying: ${verifyError.message}`);
  } else {
    console.log(`\nTotal active critical/high SDs: ${activeSDs.length}\n`);

    const criticalSDs = activeSDs.filter(sd => sd.priority === 'critical');
    const highSDs = activeSDs.filter(sd => sd.priority === 'high');

    console.log('Critical SDs:');
    criticalSDs.forEach(sd => {
      const parent = sd.parent_sd_id ? ` (parent: ${sd.parent_sd_id})` : '';
      console.log(`   - ${sd.id}: ${sd.title}${parent}`);
    });

    console.log('\nHigh SDs:');
    highSDs.forEach(sd => {
      const parent = sd.parent_sd_id ? ` (parent: ${sd.parent_sd_id})` : '';
      console.log(`   - ${sd.id}: ${sd.title}${parent}`);
    });
  }

  return results;
}

// Execute
cleanupConflictingSDs()
  .then(results => {
    const success = results.errors.length === 0;
    console.log(success ? '\n✅ Cleanup completed successfully!' : '\n⚠️  Cleanup completed with some errors');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
