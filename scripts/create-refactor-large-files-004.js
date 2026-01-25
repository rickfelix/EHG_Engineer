#!/usr/bin/env node
/**
 * Create SD-LEO-REFACTOR-LARGE-FILES-004 Orchestrator
 * Phase 4: Refactor remaining large LEO Protocol files
 *
 * Continuing from Phase 3 (10 files completed)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createOrchestrator() {
  const orchestratorId = 'SD-LEO-REFACTOR-LARGE-FILES-004';

  // Target files - large LEO Protocol files not yet refactored
  const children = [
    { id: 'SD-LEO-REFAC-STOP-HOOK-004', title: 'Refactor Stop Sub-Agent Enforcement Hook', file: 'scripts/hooks/stop-subagent-enforcement.js', loc: 995 },
    { id: 'SD-LEO-REFAC-TEST-DEBUG-004', title: 'Refactor Enhanced Testing Debugging Agents', file: 'lib/testing/enhanced-testing-debugging-agents.js', loc: 858 },
    { id: 'SD-LEO-REFAC-ERR-PATTERN-004', title: 'Refactor Error Pattern Library', file: 'lib/error-pattern-library.js', loc: 800 }
  ];

  const totalLoc = children.reduce((sum, c) => sum + c.loc, 0);

  console.log('Creating orchestrator:', orchestratorId);
  console.log('Total LOC:', totalLoc);
  console.log('Children:', children.length);
  console.log('');

  // Create orchestrator
  const orchestrator = {
    id: orchestratorId,
    sd_key: orchestratorId,
    title: 'Refactor Large LEO Protocol Files (Phase 4)',
    description: `Refactor ${children.length} large LEO Protocol files (${totalLoc} LOC total) into focused modules (<500 LOC each). Continues the refactoring initiative from Phase 3. Each file will be decomposed using the Domain Extraction pattern with backward-compatible re-export wrappers.`,
    rationale: 'Large monolithic files (>800 LOC) are difficult to maintain, test, and understand. Breaking them into focused modules improves code quality, enables better testing, and reduces cognitive load.',
    scope: `Refactor ${children.length} files totaling ${totalLoc} LOC into ~15+ modules averaging <500 LOC each. Covers hooks, testing infrastructure, and error handling.`,
    sd_type: 'orchestrator',
    category: 'Infrastructure',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    priority: 'medium',
    is_active: true,
    progress_percentage: 0,
    target_application: 'EHG_Engineer',
    key_changes: [
      { change: `Extract modules from ${children.length} large files`, impact: 'Improved maintainability' },
      { change: 'Target <500 LOC per module', impact: 'Reduced complexity' },
      { change: 'Maintain backward compatibility via re-exports', impact: 'Zero breaking changes' },
      { change: 'Add dynamic import tests', impact: 'Validate module structure' }
    ],
    success_criteria: [
      { criterion: `All ${children.length} files refactored`, measure: 'Modules created' },
      { criterion: 'Each module <500 LOC', measure: 'LOC count' },
      { criterion: 'All existing functionality preserved', measure: 'Tests pass' },
      { criterion: 'Dynamic import tests pass', measure: 'Import validation' }
    ],
    governance_metadata: {
      automation_context: 'orchestrator_creation',
      type_locked: true
    },
    dependency_chain: {
      children: children.map((c, i) => ({
        sd_id: c.id,
        order: i + 1,
        depends_on: null
      }))
    }
  };

  const { error: orchError } = await supabase
    .from('strategic_directives_v2')
    .upsert(orchestrator, { onConflict: 'id' });

  if (orchError) {
    console.error('Orchestrator error:', orchError.message);
    return;
  }
  console.log('✅ Orchestrator created');

  // Create children
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    const childSD = {
      id: child.id,
      sd_key: child.id,
      title: child.title,
      description: `Extract focused modules from ${child.file} (${child.loc} LOC). Target <500 LOC per module with backward compatibility via re-exports.`,
      rationale: `File exceeds 500 LOC threshold (${child.loc} LOC). Extracting into focused modules improves maintainability and testability.`,
      scope: `Refactor ${child.file} into modules <500 LOC each. Maintain backward compatibility.`,
      sd_type: 'refactor',
      category: 'Infrastructure',
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      priority: 'medium',
      is_active: true,
      progress_percentage: 0,
      target_application: 'EHG_Engineer',
      parent_sd_id: orchestratorId,
      intensity_level: 'structural',
      key_changes: [
        { change: `Extract modules from ${child.file}`, impact: 'Reduced file size' },
        { change: 'Create shared utilities module', impact: 'Centralized helpers' },
        { change: 'Re-export wrapper for compatibility', impact: 'No breaking changes' }
      ],
      success_criteria: [
        { criterion: 'All modules <500 LOC', measure: 'wc -l' },
        { criterion: 'Backward compatibility', measure: 'Import tests pass' },
        { criterion: 'ESLint passes', measure: 'No new errors' }
      ],
      metadata: {
        target_file: child.file,
        original_loc: child.loc,
        execution_order: i + 1
      },
      governance_metadata: {
        automation_context: 'orchestrator_child',
        type_locked: true
      }
    };

    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert(childSD, { onConflict: 'id' });

    if (childError) {
      console.error(`Child error (${child.id}):`, childError.message);
    } else {
      console.log(`✅ Child ${i + 1}: ${child.id}`);
    }
  }

  console.log('');
  console.log('========================================');
  console.log(`Orchestrator ${orchestratorId} created with ${children.length} children`);
  console.log(`Total LOC to refactor: ${totalLoc}`);
  console.log('========================================');
  console.log('');
  console.log('Children created:');
  children.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.id}`);
    console.log(`     File: ${c.file}`);
    console.log(`     LOC: ${c.loc}`);
  });
}

createOrchestrator().catch(console.error);
