#!/usr/bin/env node

/**
 * Create Blind Spots Research Strategic Directives
 *
 * Creates 1 orchestrator SD + 6 child SDs + 19 grandchildren SDs for blind spots resolution.
 * Uses parent-child relationships (parent_sd_id) for proper hierarchy.
 *
 * Hierarchy:
 * SD-BLIND-SPOTS-001 (Orchestrator)
 * +-- SD-BLIND-SPOT-EVA-001 (Critical)
 * |   +-- SD-EVA-ARCHITECTURE-001
 * |   +-- SD-EVA-DASHBOARD-001
 * |   +-- SD-EVA-ALERTING-001
 * |   \-- SD-EVA-AUTOMATION-001
 * +-- SD-BLIND-SPOT-LEGAL-001 (High)
 * |   +-- SD-LEGAL-STRUCTURE-001
 * |   +-- SD-LEGAL-TEMPLATES-001
 * |   \-- SD-COMPLIANCE-GDPR-001
 * +-- SD-BLIND-SPOT-PRICING-001 (High)
 * |   +-- SD-PRICING-PATTERNS-001
 * |   +-- SD-PRICING-FRAMEWORK-001
 * |   \-- SD-PRICING-TESTING-001
 * +-- SD-BLIND-SPOT-FAILURE-001 (Medium)
 * |   +-- SD-FAILURE-POSTMORTEM-001
 * |   +-- SD-FAILURE-PATTERNS-001
 * |   \-- SD-FAILURE-FEEDBACK-001
 * +-- SD-BLIND-SPOT-SKILLS-001 (Low)
 * |   +-- SD-SKILLS-INVENTORY-001
 * |   \-- SD-SKILLS-FRAMEWORK-001
 * \-- SD-BLIND-SPOT-DEPRECATION-001 (Low)
 *     +-- SD-PATTERN-LIFECYCLE-001
 *     \-- SD-PATTERN-METRICS-001
 *
 * Refactored to use shared modules for SD creation utilities.
 */

import { randomUUID } from 'crypto';
import {
  getSupabaseClient,
  printHeader,
  printSeparator,
  printNextSteps,
  printErrorAndExit
} from './modules/sd-creation/index.js';

import {
  childSDs,
  createOrchestratorData
} from './modules/sd-creation/blind-spots/index.js';

/**
 * Create the orchestrator SD
 * @returns {Promise<object>}
 */
async function createOrchestrator() {
  console.log('Creating Orchestrator SD: SD-BLIND-SPOTS-001...\n');

  const supabase = getSupabaseClient();
  const orchestratorSD = createOrchestratorData();

  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', orchestratorSD.id)
    .single();

  if (existing) {
    console.log('[UPDATE] SD SD-BLIND-SPOTS-001 already exists. Updating...');
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(orchestratorSD)
      .eq('id', orchestratorSD.id)
      .select()
      .single();

    if (error) throw error;
    console.log('[OK] SD SD-BLIND-SPOTS-001 updated successfully!');
    return data;
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(orchestratorSD)
    .select()
    .single();

  if (error) throw error;
  console.log('[OK] SD SD-BLIND-SPOTS-001 created successfully!');
  return data;
}

/**
 * Create child SDs (the 6 blind spot categories)
 * @param {string} parentId - The orchestrator SD ID
 * @returns {Promise<{created: number, updated: number, failed: number}>}
 */
async function createChildSDs(parentId) {
  printSeparator('CREATING CHILD SDs (6 Blind Spot Categories)');

  const supabase = getSupabaseClient();
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const child of childSDs) {
    const childSD = {
      id: child.id,
      title: child.title,
      description: child.purpose,
      rationale: `Part of ${parentId} orchestrator. ${child.purpose}`,
      scope: JSON.stringify(child.scope),
      category: 'infrastructure',
      priority: child.priority,
      status: 'draft',
      sd_key: child.id,
      target_application: 'EHG',
      current_phase: 'LEAD',
      sd_type: 'implementation',
      parent_sd_id: parentId,
      strategic_intent: child.purpose,
      strategic_objectives: child.scope.included,
      success_criteria: child.grandchildren.flatMap(gc => gc.success_criteria || []).slice(0, 5),
      key_changes: child.grandchildren.flatMap(gc => gc.deliverables || []).slice(0, 10),
      key_principles: ['Part of Blind Spots Resolution', child.oracle_warning || ''],
      created_by: 'LEAD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      uuid_id: randomUUID(),
      version: '1.0',
      phase_progress: 0,
      progress: 0,
      is_active: true,
      dependencies: child.dependencies,
      risks: [],
      success_metrics: [],
      implementation_guidelines: [
        `Execution rank: ${child.rank} of ${childSDs.length}`,
        `Estimated effort: ${child.estimated_effort}`,
        `Dependencies: ${child.dependencies.join(', ') || 'None'}`,
        `Blocks: ${child.blocks.join(', ') || 'None'}`
      ],
      metadata: {
        parent_sd: parentId,
        rank: child.rank,
        estimated_effort: child.estimated_effort,
        blocks: child.blocks,
        grandchildren: child.grandchildren,
        grandchild_count: child.grandchildren.length,
        triangulation_consensus: child.triangulation_consensus
      }
    };

    try {
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', child.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update(childSD)
          .eq('id', child.id);

        if (error) throw error;
        console.log(`   [UPDATE] Updated: ${child.id}`);
        updated++;
      } else {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert(childSD);

        if (error) throw error;
        console.log(`   [OK] Created: ${child.id}`);
        created++;
      }
    } catch (error) {
      console.error(`   [FAIL] Failed: ${child.id} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(80));
  console.log(`Child SD Summary: ${created} created, ${updated} updated, ${failed} failed`);

  return { created, updated, failed };
}

/**
 * Create grandchildren SDs (implementation-level SDs)
 * @returns {Promise<{created: number, updated: number, failed: number}>}
 */
async function createGrandchildrenSDs() {
  printSeparator('CREATING GRANDCHILDREN SDs (Implementation Level)');

  const supabase = getSupabaseClient();
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const child of childSDs) {
    console.log(`\n  ${child.id} grandchildren:`);

    for (const grandchild of child.grandchildren) {
      const grandchildSD = {
        id: grandchild.id,
        title: grandchild.title,
        description: grandchild.purpose,
        rationale: `Part of ${child.id}. ${grandchild.purpose}`,
        scope: JSON.stringify(grandchild.scope),
        category: 'infrastructure',
        priority: child.priority,
        status: 'draft',
        sd_key: grandchild.id,
        target_application: 'EHG',
        current_phase: 'LEAD',
        sd_type: 'implementation',
        parent_sd_id: child.id,
        strategic_intent: grandchild.purpose,
        strategic_objectives: grandchild.deliverables,
        success_criteria: grandchild.success_criteria,
        key_changes: grandchild.deliverables,
        key_principles: ['Implementation SD'],
        created_by: 'LEAD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        uuid_id: randomUUID(),
        version: '1.0',
        phase_progress: 0,
        progress: 0,
        is_active: true,
        dependencies: grandchild.dependencies || [],
        risks: [],
        success_metrics: [],
        implementation_guidelines: [
          `Estimated effort: ${grandchild.estimated_effort}`,
          `Dependencies: ${(grandchild.dependencies || []).join(', ') || 'None'}`
        ],
        metadata: {
          parent_sd: child.id,
          grandparent_sd: 'SD-BLIND-SPOTS-001',
          estimated_effort: grandchild.estimated_effort,
          deliverables: grandchild.deliverables
        }
      };

      try {
        const { data: existing } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('id', grandchild.id)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .update(grandchildSD)
            .eq('id', grandchild.id);

          if (error) throw error;
          console.log(`     [UPDATE] ${grandchild.id}`);
          updated++;
        } else {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .insert(grandchildSD);

          if (error) throw error;
          console.log(`     [OK] ${grandchild.id}`);
          created++;
        }
      } catch (error) {
        console.error(`     [FAIL] ${grandchild.id} - ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '-'.repeat(80));
  console.log(`Grandchild SD Summary: ${created} created, ${updated} updated, ${failed} failed`);

  return { created, updated, failed };
}

/**
 * Main execution function
 */
async function main() {
  printHeader('BLIND SPOTS RESEARCH - SD CREATION');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  const orchestrator = await createOrchestrator();
  const childResults = await createChildSDs(orchestrator.id);
  const grandchildResults = await createGrandchildrenSDs();

  printSeparator('CREATION COMPLETE');
  console.log(`Orchestrator: ${orchestrator.id}`);
  console.log(`Children: ${childResults.created + childResults.updated} successful`);
  console.log(`Grandchildren: ${grandchildResults.created + grandchildResults.updated} successful`);
  const totalGrandchildren = childSDs.reduce((acc, c) => acc + c.grandchildren.length, 0);
  console.log(`Total SDs: ${1 + childSDs.length + totalGrandchildren}`);
  console.log('');

  printNextSteps([
    'Run LEO Protocol LEAD phase for approval',
    'Start with SD-BLIND-SPOT-EVA-001 (highest priority)',
    'Reference docs/research/triangulation-blind-spots-synthesis.md'
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    printErrorAndExit('Fatal error', error);
  });
