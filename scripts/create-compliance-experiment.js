#!/usr/bin/env node
/**
 * Create LEO Protocol Compliance Experiment
 *
 * Orchestrator with 10 children to test:
 * 1. Orchestrator detection & preflight
 * 2. Child SD workflow independence
 * 3. Mandatory handoffs per child (3+ for refactor type)
 * 4. Pattern 6 (Domain Extraction) implementation
 * 5. Gate pass rate (target ≥80%)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createComplianceExperiment() {
  const orchestratorId = 'SD-LEO-REFAC-COMPLIANCE-EXP-001';

  // 10 target files for refactoring (all >500 LOC)
  const targetFiles = [
    { id: 'SD-LEO-REFAC-DATABASE-SUB-001', title: 'Refactor database.js Sub-Agent', file: 'lib/sub-agents/database.js', loc: 1158, group: 'Sub-Agents' },
    { id: 'SD-LEO-REFAC-UAT-TEMPLATE-001', title: 'Refactor UAT Assessment Template', file: 'scripts/modules/uat-assessment/assessment-template.js', loc: 1253, group: 'Assessment' },
    { id: 'SD-LEO-REFAC-EXEC-TEMPLATE-001', title: 'Refactor Execute Phase Template', file: 'templates/execute-phase.js', loc: 907, group: 'Templates' },
    { id: 'SD-LEO-REFAC-UAT-TESTS-001', title: 'Refactor Comprehensive UAT Tests Generator', file: 'scripts/generate-comprehensive-uat-tests.js', loc: 896, group: 'Generators' },
    { id: 'SD-LEO-REFAC-PLAYWRIGHT-001', title: 'Refactor Playwright Analyzer', file: 'scripts/design-playwright-analyzer.js', loc: 893, group: 'Analyzers' },
    { id: 'SD-LEO-REFAC-LFA-EXEC-001', title: 'Refactor LeadFinalApprovalExecutor', file: 'scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js', loc: 879, group: 'Executors' },
    { id: 'SD-LEO-REFAC-API-SUB-001', title: 'Refactor API Sub-Agent', file: 'lib/agents/api-sub-agent.js', loc: 876, group: 'Sub-Agents' },
    { id: 'SD-LEO-REFAC-BASE-SUB-001', title: 'Refactor Base Sub-Agent', file: 'lib/agents/base-sub-agent.js', loc: 850, group: 'Sub-Agents' },
    { id: 'SD-LEO-REFAC-TEST-INTEL-001', title: 'Refactor Test Intelligence', file: 'lib/utils/test-intelligence.js', loc: 847, group: 'Testing' },
    { id: 'SD-LEO-REFAC-BRANCH-001', title: 'Refactor Branch Resolver', file: 'scripts/lib/branch-resolver.js', loc: 835, group: 'Utilities' }
  ];

  const totalLoc = targetFiles.reduce((sum, f) => sum + f.loc, 0);

  console.log('');
  console.log('========================================');
  console.log('LEO PROTOCOL COMPLIANCE EXPERIMENT');
  console.log('========================================');
  console.log('');

  // Create orchestrator
  const orchestrator = {
    id: orchestratorId,
    sd_key: orchestratorId,
    title: 'LEO Protocol Compliance Experiment - Refactor 10 Large Files',
    description: `Orchestrator experiment to test LEO Protocol compliance with parent-child SD pattern. Coordinates refactoring of 10 large files (${totalLoc} LOC total) into focused modules (<500 LOC each) using Domain Extraction pattern (Pattern 6).

EXPERIMENT OBJECTIVES:
1. Validate orchestrator detection and preflight checks
2. Ensure each child goes through full LEAD→PLAN→EXEC workflow
3. Test handoff validation for refactor-type SDs (3+ required)
4. Measure gate pass rate (target ≥80%)
5. Validate Pattern 6 implementation quality`,
    rationale: `This experiment validates LEO Protocol compliance mechanisms:
- Orchestrator SD detection triggers mandatory preflight
- Child SDs are independent, not sub-tasks
- Refactor type requires: PRD YES, 3+ handoffs, 80% gate threshold
- Pattern 6 (Domain Extraction) produces <500 LOC modules`,
    scope: `Refactor 10 large LEO Protocol files totaling ~${totalLoc} LOC into ~50+ focused modules (<500 LOC each). Each child SD must complete full workflow independently.`,
    sd_type: 'orchestrator',
    category: 'Infrastructure',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'medium',
    is_active: true,
    progress_percentage: 0,
    target_application: 'EHG_Engineer',
    key_changes: [
      { change: 'Test orchestrator SD detection', impact: 'Validate preflight checks run before child work' },
      { change: 'Test child SD dependency validation', impact: 'Ensure blocking dependencies are respected' },
      { change: 'Test full LEAD→PLAN→EXEC per child', impact: 'Validate protocol compliance for each child' },
      { change: `Refactor ${totalLoc} LOC into <500 LOC modules`, impact: 'Improved maintainability and testability' }
    ],
    success_criteria: [
      { criterion: 'All 10 children complete full LEAD→PLAN→EXEC', measure: '10/10 children with all required handoffs' },
      { criterion: 'Each child module <500 LOC', measure: 'LOC count per module' },
      { criterion: 'Zero backward compatibility breaks', measure: 'All existing tests pass' },
      { criterion: 'Protocol compliance score ≥80%', measure: 'Gate pass rate across all children' }
    ],
    governance_metadata: {
      automation_context: 'compliance_experiment',
      type_locked: true,
      experiment_type: 'orchestrator_compliance_test',
      total_loc: totalLoc,
      child_count: 10
    },
    dependency_chain: {
      children: targetFiles.map((f, i) => ({
        sd_id: f.id,
        order: i + 1,
        depends_on: null // All children can work independently
      }))
    }
  };

  console.log('Creating orchestrator:', orchestratorId);
  const { data: orchData, error: orchError } = await supabase
    .from('strategic_directives_v2')
    .upsert(orchestrator, { onConflict: 'id' })
    .select('id, title')
    .single();

  if (orchError) {
    console.error('❌ Orchestrator error:', orchError.message);
    return;
  }
  console.log('✅ Created orchestrator:', orchData.id);
  console.log('');

  // Create all 10 children
  console.log('Creating 10 child SDs...');
  console.log('');

  for (let i = 0; i < targetFiles.length; i++) {
    const child = targetFiles[i];
    const childSD = {
      id: child.id,
      sd_key: child.id,
      title: child.title,
      description: `Extract focused modules from ${child.file} (${child.loc} LOC). Apply Domain Extraction pattern (Pattern 6) to create modules <500 LOC each with backward compatibility via re-exports.

COMPLIANCE REQUIREMENTS (refactor type):
- PRD: Required
- Min Handoffs: 3 (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
- Gate Threshold: 80%`,
      rationale: `File ${child.file} exceeds 500 LOC threshold (${child.loc} LOC). Part of LEO Protocol compliance experiment to validate full workflow execution.`,
      scope: `Refactor ${child.file} into focused modules. Each module <500 LOC. Maintain 100% backward compatibility.`,
      sd_type: 'refactor',
      category: 'Infrastructure',
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      priority: 'medium',
      is_active: true,
      progress_percentage: 0,
      target_application: 'EHG_Engineer',
      parent_sd_id: orchestratorId,
      key_changes: [
        { change: `Extract modules from ${child.file}`, impact: 'Reduced LOC per module' },
        { change: 'Create shared kernel (utilities)', impact: 'Centralized common functions' },
        { change: 'Re-export wrapper for compatibility', impact: 'Zero breaking changes' }
      ],
      success_criteria: [
        { criterion: 'All modules <500 LOC', measure: 'wc -l on each module' },
        { criterion: 'Full LEAD→PLAN→EXEC workflow', measure: '3+ handoffs completed' },
        { criterion: 'Backward compatibility', measure: 'Dynamic import tests pass' },
        { criterion: 'ESLint passes', measure: 'No new lint errors' }
      ],
      metadata: {
        target_file: child.file,
        original_loc: child.loc,
        group: child.group,
        execution_order: i + 1,
        experiment_role: 'child'
      },
      governance_metadata: {
        automation_context: 'compliance_experiment_child',
        type_locked: true,
        parent_experiment: orchestratorId
      }
    };

    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert(childSD, { onConflict: 'id' });

    if (childError) {
      console.error(`❌ Child error (${child.id}):`, childError.message);
    } else {
      console.log(`✅ Child ${(i + 1).toString().padStart(2)}: ${child.id} (${child.loc} LOC)`);
    }
  }

  console.log('');
  console.log('========================================');
  console.log('✅ EXPERIMENT CREATED SUCCESSFULLY');
  console.log('========================================');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Orchestrator: ${orchestratorId}`);
  console.log('   Children: 10');
  console.log(`   Total LOC: ${totalLoc}`);
  console.log('   Pattern: Domain Extraction (Pattern 6)');
  console.log('   Target: <500 LOC per module');
  console.log('');
  console.log('🎯 Compliance Tests:');
  console.log('   1. Orchestrator detection & preflight');
  console.log('   2. Child SD workflow independence');
  console.log('   3. Mandatory handoffs (3+ per child)');
  console.log('   4. Gate pass rate (≥80%)');
  console.log('   5. Pattern 6 implementation quality');
  console.log('');
  console.log('📋 Files to Refactor:');
  targetFiles.forEach((f, i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${f.file} (${f.loc} LOC)`);
  });
  console.log('');
  console.log('🚀 Next Steps:');
  console.log(`   1. Run preflight: node scripts/orchestrator-preflight.js ${orchestratorId}`);
  console.log(`   2. Start LEAD: node scripts/handoff.js execute LEAD-TO-PLAN ${orchestratorId}`);
  console.log('');
}

createComplianceExperiment().catch(console.error);
