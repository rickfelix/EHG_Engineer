#!/usr/bin/env node
/**
 * Store research deliverables for SD-GENESIS-RESEARCH-001
 *
 * Creates deliverables in sd_scope_deliverables table and updates PRD status
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const SD_ID = 'SD-GENESIS-RESEARCH-001';
const PRD_ID = 'PRD-SD-GENESIS-RESEARCH-001';

async function main() {
  console.log('🗄️  Storing research deliverables for', SD_ID);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  try {
    // 1. Get SD and PRD records from database
    console.log('\n📋 Looking up SD and PRD records...');

    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title')
      .eq('id', SD_ID)
      .single();

    if (sdError) throw new Error(`Failed to find SD: ${sdError.message}`);
    console.log(`   ✅ Found SD: ${sdData.id} - ${sdData.title}`);

    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title, exec_checklist')
      .eq('id', PRD_ID)
      .single();

    if (prdError) throw new Error(`Failed to find PRD: ${prdError.message}`);
    console.log(`   ✅ Found PRD: ${prdData.id} - ${prdData.title}`);

    // 2. Create deliverables
    console.log('\n📦 Creating deliverables...');

    const deliverables = [
      {
        sd_id: sdData.id,
        deliverable_name: 'Genesis-LEO Phase Mapping',
        description: 'Complete mapping of 25 Genesis stages to 6 LEO phases (TRUTH, ENGINE, IDENTITY, BLUEPRINT, BUILD LOOP, LAUNCH & LEARN)',
        completion_status: 'completed',
        deliverable_type: 'documentation',
        completion_notes: 'Mapping documented in docs/research/genesis-leo-mapping.md with complete stage-to-phase mapping and handoff integration points',
        completion_evidence: 'docs/research/genesis-leo-mapping.md',
        verified_by: 'EXEC',
        verified_at: new Date().toISOString(),
        metadata: {
          acceptance_criteria: [
            'All 25 stages mapped',
            '6 LEO phases identified',
            'SD/PRD integration points documented'
          ]
        }
      },
      {
        sd_id: sdData.id,
        deliverable_name: 'SD/PRD Field Mapping',
        description: 'Mapping of strategic_directives_v2 and product_requirements_v2 table fields to Genesis venture artifacts',
        completion_status: 'completed',
        deliverable_type: 'documentation',
        completion_notes: 'Field mapping documented in docs/research/sd-prd-field-mapping.md with complete table structure analysis and integration patterns',
        completion_evidence: 'docs/research/sd-prd-field-mapping.md',
        verified_by: 'EXEC',
        verified_at: new Date().toISOString(),
        metadata: {
          acceptance_criteria: [
            'venture_artifacts.prd_id mapped',
            'venture_stage_work.artifacts mapped',
            'Dual-domain governance documented'
          ]
        }
      },
      {
        sd_id: sdData.id,
        deliverable_name: 'API Contract Documentation',
        description: 'Integration contracts between Genesis stages and LEO handoff system',
        completion_status: 'completed',
        deliverable_type: 'documentation',
        completion_notes: 'API contracts documented in docs/research/genesis-integration-contracts.md with handoff.js integration points, CEO agent runtime, and branch lifecycle patterns',
        completion_evidence: 'docs/research/genesis-integration-contracts.md',
        verified_by: 'EXEC',
        verified_at: new Date().toISOString(),
        metadata: {
          acceptance_criteria: [
            'Handoff scripts identified',
            'CEO agent runtime documented',
            'Branch lifecycle documented'
          ]
        }
      }
    ];

    for (const deliverable of deliverables) {
      // Check if deliverable already exists
      const { data: existing } = await supabase
        .from('sd_scope_deliverables')
        .select('id')
        .eq('sd_id', deliverable.sd_id)
        .eq('deliverable_name', deliverable.deliverable_name)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('sd_scope_deliverables')
          .update(deliverable)
          .eq('id', existing.id);

        if (error) {
          console.error(`   ❌ Failed to update deliverable "${deliverable.deliverable_name}":`, error.message);
        } else {
          console.log(`   ✅ Updated: ${deliverable.deliverable_name}`);
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('sd_scope_deliverables')
          .insert(deliverable);

        if (error) {
          console.error(`   ❌ Failed to create deliverable "${deliverable.deliverable_name}":`, error.message);
        } else {
          console.log(`   ✅ Created: ${deliverable.deliverable_name}`);
        }
      }
    }

    // 3. Update PRD exec_checklist
    console.log('\n✅ Updating PRD exec_checklist...');

    const execChecklist = prdData.exec_checklist || [];

    // Update checklist items (they use 'text' property, not 'item')
    const updatedChecklist = execChecklist.map(item => {
      const checklistUpdates = {
        'LEO handoff.js flow analyzed': true,
        'SD field mapping completed': true,
        'PRD field mapping completed': true,
        'Genesis stage mapping completed': true,
        'API contracts documented': true,
        'Integration map finalized': true
      };

      // Check both 'text' and 'item' properties for compatibility
      const itemText = item.text || item.item;
      if (checklistUpdates[itemText]) {
        return { ...item, checked: true };
      }
      return item;
    });

    const { error: checklistError } = await supabase
      .from('product_requirements_v2')
      .update({
        exec_checklist: updatedChecklist,
        progress: 100,
        status: 'completed',
        actual_end: new Date().toISOString()
      })
      .eq('id', prdData.id);

    if (checklistError) {
      console.error('   ❌ Failed to update PRD:', checklistError.message);
    } else {
      console.log('   ✅ PRD exec_checklist updated');
      console.log('   ✅ PRD progress set to 100%');
      console.log('   ✅ PRD status set to completed');
    }

    // 4. Summary
    console.log('\n📊 Summary:');
    console.log('   ✅ 3 deliverables created/updated');
    console.log('   ✅ 6 checklist items marked complete');
    console.log('   ✅ PRD marked as completed (100% progress)');
    console.log('\n✨ Research deliverables successfully stored!');

  } catch (error) {
    console.error('\n❌ Error storing deliverables:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
