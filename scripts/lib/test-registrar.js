/**
 * Test Registrar Library
 * SD-TEST-MGMT-SCANNER-001
 *
 * Registers parsed test cases into the UAT database schema.
 * Handles suites, test cases, and maintains referential integrity.
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Load from multiple env files
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.claude') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create and return Supabase client
 * @returns {Object} Supabase client
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Derive suite name from file path
 * @param {string} filePath - Test file path
 * @returns {Object} Suite info
 */
function deriveSuiteInfo(filePath) {
  const parts = filePath.split(path.sep);

  // Determine test type from path
  let testType = 'functional';
  let module = 'General';

  if (filePath.includes('tests/e2e')) {
    testType = 'e2e';
    module = 'E2E';
  } else if (filePath.includes('tests/integration')) {
    testType = 'integration';
    module = 'Integration';
  } else if (filePath.includes('tests/unit')) {
    testType = 'unit';
    module = 'Unit';
  }

  // Try to derive module from path structure
  const testsIdx = parts.indexOf('tests');
  if (testsIdx !== -1 && parts.length > testsIdx + 2) {
    module = parts[testsIdx + 2]; // e.g., tests/unit/genesis -> genesis
  }

  // Generate suite name
  const suiteName = `${testType.toUpperCase()} - ${module}`;

  return {
    suiteName,
    testType,
    module,
    priority: testType === 'e2e' ? 'high' : testType === 'unit' ? 'medium' : 'medium'
  };
}

/**
 * Ensure a test suite exists, creating if necessary
 * @param {Object} supabase - Supabase client
 * @param {Object} suiteInfo - Suite information
 * @returns {string} Suite ID
 */
async function ensureSuite(supabase, suiteInfo) {
  const { suiteName, testType, module, priority } = suiteInfo;

  // Check if suite exists
  const { data: existing } = await supabase
    .from('uat_test_suites')
    .select('id')
    .eq('suite_name', suiteName)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new suite
  const { data: newSuite, error } = await supabase
    .from('uat_test_suites')
    .insert({
      suite_name: suiteName,
      description: `Auto-generated suite for ${module} ${testType} tests`,
      module,
      test_type: testType,
      priority,
      status: 'active',
      created_by: 'test-scanner'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create suite: ${error.message}`);
  }

  return newSuite.id;
}

/**
 * Register a single test case
 * @param {Object} supabase - Supabase client
 * @param {string} suiteId - Parent suite ID
 * @param {Object} testCase - Parsed test case
 * @param {Object} fileInfo - Parent file information
 * @returns {Object} Registration result
 */
async function registerTestCase(supabase, suiteId, testCase, fileInfo) {
  const testCaseData = {
    suite_id: suiteId,
    test_name: testCase.fullName,
    description: `Test: ${testCase.name}`,
    test_type: testCase.testType,
    priority: testCase.testType === 'security' ? 'critical' : 'medium',
    automation_status: 'automated',
    timeout_ms: testCase.hasTimeout ? 60000 : 30000,
    created_by: 'test-scanner',
    metadata: {
      file_path: fileInfo.filePath,
      framework: fileInfo.framework,
      language: fileInfo.language,
      parent_describe: testCase.parentDescribe,
      is_async: testCase.isAsync,
      scanned_at: new Date().toISOString()
    }
  };

  // Check if test already exists
  const { data: existing } = await supabase
    .from('uat_test_cases')
    .select('id')
    .eq('test_name', testCase.fullName)
    .eq('suite_id', suiteId)
    .single();

  if (existing) {
    // Update existing test
    const { error } = await supabase
      .from('uat_test_cases')
      .update({
        ...testCaseData,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (error) {
      return { success: false, action: 'update', error: error.message };
    }
    return { success: true, action: 'updated', id: existing.id };
  }

  // Insert new test
  const { data: newTest, error } = await supabase
    .from('uat_test_cases')
    .insert(testCaseData)
    .select('id')
    .single();

  if (error) {
    return { success: false, action: 'insert', error: error.message };
  }

  return { success: true, action: 'created', id: newTest.id };
}

/**
 * Register all tests from a parsed file
 * @param {Object} parsedFile - Parsed test file data
 * @param {Object} options - Registration options
 * @returns {Object} Registration results
 */
export async function registerTestFile(parsedFile, options = {}) {
  const { dryRun = false } = options;
  const supabase = getSupabaseClient();

  if (parsedFile.error || parsedFile.testCount === 0) {
    return {
      filePath: parsedFile.filePath,
      success: false,
      error: parsedFile.error || 'No tests found',
      registered: 0
    };
  }

  const results = {
    filePath: parsedFile.filePath,
    success: true,
    suiteId: null,
    registered: 0,
    updated: 0,
    failed: 0,
    testResults: []
  };

  try {
    // Derive suite info and ensure suite exists
    const suiteInfo = deriveSuiteInfo(parsedFile.filePath);

    if (dryRun) {
      return {
        ...results,
        dryRun: true,
        suite: suiteInfo.suiteName,
        wouldRegister: parsedFile.testCount
      };
    }

    const suiteId = await ensureSuite(supabase, suiteInfo);
    results.suiteId = suiteId;
    results.suiteName = suiteInfo.suiteName;

    // Register each test case
    for (const testCase of parsedFile.testCases) {
      const result = await registerTestCase(supabase, suiteId, testCase, parsedFile);
      results.testResults.push({
        testName: testCase.fullName,
        ...result
      });

      if (result.success) {
        if (result.action === 'created') {
          results.registered++;
        } else {
          results.updated++;
        }
      } else {
        results.failed++;
      }
    }

    // Update suite test count
    const { data: testCounts } = await supabase
      .from('uat_test_cases')
      .select('id', { count: 'exact' })
      .eq('suite_id', suiteId);

    await supabase
      .from('uat_test_suites')
      .update({ total_tests: testCounts?.length || 0 })
      .eq('id', suiteId);

  } catch (err) {
    results.success = false;
    results.error = err.message;
  }

  return results;
}

/**
 * Register all tests from multiple parsed files
 * @param {Object[]} parsedFiles - Array of parsed test files
 * @param {Object} options - Registration options
 * @returns {Object} Aggregated results
 */
export async function registerAllTests(parsedFiles, options = {}) {
  const results = {
    totalFiles: parsedFiles.length,
    processedFiles: 0,
    totalRegistered: 0,
    totalUpdated: 0,
    totalFailed: 0,
    fileResults: [],
    errors: []
  };

  for (const parsedFile of parsedFiles) {
    const fileResult = await registerTestFile(parsedFile, options);
    results.fileResults.push(fileResult);

    if (fileResult.success) {
      results.processedFiles++;
      results.totalRegistered += fileResult.registered || 0;
      results.totalUpdated += fileResult.updated || 0;
      results.totalFailed += fileResult.failed || 0;
    } else {
      results.errors.push({
        filePath: fileResult.filePath,
        error: fileResult.error
      });
    }
  }

  return results;
}

/**
 * Get registration statistics from database
 * @returns {Object} Statistics
 */
export async function getRegistrationStats() {
  const supabase = getSupabaseClient();

  const { data: suites } = await supabase
    .from('uat_test_suites')
    .select('id, suite_name, total_tests, test_type');

  const { count: totalTests } = await supabase
    .from('uat_test_cases')
    .select('id', { count: 'exact' });

  const { data: byType } = await supabase
    .from('uat_test_cases')
    .select('test_type')
    .then(({ data }) => {
      const counts = {};
      data?.forEach(t => {
        counts[t.test_type] = (counts[t.test_type] || 0) + 1;
      });
      return { data: counts };
    });

  return {
    totalSuites: suites?.length || 0,
    totalTests: totalTests || 0,
    suites: suites || [],
    byType: byType || {}
  };
}

export default {
  getSupabaseClient,
  registerTestFile,
  registerAllTests,
  getRegistrationStats
};
