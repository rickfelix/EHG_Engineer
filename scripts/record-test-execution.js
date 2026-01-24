#!/usr/bin/env node
/**
 * Record Test Execution
 * Records successful test runs for strategic directives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function recordTestExecution(sdId, testFile, testCount, testStatus = 'PASSED') {
  try {
    // Insert test execution record
    const { data, error } = await supabase
      .from('test_execution_log')
      .insert({
        sd_id: sdId,
        test_file: testFile,
        test_count: testCount,
        test_status: testStatus,
        executed_at: new Date().toISOString(),
        executed_by: 'testing-agent'
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording test execution:', error.message);
      return false;
    }

    console.log('✅ Test execution recorded successfully');
    console.log(`   SD: ${sdId}`);
    console.log(`   Test File: ${testFile}`);
    console.log(`   Tests: ${testCount} ${testStatus}`);
    console.log(`   Executed At: ${data.executed_at}`);

    return true;
  } catch (err) {
    console.error('Failed to record test execution:', err.message);
    return false;
  }
}

// Parse command line arguments
const sdId = process.argv[2];
const testFile = process.argv[3];
const testCount = parseInt(process.argv[4], 10);
const testStatus = process.argv[5] || 'PASSED';

if (!sdId || !testFile || !testCount) {
  console.error('Usage: node record-test-execution.js <SD-ID> <test-file> <test-count> [status]');
  console.error('Example: node record-test-execution.js SD-LEO-REFAC-BRANCH-003 scripts/lib/branch-resolver.test.js 26 PASSED');
  process.exit(1);
}

recordTestExecution(sdId, testFile, testCount, testStatus)
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
