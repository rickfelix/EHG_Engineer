/**
 * Validators Domain
 * Main validation functions for test intelligence
 *
 * @module test-intelligence/validators
 */

import {
  findTestFiles,
  getTestFileName,
  checkComponentExists,
  findAllComponents,
  checkComponentHasTest,
  isTestableComponent
} from './file-utils.js';
import {
  extractSelectorsFromTest,
  findReferencedComponents,
  validateSelector,
  extractNavigationSequences,
  validateNavigationSequence,
  extractComponentReferences
} from './extractors.js';
import {
  classifyError,
  determineRootCause,
  generateErrorFixes,
  calculateErrorAnalysisConfidence
} from './error-analysis.js';

/**
 * Phase 1.1: Validate test selectors against actual component code
 * Prevents 90% of selector-based test failures
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Options including test file paths
 * @returns {Promise<Object>} Validation results
 */
export async function validateTestSelectors(sdId, options = {}) {
  console.log('\n🔍 Phase 1.1: Intelligent Selector Validation...');

  const results = {
    total_selectors_checked: 0,
    mismatches_found: 0,
    mismatches: [],
    suggestions: [],
    components_analyzed: 0,
    confidence: 100
  };

  try {
    // Find test files for this SD
    const testFiles = await findTestFiles(sdId, options);
    console.log(`   📁 Found ${testFiles.length} test file(s)`);

    for (const testFile of testFiles) {
      const filename = getTestFileName(testFile);

      console.log(`   📝 Analyzing: ${filename}`);

      // Extract selectors from test file
      const selectors = await extractSelectorsFromTest(testFile, options);
      results.total_selectors_checked += selectors.length;

      // Find corresponding components
      const components = await findReferencedComponents(testFile, selectors, options);
      results.components_analyzed += components.length;

      // Validate each selector against component code
      for (const selector of selectors) {
        const validation = await validateSelector(selector, components);

        if (!validation.is_valid) {
          results.mismatches_found++;
          results.mismatches.push({
            test_file: filename,
            line_number: selector.line_number,
            selector: selector.text,
            expected_in_component: validation.actual_text,
            component_file: validation.component_file,
            component_line: validation.component_line,
            severity: validation.severity
          });

          results.suggestions.push({
            test_file: filename,
            line_number: selector.line_number,
            current: selector.original_line,
            suggested: validation.suggested_fix,
            reason: validation.reason
          });
        }
      }
    }

    // Calculate confidence
    if (results.mismatches_found > 0) {
      const mismatchRate = results.mismatches_found / Math.max(results.total_selectors_checked, 1);
      results.confidence = Math.max(0, Math.round(100 - (mismatchRate * 100)));
    }

    // Summary
    console.log(`   ✅ Checked ${results.total_selectors_checked} selector(s)`);
    console.log(`   🔍 Analyzed ${results.components_analyzed} component(s)`);

    if (results.mismatches_found > 0) {
      console.log(`   ⚠️  Found ${results.mismatches_found} selector mismatch(es)`);
      console.log(`   💡 Confidence: ${results.confidence}% (based on mismatch rate)`);

      // Show first 3 suggestions
      results.suggestions.slice(0, 3).forEach((suggestion, i) => {
        console.log(`\n   Suggestion ${i + 1}:`);
        console.log(`      File: ${suggestion.test_file}:${suggestion.line_number}`);
        console.log(`      Current:   ${suggestion.current.trim()}`);
        console.log(`      Suggested: ${suggestion.suggested.trim()}`);
        console.log(`      Reason: ${suggestion.reason}`);
      });

      if (results.suggestions.length > 3) {
        console.log(`\n      ... and ${results.suggestions.length - 3} more suggestion(s)`);
      }
    } else {
      console.log(`   ✅ All selectors valid! Confidence: ${results.confidence}%`);
    }

  } catch (error) {
    console.error(`   ❌ Validation error: ${error.message}`);
    results.error = error.message;
    results.confidence = 0;
  }

  return results;
}

/**
 * Phase 1.2: Validate navigation flow in tests matches actual UI
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Navigation validation results
 */
export async function validateNavigationFlow(sdId, options = {}) {
  console.log('\n🗺️  Phase 1.2: Navigation Flow Validation...');

  const results = {
    flows_checked: 0,
    broken_paths: [],
    optimal_paths_suggested: [],
    confidence: 100
  };

  try {
    // Extract navigation sequences from tests
    const testFiles = await findTestFiles(sdId, options);

    for (const testFile of testFiles) {
      const filename = getTestFileName(testFile);
      const navSequences = await extractNavigationSequences(testFile, options);
      results.flows_checked += navSequences.length;

      for (const sequence of navSequences) {
        const validation = validateNavigationSequence(sequence);

        if (!validation.is_valid) {
          results.broken_paths.push({
            test_file: filename,
            sequence: sequence.steps,
            issue: validation.issue,
            broken_step: validation.broken_step
          });
        }

        if (validation.optimal_path) {
          results.optimal_paths_suggested.push({
            test_file: filename,
            current_steps: sequence.steps.length,
            optimal_steps: validation.optimal_path.length,
            savings: sequence.steps.length - validation.optimal_path.length,
            suggestion: validation.optimal_path
          });
        }
      }
    }

    console.log(`   ✅ Checked ${results.flows_checked} navigation flow(s)`);

    if (results.broken_paths.length > 0) {
      console.log(`   ⚠️  Found ${results.broken_paths.length} broken navigation path(s)`);
      results.confidence = 50;
    }

    if (results.optimal_paths_suggested.length > 0) {
      console.log(`   💡 ${results.optimal_paths_suggested.length} optimization(s) available`);
    }

  } catch (error) {
    console.error(`   ❌ Navigation validation error: ${error.message}`);
    results.error = error.message;
  }

  return results;
}

/**
 * Phase 1.3: Test-to-Component mapping intelligence
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Mapping results
 */
export async function analyzeTestComponentMapping(sdId, options = {}) {
  console.log('\n🔗 Phase 1.3: Test-to-Component Mapping...');

  const results = {
    tests_analyzed: 0,
    components_found: 0,
    missing_components: [],
    orphaned_tests: [],
    missing_tests: [],
    confidence: 100
  };

  try {
    const testFiles = await findTestFiles(sdId, options);
    results.tests_analyzed = testFiles.length;

    for (const testFile of testFiles) {
      const filename = getTestFileName(testFile);

      // Find which components this test file references
      const referencedComponents = await extractComponentReferences(testFile, options);

      for (const componentRef of referencedComponents) {
        const componentExists = await checkComponentExists(componentRef);

        if (componentExists) {
          results.components_found++;
        } else {
          results.missing_components.push({
            test_file: filename,
            component: componentRef.name,
            referenced_at: componentRef.line_number
          });
        }
      }
    }

    // Find components without tests
    const allComponents = await findAllComponents(options);
    for (const component of allComponents) {
      const hasTest = checkComponentHasTest(component, testFiles);
      if (!hasTest && isTestableComponent(component)) {
        results.missing_tests.push({
          component: component.name,
          path: component.path,
          suggestion: `Create: tests/e2e/${sdId}-${component.name.toLowerCase()}.spec.ts`
        });
      }
    }

    console.log(`   ✅ Analyzed ${results.tests_analyzed} test(s)`);
    console.log(`   ✅ Found ${results.components_found} valid component(s)`);

    if (results.missing_components.length > 0) {
      console.log(`   ⚠️  ${results.missing_components.length} missing component(s) referenced in tests`);
    }

    if (results.missing_tests.length > 0) {
      console.log(`   💡 ${results.missing_tests.length} component(s) without test coverage`);
    }

  } catch (error) {
    console.error(`   ❌ Mapping error: ${error.message}`);
    results.error = error.message;
  }

  return results;
}

/**
 * Phase 1.4: Contextual error analysis
 * Parses Playwright errors and suggests intelligent fixes
 *
 * @param {Object} errorData - Error information from test execution
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Analysis and suggestions
 */
export async function analyzeTestError(errorData, sdId) {
  console.log('\n🔬 Phase 1.4: Contextual Error Analysis...');

  const analysis = {
    error_type: null,
    root_cause: null,
    similar_past_errors: [],
    suggested_fixes: [],
    confidence: 0
  };

  try {
    // Classify error type
    analysis.error_type = classifyError(errorData.message);

    // Determine root cause based on error patterns
    analysis.root_cause = determineRootCause(errorData, sdId);

    // Generate fix suggestions based on error type
    analysis.suggested_fixes = generateErrorFixes(analysis.error_type, errorData);

    // Calculate confidence based on pattern matching
    analysis.confidence = calculateErrorAnalysisConfidence(analysis);

    console.log(`   🔍 Error Type: ${analysis.error_type}`);
    console.log(`   🎯 Root Cause: ${analysis.root_cause}`);
    console.log(`   💡 ${analysis.suggested_fixes.length} fix(es) suggested`);
    console.log(`   📊 Confidence: ${analysis.confidence}%`);

  } catch (error) {
    console.error(`   ❌ Analysis error: ${error.message}`);
    analysis.error = error.message;
  }

  return analysis;
}

export default {
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping,
  analyzeTestError
};
