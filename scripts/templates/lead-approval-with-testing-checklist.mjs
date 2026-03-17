#!/usr/bin/env node
/**
 * LEAD APPROVAL TEMPLATE WITH TESTING CHECKLIST
 *
 * This template ensures LEAD validates all testing evidence before approval
 * Based on lessons learned from SD-RECONNECT-011
 */

import { createSupabaseClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const supabase = createSupabaseClient();

const SD_KEY = process.argv[2];

if (!SD_KEY) {
  console.error('Usage: node lead-approval-with-testing-checklist.mjs <SD_KEY>');
  process.exit(1);
}

console.log('\n🎯 LEAD FINAL APPROVAL WITH TESTING VALIDATION');
console.log('======================================================================\n');
console.log(`SD: ${SD_KEY}\n`);

// Retrieve SD
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', SD_KEY)
  .single();

if (sdError || !sd) {
  console.error('❌ Failed to retrieve SD:', sdError?.message);
  process.exit(1);
}

console.log(`📋 SD: ${sd.title}`);
console.log(`   Status: ${sd.status}`);
console.log(`   Phase: ${sd.current_phase}\n`);

// MANDATORY TESTING CHECKLIST
console.log('🧪 MANDATORY TESTING CHECKLIST');
console.log('======================================================================\n');

let checklistPassed = true;

// Check 1: Run testing evidence validation
console.log('1️⃣  Validating testing evidence...');
try {
  execSync(`node scripts/validate-testing-evidence.mjs ${SD_KEY}`, {
    stdio: 'pipe',
    encoding: 'utf8'
  });
  console.log('   ✅ Testing evidence validation PASSED\n');
} catch (error) {
  console.log('   ❌ Testing evidence validation FAILED');
  console.log('   Output:', error.stdout);
  console.log();
  checklistPassed = false;
}

// Check 2: Verify PLAN→LEAD action items
console.log('2️⃣  Checking PLAN→LEAD action items...');
const planLeadHandoff = sd.metadata?.plan_lead_handoff;
if (planLeadHandoff?.action_items) {
  const actionItems = planLeadHandoff.action_items;
  console.log(`   Found ${actionItems.length} action items:\n`);

  actionItems.forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.action}`);
    if (item.priority === 'CRITICAL') {
      console.log(`      ⚠️  CRITICAL priority - must be completed`);
    }
  });

  // Check if any testing-related action items
  const testingItems = actionItems.filter(item =>
    item.action?.toLowerCase().includes('test') ||
    item.action?.toLowerCase().includes('manual') ||
    item.action?.toLowerCase().includes('screenshot')
  );

  if (testingItems.length > 0) {
    console.log(`\n   ⚠️  ${testingItems.length} testing-related action items found`);
    console.log('   ❌ Verify these were completed before proceeding\n');
    checklistPassed = false;
  } else {
    console.log('\n   ✅ No testing action items or all completed\n');
  }
} else {
  console.log('   ⚠️  No PLAN→LEAD handoff found\n');
}

// Check 3: Verify test evidence exists
console.log('3️⃣  Verifying test evidence in metadata...');
const testEvidence = sd.metadata?.lead_final_approval?.test_evidence;
if (testEvidence) {
  console.log('   ✅ Test evidence found:');
  console.log(`      - Script: ${testEvidence.automated_test_script || 'N/A'}`);
  console.log(`      - Pass rate: ${testEvidence.pass_rate || 'N/A'}`);
  console.log(`      - Results: ${testEvidence.tests_passed || 'N/A'}/${testEvidence.tests_total || 'N/A'}`);
  console.log(`      - Screenshot: ${testEvidence.screenshot_path || 'N/A'}`);
  console.log(`      - Auth verified: ${testEvidence.authentication_verified || false}\n`);
} else {
  console.log('   ❌ No test evidence found in metadata\n');
  checklistPassed = false;
}

// Check 4: Verify sub-agent verification completed
console.log('4️⃣  Checking sub-agent verification...');
const planLeadVerdict = planLeadHandoff?.supervisor_verdict;
if (planLeadVerdict) {
  console.log(`   ✅ PLAN supervisor verdict: ${planLeadVerdict}`);
  console.log(`      Confidence: ${planLeadHandoff.supervisor_confidence || 'N/A'}%\n`);
} else {
  console.log('   ⚠️  No PLAN supervisor verdict found\n');
}

// Final Decision
console.log('======================================================================');
console.log('📊 CHECKLIST SUMMARY\n');

if (checklistPassed) {
  console.log('✅ ALL CHECKS PASSED - Ready for LEAD approval\n');
  console.log('Next steps:');
  console.log('1. Review test evidence and screenshots');
  console.log('2. Verify all action items are completed');
  console.log('3. Create LEAD approval decision with test evidence');
  console.log('4. Update SD status to COMPLETED\n');
  process.exit(0);
} else {
  console.log('❌ CHECKLIST FAILED - Cannot approve yet\n');
  console.log('Required actions:');
  console.log('1. Complete all testing action items from PLAN→LEAD handoff');
  console.log('2. Ensure test evidence is captured and validated');
  console.log('3. Run validate-testing-evidence.mjs and ensure it passes');
  console.log('4. Re-run this checklist\n');
  process.exit(1);
}
