#!/usr/bin/env node

/**
 * LEAD APPROVAL CHECKLIST
 * Comprehensive pre-approval verification to prevent missing critical steps
 * Ensures all sub-agents, retrospectives, and validations are complete
 */

import { createClient } from '@supabase/supabase-js';
import { detectRequiredSubAgents } from './auto-trigger-subagents.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runLeadApprovalChecklist(sdId) {
  console.log('🔍 LEAD APPROVAL CHECKLIST');
  console.log('═'.repeat(60));
  console.log(`SD ID: ${sdId}`);
  console.log('');

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // 1. Check SD exists and is in correct status
  console.log('1️⃣  Checking SD status...');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    results.failed.push('❌ SD not found in database');
    console.log('   ❌ FAILED: SD not found');
    return results;
  }

  console.log(`   ✅ SD found: ${sd.sd_key} - ${sd.title}`);
  console.log(`   Status: ${sd.status}, Progress: ${sd.progress}%`);

  if (sd.status !== 'completed' && sd.status !== 'pending_approval') {
    results.warnings.push(`⚠️  SD status is ${sd.status}, expected completed or pending_approval`);
  }
  results.passed.push('✅ SD exists and accessible');

  // 2. Check for retrospective
  console.log('\n2️⃣  Checking retrospective...');
  const { data: retro, error: retroError } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (retroError || !retro || retro.length === 0) {
    results.failed.push('❌ CRITICAL: Retrospective missing!');
    console.log('   ❌ FAILED: No retrospective found');
    console.log('   ACTION: Trigger Continuous Improvement Coach sub-agent');
  } else {
    results.passed.push('✅ Retrospective generated');
    console.log(`   ✅ Retrospective found (ID: ${retro[0].id})`);
    console.log(`   Quality Score: ${retro[0].quality_score}/100`);
    console.log(`   Satisfaction: ${retro[0].team_satisfaction}/5`);
  }

  // 3. Check for required sub-agents based on implementation
  console.log('\n3️⃣  Checking sub-agent activations...');

  // Build context from SD description and phases
  const context = `${sd.description || ''} ${sd.acceptance_criteria || ''}`;
  const requiredSubAgents = detectRequiredSubAgents('EXEC_IMPLEMENTATION_COMPLETE', context);

  console.log(`   Required sub-agents: ${requiredSubAgents.length}`);

  if (requiredSubAgents.length > 0) {
    console.log('   Expected:');
    requiredSubAgents.forEach(sa => console.log(`      • ${sa}`));

    // Check if sub-agent executions were recorded
    const { data: executions } = await supabase
      .from('sub_agent_executions')
      .select('*')
      .eq('sd_id', sdId);

    if (!executions || executions.length === 0) {
      results.warnings.push('⚠️  No sub-agent executions recorded in database');
      console.log('   ⚠️  WARNING: No sub-agent execution records found');
    } else {
      results.passed.push(`✅ ${executions.length} sub-agent executions recorded`);
      console.log(`   ✅ ${executions.length} sub-agent activations recorded`);
    }
  }

  // 4. Check for DevOps verification (CI/CD status)
  console.log('\n4️⃣  Checking DevOps verification...');
  const devOpsRequired = detectRequiredSubAgents('EXEC_IMPLEMENTATION_COMPLETE', '').includes('DEVOPS_PLATFORM_ARCHITECT');

  if (devOpsRequired) {
    results.warnings.push('⚠️  DevOps Platform Architect should verify CI/CD status');
    console.log('   ⚠️  WARNING: DevOps verification recommended');
    console.log('   ACTION: Check GitHub Actions, build status, test results');
  } else {
    console.log('   ℹ️  DevOps verification not required for this SD type');
  }

  // 5. Check for PRD
  console.log('\n5️⃣  Checking PRD...');
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('strategic_directive_id', sdId)
    .single();

  if (!prd) {
    results.warnings.push('⚠️  No PRD found');
    console.log('   ⚠️  WARNING: No PRD found');
  } else {
    results.passed.push('✅ PRD exists');
    console.log(`   ✅ PRD found (ID: ${prd.id})`);
  }

  // 6. Check for handoffs
  console.log('\n6️⃣  Checking handoffs...');
  const { data: handoffs } = await supabase
    .from('v_handoff_chain')
    .select('*')
    .eq('sd_id', sdId);

  if (!handoffs || handoffs.length === 0) {
    results.warnings.push('⚠️  No handoffs recorded');
    console.log('   ⚠️  WARNING: No handoffs found');
  } else {
    results.passed.push(`✅ ${handoffs.length} handoffs recorded`);
    console.log(`   ✅ ${handoffs.length} handoffs found`);
    handoffs.forEach(h => {
      console.log(`      • ${h.from_agent} → ${h.to_agent}`);
    });
  }

  // 7. Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));

  console.log('\n✅ PASSED:');
  results.passed.forEach(p => console.log(`   ${p}`));

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED:');
    results.failed.forEach(f => console.log(`   ${f}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(w => console.log(`   ${w}`));
  }

  const canApprove = results.failed.length === 0;
  console.log('\n' + '═'.repeat(60));
  if (canApprove) {
    console.log('✅ READY FOR LEAD APPROVAL');
    if (results.warnings.length > 0) {
      console.log('⚠️  Review warnings before approving');
    }
  } else {
    console.log('❌ NOT READY FOR APPROVAL');
    console.log('   Fix critical issues before proceeding');
  }
  console.log('═'.repeat(60));

  return {
    canApprove,
    passed: results.passed.length,
    failed: results.failed.length,
    warnings: results.warnings.length,
    details: results
  };
}

// CLI usage
async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node lead-approval-checklist.js <SD_ID>');
    console.error('Example: node lead-approval-checklist.js ccf6484d-9182-4879-a36a-33c7bbb1796c');
    process.exit(1);
  }

  const result = await runLeadApprovalChecklist(sdId);
  process.exit(result.canApprove ? 0 : 1);
}

// Run if called directly
main();

export { runLeadApprovalChecklist };
