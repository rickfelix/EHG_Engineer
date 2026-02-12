#!/usr/bin/env node

/**
 * Orchestrator SD Creation Template
 *
 * This template demonstrates the CORRECT pattern for creating orchestrator SDs
 * with children that have properly enriched scopes from a master plan.
 *
 * KEY PRINCIPLE: When creating orchestrators from plans:
 * 1. Create the parent orchestrator SD
 * 2. Create child SDs with basic info
 * 3. Use inheritStrategicFields() for required protocol fields
 * 4. Use enrichChildrenFromPlan() to copy detailed scope from plan sections
 *
 * Without step 4, children have generic scopes that don't include the specific
 * deliverables, targets, and validation criteria from the plan.
 *
 * Usage:
 *   // Copy this template and customize for your orchestrator
 *   cp scripts/modules/orchestrator-creation-template.js scripts/create-my-orchestrator.js
 *
 * Required imports:
 *   - child-sd-template.js: For inheritStrategicFields(), inferSDType()
 *   - plan-to-children-enricher.js: For enrichChildrenFromPlan()
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { inheritStrategicFields, inferSDType } from './child-sd-template.js';
import { enrichChildrenFromPlan } from './plan-to-children-enricher.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Template function - customize for your orchestrator
 */
async function createOrchestrator() {
  // ============================================================
  // STEP 1: Define orchestrator configuration
  // ============================================================
  const config = {
    parentId: 'SD-CATEGORY-NAME-001',  // Your SD ID
    planFile: 'docs/planning/your-plan.md',  // Path to master plan
    title: 'Your Orchestrator Title',
    sdType: 'orchestrator',
    category: 'feature',  // feature, infrastructure, documentation, etc.
    priority: 'high',
    description: 'Brief description of the orchestrator goal.',
    strategicIntent: 'What this orchestrator aims to achieve.',
    scope: 'High-level scope - details in plan file.',
    rationale: 'Why this orchestrator is needed.',
  };

  console.log(`Creating Orchestrator: ${config.parentId}\n`);

  // ============================================================
  // STEP 2: Create parent orchestrator SD
  // ============================================================
  const { error: parentError } = await supabase
    .from('strategic_directives_v2')
    .upsert({
      id: config.parentId,
      sd_key: config.parentId,
      title: config.title,
      sd_type: config.sdType,
      category: config.category,
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      priority: config.priority,
      description: config.description,
      strategic_intent: config.strategicIntent,
      scope: config.scope,
      rationale: config.rationale,
      // Add key_changes, success_criteria, risks, dependencies as needed
      key_changes: JSON.stringify([]),
      success_criteria: JSON.stringify([]),
      risks: JSON.stringify([]),
      dependencies: JSON.stringify([]),
      is_active: true,
      progress_percentage: 0,
      created_by: 'LEAD',
      metadata: JSON.stringify({
        is_orchestrator: true,
        pattern_type: 'orchestrator',
        plan_file: config.planFile
      })
    }, { onConflict: 'id' });

  if (parentError) {
    console.error('Error creating parent:', parentError.message);
    return;
  }
  console.log(`✅ Created orchestrator: ${config.parentId}`);

  // ============================================================
  // STEP 3: Define parent context for child inheritance
  // ============================================================
  // This ensures children inherit strategic_objectives, key_principles, etc.
  const parentContext = {
    id: config.parentId,
    title: config.title,
    description: config.description,
    strategic_objectives: [
      'Primary objective inherited by children',
      'Secondary objective'
    ],
    key_principles: [
      'Principle 1 - guides child implementation',
      'Principle 2',
      'Principle 3'
    ],
    success_criteria: [
      { criterion: 'Metric 1', measure: 'Target value' },
      { criterion: 'Metric 2', measure: 'Target value' }
    ],
    risks: [
      { risk: 'Risk description', severity: 'medium', mitigation: 'How to mitigate' }
    ]
  };

  // ============================================================
  // STEP 4: Define children (basic info - details come from plan)
  // ============================================================
  const children = [
    {
      id: `${config.parentId}-A`,
      title: 'Phase 1: First Phase Title',
      sdType: 'infrastructure',  // or inferred
      description: 'Brief description - details in plan.',
      scope: 'Initial scope - will be enriched from plan.'
    },
    {
      id: `${config.parentId}-B`,
      title: 'Phase 2: Second Phase Title',
      sdType: 'feature',
      description: 'Brief description.',
      scope: 'Initial scope.'
    }
    // Add more children as needed
  ];

  // ============================================================
  // STEP 5: Create children with inherited strategic fields
  // ============================================================
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Inherit strategic fields from parent
    const inherited = inheritStrategicFields(parentContext, {
      phaseNumber: i + 1,
      phaseTitle: child.title,
      phaseObjective: child.description.split('.')[0]
    });

    // Optionally infer SD type from title/scope
    const typeInference = inferSDType(child.title, child.scope, child.description);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: child.id,
        sd_key: child.id,
        title: child.title,
        sd_type: child.sdType || typeInference.sdType,
        category: child.sdType === 'documentation' ? 'documentation' : config.category,
        status: 'draft',
        current_phase: 'LEAD_APPROVAL',
        priority: config.priority,
        parent_sd_id: config.parentId,
        description: child.description,
        scope: child.scope,  // Will be enriched in step 6
        rationale: `Part of ${config.title} orchestrator. See parent SD: ${config.parentId}`,
        strategic_intent: child.description.split('.')[0] + '.',
        // Inherited fields
        strategic_objectives: inherited.strategic_objectives,
        key_principles: inherited.key_principles,
        success_criteria: inherited.success_criteria,
        risks: inherited.risks,
        // Standard fields
        key_changes: JSON.stringify([]),
        dependencies: i > 0 ? JSON.stringify([{ dependency: children[i-1].id, type: 'technical', status: 'ready' }]) : JSON.stringify([]),
        is_active: true,
        progress_percentage: 0,
        created_by: 'LEAD',
        sequence_rank: i + 1,
        metadata: JSON.stringify({
          parent_orchestrator: config.parentId,
          child_index: i + 1,
          total_children: children.length,
          strategic_fields_source: 'child-sd-template'
        })
      }, { onConflict: 'id' });

    if (error) {
      console.error(`Error creating child ${child.id}:`, error.message);
    } else {
      console.log(`  ✅ Created child ${i+1}/${children.length}: ${child.id}`);
    }
  }

  // ============================================================
  // STEP 6: CRITICAL - Enrich children with plan details
  // ============================================================
  // This is the step that was missing! Without it, children have
  // generic scopes instead of the detailed requirements from the plan.

  console.log('\n📄 Enriching children with plan details...');

  // Option A: Manual mapping (more precise)
  const childMapping = [
    { childId: `${config.parentId}-A`, sectionPattern: /Phase 1/i },
    { childId: `${config.parentId}-B`, sectionPattern: /Phase 2/i }
  ];

  // Option B: Auto-detect mapping (convenient for standard phase structure)
  // const childMapping = autoDetectChildMapping(config.planFile, config.parentId);

  const enrichResult = await enrichChildrenFromPlan(config.planFile, childMapping);

  console.log(`  ✅ Enriched ${enrichResult.success.length} children`);
  if (enrichResult.failed.length > 0) {
    console.log(`  ⚠️  Failed: ${enrichResult.failed.map(f => f.childId).join(', ')}`);
  }
  if (enrichResult.skipped.length > 0) {
    console.log(`  ⏭️  Skipped: ${enrichResult.skipped.map(s => s.childId).join(', ')}`);
  }

  // ============================================================
  // STEP 7: Summary
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📋 Orchestrator SD Created Successfully');
  console.log('='.repeat(60));
  console.log(`\nParent: ${config.parentId}`);
  console.log(`Title: ${config.title}`);
  console.log(`Children: ${children.length} (enriched with plan details)`);
  console.log(`Plan: ${config.planFile}`);
  console.log('\nChild SDs:');
  children.forEach((c, i) => {
    console.log(`  ${String.fromCharCode(65 + i)}. ${c.id} - ${c.title}`);
  });
  console.log('\nNext Steps:');
  console.log('  1. Read CLAUDE_LEAD.md for orchestrator approval workflow');
  console.log('  2. Run: node scripts/handoff.js execute LEAD-TO-PLAN ' + config.parentId);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1].includes('orchestrator-creation-template')) {
  createOrchestrator().catch(console.error);
}

export { createOrchestrator };
