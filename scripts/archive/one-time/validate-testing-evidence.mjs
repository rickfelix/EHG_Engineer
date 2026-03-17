#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { stat, readdir } from 'fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_KEY = process.argv[2];

if (!SD_KEY) {
  console.error('Usage: node validate-testing-evidence.mjs <SD_KEY>');
  process.exit(1);
}

console.log('\n🔍 VALIDATING TESTING EVIDENCE');
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

const validationResults = [];
let overallPass = true;

// Check 1: Test evidence exists in metadata
console.log('1️⃣  Checking for test evidence in metadata...');
const testEvidence = sd.metadata?.lead_final_approval?.test_evidence;
if (testEvidence) {
  console.log('   ✅ Test evidence found in metadata\n');
  validationResults.push({ check: 'Test evidence in metadata', status: 'PASS' });
} else {
  console.log('   ❌ No test evidence found in metadata\n');
  validationResults.push({ check: 'Test evidence in metadata', status: 'FAIL' });
  overallPass = false;
}

// Check 2: Screenshot evidence
console.log('2️⃣  Checking for screenshot evidence...');
const screenshotPath = testEvidence?.screenshot_path;
if (screenshotPath) {
  try {
    await stat(screenshotPath);
    console.log(`   ✅ Screenshot found: ${screenshotPath}\n`);
    validationResults.push({ check: 'Screenshot evidence', status: 'PASS', detail: screenshotPath });
  } catch {
    console.log(`   ❌ Screenshot not found at: ${screenshotPath}\n`);
    validationResults.push({ check: 'Screenshot evidence', status: 'FAIL', detail: `Missing: ${screenshotPath}` });
    overallPass = false;
  }
} else {
  console.log('   ❌ No screenshot path specified\n');
  validationResults.push({ check: 'Screenshot evidence', status: 'FAIL', detail: 'No path specified' });
  overallPass = false;
}

// Check 3: Test pass rate documented
console.log('3️⃣  Checking test pass rate documentation...');
const passRate = testEvidence?.pass_rate;
if (passRate) {
  const passRateNum = parseFloat(passRate);
  if (passRateNum >= 70) {
    console.log(`   ✅ Pass rate documented: ${passRate} (≥70% threshold)\n`);
    validationResults.push({ check: 'Test pass rate', status: 'PASS', detail: passRate });
  } else {
    console.log(`   ⚠️  Pass rate below threshold: ${passRate} (<70%)\n`);
    validationResults.push({ check: 'Test pass rate', status: 'WARNING', detail: `${passRate} below 70%` });
  }
} else {
  console.log('   ❌ Test pass rate not documented\n');
  validationResults.push({ check: 'Test pass rate', status: 'FAIL', detail: 'Not documented' });
  overallPass = false;
}

// Check 4: Test results documented
console.log('4️⃣  Checking test results documentation...');
const testsPassed = testEvidence?.tests_passed;
const testsTotal = testEvidence?.tests_total;
if (testsPassed !== undefined && testsTotal !== undefined) {
  console.log(`   ✅ Test results: ${testsPassed}/${testsTotal} tests passed\n`);
  validationResults.push({ check: 'Test results', status: 'PASS', detail: `${testsPassed}/${testsTotal}` });
} else {
  console.log('   ❌ Test results not documented (tests_passed/tests_total missing)\n');
  validationResults.push({ check: 'Test results', status: 'FAIL', detail: 'Missing counts' });
  overallPass = false;
}

// Check 5: Authentication verification
console.log('5️⃣  Checking authentication verification...');
const authVerified = testEvidence?.authentication_verified;
if (authVerified === true) {
  console.log('   ✅ Authentication verified for protected routes\n');
  validationResults.push({ check: 'Authentication verification', status: 'PASS' });
} else if (authVerified === false) {
  console.log('   ⚠️  Authentication not required (public routes)\n');
  validationResults.push({ check: 'Authentication verification', status: 'N/A', detail: 'Public routes' });
} else {
  console.log('   ❌ Authentication verification status unknown\n');
  validationResults.push({ check: 'Authentication verification', status: 'FAIL', detail: 'Not specified' });
  overallPass = false;
}

// Check 6: PLAN→LEAD action items completed
console.log('6️⃣  Checking PLAN→LEAD action items...');
const planLeadHandoff = sd.metadata?.plan_lead_handoff;
if (planLeadHandoff?.action_items) {
  const actionItems = planLeadHandoff.action_items;
  const testingActionItems = actionItems.filter(item =>
    item.action?.toLowerCase().includes('test') ||
    item.action?.toLowerCase().includes('manual') ||
    item.action?.toLowerCase().includes('screenshot')
  );

  if (testingActionItems.length > 0) {
    console.log(`   ℹ️  Found ${testingActionItems.length} testing-related action items:`);
    testingActionItems.forEach((item, idx) => {
      console.log(`      ${idx + 1}. ${item.action}`);
    });
    console.log('   ⚠️  Verify these were completed before approval\n');
    validationResults.push({ check: 'Action items review', status: 'WARNING', detail: `${testingActionItems.length} items to verify` });
  } else {
    console.log('   ✅ No testing-specific action items\n');
    validationResults.push({ check: 'Action items review', status: 'PASS', detail: 'No testing items' });
  }
} else {
  console.log('   ⚠️  No PLAN→LEAD handoff found\n');
  validationResults.push({ check: 'Action items review', status: 'WARNING', detail: 'No handoff' });
}

// Check 7: Test script evidence
console.log('7️⃣  Checking for test script evidence...');
const testScript = testEvidence?.automated_test_script;
if (testScript) {
  console.log(`   ✅ Test script documented: ${testScript}\n`);
  validationResults.push({ check: 'Test script', status: 'PASS', detail: testScript });
} else {
  console.log('   ❌ No test script documented\n');
  validationResults.push({ check: 'Test script', status: 'FAIL', detail: 'Not specified' });
  overallPass = false;
}

// Summary
console.log('======================================================================');
console.log('📊 VALIDATION SUMMARY\n');

validationResults.forEach(result => {
  const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️ ' : '❌';
  const detail = result.detail ? ` (${result.detail})` : '';
  console.log(`${icon} ${result.check}: ${result.status}${detail}`);
});

const passCount = validationResults.filter(r => r.status === 'PASS').length;
const failCount = validationResults.filter(r => r.status === 'FAIL').length;
const warnCount = validationResults.filter(r => r.status === 'WARNING' || r.status === 'N/A').length;

console.log(`\nResults: ${passCount} PASS, ${failCount} FAIL, ${warnCount} WARNING/N/A`);

if (overallPass && failCount === 0) {
  console.log('\n✅ VERDICT: Testing evidence is SUFFICIENT for LEAD approval\n');
  process.exit(0);
} else {
  console.log('\n❌ VERDICT: Testing evidence is INSUFFICIENT - address failures before LEAD approval\n');
  process.exit(1);
}
