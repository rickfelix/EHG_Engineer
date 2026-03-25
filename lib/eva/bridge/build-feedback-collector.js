/**
 * Build Feedback Collector
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-D
 *
 * Aggregates CI/CD results (Vitest, Playwright, lcov) from venture
 * GitHub Actions into venture_stage_work advisory_data for Stage 20.
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// --- Parsers ---

/**
 * Parse Vitest JSON reporter output.
 * Expects the standard Vitest --reporter=json format.
 * @param {string} filePath - Path to vitest JSON output
 * @returns {{ data: object|null, warning: string|null }}
 */
export function parseVitestJson(filePath) {
  if (!filePath) return { data: null, warning: 'Vitest JSON path not provided' };
  try {
    if (!fs.existsSync(filePath)) return { data: null, warning: `Vitest JSON not found: ${filePath}` };
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const testResults = raw.testResults || raw.files || [];
    let numPassed = raw.numPassedTests || 0;
    let numFailed = raw.numFailedTests || 0;
    let numSkipped = raw.numPendingTests || 0;
    let numTotal = raw.numTotalTests || 0;

    // Derive from testResults if top-level counts are missing
    if (!numTotal && testResults.length > 0) {
      for (const file of testResults) {
        const tests = file.assertionResults || file.tests || [];
        numTotal += tests.length;
        numPassed += tests.filter(t => t.status === 'passed').length;
        numFailed += tests.filter(t => t.status === 'failed').length;
        numSkipped += tests.filter(t => ['pending', 'skipped'].includes(t.status)).length;
      }
    }

    const failures = [];
    for (const file of testResults) {
      for (const test of (file.assertionResults || file.tests || [])) {
        if (test.status === 'failed') {
          failures.push({
            testName: test.fullName || test.name || test.title || 'unknown',
            filePath: file.name || file.filePath || 'unknown',
            errorMessage: (test.failureMessages?.join('\n') || test.error?.message || '').substring(0, 500),
            duration: test.duration || 0,
          });
        }
      }
    }

    return {
      data: {
        framework: 'vitest',
        numPassed,
        numFailed,
        numSkipped,
        numTotal,
        totalDuration: raw.duration || 0,
        success: numFailed === 0,
        failures,
      },
      warning: null,
    };
  } catch (err) {
    return { data: null, warning: `Vitest JSON parse error: ${err.message}` };
  }
}

/**
 * Parse Playwright JSON reporter output.
 * Expects the standard Playwright --reporter=json format.
 * @param {string} filePath - Path to playwright JSON output
 * @returns {{ data: object|null, warning: string|null }}
 */
export function parsePlaywrightReport(filePath) {
  if (!filePath) return { data: null, warning: 'Playwright report path not provided' };
  try {
    if (!fs.existsSync(filePath)) return { data: null, warning: `Playwright report not found: ${filePath}` };
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const suites = raw.suites || [];
    const tests = [];

    // Recursively extract tests from nested suites
    function extractTests(suiteList) {
      for (const suite of suiteList) {
        for (const spec of (suite.specs || [])) {
          for (const test of (spec.tests || [])) {
            const result = test.results?.[0] || {};
            tests.push({
              title: spec.title || 'unknown',
              status: result.status || test.status || 'unknown',
              duration: result.duration || 0,
              attachments: (result.attachments || []).map(a => a.name || a.path).filter(Boolean),
            });
          }
        }
        if (suite.suites) extractTests(suite.suites);
      }
    }
    extractTests(suites);

    const numPassed = tests.filter(t => t.status === 'passed' || t.status === 'expected').length;
    const numFailed = tests.filter(t => t.status === 'failed' || t.status === 'unexpected').length;
    const numSkipped = tests.filter(t => t.status === 'skipped').length;

    return {
      data: {
        framework: 'playwright',
        numPassed,
        numFailed,
        numSkipped,
        numTotal: tests.length,
        totalDuration: raw.stats?.duration || tests.reduce((sum, t) => sum + t.duration, 0),
        success: numFailed === 0,
        tests,
      },
      warning: null,
    };
  } catch (err) {
    return { data: null, warning: `Playwright report parse error: ${err.message}` };
  }
}

/**
 * Parse Istanbul lcov.info coverage report.
 * @param {string} filePath - Path to lcov.info file
 * @returns {{ data: object|null, warning: string|null }}
 */
export function parseLcovCoverage(filePath) {
  if (!filePath) return { data: null, warning: 'lcov file path not provided' };
  try {
    if (!fs.existsSync(filePath)) return { data: null, warning: `lcov file not found: ${filePath}` };
    const content = fs.readFileSync(filePath, 'utf-8');

    let linesFound = 0, linesHit = 0;
    let branchesFound = 0, branchesHit = 0;
    let functionsFound = 0, functionsHit = 0;

    for (const line of content.split('\n')) {
      const [tag, value] = line.split(':');
      const num = parseInt(value, 10);
      if (isNaN(num)) continue;
      switch (tag) {
        case 'LF': linesFound += num; break;
        case 'LH': linesHit += num; break;
        case 'BRF': branchesFound += num; break;
        case 'BRH': branchesHit += num; break;
        case 'FNF': functionsFound += num; break;
        case 'FNH': functionsHit += num; break;
      }
    }

    const pct = (hit, found) => found > 0 ? Math.round((hit / found) * 10000) / 100 : 0;

    return {
      data: {
        lines: pct(linesHit, linesFound),
        branches: pct(branchesHit, branchesFound),
        functions: pct(functionsHit, functionsFound),
        statements: pct(linesHit, linesFound), // lcov doesn't distinguish statements from lines
        linesFound,
        linesHit,
      },
      warning: null,
    };
  } catch (err) {
    return { data: null, warning: `lcov parse error: ${err.message}` };
  }
}

// --- Database Writer ---

/**
 * Write build feedback to venture_stage_work advisory_data.
 * Merges into existing advisory_data under the 'build_feedback' key.
 * @param {string} ventureId - Venture UUID
 * @param {number} lifecycleStage - Stage number (default 20)
 * @param {object} buildFeedback - Aggregated feedback data
 * @returns {{ success: boolean, error: string|null }}
 */
async function writeAdvisoryData(ventureId, lifecycleStage, buildFeedback) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required' };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check row exists
  const { data: existing, error: fetchError } = await supabase
    .from('venture_stage_work')
    .select('id, advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', lifecycleStage)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: `venture_stage_work row not found for venture ${ventureId} stage ${lifecycleStage}` };
  }

  const currentAdvisory = existing.advisory_data || {};
  const updatedAdvisory = {
    ...currentAdvisory,
    build_feedback: {
      ...buildFeedback,
      collected_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('venture_stage_work')
    .update({ advisory_data: updatedAdvisory })
    .eq('id', existing.id);

  if (updateError) {
    return { success: false, error: `Failed to update advisory_data: ${updateError.message}` };
  }

  return { success: true, error: null };
}

// --- Orchestrator ---

/**
 * Collect build feedback from CI/CD artifacts and write to venture_stage_work.
 *
 * @param {string} ventureId - Venture UUID
 * @param {object} artifactPaths - Optional paths to CI artifacts
 * @param {string} [artifactPaths.vitestJson] - Path to Vitest JSON reporter output
 * @param {string} [artifactPaths.playwrightReport] - Path to Playwright JSON report
 * @param {string} [artifactPaths.lcovInfo] - Path to lcov.info coverage file
 * @param {object} [options]
 * @param {number} [options.lifecycleStage=20] - Target lifecycle stage
 * @param {boolean} [options.skipWrite=false] - Parse only, skip database write
 * @returns {Promise<{ success: boolean, data: object, warnings: string[] }>}
 */
export async function collectBuildFeedback(ventureId, artifactPaths = {}, options = {}) {
  const { lifecycleStage = 20, skipWrite = false } = options;
  const warnings = [];

  // Parse all three artifact types
  const vitest = parseVitestJson(artifactPaths.vitestJson);
  const playwright = parsePlaywrightReport(artifactPaths.playwrightReport);
  const lcov = parseLcovCoverage(artifactPaths.lcovInfo);

  if (vitest.warning) warnings.push(vitest.warning);
  if (playwright.warning) warnings.push(playwright.warning);
  if (lcov.warning) warnings.push(lcov.warning);

  const buildFeedback = {
    unit_tests: vitest.data,
    e2e_tests: playwright.data,
    coverage: lcov.data,
  };

  if (!skipWrite) {
    if (!ventureId) {
      return { success: false, data: buildFeedback, warnings: [...warnings, 'ventureId is required for database write'] };
    }

    const writeResult = await writeAdvisoryData(ventureId, lifecycleStage, buildFeedback);
    if (!writeResult.success) {
      return { success: false, data: buildFeedback, warnings: [...warnings, writeResult.error] };
    }
  }

  return { success: true, data: buildFeedback, warnings };
}
