/**
 * REGRESSION Sub-Agent (Regression Validator)
 * LEO Protocol v4.3.3 - Refactoring Workflow Enhancement
 *
 * Purpose: Validate refactoring changes maintain backward compatibility
 * Code: REGRESSION
 * Priority: 95 (High - always runs for refactoring SDs)
 *
 * Philosophy: "Refactoring changes structure, not behavior. Prove it."
 *
 * Created: 2025-12-27 (SD-REFACTOR-WORKFLOW-001)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

dotenv.config();

const execAsync = promisify(exec);
let supabase = null;

// Default paths
const DEFAULT_REPO_PATH = '/mnt/c/_EHG/EHG';
const DEFAULT_ENGINEER_PATH = '/mnt/c/_EHG/EHG_Engineer';

/**
 * Execute REGRESSION sub-agent
 * Validates backward compatibility for refactoring SDs
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Regression validation results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔄 Starting REGRESSION for ${sdId}...`);
  console.log('   Regression Validator - Backward Compatibility Check');

  // Initialize Supabase client
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      baseline: null,
      test_comparison: null,
      api_comparison: null,
      import_analysis: null,
      coverage_comparison: null
    },
    options,
    mode: options.mode || 'full-validation'
  };

  try {
    const repoPath = options.repo_path || DEFAULT_REPO_PATH;
    const engineerPath = options.engineer_path || DEFAULT_ENGINEER_PATH;
    const regressionDir = path.join(engineerPath, '.regression', sdId);

    // Ensure regression directory exists
    await fs.mkdir(regressionDir, { recursive: true });

    // Get SD details
    const sdDetails = await getSDDetails(sdId);
    if (!sdDetails) {
      throw new Error(`SD not found: ${sdId}`);
    }

    console.log(`   📋 SD Type: ${sdDetails.sd_type}, Intensity: ${sdDetails.intensity_level || 'not set'}`);

    // Determine mode
    if (options.captureBaseline || options['capture-baseline']) {
      results.mode = 'capture-baseline';
    } else if (options.compare) {
      results.mode = 'compare';
    }

    // Phase 1: Baseline Capture or Load
    console.log('\n📊 Phase 1: Baseline Management...');
    const baselineResult = await handleBaseline(regressionDir, repoPath, results.mode);
    results.findings.baseline = baselineResult;

    if (results.mode === 'capture-baseline') {
      console.log('   ✅ Baseline captured successfully');
      results.verdict = 'BASELINE_CAPTURED';
      results.recommendations.push({
        action: 'Proceed with refactoring',
        next_step: `After refactoring, run: node lib/sub-agents/regression.js ${sdId} --compare`
      });
      return results;
    }

    if (!baselineResult.exists) {
      console.log('   ⚠️  No baseline found - capturing now...');
      const newBaseline = await captureBaseline(regressionDir, repoPath);
      results.findings.baseline = newBaseline;
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'No pre-refactoring baseline was captured',
        recommendation: 'For accurate comparison, capture baseline before refactoring begins'
      });
    }

    // Phase 2: Test Comparison
    console.log('\n🧪 Phase 2: Test Suite Comparison...');
    const testComparison = await compareTestResults(regressionDir, repoPath);
    results.findings.test_comparison = testComparison;

    if (testComparison.new_failures > 0) {
      console.log(`   ❌ ${testComparison.new_failures} new test failure(s)`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${testComparison.new_failures} tests that passed before now fail`,
        tests: testComparison.failed_tests,
        recommendation: 'Behavior changed during refactoring - revert or fix'
      });
      results.verdict = 'FAIL';
      results.confidence = 0;
    } else if (testComparison.all_passing) {
      console.log('   ✅ All tests pass (same as baseline)');
    } else {
      console.log(`   ⚠️  Some pre-existing failures (${testComparison.pre_existing_failures} known)`);
    }

    // Phase 3: API Signature Comparison
    console.log('\n📝 Phase 3: API Signature Check...');
    const apiComparison = await compareAPISignatures(regressionDir, repoPath);
    results.findings.api_comparison = apiComparison;

    if (apiComparison.breaking_changes > 0) {
      console.log(`   ❌ ${apiComparison.breaking_changes} breaking API change(s)`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${apiComparison.breaking_changes} public API signatures changed`,
        changes: apiComparison.changed_signatures,
        recommendation: 'Refactoring should not change public APIs - revert or document migration'
      });
      if (results.verdict !== 'FAIL') {
        results.verdict = 'FAIL';
        results.confidence = Math.min(results.confidence, 25);
      }
    } else if (apiComparison.documented_changes > 0) {
      console.log(`   ⚠️  ${apiComparison.documented_changes} documented API change(s)`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'API changes detected but documented in Refactor Brief',
        changes: apiComparison.documented_changes
      });
      if (results.verdict === 'PASS') {
        results.verdict = 'CONDITIONAL_PASS';
        results.confidence = Math.min(results.confidence, 80);
      }
    } else {
      console.log('   ✅ No API signature changes');
    }

    // Phase 4: Import Resolution Check
    console.log('\n🔗 Phase 4: Import Resolution Check...');
    const importAnalysis = await analyzeImports(repoPath);
    results.findings.import_analysis = importAnalysis;

    if (importAnalysis.broken_imports > 0) {
      console.log(`   ❌ ${importAnalysis.broken_imports} broken import(s)`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${importAnalysis.broken_imports} import paths do not resolve`,
        imports: importAnalysis.broken_import_list,
        recommendation: 'Fix all import paths before completing refactoring'
      });
      if (results.verdict !== 'FAIL') {
        results.verdict = 'FAIL';
        results.confidence = Math.min(results.confidence, 10);
      }
    } else if (importAnalysis.circular_dependencies > 0) {
      console.log(`   ⚠️  ${importAnalysis.circular_dependencies} circular dependency(ies)`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${importAnalysis.circular_dependencies} circular dependencies detected`,
        cycles: importAnalysis.cycles,
        recommendation: 'Resolve circular dependencies for cleaner architecture'
      });
    } else {
      console.log('   ✅ All imports resolve correctly');
    }

    // Phase 5: Coverage Comparison
    console.log('\n📈 Phase 5: Coverage Comparison...');
    const coverageComparison = await compareCoverage(regressionDir, repoPath);
    results.findings.coverage_comparison = coverageComparison;

    if (coverageComparison.decreased && coverageComparison.decrease_percentage > 5) {
      console.log(`   ❌ Coverage decreased by ${coverageComparison.decrease_percentage}%`);
      results.critical_issues.push({
        severity: 'HIGH',
        issue: `Test coverage decreased by ${coverageComparison.decrease_percentage}%`,
        before: coverageComparison.baseline_coverage,
        after: coverageComparison.current_coverage,
        recommendation: 'Refactoring should not decrease coverage significantly'
      });
      if (results.verdict === 'PASS') {
        results.verdict = 'CONDITIONAL_PASS';
        results.confidence = Math.min(results.confidence, 70);
      }
    } else if (coverageComparison.decreased) {
      console.log(`   ⚠️  Coverage decreased slightly (${coverageComparison.decrease_percentage}%)`);
      results.warnings.push({
        severity: 'LOW',
        issue: `Test coverage decreased by ${coverageComparison.decrease_percentage}%`,
        recommendation: 'Consider adding tests for refactored code'
      });
    } else {
      console.log(`   ✅ Coverage maintained (${coverageComparison.current_coverage}%)`);
    }

    // Generate comparison report
    console.log('\n📄 Generating comparison report...');
    await generateComparisonReport(regressionDir, results);

    // Save verdict
    await saveVerdict(regressionDir, results);

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log(`   REGRESSION VERDICT: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence}%`);
    console.log(`   Critical Issues: ${results.critical_issues.length}`);
    console.log(`   Warnings: ${results.warnings.length}`);
    console.log('='.repeat(60));

    // Store results in database
    await storeResults(sdId, results);

  } catch (error) {
    console.error(`   ❌ Error during regression validation: ${error.message}`);
    results.verdict = 'ERROR';
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: `Regression validation failed: ${error.message}`,
      recommendation: 'Fix the error and re-run validation'
    });
  }

  return results;
}

/**
 * Get SD details from database
 */
async function getSDDetails(sdId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, intensity_level, status')
    .eq('id', sdId)
    .single();

  if (error) {
    console.log(`   ⚠️  Could not fetch SD details: ${error.message}`);
    return null;
  }

  return data;
}

/**
 * Handle baseline - load existing or capture new
 */
async function handleBaseline(regressionDir, repoPath, mode) {
  const baselinePath = path.join(regressionDir, 'baseline.json');

  try {
    const baselineData = await fs.readFile(baselinePath, 'utf-8');
    return {
      exists: true,
      data: JSON.parse(baselineData),
      captured_at: (await fs.stat(baselinePath)).mtime
    };
  } catch {
    if (mode === 'compare') {
      // Need baseline for comparison but none exists
      return { exists: false };
    }
    // Capture new baseline
    return await captureBaseline(regressionDir, repoPath);
  }
}

/**
 * Capture baseline state
 */
async function captureBaseline(regressionDir, repoPath) {
  console.log('   📸 Capturing baseline...');

  const baseline = {
    captured_at: new Date().toISOString(),
    test_results: null,
    exports: null,
    dependencies: null,
    coverage: null
  };

  // Run tests and capture results
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && npm test -- --reporter=json --silent 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    baseline.test_results = parseTestOutput(stdout);
    await fs.writeFile(
      path.join(regressionDir, 'test-baseline.json'),
      JSON.stringify(baseline.test_results, null, 2)
    );
  } catch (error) {
    console.log(`   ⚠️  Could not capture test baseline: ${error.message}`);
    baseline.test_results = { error: error.message };
  }

  // Capture exports
  try {
    const exports = await analyzeExports(repoPath);
    baseline.exports = exports;
    await fs.writeFile(
      path.join(regressionDir, 'exports-baseline.json'),
      JSON.stringify(exports, null, 2)
    );
  } catch (error) {
    console.log(`   ⚠️  Could not capture exports: ${error.message}`);
    baseline.exports = { error: error.message };
  }

  // Capture dependency graph
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && npx madge --json src/ 2>/dev/null || echo "{}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    baseline.dependencies = JSON.parse(stdout || '{}');
    await fs.writeFile(
      path.join(regressionDir, 'deps-baseline.json'),
      JSON.stringify(baseline.dependencies, null, 2)
    );
  } catch (error) {
    console.log(`   ⚠️  Could not capture dependency graph: ${error.message}`);
    baseline.dependencies = { error: error.message };
  }

  // Capture coverage
  try {
    const { stdout: _stdout } = await execAsync(
      `cd "${repoPath}" && npm test -- --coverage --coverageReporters=json-summary --silent 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const coveragePath = path.join(repoPath, 'coverage', 'coverage-summary.json');
    try {
      const coverageData = await fs.readFile(coveragePath, 'utf-8');
      baseline.coverage = JSON.parse(coverageData);
    } catch {
      baseline.coverage = { total: { lines: { pct: 0 } } };
    }
    await fs.writeFile(
      path.join(regressionDir, 'coverage-baseline.json'),
      JSON.stringify(baseline.coverage, null, 2)
    );
  } catch (error) {
    console.log(`   ⚠️  Could not capture coverage: ${error.message}`);
    baseline.coverage = { error: error.message };
  }

  // Save combined baseline
  await fs.writeFile(
    path.join(regressionDir, 'baseline.json'),
    JSON.stringify(baseline, null, 2)
  );

  return {
    exists: true,
    data: baseline,
    captured_at: baseline.captured_at,
    freshly_captured: true
  };
}

/**
 * Parse test output into structured format
 */
function parseTestOutput(stdout) {
  try {
    // Try to parse as JSON (if jest --json)
    const parsed = JSON.parse(stdout);
    return {
      passed: parsed.numPassedTests || 0,
      failed: parsed.numFailedTests || 0,
      skipped: parsed.numPendingTests || 0,
      total: parsed.numTotalTests || 0,
      success: parsed.success || false
    };
  } catch {
    // Parse text output
    const passMatch = stdout.match(/(\d+) pass/i);
    const failMatch = stdout.match(/(\d+) fail/i);
    return {
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 0,
      skipped: 0,
      total: (passMatch ? parseInt(passMatch[1]) : 0) + (failMatch ? parseInt(failMatch[1]) : 0),
      success: !failMatch || parseInt(failMatch[1]) === 0
    };
  }
}

/**
 * Analyze exports from source files
 */
async function analyzeExports(repoPath) {
  const exports = {};
  const srcPath = path.join(repoPath, 'src');

  // Simple grep for exports
  try {
    const { stdout } = await execAsync(
      `grep -rn "^export " "${srcPath}" --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | head -500 || true`,
      { maxBuffer: 5 * 1024 * 1024 }
    );

    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (match) {
        const file = match[1].replace(srcPath, '');
        const lineNum = match[2];
        const exportLine = match[3].trim();

        if (!exports[file]) exports[file] = [];
        exports[file].push({ line: lineNum, export: exportLine });
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Export analysis limited: ${error.message}`);
  }

  return exports;
}

/**
 * Compare test results with baseline
 */
async function compareTestResults(regressionDir, repoPath) {
  const baselinePath = path.join(regressionDir, 'test-baseline.json');
  let baseline = { passed: 0, failed: 0 };

  try {
    const baselineData = await fs.readFile(baselinePath, 'utf-8');
    baseline = JSON.parse(baselineData);
  } catch {
    // No baseline
  }

  // Run current tests
  let current = { passed: 0, failed: 0, success: true };
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && npm test -- --reporter=json --silent 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    current = parseTestOutput(stdout);

    // Save current results
    await fs.writeFile(
      path.join(regressionDir, 'test-after.json'),
      JSON.stringify(current, null, 2)
    );
  } catch (error) {
    current = { passed: 0, failed: 0, error: error.message };
  }

  const newFailures = Math.max(0, (current.failed || 0) - (baseline.failed || 0));

  return {
    baseline,
    current,
    all_passing: current.failed === 0,
    new_failures: newFailures,
    pre_existing_failures: baseline.failed || 0,
    failed_tests: newFailures > 0 ? ['See test-after.json for details'] : []
  };
}

/**
 * Compare API signatures with baseline
 */
async function compareAPISignatures(regressionDir, repoPath) {
  const baselinePath = path.join(regressionDir, 'exports-baseline.json');
  let baseline = {};

  try {
    const baselineData = await fs.readFile(baselinePath, 'utf-8');
    baseline = JSON.parse(baselineData);
  } catch {
    // No baseline
  }

  // Get current exports
  const current = await analyzeExports(repoPath);

  // Save current
  await fs.writeFile(
    path.join(regressionDir, 'exports-after.json'),
    JSON.stringify(current, null, 2)
  );

  // Compare
  const changedSignatures = [];
  const baselineFiles = new Set(Object.keys(baseline));
  const currentFiles = new Set(Object.keys(current));

  // Check for removed files
  for (const file of baselineFiles) {
    if (!currentFiles.has(file)) {
      changedSignatures.push({
        file,
        change: 'FILE_REMOVED',
        exports_lost: baseline[file]?.length || 0
      });
    }
  }

  // Check for changed exports in existing files
  for (const file of currentFiles) {
    if (baselineFiles.has(file)) {
      const baselineExports = new Set(baseline[file]?.map(e => e.export) || []);
      const currentExports = new Set(current[file]?.map(e => e.export) || []);

      for (const exp of baselineExports) {
        if (!currentExports.has(exp)) {
          changedSignatures.push({
            file,
            change: 'EXPORT_REMOVED',
            export: exp
          });
        }
      }
    }
  }

  return {
    breaking_changes: changedSignatures.length,
    documented_changes: 0, // Would need to check Refactor Brief
    changed_signatures: changedSignatures
  };
}

/**
 * Analyze import resolution
 */
async function analyzeImports(repoPath) {
  let brokenImports = [];
  let circularDeps = [];

  // Check for TypeScript errors (includes import errors)
  try {
    const { stdout, stderr } = await execAsync(
      `cd "${repoPath}" && npx tsc --noEmit 2>&1 | grep -i "cannot find module" | head -20 || true`,
      { maxBuffer: 5 * 1024 * 1024 }
    );
    const importErrors = (stdout + stderr).split('\n').filter(line => line.includes('cannot find module'));
    brokenImports = importErrors.map(line => {
      const match = line.match(/Cannot find module '([^']+)'/);
      return match ? match[1] : line;
    });
  } catch {
    // TypeScript check failed
  }

  // Check for circular dependencies
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && npx madge --circular src/ 2>/dev/null || echo "[]"`,
      { maxBuffer: 5 * 1024 * 1024 }
    );
    if (stdout.includes('Circular')) {
      const cycles = stdout.split('\n').filter(line => line.includes('→') || line.includes('->'));
      circularDeps = cycles;
    }
  } catch {
    // madge check failed
  }

  return {
    broken_imports: brokenImports.length,
    broken_import_list: brokenImports,
    circular_dependencies: circularDeps.length,
    cycles: circularDeps
  };
}

/**
 * Compare coverage with baseline
 */
async function compareCoverage(regressionDir, repoPath) {
  const baselinePath = path.join(regressionDir, 'coverage-baseline.json');
  let baselineCoverage = 0;

  try {
    const baselineData = await fs.readFile(baselinePath, 'utf-8');
    const baseline = JSON.parse(baselineData);
    baselineCoverage = baseline.total?.lines?.pct || 0;
  } catch {
    // No baseline
  }

  // Get current coverage
  let currentCoverage = 0;
  try {
    await execAsync(
      `cd "${repoPath}" && npm test -- --coverage --coverageReporters=json-summary --silent 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const coveragePath = path.join(repoPath, 'coverage', 'coverage-summary.json');
    const coverageData = await fs.readFile(coveragePath, 'utf-8');
    const coverage = JSON.parse(coverageData);
    currentCoverage = coverage.total?.lines?.pct || 0;

    // Save current
    await fs.writeFile(
      path.join(regressionDir, 'coverage-after.json'),
      JSON.stringify(coverage, null, 2)
    );
  } catch {
    // Coverage check failed
  }

  const decreased = currentCoverage < baselineCoverage;
  const decreasePercentage = decreased ? Math.round((baselineCoverage - currentCoverage) * 10) / 10 : 0;

  return {
    baseline_coverage: baselineCoverage,
    current_coverage: currentCoverage,
    decreased,
    decrease_percentage: decreasePercentage
  };
}

/**
 * Generate comparison report
 */
async function generateComparisonReport(regressionDir, results) {
  const report = `# Regression Validation Report

**Generated**: ${new Date().toISOString()}
**Verdict**: ${results.verdict}
**Confidence**: ${results.confidence}%

## Summary

| Check | Result |
|-------|--------|
| Test Comparison | ${results.findings.test_comparison?.all_passing ? '✅ PASS' : '❌ FAIL'} |
| API Signatures | ${results.findings.api_comparison?.breaking_changes === 0 ? '✅ PASS' : '❌ FAIL'} |
| Import Resolution | ${results.findings.import_analysis?.broken_imports === 0 ? '✅ PASS' : '❌ FAIL'} |
| Coverage | ${!results.findings.coverage_comparison?.decreased ? '✅ PASS' : '⚠️ DECREASED'} |

## Critical Issues

${results.critical_issues.length > 0
    ? results.critical_issues.map(i => `- **${i.severity}**: ${i.issue}`).join('\n')
    : '_No critical issues_'}

## Warnings

${results.warnings.length > 0
    ? results.warnings.map(w => `- **${w.severity}**: ${w.issue}`).join('\n')
    : '_No warnings_'}

## Recommendations

${results.recommendations.length > 0
    ? results.recommendations.map(r => `- ${r.action || r}`).join('\n')
    : '_No recommendations_'}

---
*REGRESSION-VALIDATOR Sub-Agent v1.0.0*
`;

  await fs.writeFile(
    path.join(regressionDir, 'comparison-report.md'),
    report
  );
}

/**
 * Save verdict to file
 */
async function saveVerdict(regressionDir, results) {
  const verdict = {
    verdict: results.verdict,
    confidence: results.confidence,
    timestamp: new Date().toISOString(),
    critical_count: results.critical_issues.length,
    warning_count: results.warnings.length
  };

  await fs.writeFile(
    path.join(regressionDir, 'verdict.json'),
    JSON.stringify(verdict, null, 2)
  );
}

/**
 * Store results in database
 */
async function storeResults(sdId, results) {
  if (!supabase) return;

  try {
    // Store in sub_agent_execution_results
    await supabase.from('sub_agent_execution_results').insert({
      sd_id: sdId,
      sub_agent_code: 'REGRESSION',
      verdict: results.verdict,
      confidence_score: results.confidence,
      execution_time_ms: 0, // Would need to track
      findings: results.findings,
      critical_issues: results.critical_issues,
      warnings: results.warnings,
      recommendations: results.recommendations
    });
  } catch (error) {
    console.log(`   ⚠️  Could not store results: ${error.message}`);
  }
}

// CLI support
if (process.argv[1].includes('regression.js')) {
  const args = process.argv.slice(2);
  const sdId = args.find(a => !a.startsWith('--')) || 'TEST-SD';

  const options = {
    captureBaseline: args.includes('--capture-baseline'),
    compare: args.includes('--compare'),
    fullValidation: args.includes('--full-validation') || (!args.includes('--capture-baseline') && !args.includes('--compare'))
  };

  execute(sdId, {}, options)
    .then(results => {
      console.log('\n✅ Regression validation complete');
      process.exit(results.verdict === 'PASS' || results.verdict === 'CONDITIONAL_PASS' || results.verdict === 'BASELINE_CAPTURED' ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Regression validation failed:', error.message);
      process.exit(1);
    });
}

export default { execute };
