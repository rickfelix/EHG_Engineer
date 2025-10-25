#!/usr/bin/env node
/**
 * DirectiveLab Submission Test Suite
 *
 * Automated testing for DirectiveLab submission flow
 * Tests API endpoint, database integration, and schema compliance
 *
 * Created: 2025-10-11
 * Purpose: Validate database schema fix for directive_submissions table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const TEST_FEEDBACK = 'Testing DirectiveLab submission flow - automated test suite validating database schema fix and API integration';
const TEST_SCREENSHOT_URL = 'https://example.com/test-screenshot.png';
const SERVER_URL = 'http://localhost:3000';

// Test results storage
const results = {
  testCases: [],
  startTime: Date.now(),
  endTime: null,
  overallVerdict: 'PENDING',
  confidence: 0
};

/**
 * Log test case result
 */
function logTestCase(name, status, message, details = null) {
  const testCase = { name, status, message, details, timestamp: new Date().toISOString() };
  results.testCases.push(testCase);

  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${status}`);
  if (message) console.log(`   ${message}`);
  if (details) console.log('   Details:', details);
}

/**
 * Test Case 1: API Endpoint Connectivity
 */
async function testAPIEndpoint() {
  console.log('\n📋 Test Case 1: API Endpoint Connectivity');
  console.log('─────────────────────────────────────────');

  try {
    const response = await fetch(`${SERVER_URL}/api/sdip/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedback: TEST_FEEDBACK,
        screenshot_url: TEST_SCREENSHOT_URL
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logTestCase('API Endpoint', 'FAIL', `HTTP ${response.status}`, { error: errorText });
      return null;
    }

    const data = await response.json();

    if (!data.success) {
      logTestCase('API Endpoint', 'FAIL', 'Response success=false', data);
      return null;
    }

    if (!data.submission || !data.submission.id) {
      logTestCase('API Endpoint', 'FAIL', 'Missing submission ID in response', data);
      return null;
    }

    logTestCase('API Endpoint', 'PASS', `Submission created: ${data.submission.id}`);
    return data.submission;

  } catch (error) {
    logTestCase('API Endpoint', 'FAIL', `Request failed: ${error.message}`);
    return null;
  }
}

/**
 * Test Case 2: Database Record Validation
 */
async function testDatabaseRecord(submissionId) {
  console.log('\n📋 Test Case 2: Database Record Validation');
  console.log('─────────────────────────────────────────');

  if (!submissionId) {
    logTestCase('Database Record', 'BLOCKED', 'No submission ID from API test');
    return null;
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from('directive_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error) {
      logTestCase('Database Record', 'FAIL', `Query error: ${error.message}`);
      return null;
    }

    if (!data) {
      logTestCase('Database Record', 'FAIL', 'Record not found in database');
      return null;
    }

    logTestCase('Database Record', 'PASS', `Record found with ${Object.keys(data).length} columns`);
    return data;

  } catch (error) {
    logTestCase('Database Record', 'FAIL', `Database error: ${error.message}`);
    return null;
  }
}

/**
 * Test Case 3: Schema Compliance
 */
function testSchemaCompliance(record) {
  console.log('\n📋 Test Case 3: Schema Compliance');
  console.log('─────────────────────────────────────────');

  if (!record) {
    logTestCase('Schema Compliance', 'BLOCKED', 'No database record to validate');
    return false;
  }

  const requiredFields = [
    'id',
    'submission_id',
    'chairman_input',
    'status',
    'current_step',
    'completed_steps',
    'gate_status',
    'created_by',
    'created_at',
    'updated_at'
  ];

  const missingFields = [];
  const nullFields = [];
  const validFields = [];

  for (const field of requiredFields) {
    if (!(field in record)) {
      missingFields.push(field);
    } else if (record[field] === null && !['screenshot_url', 'intent_summary', 'strategic_tactical_classification', 'synthesis_data', 'questions', 'final_summary', 'completed_at'].includes(field)) {
      nullFields.push(field);
    } else {
      validFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    logTestCase('Schema Compliance', 'FAIL', `Missing fields: ${missingFields.join(', ')}`);
    return false;
  }

  if (nullFields.length > 0) {
    logTestCase('Schema Compliance', 'WARN', `Null fields: ${nullFields.join(', ')}`, {
      note: 'Some null values may be acceptable'
    });
  }

  logTestCase('Schema Compliance', 'PASS', `All ${validFields.length} required fields present and populated`);
  return true;
}

/**
 * Test Case 4: Data Integrity
 */
function testDataIntegrity(record) {
  console.log('\n📋 Test Case 4: Data Integrity');
  console.log('─────────────────────────────────────────');

  if (!record) {
    logTestCase('Data Integrity', 'BLOCKED', 'No database record to validate');
    return false;
  }

  const issues = [];

  // Validate chairman_input matches test data
  if (!record.chairman_input || !record.chairman_input.includes('Testing DirectiveLab')) {
    issues.push('chairman_input does not match submitted feedback');
  }

  // Validate status is pending
  if (record.status !== 'pending') {
    issues.push(`Unexpected status: ${record.status} (expected: pending)`);
  }

  // Validate current_step is 1
  if (record.current_step !== 1) {
    issues.push(`Unexpected current_step: ${record.current_step} (expected: 1)`);
  }

  // Validate completed_steps is array
  if (!Array.isArray(record.completed_steps)) {
    issues.push(`completed_steps is not an array: ${typeof record.completed_steps}`);
  }

  // Validate gate_status is object
  if (typeof record.gate_status !== 'object') {
    issues.push(`gate_status is not an object: ${typeof record.gate_status}`);
  }

  // Validate created_by
  if (record.created_by !== 'Chairman') {
    issues.push(`Unexpected created_by: ${record.created_by} (expected: Chairman)`);
  }

  // Validate timestamps
  const createdAt = new Date(record.created_at);
  const updatedAt = new Date(record.updated_at);
  if (isNaN(createdAt.getTime())) {
    issues.push('Invalid created_at timestamp');
  }
  if (isNaN(updatedAt.getTime())) {
    issues.push('Invalid updated_at timestamp');
  }

  if (issues.length > 0) {
    logTestCase('Data Integrity', 'FAIL', `${issues.length} issue(s) found`, { issues });
    return false;
  }

  logTestCase('Data Integrity', 'PASS', 'All data fields valid and consistent');
  return true;
}

/**
 * Test Case 5: No Schema Errors
 */
function testNoSchemaErrors(record) {
  console.log('\n📋 Test Case 5: No Deprecated Schema Fields');
  console.log('─────────────────────────────────────────');

  if (!record) {
    logTestCase('No Schema Errors', 'BLOCKED', 'No database record to validate');
    return false;
  }

  // Check that old problematic fields are NOT present
  const deprecatedFields = ['metadata', 'processing_history'];
  const foundDeprecated = [];

  for (const field of deprecatedFields) {
    if (field in record) {
      foundDeprecated.push(field);
    }
  }

  if (foundDeprecated.length > 0) {
    logTestCase('No Schema Errors', 'FAIL', `Found deprecated fields: ${foundDeprecated.join(', ')}`, {
      note: 'These fields caused the original bug'
    });
    return false;
  }

  logTestCase('No Schema Errors', 'PASS', 'No deprecated fields present (bug fix confirmed)');
  return true;
}

/**
 * Generate final report
 */
function generateReport() {
  results.endTime = Date.now();
  const duration = ((results.endTime - results.startTime) / 1000).toFixed(2);

  const passed = results.testCases.filter(tc => tc.status === 'PASS').length;
  const failed = results.testCases.filter(tc => tc.status === 'FAIL').length;
  const warned = results.testCases.filter(tc => tc.status === 'WARN').length;
  const blocked = results.testCases.filter(tc => tc.status === 'BLOCKED').length;
  const total = results.testCases.length;

  // Calculate verdict
  if (failed > 0 || blocked > 0) {
    results.overallVerdict = 'FAIL';
    results.confidence = Math.round((passed / total) * 100);
  } else if (warned > 0) {
    results.overallVerdict = 'CONDITIONAL_PASS';
    results.confidence = Math.round(((passed - warned * 0.5) / total) * 100);
  } else {
    results.overallVerdict = 'PASS';
    results.confidence = 100;
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 DirectiveLab Submission Test Report');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`📊 Test Results: ${passed}/${total} passed`);
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⚠️  Warned:  ${warned}`);
  console.log(`   🚫 Blocked: ${blocked}`);
  console.log('');
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('');
  console.log(`🎯 Overall Verdict: ${results.overallVerdict}`);
  console.log(`📈 Confidence: ${results.confidence}%`);
  console.log('');

  if (results.overallVerdict === 'PASS') {
    console.log('✅ All tests passed! DirectiveLab submission flow is working correctly.');
    console.log('   Database schema fix confirmed.');
    console.log('   API integration validated.');
    console.log('   Ready for production use.');
  } else if (results.overallVerdict === 'CONDITIONAL_PASS') {
    console.log('⚠️  Tests passed with warnings. Review warnings above.');
  } else {
    console.log('❌ Tests failed. Review failures above and fix issues.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  return results;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 DirectiveLab Submission Test Suite');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`📍 Server: ${SERVER_URL}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log('');

  // Run tests sequentially
  const submission = await testAPIEndpoint();
  const record = await testDatabaseRecord(submission?.id);
  testSchemaCompliance(record);
  testDataIntegrity(record);
  testNoSchemaErrors(record);

  // Generate final report
  const report = generateReport();

  // Exit with appropriate code
  process.exit(report.overallVerdict === 'PASS' ? 0 : 1);
}

// Execute tests
runTests().catch(error => {
  console.error('\n❌ Fatal error during test execution:', error.message);
  console.error(error.stack);
  process.exit(1);
});
