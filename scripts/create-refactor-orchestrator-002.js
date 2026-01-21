#!/usr/bin/env node
/**
 * Create SD-LEO-REFACTOR-LARGE-FILES-002 Orchestrator
 * 23 children covering all large LEO Protocol files
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createOrchestrator() {
  // Create parent orchestrator
  const orchestrator = {
    id: 'SD-LEO-REFACTOR-LARGE-FILES-002',
    sd_key: 'SD-LEO-REFACTOR-LARGE-FILES-002',
    title: 'Refactor All Large LEO Protocol Files (Phase 2)',
    description: 'Comprehensive refactoring of 23 large LEO Protocol files (26,149 LOC total) into focused modules (<500 LOC each). Covers core workflow, handoff executors, validation modules, generation scripts, and workflow utilities.',
    rationale: 'Large monolithic files (>800 LOC) are difficult to maintain, test, and understand. Phase 1 successfully refactored 5 files (12,795 LOC). Phase 2 completes the effort by refactoring the remaining 23 large files.',
    status: 'in_progress',
    priority: 'high',
    sd_type: 'orchestrator',
    category: 'Infrastructure',
    current_phase: 'EXEC',
    progress_percentage: 0,
    target_application: 'EHG_Engineer',
    key_changes: [
      'Extract modules from 23 large files',
      'Target <500 LOC per module',
      'Maintain backward compatibility via re-exports',
      'Improve maintainability and testability'
    ],
    success_criteria: [
      'All 23 files refactored into focused modules',
      'Each module under 500 LOC',
      'All existing functionality preserved',
      'Dynamic import tests pass for all modules'
    ],
    scope: 'Refactor 23 large LEO Protocol files totaling ~26,149 LOC into ~100+ focused modules (<500 LOC each). Covers core workflow, handoff executors, validation modules, generation scripts, and workflow utilities.',
    complexity_level: 'moderate',
    governance_metadata: {
      automation_context: 'orchestrator_creation',
      type_change_reason: 'Creating orchestrator SD with 23 children for Phase 2 refactoring'
    }
  };

  const { data: orchData, error: orchError } = await supabase
    .from('strategic_directives_v2')
    .upsert(orchestrator, { onConflict: 'id' })
    .select()
    .single();

  if (orchError) {
    console.error('Orchestrator error:', orchError);
    return;
  }
  console.log('Created orchestrator:', orchData.id);

  // Define all 23 children
  const children = [
    // Phase 1 - Core
    { id: 'SD-LEO-REFACTOR-SD-NEXT-001', title: 'Refactor sd-next.js', file: 'scripts/sd-next.js', loc: 1239, group: 'Core', order: 1 },
    { id: 'SD-LEO-REFACTOR-ORCH-MAIN-001', title: 'Refactor leo-protocol-orchestrator.js', file: 'scripts/leo-protocol-orchestrator.js', loc: 1418, group: 'Core', order: 2 },
    { id: 'SD-LEO-REFACTOR-PRD-DB-001', title: 'Refactor add-prd-to-database.js', file: 'scripts/add-prd-to-database.js', loc: 1770, group: 'Core', order: 3 },

    // Phase 2 - Executors
    { id: 'SD-LEO-REFACTOR-EXEC-LFA-001', title: 'Refactor LeadFinalApprovalExecutor.js', file: 'scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js', loc: 878, group: 'Executors', order: 4 },
    { id: 'SD-LEO-REFACTOR-EXEC-E2P-001', title: 'Refactor ExecToPlanExecutor.js', file: 'scripts/modules/handoff/executors/ExecToPlanExecutor.js', loc: 1271, group: 'Executors', order: 5 },
    { id: 'SD-LEO-REFACTOR-EXEC-L2P-001', title: 'Refactor LeadToPlanExecutor.js', file: 'scripts/modules/handoff/executors/LeadToPlanExecutor.js', loc: 1372, group: 'Executors', order: 6 },
    { id: 'SD-LEO-REFACTOR-EXEC-P2L-001', title: 'Refactor PlanToLeadExecutor.js', file: 'scripts/modules/handoff/executors/PlanToLeadExecutor.js', loc: 1427, group: 'Executors', order: 7 },
    { id: 'SD-LEO-REFACTOR-EXEC-P2E-001', title: 'Refactor PlanToExecExecutor.js', file: 'scripts/modules/handoff/executors/PlanToExecExecutor.js', loc: 1610, group: 'Executors', order: 8 },

    // Phase 3 - Validation
    { id: 'SD-LEO-REFACTOR-AI-EVAL-001', title: 'Refactor ai-quality-evaluator.js', file: 'scripts/modules/ai-quality-evaluator.js', loc: 948, group: 'Validation', order: 9 },
    { id: 'SD-LEO-REFACTOR-TRACE-001', title: 'Refactor traceability-validation.js', file: 'scripts/modules/traceability-validation.js', loc: 993, group: 'Validation', order: 10 },
    { id: 'SD-LEO-REFACTOR-PRD-VAL-001', title: 'Refactor leo-prd-validator.js', file: 'scripts/leo-prd-validator.js', loc: 1054, group: 'Validation', order: 11 },
    { id: 'SD-LEO-REFACTOR-VALIDATOR-001', title: 'Refactor ValidatorRegistry.js', file: 'scripts/modules/handoff/validation/ValidatorRegistry.js', loc: 1234, group: 'Validation', order: 12 },
    { id: 'SD-LEO-REFACTOR-FIDELITY-001', title: 'Refactor implementation-fidelity-validation.js', file: 'scripts/modules/implementation-fidelity-validation.js', loc: 1559, group: 'Validation', order: 13 },

    // Phase 4 - Generation
    { id: 'SD-LEO-REFACTOR-UAT-TESTS-001', title: 'Refactor generate-comprehensive-uat-tests.js', file: 'scripts/generate-comprehensive-uat-tests.js', loc: 895, group: 'Generation', order: 14 },
    { id: 'SD-LEO-REFACTOR-SCHEMA-DOCS-001', title: 'Refactor generate-schema-docs-from-db.js', file: 'scripts/generate-schema-docs-from-db.js', loc: 956, group: 'Generation', order: 15 },
    { id: 'SD-LEO-REFACTOR-UAT-PRD-001', title: 'Refactor generate-uat-prd.js', file: 'scripts/generate-uat-prd.js', loc: 1025, group: 'Generation', order: 16 },
    { id: 'SD-LEO-REFACTOR-STORIES-001', title: 'Refactor generate-user-stories-d6.js', file: 'scripts/generate-user-stories-d6.js', loc: 1110, group: 'Generation', order: 17 },
    { id: 'SD-LEO-REFACTOR-WORKFLOW-DOCS-001', title: 'Refactor generate-workflow-docs.js', file: 'scripts/generate-workflow-docs.js', loc: 1393, group: 'Generation', order: 18 },

    // Phase 5 - Workflow & Lib
    { id: 'SD-LEO-REFACTOR-BRANCH-001', title: 'Refactor branch-resolver.js', file: 'scripts/lib/branch-resolver.js', loc: 834, group: 'Lib', order: 19 },
    { id: 'SD-LEO-REFACTOR-PLAYWRIGHT-001', title: 'Refactor design-playwright-analyzer.js', file: 'scripts/design-playwright-analyzer.js', loc: 892, group: 'Workflow', order: 20 },
    { id: 'SD-LEO-REFACTOR-QA-DIR-001', title: 'Refactor qa-engineering-director-enhanced.js', file: 'scripts/qa-engineering-director-enhanced.js', loc: 926, group: 'Workflow', order: 21 },
    { id: 'SD-LEO-REFACTOR-SUBAGENT-001', title: 'Refactor orchestrate-phase-subagents.js', file: 'scripts/orchestrate-phase-subagents.js', loc: 1121, group: 'Workflow', order: 22 },
    { id: 'SD-LEO-REFACTOR-QUICKFIX-001', title: 'Refactor complete-quick-fix.js', file: 'scripts/complete-quick-fix.js', loc: 1224, group: 'Workflow', order: 23 }
  ];

  // Create all children
  for (const child of children) {
    const childSD = {
      id: child.id,
      sd_key: child.id,
      title: child.title,
      description: `Extract focused modules from ${child.file} (${child.loc} LOC). Target <500 LOC per module with backward compatibility via re-exports. Includes testing validation and documentation review.`,
      rationale: `File ${child.file} exceeds 500 LOC threshold (${child.loc} LOC). Extracting into focused modules improves maintainability, testability, and code comprehension.`,
      status: 'draft',
      priority: 'medium',
      sd_type: 'infrastructure',
      category: 'Infrastructure',
      current_phase: 'LEAD_APPROVAL',
      progress_percentage: 0,
      target_application: 'EHG_Engineer',
      parent_sd_id: 'SD-LEO-REFACTOR-LARGE-FILES-002',
      key_changes: [
        `Extract modules from ${child.file}`,
        'Target <500 LOC per module',
        'Maintain backward compatibility via re-exports',
        'Validate with dynamic import tests',
        'Run smoke tests to verify functionality',
        'Review and update related documentation'
      ],
      success_criteria: [
        'All extracted modules under 500 LOC',
        'Original functionality preserved (smoke tests pass)',
        'Dynamic import tests pass for all exports',
        'ESLint passes with no new errors',
        'Documentation reviewed and updated if needed (invoke DOCMON sub-agent)',
        'Backward compatibility maintained via index.js re-exports'
      ],
      scope: `Extract focused modules from ${child.file} (${child.loc} LOC). Create modules <500 LOC each with re-exports for backward compatibility.`,
      complexity_level: 'moderate',
      governance_metadata: {
        automation_context: 'orchestrator_child_creation',
        created_by: 'create-refactor-orchestrator-002.js',
        batch_operation: true
      },
      metadata: {
        target_file: child.file,
        original_loc: child.loc,
        group: child.group,
        execution_order: child.order,
        testing_requirements: ['dynamic_import_test', 'smoke_test', 'eslint'],
        documentation_review: true
      }
    };

    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert(childSD, { onConflict: 'id' });

    if (childError) {
      console.error('Child error for', child.id, ':', childError);
    } else {
      console.log(`Created child ${child.order}: ${child.id} (${child.loc} LOC)`);
    }
  }

  console.log('\n========================================');
  console.log('Orchestrator created with 23 children!');
  console.log('Total LOC to refactor: 26,149');
  console.log('========================================');
}

createOrchestrator();
