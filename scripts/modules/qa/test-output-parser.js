/**
 * Test Output Parser
 * Parses Vitest and Playwright test output to extract real results
 */

/**
 * Parse Vitest unit test output
 * @param {string} output - Raw stdout from vitest command
 * @returns {Object} Parsed test results
 */
export function parseVitestOutput(output) {
  const results = {
    framework: 'vitest',
    total_tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_seconds: 0,
    coverage_percentage: null,
    success: false,
    error: null,
    failures: []
  };

  try {
    // Look for test summary line: " Test Files  13 passed (13)"
    const _testFilesMatch = output.match(/Test Files\s+(\d+)\s+passed/);

    // Look for individual test count: " Tests  162 passed | 1 skipped (163)"
    // Format: "Tests  <passed> passed [| <failed> failed] [| <skipped> skipped] (<total>)"
    const testsMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?(?:\s+\|\s+(\d+)\s+skipped)?\s+\((\d+)\)/);

    if (testsMatch) {
      const passed = parseInt(testsMatch[1]) || 0;
      const failed = parseInt(testsMatch[2]) || 0;
      const skipped = parseInt(testsMatch[3]) || 0;
      const total = parseInt(testsMatch[4]) || 0;

      results.passed = passed;
      results.failed = failed;
      results.skipped = skipped;
      results.total_tests = total;
    }

    // Look for duration: "   Duration  46.00s" or "Duration  2.5m"
    const durationMatch = output.match(/Duration\s+([\d.]+)([sm])/);
    if (durationMatch) {
      const value = parseFloat(durationMatch[1]);
      const unit = durationMatch[2];
      results.duration_seconds = unit === 'm' ? value * 60 : value;
    }

    // Look for coverage: "All files | 85.5 |"
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|/);
    if (coverageMatch) {
      results.coverage_percentage = parseFloat(coverageMatch[1]);
    }

    // Extract failure details
    if (results.failed > 0) {
      // Look for FAIL blocks with test names and error messages
      const failRegex = /FAIL\s+(.+?)\n.*?Error:\s*(.+?)(?:\n\s*at|$)/gs;
      let match;
      while ((match = failRegex.exec(output)) !== null) {
        results.failures.push({
          test_file: match[1].trim(),
          error_message: match[2].trim().substring(0, 200) // Limit to 200 chars
        });
      }

      // Alternative: Look for ❯ test name followed by error
      if (results.failures.length === 0) {
        const altFailRegex = /❯\s+(.+?)\n.*?(?:Expected|Error|AssertionError):\s*(.+?)(?:\n|$)/gs;
        while ((match = altFailRegex.exec(output)) !== null) {
          results.failures.push({
            test_name: match[1].trim(),
            error_message: match[2].trim().substring(0, 200)
          });
        }
      }
    }

    results.success = results.failed === 0;

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

/**
 * Parse Playwright E2E test output
 * @param {string} output - Raw stdout from playwright command
 * @returns {Object} Parsed test results
 */
export function parsePlaywrightOutput(output) {
  const results = {
    framework: 'playwright',
    total_tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_seconds: 0,
    coverage_percentage: null,
    success: false,
    error: null,
    failures: []
  };

  try {
    // Look for summary: "5 passed (2.3s)"
    const passedMatch = output.match(/(\d+)\s+passed\s+\(([\d.]+)([sm])\)/);
    if (passedMatch) {
      results.passed = parseInt(passedMatch[1]) || 0;
      const value = parseFloat(passedMatch[2]);
      const unit = passedMatch[3];
      results.duration_seconds = unit === 'm' ? value * 60 : value;
    }

    // Look for failures: "2 failed"
    const failedMatch = output.match(/(\d+)\s+failed/);
    if (failedMatch) {
      results.failed = parseInt(failedMatch[1]) || 0;
    }

    // Look for skipped: "3 skipped"
    const skippedMatch = output.match(/(\d+)\s+skipped/);
    if (skippedMatch) {
      results.skipped = parseInt(skippedMatch[1]) || 0;
    }

    // Calculate total
    results.total_tests = results.passed + results.failed + results.skipped;

    // Extract failure details from Playwright output
    if (results.failed > 0) {
      // Look for failed test blocks: "1) [chromium] › path/to/test.spec.ts:123:45 › test name"
      const failRegex = /\d+\)\s+\[.+?\]\s+›\s+(.+?\.spec\.ts).*?›\s+(.+?)(?:\n|$)/g;
      let match;
      while ((match = failRegex.exec(output)) !== null) {
        const testFile = match[1].trim();
        const testName = match[2].trim();

        // Try to find associated error message
        const errorIndex = output.indexOf(match[0]);
        const nextSection = output.substring(errorIndex, errorIndex + 500);
        const errorMatch = nextSection.match(/Error:\s*(.+?)(?:\n\s*at|$)/s);

        results.failures.push({
          test_file: testFile,
          test_name: testName,
          error_message: errorMatch ? errorMatch[1].trim().substring(0, 200) : 'See full output for details'
        });
      }

      // Alternative: Look for "Error: " messages in failed tests
      if (results.failures.length === 0) {
        const simpleFailRegex = /Error:\s*(.+?)(?:\n|$)/g;
        let errorCount = 0;
        while ((match = simpleFailRegex.exec(output)) !== null && errorCount < results.failed) {
          results.failures.push({
            error_message: match[1].trim().substring(0, 200)
          });
          errorCount++;
        }
      }
    }

    results.success = results.failed === 0 && results.total_tests > 0;

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

/**
 * Aggregate results from multiple test runs
 * @param {Array} testResults - Array of parsed test results
 * @returns {Object} Aggregated results
 */
export function aggregateTestResults(testResults) {
  const aggregate = {
    total_tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_seconds: 0,
    coverage_percentage: null,
    pass_rate: 0,
    frameworks_used: [],
    all_passed: false,
    failures: []
  };

  let coverageSum = 0;
  let coverageCount = 0;

  for (const result of testResults) {
    aggregate.total_tests += result.total_tests || 0;
    aggregate.passed += result.passed || 0;
    aggregate.failed += result.failed || 0;
    aggregate.skipped += result.skipped || 0;
    aggregate.duration_seconds += result.duration_seconds || 0;

    if (result.framework && !aggregate.frameworks_used.includes(result.framework)) {
      aggregate.frameworks_used.push(result.framework);
    }

    if (result.coverage_percentage !== null) {
      coverageSum += result.coverage_percentage;
      coverageCount++;
    }

    // Collect all failures with framework labels
    if (result.failures && result.failures.length > 0) {
      result.failures.forEach(failure => {
        aggregate.failures.push({
          framework: result.framework,
          ...failure
        });
      });
    }
  }

  // Calculate average coverage
  if (coverageCount > 0) {
    aggregate.coverage_percentage = coverageSum / coverageCount;
  }

  // Calculate pass rate
  if (aggregate.total_tests > 0) {
    aggregate.pass_rate = (aggregate.passed / aggregate.total_tests) * 100;
  }

  aggregate.all_passed = aggregate.failed === 0 && aggregate.total_tests > 0;

  return aggregate;
}

/**
 * Check if test output indicates success
 * @param {string} output - Raw test output
 * @returns {boolean} True if tests passed
 */
export function isTestSuccess(output) {
  // Vitest success indicators
  if (output.includes('Test Files') && output.includes('passed')) {
    return !output.match(/(\d+)\s+failed/) && !output.includes('FAIL');
  }

  // Playwright success indicators
  if (output.match(/\d+\s+passed/)) {
    return !output.match(/(\d+)\s+failed/);
  }

  return false;
}
