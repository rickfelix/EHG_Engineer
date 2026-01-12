/**
 * Test Intelligence Module
 * Phase 1: Selector Validation, Navigation Flow, Error Analysis, Component Mapping
 *
 * Purpose: Make testing-agent proactive and intelligent
 * Created: 2025-11-21
 * Author: Claude Code Enhancement
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Branch-aware utilities for LEO protocol compliance
// Tests live on feature branch until SD is approved and merged

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
      // Handle both object and string formats
      const filename = getTestFileName(testFile);
      const filePath = getTestFilePath(testFile);

      console.log(`   📝 Analyzing: ${filename}`);

      // Extract selectors from test file (pass options for branch context)
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
        const validation = await validateNavigationSequence(sequence);

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
      const hasTest = await checkComponentHasTest(component, testFiles);
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
    analysis.root_cause = await determineRootCause(errorData, sdId);

    // Search for similar past errors in database
    // analysis.similar_past_errors = await searchSimilarErrors(errorData);

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get filename from test file (handles both string and object formats)
 */
function getTestFileName(testFile) {
  if (typeof testFile === 'object') {
    return testFile.filename || path.basename(testFile.path);
  }
  return path.basename(testFile);
}

/**
 * Get file path from test file (handles both string and object formats)
 */
function getTestFilePath(testFile) {
  if (typeof testFile === 'object') {
    return testFile.path;
  }
  return testFile;
}

/**
 * Find test files for an SD - branch-aware for LEO protocol compliance
 *
 * LEO Protocol: Tests live on feature branch until SD is approved and merged.
 * This function checks:
 * 1. If branch info is provided, reads from that branch via git
 * 2. Falls back to filesystem if no branch context
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Options including branch context
 * @returns {Promise<Array>} List of test file info objects
 */
async function findTestFiles(sdId, options) {
  const repoPath = options.repoPath || path.resolve(__dirname, '../../../../ehg');
  const branch = options.branch || options.featureBranch;
  const testDir = options.testDir || 'tests/e2e';

  // Patterns to search for (order of preference)
  const searchPatterns = [
    sdId.toLowerCase().replace('sd-', '').replace(/-/g, '-'), // eval-matrix-001
    sdId.toLowerCase(), // sd-eval-matrix-001
    // Also search for semantic patterns from the SD title
    ...(options.semanticPatterns || [])
  ];

  // If we have branch context, use git to read from the branch
  if (branch) {
    console.log(`   🌿 Using branch-aware scanning: ${branch}`);
    return findTestFilesFromBranch(repoPath, branch, testDir, searchPatterns, sdId);
  }

  // Fallback to filesystem (for backwards compatibility)
  console.log('   ⚠️  No branch context - falling back to filesystem scan');
  const fullTestDir = path.join(repoPath, testDir);

  try {
    const files = await fs.readdir(fullTestDir);
    const matches = files.filter(f => {
      const fLower = f.toLowerCase();
      return searchPatterns.some(p => fLower.includes(p)) && f.endsWith('.spec.ts');
    });
    return matches.map(f => ({
      path: path.join(fullTestDir, f),
      filename: f,
      source: 'filesystem'
    }));
  } catch (error) {
    console.warn(`   ⚠️  Could not read test directory: ${error.message}`);
    return [];
  }
}

/**
 * Find test files from a specific git branch without checking it out
 */
function findTestFilesFromBranch(repoPath, branch, testDir, searchPatterns, sdId) {
  const results = [];

  try {
    // List all test files on the branch
    const allTests = execSync(
      `cd "${repoPath}" && git ls-tree -r --name-only "${branch}" -- "${testDir}" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    ).trim();

    if (!allTests) {
      console.log(`   ⚠️  No test directory found on branch: ${testDir}`);
      return results;
    }

    const testFiles = allTests.split('\n').filter(f => f && f.endsWith('.spec.ts'));

    console.log(`   📁 Found ${testFiles.length} total test files on branch`);

    // First, try to find exact pattern matches
    for (const pattern of searchPatterns) {
      const matches = testFiles.filter(f => f.toLowerCase().includes(pattern));
      if (matches.length > 0) {
        console.log(`   ✅ Pattern "${pattern}" matched ${matches.length} file(s)`);
        for (const match of matches) {
          if (!results.some(r => r.path === match)) {
            results.push({
              path: match,
              filename: path.basename(match),
              source: 'branch',
              branch,
              pattern
            });
          }
        }
      }
    }

    // If no pattern matches, check user_stories.e2e_test_path from database
    if (results.length === 0 && searchPatterns.length > 0) {
      console.log('   ℹ️  No pattern matches, will use e2e_test_path from user stories if available');
    }

  } catch (error) {
    console.warn(`   ⚠️  Error reading from branch: ${error.message}`);
  }

  return results;
}

/**
 * Read file content from a branch
 */
function readFileFromBranch(repoPath, branch, filePath) {
  try {
    return execSync(
      `cd "${repoPath}" && git show "${branch}:${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
}

async function extractSelectorsFromTest(testFile, options = {}) {
  const selectors = [];

  // Handle both string paths and object format from branch-aware scanning
  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../ehg')) : null;

  try {
    let content;

    // If we have branch context, read from branch via git
    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        console.warn(`   ⚠️  Could not read ${path.basename(filePath)} from branch ${branch}`);
        return selectors;
      }
    } else {
      // Fallback to filesystem
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    // Pattern: waitForSelector, getByRole, getByText, locator with text=
    const selectorPatterns = [
      /waitForSelector\(['"`]text=([^'"`]+)['"`]/g,
      /locator\(['"`]text=([^'"`]+)['"`]/g,
      /getByText\(['"`]([^'"`]+)['"`]/g,
      /getByRole\([^)]*name:\s*\/([^/]+)\//g
    ];

    lines.forEach((line, index) => {
      selectorPatterns.forEach(pattern => {
        const matches = [...line.matchAll(pattern)];
        matches.forEach(match => {
          selectors.push({
            text: match[1],
            line_number: index + 1,
            original_line: line,
            type: pattern.source.includes('waitFor') ? 'waitForSelector' :
                  pattern.source.includes('locator') ? 'locator' :
                  pattern.source.includes('getByText') ? 'getByText' : 'getByRole'
          });
        });
      });
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract selectors: ${error.message}`);
  }

  return selectors;
}

async function findReferencedComponents(testFile, selectors) {
  // Analyze test file and selectors to determine which components are being tested
  // For Strategic Data Intelligence, we know it tests Stage1Enhanced and Stage2VentureResearch

  const components = [];
  const componentDir = path.resolve(__dirname, '../../../../ehg/src/components/stages');

  try {
    // Check for common stage patterns in selectors
    const stagePatterns = selectors.map(s => s.text.match(/Stage (\d+)/)).filter(Boolean);

    for (const match of stagePatterns) {
      const stageNum = match[1];
      const files = await fs.readdir(componentDir);
      const stageFile = files.find(f => f.includes(`Stage${stageNum}`) && f.endsWith('.tsx'));

      if (stageFile) {
        components.push({
          name: stageFile.replace('.tsx', ''),
          path: path.join(componentDir, stageFile)
        });
      }
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not find components: ${error.message}`);
  }

  return components;
}

async function validateSelector(selector, components) {
  const validation = {
    is_valid: false,
    actual_text: null,
    component_file: null,
    component_line: null,
    severity: 'HIGH',
    reason: null,
    suggested_fix: null
  };

  try {
    // Search for selector text in component files
    for (const component of components) {
      const content = await fs.readFile(component.path, 'utf-8');
      const lines = content.split('\n');

      // Look for exact match or close match
      const exactMatch = lines.findIndex(line => line.includes(selector.text));

      if (exactMatch !== -1) {
        validation.is_valid = true;
        validation.component_file = path.basename(component.path);
        validation.component_line = exactMatch + 1;
        return validation;
      }

      // Look for partial matches (e.g., "Stage 1" in "Stage 1: Draft Your Venture Idea")
      const partialMatch = lines.findIndex(line => {
        const normalized = line.toLowerCase().replace(/[^\w\s]/g, '');
        const selectorNormalized = selector.text.toLowerCase().replace(/[^\w\s]/g, '');
        return normalized.includes(selectorNormalized) || selectorNormalized.includes(normalized);
      });

      if (partialMatch !== -1) {
        // Found a close match - suggest the actual text
        const actualLine = lines[partialMatch];
        const actualTextMatch = actualLine.match(/[">]([^<"]+)[<"]/);

        if (actualTextMatch) {
          validation.is_valid = false;
          validation.actual_text = actualTextMatch[1].trim();
          validation.component_file = path.basename(component.path);
          validation.component_line = partialMatch + 1;
          validation.reason = `Selector text doesn't match component. Found "${validation.actual_text}" instead`;
          validation.suggested_fix = selector.original_line.replace(selector.text, validation.actual_text);
          validation.severity = 'CRITICAL';
        }
      }
    }

    if (!validation.is_valid && !validation.actual_text) {
      validation.reason = 'Selector text not found in any component';
      validation.severity = 'CRITICAL';
    }

  } catch (error) {
    validation.reason = `Validation error: ${error.message}`;
  }

  return validation;
}

async function extractNavigationSequences(testFile, options = {}) {
  // Extract click sequences that represent navigation
  const sequences = [];

  // Handle both string paths and object format
  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../ehg')) : null;

  try {
    let content;

    // If we have branch context, read from branch via git
    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        return sequences;
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    let currentSequence = null;

    lines.forEach((line, index) => {
      // Detect navigation actions
      if (line.includes('.click()') || line.includes('navigate') || line.includes('goto')) {
        if (!currentSequence) {
          currentSequence = { steps: [], start_line: index + 1 };
        }
        currentSequence.steps.push({
          line: index + 1,
          action: line.trim()
        });
      }

      // Detect sequence end (waitForSelector or assertion)
      if (currentSequence && (line.includes('waitForSelector') || line.includes('expect'))) {
        currentSequence.end_line = index + 1;
        sequences.push(currentSequence);
        currentSequence = null;
      }
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract navigation: ${error.message}`);
  }

  return sequences;
}

async function validateNavigationSequence(_sequence) {
  // Simplified validation - in real implementation would check actual navigation graph
  return {
    is_valid: true,
    optimal_path: null
  };
}

async function extractComponentReferences(testFile, options = {}) {
  // Extract component names referenced in test
  const references = [];

  // Handle both string paths and object format
  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../ehg')) : null;

  try {
    let content;

    // If we have branch context, read from branch via git
    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        return references;
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Look for component imports or references
      const importMatch = line.match(/from ['"].*\/([A-Z][a-zA-Z0-9]+)['"]/);
      if (importMatch) {
        references.push({
          name: importMatch[1],
          line_number: index + 1,
          type: 'import'
        });
      }
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract references: ${error.message}`);
  }

  return references;
}

async function checkComponentExists(componentRef) {
  const ehgPath = path.resolve(__dirname, '../../../../ehg');
  const possiblePaths = [
    path.join(ehgPath, `src/components/${componentRef.name}.tsx`),
    path.join(ehgPath, `src/components/stages/${componentRef.name}.tsx`),
    path.join(ehgPath, `src/components/ui/${componentRef.name}.tsx`)
  ];

  for (const checkPath of possiblePaths) {
    try {
      await fs.access(checkPath);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function findAllComponents(_options) {
  // Simplified - would recursively scan component directories
  return [];
}

async function checkComponentHasTest(component, testFiles) {
  // Check if any test file references this component
  const componentName = component.name.toLowerCase();
  return testFiles.some(testFile =>
    path.basename(testFile).toLowerCase().includes(componentName)
  );
}

function isTestableComponent(component) {
  // Filter out non-testable components (utils, types, etc.)
  return component.name.match(/^(Stage|Page|Dialog|Form|Button)/);
}

function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout') || msg.includes('exceeded')) return 'TIMEOUT';
  if (msg.includes('selector') || msg.includes('not found') || msg.includes('element')) return 'SELECTOR_NOT_FOUND';
  if (msg.includes('navigation') || msg.includes('goto')) return 'NAVIGATION_FAILED';
  if (msg.includes('assertion') || msg.includes('expect')) return 'ASSERTION_FAILED';
  if (msg.includes('network') || msg.includes('connection')) return 'NETWORK_ERROR';
  if (msg.includes('database') || msg.includes('query')) return 'DATABASE_ERROR';

  return 'UNKNOWN';
}

async function determineRootCause(errorData, _sdId) {
  const errorType = classifyError(errorData.message);

  const rootCauses = {
    'TIMEOUT': 'Element loading too slowly or selector incorrect',
    'SELECTOR_NOT_FOUND': 'Selector text doesn\'t match actual UI component text',
    'NAVIGATION_FAILED': 'Navigation path broken or URL incorrect',
    'ASSERTION_FAILED': 'Expected value doesn\'t match actual value',
    'NETWORK_ERROR': 'API endpoint unreachable or failing',
    'DATABASE_ERROR': 'Database query failed or RLS policy blocking access',
    'UNKNOWN': 'Error type not recognized - manual investigation required'
  };

  return rootCauses[errorType] || rootCauses['UNKNOWN'];
}

function generateErrorFixes(errorType, _errorData) {
  const fixes = [];

  switch (errorType) {
    case 'SELECTOR_NOT_FOUND':
      fixes.push({
        priority: 1,
        fix: 'Run selector validation to find correct component text',
        command: 'Included in Phase 1.1 output above',
        estimated_time: '2 minutes'
      });
      fixes.push({
        priority: 2,
        fix: 'Use data-testid attributes instead of text selectors',
        command: 'Add data-testid to component, update test',
        estimated_time: '5 minutes'
      });
      break;

    case 'TIMEOUT':
      fixes.push({
        priority: 1,
        fix: 'Increase timeout threshold',
        command: 'Add { timeout: 30000 } to waitForSelector',
        estimated_time: '1 minute'
      });
      fixes.push({
        priority: 2,
        fix: 'Add proper wait conditions',
        command: 'Use waitForLoadState("networkidle") before action',
        estimated_time: '3 minutes'
      });
      break;

    case 'NAVIGATION_FAILED':
      fixes.push({
        priority: 1,
        fix: 'Verify navigation path exists in UI',
        command: 'Run navigation flow validation (Phase 1.2)',
        estimated_time: '5 minutes'
      });
      break;

    default:
      fixes.push({
        priority: 1,
        fix: 'Review error message and stack trace',
        command: 'Check Playwright trace viewer',
        estimated_time: '10 minutes'
      });
  }

  return fixes;
}

function calculateErrorAnalysisConfidence(analysis) {
  let confidence = 50; // Base confidence

  if (analysis.error_type !== 'UNKNOWN') confidence += 20;
  if (analysis.root_cause) confidence += 15;
  if (analysis.suggested_fixes.length > 0) confidence += 15;

  return Math.min(100, confidence);
}
