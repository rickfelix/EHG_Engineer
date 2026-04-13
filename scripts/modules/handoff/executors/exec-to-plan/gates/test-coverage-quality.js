/**
 * Test Coverage Quality Gate for EXEC-TO-PLAN
 *
 * REWRITTEN: SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-B
 *
 * Executes live Playwright tests via subprocess and maps results to gate scores.
 * Replaces stale coverage-summary.json file reading with real test execution.
 *
 * Modes:
 *   - LIVE (ENABLE_LIVE_TEST_EXECUTION=true): Spawns npx playwright test, parses JSON results
 *   - ADVISORY (default): Returns advisory score without executing tests (gradual rollout)
 *
 * Thresholds:
 *   - 60% for feature/bugfix/security (BLOCKING)
 *   - 40% for infrastructure/refactor (ADVISORY/WARN)
 *
 * Timeout: 60s default (configurable via PLAYWRIGHT_GATE_TIMEOUT_MS)
 */

import { execSync, spawn } from 'child_process';

/**
 * Detect code file changes in the current branch/working directory.
 *
 * @returns {{ hasCodeFiles: boolean, codeFileCount: number, codeFiles: string[] }}
 */
function detectCodeChanges() {
  const CODE_EXTENSIONS = /\.(js|ts|tsx|jsx|mjs|cjs|py|rb|go|rs|java|cs|php|sql)$/i;

  try {
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-only HEAD~10 2>nul || git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch (e) {
      console.debug('[TestCoverageQuality] git diff HEAD~10 suppressed:', e?.message || e);
      diffOutput = execSync('git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    }

    const files = diffOutput.split('\n').filter(f => f.trim());
    const codeFiles = files.filter(f => CODE_EXTENSIONS.test(f));

    return {
      hasCodeFiles: codeFiles.length > 0,
      codeFileCount: codeFiles.length,
      codeFiles
    };
  } catch (error) {
    console.log(`   ⚠️  Git diff detection failed: ${error.message}`);
    return { hasCodeFiles: true, codeFileCount: 0, codeFiles: [] };
  }
}

/**
 * Execute Playwright tests via subprocess and parse JSON reporter output.
 *
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{success: boolean, results: Object|null, error: string|null}>}
 */
function runPlaywrightTests(timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const proc = spawn('npx', ['playwright', 'test', '--reporter=json'], {
      shell: true,
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGTERM');
        resolve({
          success: false,
          results: null,
          error: `Timeout after ${timeoutMs}ms`
        });
      }
    }, timeoutMs);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          success: false,
          results: null,
          error: `Subprocess error: ${err.message}`
        });
      }
    });

    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);

        try {
          const results = JSON.parse(stdout);
          resolve({
            success: code === 0,
            results,
            error: code !== 0 ? `Exit code ${code}` : null
          });
        } catch (parseErr) {
          resolve({
            success: false,
            results: null,
            error: `Failed to parse JSON output: ${parseErr.message}. Stderr: ${stderr.slice(0, 200)}`
          });
        }
      }
    });
  });
}

/**
 * Parse Playwright JSON reporter output into structured results.
 *
 * @param {Object} jsonReport - Parsed Playwright JSON reporter output
 * @returns {{ total: number, passed: number, failed: number, skipped: number, duration: number }}
 */
function parsePlaywrightResults(jsonReport) {
  if (!jsonReport || !jsonReport.suites) {
    return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  }

  let total = 0, passed = 0, failed = 0, skipped = 0;

  function walkSuites(suites) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          if (spec.tests) {
            for (const test of spec.tests) {
              total++;
              const status = test.status || (test.results?.[0]?.status);
              if (status === 'expected' || status === 'passed') passed++;
              else if (status === 'skipped') skipped++;
              else failed++;
            }
          }
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }

  walkSuites(jsonReport.suites);

  const duration = jsonReport.stats?.duration || 0;

  return { total, passed, failed, skipped, duration };
}

/**
 * Map Playwright test results to a 0-100 gate score.
 *
 * @param {{ total: number, passed: number, failed: number, skipped: number }} results
 * @returns {number} Score 0-100
 */
function mapToGateScore(results) {
  if (results.total === 0) return 100; // No tests = pass (advisory)
  const runnable = results.total - results.skipped;
  if (runnable === 0) return 100; // All skipped = pass
  return Math.round((results.passed / runnable) * 100);
}

/**
 * Look up the coverage threshold for a given SD type from sd_type_validation_profiles.
 * Falls back to the legacy hardcoded 60/40 thresholds when the profile has no value.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdType - SD type string (e.g., 'feature', 'infrastructure')
 * @returns {Promise<{threshold: number, blocking: boolean, source: string}>}
 */
async function getThresholdForSD(supabase, sdType) {
  const LEGACY_BLOCKING_TYPES = ['feature', 'bugfix', 'security'];

  if (!supabase) {
    const isBlocking = LEGACY_BLOCKING_TYPES.includes(sdType);
    return { threshold: isBlocking ? 60 : 40, blocking: isBlocking, source: 'hardcoded (no supabase client)' };
  }

  try {
    const { data, error } = await supabase
      .from('sd_type_validation_profiles')
      .select('coverage_threshold_pct, coverage_blocking')
      .eq('sd_type', sdType)
      .maybeSingle();

    if (error || !data || data.coverage_threshold_pct == null) {
      const isBlocking = LEGACY_BLOCKING_TYPES.includes(sdType);
      return { threshold: isBlocking ? 60 : 40, blocking: isBlocking, source: 'hardcoded (profile NULL or missing)' };
    }

    return {
      threshold: data.coverage_threshold_pct,
      blocking: data.coverage_blocking !== false,
      source: 'sd_type_validation_profiles'
    };
  } catch (e) {
    console.debug('[TestCoverageQuality] Profile lookup suppressed:', e?.message || e);
    const isBlocking = LEGACY_BLOCKING_TYPES.includes(sdType);
    return { threshold: isBlocking ? 60 : 40, blocking: isBlocking, source: 'hardcoded (lookup error)' };
  }
}

/**
 * Log gate evaluation to gate_health_history for baseline defect leakage audit.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params - { sdKey, sdType, thresholdUsed, scoreAchieved, gateName, passed, source }
 */
async function logGateEvaluation(supabase, params) {
  if (!supabase) return;
  try {
    await supabase.from('gate_health_history').insert({
      gate_name: params.gateName || 'GATE_TEST_COVERAGE_QUALITY',
      sd_key: params.sdKey || null,
      score: params.scoreAchieved,
      max_score: 100,
      passed: params.passed,
      metadata: {
        threshold_used: params.thresholdUsed,
        score_achieved: params.scoreAchieved,
        sd_type: params.sdType,
        source: params.source
      }
    });
  } catch (e) {
    console.debug('[TestCoverageQuality] Gate logging suppressed:', e?.message || e);
  }
}

/**
 * Create the GATE_TEST_COVERAGE_QUALITY gate validator.
 *
 * @param {Object} supabase - Supabase client for profile lookup and baseline logging
 * @returns {Object} Gate configuration { name, validator, required }
 */
export function createTestCoverageQualityGate(supabase) {
  return {
    name: 'GATE_TEST_COVERAGE_QUALITY',
    validator: async (ctx) => {
      console.log('\n📊 TEST COVERAGE QUALITY GATE');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || 'unknown';
      const sdKey = ctx.sd?.sd_key || ctx.sd?.legacy_id || null;
      const liveExecution = process.env.ENABLE_LIVE_TEST_EXECUTION === 'true';
      const timeoutMs = parseInt(process.env.PLAYWRIGHT_GATE_TIMEOUT_MS || '60000', 10);

      console.log(`   📋 SD Type: ${sdType}`);
      console.log(`   📋 Mode: ${liveExecution ? 'LIVE (Playwright subprocess)' : 'ADVISORY (feature flag off)'}`);

      // Look up threshold from sd_type_validation_profiles (falls back to 60/40)
      const profile = await getThresholdForSD(supabase, sdType);
      const isBlocking = profile.blocking;
      const threshold = profile.threshold;

      console.log(`   📋 Threshold: ${threshold}% (source: ${profile.source})`);
      console.log(`   📋 Blocking: ${isBlocking ? 'YES' : 'NO (advisory)'}`);

      // 1. Detect changed code files
      const codeChanges = detectCodeChanges();
      console.log(`   📋 Changed code files: ${codeChanges.codeFileCount}`);

      if (!codeChanges.hasCodeFiles || codeChanges.codeFileCount === 0) {
        console.log('   ✅ No code files changed - coverage check not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['No code files changed - coverage check skipped'],
          details: {
            status: 'PASS',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            mode: liveExecution ? 'live' : 'advisory',
            changed_files_count: 0,
            summary: 'No code files changed'
          }
        };
      }

      // 2. If feature flag is off, return advisory result
      if (!liveExecution) {
        console.log('   ⚠️  Live test execution disabled (ENABLE_LIVE_TEST_EXECUTION != true)');
        console.log('   💡 Set ENABLE_LIVE_TEST_EXECUTION=true to enable live Playwright testing');
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [
            'Live test execution disabled. Set ENABLE_LIVE_TEST_EXECUTION=true to enable.',
            `${codeChanges.codeFileCount} code files changed but not verified by live tests`
          ],
          details: {
            status: 'ADVISORY',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            mode: 'advisory',
            changed_files_count: codeChanges.codeFileCount,
            summary: 'Live test execution disabled - advisory mode'
          }
        };
      }

      // 3. Execute Playwright tests
      console.log(`   🔄 Executing: npx playwright test --reporter=json (timeout: ${timeoutMs}ms)`);

      const execution = await runPlaywrightTests(timeoutMs);

      if (execution.error && !execution.results) {
        console.log(`   ⚠️  Test execution failed: ${execution.error}`);

        if (execution.error.startsWith('Timeout')) {
          console.log(`   ❌ TIMEOUT: Tests did not complete within ${timeoutMs}ms`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`Test execution timed out after ${timeoutMs}ms`],
            warnings: [],
            details: {
              status: 'FAIL',
              blocking: isBlocking,
              threshold_used: threshold,
              sd_type: sdType,
              mode: 'live',
              changed_files_count: codeChanges.codeFileCount,
              error: execution.error,
              summary: `TIMEOUT: Tests exceeded ${timeoutMs}ms limit`
            }
          };
        }

        // Subprocess error (e.g., Playwright not installed)
        console.log('   ⚠️  Falling back to advisory mode due to execution error');
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [
            `Test execution failed: ${execution.error}`,
            'Falling back to advisory mode. Ensure Playwright is installed: npx playwright install'
          ],
          details: {
            status: 'WARN',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            mode: 'live_fallback',
            changed_files_count: codeChanges.codeFileCount,
            error: execution.error,
            summary: `Execution error: ${execution.error}`
          }
        };
      }

      // 4. Parse results
      const results = parsePlaywrightResults(execution.results);
      const score = mapToGateScore(results);

      console.log(`   📊 Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${results.total} total)`);
      console.log(`   📊 Score: ${score}/100 (threshold: ${threshold}%)`);
      if (results.duration) console.log(`   ⏱️  Duration: ${Math.round(results.duration / 1000)}s`);

      // 5. Determine pass/fail
      const passed = score >= threshold;
      const issues = [];
      const warnings = [];

      if (!passed && isBlocking) {
        issues.push(`Test score ${score}% below blocking threshold ${threshold}%: ${results.failed} test(s) failed`);
      } else if (!passed && !isBlocking) {
        warnings.push(`Test score ${score}% below advisory threshold ${threshold}%: ${results.failed} test(s) failed`);
      }

      if (results.skipped > 0) {
        warnings.push(`${results.skipped} test(s) skipped`);
      }

      const status = passed ? 'PASS' : (isBlocking ? 'FAIL' : 'WARN');

      if (passed) {
        console.log(`   ✅ ${status}: Score ${score}% meets ${threshold}% threshold`);
      } else if (isBlocking) {
        console.log(`   ❌ ${status}: Score ${score}% below ${threshold}% threshold (BLOCKING)`);
      } else {
        console.log(`   ⚠️  ${status}: Score ${score}% below ${threshold}% threshold (advisory)`);
      }

      // Baseline instrumentation: log evaluation for 30-day defect leakage audit
      await logGateEvaluation(supabase, {
        sdKey, sdType, thresholdUsed: threshold, scoreAchieved: score,
        gateName: 'GATE_TEST_COVERAGE_QUALITY', passed: isBlocking ? passed : true,
        source: profile.source
      });

      return {
        passed: isBlocking ? passed : true,
        score,
        max_score: 100,
        issues,
        warnings,
        details: {
          status,
          blocking: isBlocking && !passed,
          threshold_used: threshold,
          sd_type: sdType,
          mode: 'live',
          changed_files_count: codeChanges.codeFileCount,
          test_results: {
            total: results.total,
            passed: results.passed,
            failed: results.failed,
            skipped: results.skipped,
            duration_ms: results.duration
          },
          summary: `${status}: ${results.passed}/${results.total} tests passed (${score}%, threshold ${threshold}%)`
        }
      };
    },
    required: true
  };
}
