#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create orchestrator SD and update child SDs with parent relationship
 */

async function createOrchestratorAndUpdateChildren() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('\n🎯 Creating Orchestrator SD...\n');

    const orchestratorId = 'SD-LEO-REFACTOR-LARGE-FILES-001';
    const childIds = [
      'SD-LEO-REFACTOR-HANDOFF-001',
      'SD-LEO-REFACTOR-PRD-001',
      'SD-LEO-REFACTOR-ORCH-001',
      'SD-LEO-REFACTOR-QUEUE-001',
      'SD-LEO-REFACTOR-LEARN-001'
    ];

    // First, check if the child SDs exist
    console.log('📋 Verifying child SDs exist...');
    const { data: childSDs, error: childError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title')
      .in('id', childIds)
      .order('id');

    if (childError) {
      throw new Error(`Failed to query child SDs: ${childError.message}`);
    }

    console.log(`Found ${childSDs.length}/${childIds.length} child SDs:`);
    childSDs.forEach(sd => {
      console.log(`  ✅ ${sd.id}: ${sd.title}`);
    });

    if (childSDs.length !== childIds.length) {
      const found = childSDs.map(r => r.id);
      const missing = childIds.filter(id => !found.includes(id));
      console.error('\n❌ Missing child SDs:', missing);
      process.exit(1);
    }

    // Check if orchestrator already exists
    const { data: existing, error: existError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', orchestratorId)
      .maybeSingle();

    if (existError) {
      throw new Error(`Failed to check existing orchestrator: ${existError.message}`);
    }

    if (existing) {
      console.log(`\n⚠️  Orchestrator ${orchestratorId} already exists. Skipping creation.`);
    } else {
      // Create the orchestrator SD
      console.log('\n✨ Creating orchestrator SD...');

      const orchestratorData = {
        id: orchestratorId,
        sd_key: orchestratorId, // Required field
        title: 'Refactor Large LEO Protocol Files (Orchestrator)',
        description: 'Parent orchestrator for decomposing 14 large LEO Protocol files (>1000 LOC each) into maintainable modules (<500 LOC). Coordinates 5 child SDs targeting specific functional areas: handoff scripts, PRD scripts, orchestration scripts, queue/generation scripts, and learning modules. References SD-LEO-INFRA-REFACTOR-LARGE-LEO-001 as predecessor (analysis/archive phase).',
        rationale: 'Large files (>1000 LOC) are difficult to maintain, test, and reason about. Breaking them into focused modules improves maintainability, enables better testing, and reduces cognitive load for both humans and AI agents.',
        scope: 'Refactor 14 large LEO Protocol files totaling ~12,795 LOC into ~23 modules averaging <500 LOC each. Includes handoff system, PRD generation, orchestration, queue management, and learning modules.',
        sd_type: 'infrastructure',
        category: 'infrastructure',
        status: 'draft',
        current_phase: 'LEAD',
        priority: 'MEDIUM',
        sequence_rank: 100,
        relationship_type: 'parent',
        key_changes: {
          overview: 'Coordinates decomposition of 14 large LEO Protocol files',
          total_reduction: 'Target: ~12,795 LOC → ~5,000 LOC (60% reduction)',
          child_sds: [
            { id: 'SD-LEO-REFACTOR-HANDOFF-001', target: 'Handoff scripts (2,234 LOC → 4 modules)' },
            { id: 'SD-LEO-REFACTOR-PRD-001', target: 'PRD generation scripts (2,092 LOC → 4 modules)' },
            { id: 'SD-LEO-REFACTOR-ORCH-001', target: 'Orchestration scripts (3,281 LOC → 6 modules)' },
            { id: 'SD-LEO-REFACTOR-QUEUE-001', target: 'Queue/generation scripts (3,019 LOC → 5 modules)' },
            { id: 'SD-LEO-REFACTOR-LEARN-001', target: 'Learning modules (2,169 LOC → 4 modules)' }
          ]
        },
        success_criteria: [
          'All 5 child SDs completed',
          'Total LOC reduced from ~12,795 to ~5,000 (60% reduction)',
          'All modules <500 LOC',
          'No regression in functionality',
          'All tests passing',
          'Documentation updated'
        ],
        dependencies: {
          predecessor: 'SD-LEO-INFRA-REFACTOR-LARGE-LEO-001',
          blocks: [],
          blocked_by: []
        },
        dependency_chain: {
          children: childIds.map((id, index) => ({
            sd_id: id,
            order: index + 1,
            depends_on: null // All children can be worked on independently
          }))
        }
      };

      const { data: insertData, error: insertError } = await supabase
        .from('strategic_directives_v2')
        .insert([orchestratorData])
        .select('id, title')
        .single();

      if (insertError) {
        throw new Error(`Failed to create orchestrator: ${insertError.message}`);
      }

      console.log(`✅ Created orchestrator: ${insertData.id}`);
      console.log(`   Title: ${insertData.title}`);
    }

    // Update child SDs with parent relationship
    console.log('\n🔗 Updating child SDs with parent relationship...');

    for (const childId of childIds) {
      // Get current dependencies
      const { data: currentSD, error: currentError } = await supabase
        .from('strategic_directives_v2')
        .select('dependencies, relationship_type')
        .eq('id', childId)
        .single();

      if (currentError) {
        throw new Error(`Failed to fetch ${childId}: ${currentError.message}`);
      }

      let dependencies = currentSD?.dependencies || {};

      // Add orchestrator as dependency
      if (!dependencies.orchestrator) {
        dependencies.orchestrator = orchestratorId;
      }

      // Determine relationship type - if already child_phase or child_independent, keep it
      let relationshipType = currentSD?.relationship_type;
      if (!relationshipType || relationshipType === 'standalone') {
        relationshipType = 'child_independent'; // Default for independent children
      }

      // Update the child SD
      const { data: updateData, error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          parent_sd_id: orchestratorId,
          dependencies: dependencies,
          relationship_type: relationshipType,
          updated_at: new Date().toISOString()
        })
        .eq('id', childId)
        .select('id, title, parent_sd_id, relationship_type')
        .single();

      if (updateError) {
        throw new Error(`Failed to update ${childId}: ${updateError.message}`);
      }

      console.log(`  ✅ ${updateData.id}`);
      console.log(`     Parent: ${updateData.parent_sd_id}`);
      console.log(`     Relationship: ${updateData.relationship_type}`);
    }

    // Final verification
    console.log('\n✅ Verification Summary:');
    const { data: finalCheck, error: finalError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, parent_sd_id, relationship_type')
      .or(`id.eq.${orchestratorId},parent_sd_id.eq.${orchestratorId}`)
      .order('relationship_type')
      .order('id');

    if (finalError) {
      throw new Error(`Failed final verification: ${finalError.message}`);
    }

    console.log(`\n📊 Orchestrator Family (${finalCheck.length} total):`);
    finalCheck.forEach(sd => {
      if (sd.relationship_type === 'parent') {
        console.log(`\n  🎯 ${sd.id} (ORCHESTRATOR)`);
        console.log(`     ${sd.title}`);
      } else {
        console.log(`\n  └─ ${sd.id} (${sd.relationship_type.toUpperCase()})`);
        console.log(`     ${sd.title}`);
        console.log(`     Parent: ${sd.parent_sd_id}`);
      }
    });

    console.log('\n✅ Orchestrator creation complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run LEAD phase approval for the orchestrator');
    console.log('   2. Each child SD can be executed independently');
    console.log('   3. Mark orchestrator complete when all children are done');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

// Execute the function
createOrchestratorAndUpdateChildren().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
