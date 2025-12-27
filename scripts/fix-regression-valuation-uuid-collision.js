#!/usr/bin/env node

/**
 * Fix UUID Collision between REGRESSION and VALUATION Sub-Agents
 *
 * Root Cause: Both sub-agents were assigned the same UUID 'a1b2c3d4-9999-4999-8999-999999999999'
 *
 * Solution:
 * 1. Delete the mixed entry and all its triggers
 * 2. Restore VALUATION sub-agent with original UUID
 * 3. Create REGRESSION with NEW unique UUID
 *
 * Created: 2025-12-27
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Original VALUATION UUID (keeping it)
const VALUATION_UUID = 'a1b2c3d4-9999-4999-8999-999999999999';

// NEW unique UUID for REGRESSION (using a completely different pattern)
const REGRESSION_UUID = 'b2c3d4e5-regr-4egr-8egr-regression001';

async function fixCollision() {
  console.log('=== Fixing UUID Collision: REGRESSION vs VALUATION ===\n');

  // Step 1: Delete all triggers for the colliding UUID
  console.log('Step 1: Deleting mixed triggers for UUID', VALUATION_UUID);
  const { error: trigDelErr } = await supabase
    .from('leo_sub_agent_triggers')
    .delete()
    .eq('sub_agent_id', VALUATION_UUID);

  if (trigDelErr) {
    console.log('   Error deleting triggers:', trigDelErr.message);
  } else {
    console.log('   ✅ Triggers deleted');
  }

  // Step 2: Delete the mixed sub-agent record
  console.log('Step 2: Deleting mixed sub-agent record');
  const { error: agentDelErr } = await supabase
    .from('leo_sub_agents')
    .delete()
    .eq('id', VALUATION_UUID);

  if (agentDelErr) {
    console.log('   Error deleting sub-agent:', agentDelErr.message);
  } else {
    console.log('   ✅ Sub-agent deleted');
  }

  // Step 3: Restore VALUATION sub-agent
  console.log('Step 3: Restoring VALUATION sub-agent');
  const { error: valAgentErr } = await supabase
    .from('leo_sub_agents')
    .insert({
      id: VALUATION_UUID,
      name: 'Exit Valuation Sub-Agent',
      code: 'VALUATION',
      description: 'Handles exit valuation modeling, comparable analysis, acquisition scenario planning, and investor readiness assessments.',
      activation_type: 'automatic',
      priority: 70,
      script_path: 'lib/sub-agents/valuation.js',
      context_file: null,
      active: true,
      metadata: {
        category: 'financial',
        restored_at: new Date().toISOString(),
        restoration_reason: 'UUID collision fix with REGRESSION'
      }
    });

  if (valAgentErr) {
    console.log('   Error restoring VALUATION:', valAgentErr.message);
  } else {
    console.log('   ✅ VALUATION sub-agent restored');
  }

  // Step 4: Insert VALUATION triggers
  console.log('Step 4: Inserting VALUATION triggers');
  const valuationTriggers = [
    { trigger_phrase: 'valuation', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
    { trigger_phrase: 'exit', trigger_type: 'keyword', trigger_context: 'PRD', priority: 75 },
    { trigger_phrase: 'exit strategy', trigger_type: 'pattern', trigger_context: 'PRD', priority: 85 },
    { trigger_phrase: 'acquisition', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
    { trigger_phrase: 'IPO', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
    { trigger_phrase: 'Series A', trigger_type: 'pattern', trigger_context: 'PRD', priority: 75 },
    { trigger_phrase: 'fundraising', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
    { trigger_phrase: 'multiple', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
    { trigger_phrase: 'DCF', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
    { trigger_phrase: 'comparable', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
    { trigger_phrase: 'investor', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 }
  ].map(t => ({ ...t, sub_agent_id: VALUATION_UUID }));

  const { error: valTrigErr } = await supabase
    .from('leo_sub_agent_triggers')
    .insert(valuationTriggers);

  if (valTrigErr) {
    console.log('   Error inserting VALUATION triggers:', valTrigErr.message);
  } else {
    console.log('   ✅ VALUATION triggers inserted (11 triggers)');
  }

  // Step 5: Create REGRESSION sub-agent with NEW UUID
  console.log('Step 5: Creating REGRESSION sub-agent with NEW UUID', REGRESSION_UUID);
  const { error: regAgentErr } = await supabase
    .from('leo_sub_agents')
    .insert({
      id: REGRESSION_UUID,
      name: 'Regression Validator Sub-Agent',
      code: 'REGRESSION',
      description: 'Validates that refactoring changes maintain backward compatibility. Captures baseline test results, compares before/after states, validates API signatures unchanged, and checks import path resolution. Essential for structural and architectural refactoring SDs.',
      activation_type: 'automatic',
      priority: 95,
      script_path: 'lib/sub-agents/regression.js',
      context_file: 'CLAUDE-REGRESSION.md',
      active: true,
      metadata: {
        category: 'refactoring',
        leo_version: '4.3.3',
        created_at: new Date().toISOString(),
        purpose: 'Backward compatibility validation for refactoring SDs',
        intensity_levels: ['structural', 'architectural'],
        verdict_types: ['PASS', 'CONDITIONAL_PASS', 'FAIL']
      }
    });

  if (regAgentErr) {
    console.log('   Error creating REGRESSION:', regAgentErr.message);
  } else {
    console.log('   ✅ REGRESSION sub-agent created');
  }

  // Step 6: Insert REGRESSION triggers
  console.log('Step 6: Inserting REGRESSION triggers');
  const regressionTriggers = [
    // High priority - direct matches
    { trigger_phrase: 'refactor', trigger_type: 'keyword', trigger_context: 'SD', priority: 95 },
    { trigger_phrase: 'refactoring', trigger_type: 'keyword', trigger_context: 'SD', priority: 95 },
    { trigger_phrase: 'backward compatibility', trigger_type: 'pattern', trigger_context: 'PRD', priority: 95 },
    { trigger_phrase: 'backwards compatible', trigger_type: 'pattern', trigger_context: 'PRD', priority: 95 },
    { trigger_phrase: 'breaking change', trigger_type: 'pattern', trigger_context: 'PRD', priority: 95 },
    // Medium-high priority - related concepts
    { trigger_phrase: 'regression', trigger_type: 'keyword', trigger_context: 'PRD', priority: 90 },
    { trigger_phrase: 'restructure', trigger_type: 'keyword', trigger_context: 'SD', priority: 90 },
    { trigger_phrase: 'no behavior change', trigger_type: 'pattern', trigger_context: 'PRD', priority: 90 },
    { trigger_phrase: 'no functional change', trigger_type: 'pattern', trigger_context: 'PRD', priority: 90 },
    { trigger_phrase: 'api signature', trigger_type: 'pattern', trigger_context: 'PRD', priority: 90 },
    // Medium priority - specific refactoring operations
    { trigger_phrase: 'extract method', trigger_type: 'pattern', trigger_context: 'SD', priority: 85 },
    { trigger_phrase: 'extract function', trigger_type: 'pattern', trigger_context: 'SD', priority: 85 },
    { trigger_phrase: 'extract component', trigger_type: 'pattern', trigger_context: 'SD', priority: 85 },
    { trigger_phrase: 'reorganize', trigger_type: 'keyword', trigger_context: 'SD', priority: 85 },
    { trigger_phrase: 'regression test', trigger_type: 'pattern', trigger_context: 'PRD', priority: 85 },
    { trigger_phrase: 'public api', trigger_type: 'pattern', trigger_context: 'PRD', priority: 85 },
    { trigger_phrase: 'deprecate', trigger_type: 'keyword', trigger_context: 'PRD', priority: 85 },
    // Lower priority - general refactoring
    { trigger_phrase: 'consolidate', trigger_type: 'keyword', trigger_context: 'SD', priority: 80 },
    { trigger_phrase: 'move file', trigger_type: 'pattern', trigger_context: 'SD', priority: 80 },
    { trigger_phrase: 'rename', trigger_type: 'keyword', trigger_context: 'SD', priority: 75 }
  ].map(t => ({ ...t, sub_agent_id: REGRESSION_UUID }));

  const { error: regTrigErr } = await supabase
    .from('leo_sub_agent_triggers')
    .insert(regressionTriggers);

  if (regTrigErr) {
    console.log('   Error inserting REGRESSION triggers:', regTrigErr.message);
  } else {
    console.log('   ✅ REGRESSION triggers inserted (20 triggers)');
  }

  // Step 7: Verify the fix
  console.log('\n=== Verifying Fix ===\n');

  const { data: agents } = await supabase
    .from('leo_sub_agents')
    .select('id, name, code, priority')
    .in('code', ['REGRESSION', 'VALUATION']);

  console.log('Sub-agents after fix:');
  agents?.forEach(a => {
    console.log(`  ${a.code}: ${a.name}`);
    console.log(`    ID: ${a.id}`);
    console.log(`    Priority: ${a.priority}`);
  });

  // Verify trigger counts
  for (const agent of agents || []) {
    const { data: triggers } = await supabase
      .from('leo_sub_agent_triggers')
      .select('trigger_phrase')
      .eq('sub_agent_id', agent.id);
    console.log(`  ${agent.code} triggers: ${triggers?.length || 0}`);
  }

  console.log('\n=== Fix Complete ===');
}

fixCollision().catch(console.error);
