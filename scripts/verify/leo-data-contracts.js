#!/usr/bin/env node

/**
 * LEO Data Contracts Verification Script
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 *
 * Verifies:
 * 1. All 7 LEO protocol tables exist
 * 2. Constraints are enforced (transitions, immutability, append-only)
 * 3. TypeScript types compile without errors
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const results = {
  tables: {},
  constraints: {},
  functions: {},
  typescript: false,
  totalPassed: 0,
  totalFailed: 0
};

function pass(name) {
  console.log(`  ✅ ${name}`);
  results.totalPassed++;
}

function fail(name, error) {
  console.log(`  ❌ ${name}: ${error}`);
  results.totalFailed++;
}

async function verifyTables() {
  console.log('\n1. Verifying tables exist...');
  const tables = [
    'leo_proposals',
    'leo_proposal_transitions',
    'leo_vetting_rubrics',
    'leo_prioritization_config',
    'leo_audit_config',
    'leo_feature_flags',
    'leo_events',
    'leo_prompts'
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(0);
    if (error) {
      fail(table, error.message);
      results.tables[table] = false;
    } else {
      pass(table);
      results.tables[table] = true;
    }
  }
}

async function verifyProposalTransitions() {
  console.log('\n2. Verifying proposal state transitions...');

  // Create a test proposal
  const { data: proposal, error: createError } = await supabase
    .from('leo_proposals')
    .insert({
      created_by: '00000000-0000-0000-0000-000000000000',
      title: 'Test Proposal for Constraint Verification',
      summary: 'This tests the state transition constraints',
      motivation: 'Verify database constraints work correctly',
      risk_level: 'low'
    })
    .select()
    .single();

  if (createError) {
    fail('Create proposal', createError.message);
    return;
  }

  pass('Create proposal (starts in draft)');

  // Try invalid transition: draft -> approved (should fail)
  const { error: invalidError } = await supabase
    .from('leo_proposals')
    .update({ status: 'approved' })
    .eq('id', proposal.id);

  if (invalidError && invalidError.message.includes('invalid_status_transition')) {
    pass('Invalid transition blocked (draft -> approved)');
    results.constraints.proposal_transitions = true;
  } else {
    fail('Invalid transition should be blocked', 'Expected error not thrown');
    results.constraints.proposal_transitions = false;
  }

  // Valid transition: draft -> submitted
  const { error: validError } = await supabase
    .from('leo_proposals')
    .update({ status: 'submitted' })
    .eq('id', proposal.id);

  if (!validError) {
    pass('Valid transition allowed (draft -> submitted)');
  } else {
    fail('Valid transition', validError.message);
  }

  // Cleanup
  await supabase.from('leo_proposals').delete().eq('id', proposal.id);
}

async function verifyRubricImmutability() {
  console.log('\n3. Verifying rubric immutability...');

  // Create a rubric with weights summing to 1.0
  const { data: rubric, error: createError } = await supabase
    .from('leo_vetting_rubrics')
    .insert({
      created_by: '00000000-0000-0000-0000-000000000000',
      name: 'Test Rubric',
      version: 999,
      weights: { strategic_value: 0.5, risk_assessment: 0.5 },
      criteria: [{ id: 'sv', name: 'Strategic Value', description: 'Test' }],
      scoring_scale: { min: 0, max: 100, labels: {} }
    })
    .select()
    .single();

  if (createError) {
    fail('Create rubric', createError.message);
    return;
  }

  pass('Create rubric with valid weights');

  // Publish the rubric
  const { error: publishError } = await supabase
    .from('leo_vetting_rubrics')
    .update({ status: 'published' })
    .eq('id', rubric.id);

  if (!publishError) {
    pass('Publish rubric');
  } else {
    fail('Publish rubric', publishError.message);
  }

  // Try to modify weights of published rubric (should fail)
  const { error: modifyError } = await supabase
    .from('leo_vetting_rubrics')
    .update({ weights: { strategic_value: 0.7, risk_assessment: 0.3 } })
    .eq('id', rubric.id);

  if (modifyError && modifyError.message.includes('published_rubric_immutable')) {
    pass('Published rubric immutability enforced');
    results.constraints.rubric_immutability = true;
  } else {
    fail('Published rubric should be immutable', 'Modification was allowed');
    results.constraints.rubric_immutability = false;
  }

  // Cleanup
  await supabase.from('leo_vetting_rubrics').delete().eq('id', rubric.id);
}

async function verifyRubricWeights() {
  console.log('\n4. Verifying rubric weight validation...');

  // Try to create rubric with weights not summing to 1.0
  const { error: invalidWeightsError } = await supabase
    .from('leo_vetting_rubrics')
    .insert({
      created_by: '00000000-0000-0000-0000-000000000000',
      name: 'Invalid Rubric',
      version: 998,
      weights: { a: 0.3, b: 0.3 }, // Sum = 0.6, not 1.0
      criteria: [],
      scoring_scale: { min: 0, max: 100, labels: {} }
    });

  if (invalidWeightsError && invalidWeightsError.message.includes('invalid_rubric_weights')) {
    pass('Invalid weights rejected (sum != 1.0)');
    results.constraints.rubric_weights = true;
  } else {
    fail('Invalid weights should be rejected', 'Weights validation not enforced');
    results.constraints.rubric_weights = false;
  }
}

async function verifyEventsAppendOnly() {
  console.log('\n5. Verifying events append-only...');

  // Create an event
  const { data: event, error: createError } = await supabase
    .from('leo_events')
    .insert({
      actor_type: 'system',
      event_name: 'test.constraint_verification',
      entity_type: 'proposal',
      correlation_id: crypto.randomUUID(),
      payload: { test: true }
    })
    .select()
    .single();

  if (createError) {
    fail('Create event', createError.message);
    return;
  }

  pass('Create event');

  // Try to update (should fail)
  const { error: updateError } = await supabase
    .from('leo_events')
    .update({ payload: { modified: true } })
    .eq('id', event.id);

  if (updateError && updateError.message.includes('events_append_only')) {
    pass('Event update blocked (append-only)');
    results.constraints.events_append_only = true;
  } else {
    fail('Event update should be blocked', 'Update was allowed');
    results.constraints.events_append_only = false;
  }

  // Try to delete (should fail)
  const { error: deleteError } = await supabase
    .from('leo_events')
    .delete()
    .eq('id', event.id);

  if (deleteError && deleteError.message.includes('events_append_only')) {
    pass('Event delete blocked (append-only)');
  } else {
    fail('Event delete should be blocked', 'Delete was allowed');
  }
}

async function verifyPromptChecksum() {
  console.log('\n6. Verifying prompt checksum validation...');

  const promptText = 'This is a test prompt for checksum verification.';
  const correctChecksum = crypto.createHash('sha256').update(promptText).digest('hex');
  const wrongChecksum = 'incorrect_checksum';

  // Try to create with wrong checksum (should fail)
  const { error: invalidError } = await supabase
    .from('leo_prompts')
    .insert({
      created_by: '00000000-0000-0000-0000-000000000000',
      name: 'Test Prompt',
      version: 999,
      prompt_text: promptText,
      checksum: wrongChecksum
    });

  if (invalidError && invalidError.message.includes('invalid_prompt_checksum')) {
    pass('Invalid checksum rejected');
    results.constraints.prompt_checksum = true;
  } else {
    fail('Invalid checksum should be rejected', 'Checksum validation not enforced');
    results.constraints.prompt_checksum = false;
  }

  // Create with correct checksum
  const { data: prompt, error: validError } = await supabase
    .from('leo_prompts')
    .insert({
      created_by: '00000000-0000-0000-0000-000000000000',
      name: 'Test Prompt Valid',
      version: 999,
      prompt_text: promptText,
      checksum: correctChecksum
    })
    .select()
    .single();

  if (!validError) {
    pass('Valid checksum accepted');
    // Cleanup
    await supabase.from('leo_prompts').delete().eq('id', prompt.id);
  } else {
    fail('Valid checksum', validError.message);
  }
}

async function verifyFunctions() {
  console.log('\n7. Verifying database functions...');

  // Test leo_get_active_configs (should fail with no active configs)
  const { error: configError } = await supabase.rpc('leo_get_active_configs');

  if (configError && configError.message.includes('invalid_active_config_state')) {
    pass('leo_get_active_configs validates active state');
    results.functions.get_active_configs = true;
  } else if (!configError) {
    pass('leo_get_active_configs works (configs exist)');
    results.functions.get_active_configs = true;
  } else {
    fail('leo_get_active_configs', configError.message);
    results.functions.get_active_configs = false;
  }

  // Test leo_get_active_prompt (should fail with no active prompt)
  const { error: promptError } = await supabase.rpc('leo_get_active_prompt', {
    p_name: 'nonexistent_prompt'
  });

  if (promptError && promptError.message.includes('active_prompt_not_found')) {
    pass('leo_get_active_prompt validates existence');
    results.functions.get_active_prompt = true;
  } else {
    fail('leo_get_active_prompt', promptError?.message || 'Expected error not thrown');
    results.functions.get_active_prompt = false;
  }
}

async function verifyTypeScript() {
  console.log('\n8. Verifying TypeScript compilation...');

  try {
    execSync('npx tsc --noEmit', {
      cwd: process.cwd() + '/types',
      stdio: 'pipe'
    });
    pass('TypeScript types compile without errors');
    results.typescript = true;
  } catch (error) {
    fail('TypeScript compilation', error.stderr?.toString() || error.message);
    results.typescript = false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO Data Contracts Verification');
  console.log('  SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5)');
  console.log('═══════════════════════════════════════════════════════════════');

  await verifyTables();
  await verifyProposalTransitions();
  await verifyRubricImmutability();
  await verifyRubricWeights();
  await verifyEventsAppendOnly();
  await verifyPromptChecksum();
  await verifyFunctions();
  await verifyTypeScript();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  console.log(`\n  Tables: ${Object.values(results.tables).filter(Boolean).length}/${Object.keys(results.tables).length} exist`);
  console.log(`  Constraints: ${Object.values(results.constraints).filter(Boolean).length}/${Object.keys(results.constraints).length} enforced`);
  console.log(`  Functions: ${Object.values(results.functions).filter(Boolean).length}/${Object.keys(results.functions).length} working`);
  console.log(`  TypeScript: ${results.typescript ? '✅' : '❌'}`);

  console.log(`\n  Total: ${results.totalPassed} passed, ${results.totalFailed} failed`);

  if (results.totalFailed === 0) {
    console.log('\n  🎉 ALL VERIFICATIONS PASSED');
    console.log('  Data contracts are ready for Phase 1 implementation.');
  } else {
    console.log('\n  ⚠️  SOME VERIFICATIONS FAILED');
    console.log('  Review the failures above and fix before proceeding.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
