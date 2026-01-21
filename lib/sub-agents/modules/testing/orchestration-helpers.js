/**
 * TESTING Sub-Agent - Orchestration Helpers Module
 * Helper functions for the main execute orchestration
 *
 * Responsibilities:
 * - Branch context resolution
 * - Semantic pattern extraction
 * - SD type detection and skipping
 * - Evidence freshness checking
 * - User story verification
 */

import { quickPreflightCheck } from '../../../../scripts/lib/handoff-preflight.js';
import { resolveBranch } from '../../../../scripts/lib/branch-resolver.js';
import { checkTestEvidenceFreshness } from '../../../../scripts/lib/test-evidence-ingest.js';
import {
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping
} from '../../../utils/test-intelligence.js';

/**
 * Run handoff preflight check (advisory, non-blocking)
 *
 * @param {string} sdId - Strategic Directive ID
 */
export async function runHandoffPreflightCheck(sdId) {
  try {
    console.log('   Checking handoff chain status...');
    const preflightResult = await quickPreflightCheck(sdId, 'EXEC');

    if (preflightResult.ready) {
      console.log('   [PASS] Handoff chain verified for EXEC phase');
    } else {
      console.log('   [WARN] Handoff chain incomplete:');
      (preflightResult.missing || []).forEach(h => console.log(`      - Missing: ${h}`));
      console.log('   [TIP] Consider running: node scripts/handoff.js create --sd ' + sdId);
      console.log('   [WARN] Proceeding with TESTING validation (advisory check)');
    }
  } catch (preflightError) {
    console.log(`   [WARN] Handoff preflight skipped: ${preflightError.message}`);
  }
}

/**
 * Resolve feature branch context
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object|null>} Branch context or null
 */
export async function resolveBranchContext(sdId, supabase) {
  try {
    console.log('   Resolving feature branch...');
    const branchResult = await resolveBranch(supabase, sdId, {
      verbose: false,
      autoStore: true
    });

    if (branchResult.success) {
      const context = {
        branch: branchResult.branch,
        repoPath: branchResult.repoPath,
        source: branchResult.source,
        validated: branchResult.validated
      };
      console.log(`   [PASS] Feature branch resolved: ${branchResult.branch}`);
      console.log(`      Source: ${branchResult.source}, Repo: ${branchResult.repoPath}`);
      return context;
    } else {
      console.log(`   [WARN] Could not resolve feature branch: ${branchResult.error}`);
      console.log('   [TIP] Falling back to filesystem scan (may miss tests on feature branch)');
      return null;
    }
  } catch (branchError) {
    console.log(`   [WARN] Branch resolution error: ${branchError.message}`);
    return null;
  }
}

/**
 * Fetch semantic patterns from user stories
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Array<string>>} Array of semantic patterns
 */
export async function fetchSemanticPatterns(sdId, supabase) {
  try {
    const { data: stories } = await supabase
      .from('user_stories')
      .select('e2e_test_path')
      .or(`sd_id.eq.${sdId},sd_id.ilike.%${sdId}%`)
      .not('e2e_test_path', 'is', null);

    if (stories && stories.length > 0) {
      const paths = stories.map(s => s.e2e_test_path).filter(Boolean);
      const uniqueFilenames = [...new Set(paths.map(p => {
        const match = p.match(/([^/]+)\.spec\.ts$/);
        return match ? match[1].toLowerCase() : null;
      }).filter(Boolean))];
      console.log(`   Semantic patterns from user stories: ${uniqueFilenames.join(', ')}`);
      return uniqueFilenames;
    }
  } catch (e) {
    console.log(`   [WARN] Could not fetch semantic patterns: ${e.message}`);
  }
  return [];
}

/**
 * Build enhanced options with branch context
 *
 * @param {Object} options - Original options
 * @param {Object|null} branchContext - Branch context
 * @param {Array<string>} semanticPatterns - Semantic patterns
 * @returns {Object} Enhanced options
 */
export function buildEnhancedOptions(options, branchContext, semanticPatterns) {
  return {
    ...options,
    ...(branchContext && {
      branch: branchContext.branch,
      featureBranch: branchContext.branch,
      repoPath: branchContext.repoPath
    }),
    semanticPatterns
  };
}

/**
 * Check if SD type should skip E2E testing
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} validationMode - Validation mode
 * @param {Object} options - Execution options
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object|null>} Skip result or null to continue
 */
export async function checkForSkippableSdType(sdId, validationMode, options, supabase) {
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('category')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  const sdCategory = sdData?.category?.toLowerCase() || '';
  const skipE2ESdTypes = ['database', 'infrastructure', 'documentation', 'protocol', 'refactor'];

  if (!skipE2ESdTypes.includes(sdCategory)) {
    return null;
  }

  const isRefactor = sdCategory === 'refactor';
  console.log(`\n[SD TYPE] SD Type Detection: ${sdCategory.toUpperCase()}`);
  console.log(isRefactor
    ? '   [TIP] Refactor SDs use REGRESSION sub-agent for validation'
    : '   [TIP] Database/Infrastructure SDs do not require UI E2E tests');
  console.log(isRefactor
    ? '   [PASS] Validation via REGRESSION sub-agent (before/after behavior comparison)'
    : '   [PASS] Validation via DATABASE/SECURITY sub-agents + table existence');

  return {
    verdict: 'PASS',
    confidence: 95,
    validation_mode: validationMode,
    critical_issues: [],
    warnings: [],
    recommendations: [{
      severity: 'INFO',
      issue: `${sdCategory} SD - UI E2E tests not applicable`,
      recommendation: isRefactor
        ? 'Behavior validated via REGRESSION sub-agent (before/after comparison)'
        : 'Schema validated via DATABASE sub-agent and table existence checks'
    }],
    detailed_analysis: {
      sd_type: sdCategory,
      skip_reason: isRefactor
        ? 'Refactor SD - validation via REGRESSION sub-agent behavior comparison'
        : 'Non-UI SD type - E2E validation deferred to DATABASE/SECURITY sub-agents',
      validation_approach: isRefactor
        ? 'REGRESSION sub-agent: before/after behavior comparison, no functional changes'
        : 'SQL schema validation, RLS policy verification'
    },
    findings: {
      phase0_intelligence: { skipped: true, reason: `${sdCategory} SD - no UI components` },
      phase1_preflight: { skipped: true },
      phase2_test_generation: { skipped: true },
      phase3_execution: { skipped: true, reason: 'E2E not applicable for database SDs' },
      phase4_evidence: { type: 'schema_validation' },
      phase5_verdict: { auto_pass: true, sd_type: sdCategory }
    },
    options
  };
}

/**
 * Initialize results structure
 *
 * @param {string} validationMode - Validation mode
 * @param {Object} options - Execution options
 * @returns {Object} Initialized results object
 */
export function initializeResults(validationMode, options) {
  return {
    verdict: 'PASS',
    confidence: 100,
    validation_mode: validationMode,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      phase0_intelligence: null,
      phase1_preflight: null,
      phase2_test_generation: null,
      phase3_execution: null,
      phase4_evidence: null,
      phase5_verdict: null
    },
    options
  };
}

/**
 * Run Phase 0: Intelligent Test Analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} enhancedOptions - Enhanced execution options
 * @param {Object} results - Results object to update
 */
export async function runPhase0Intelligence(sdId, enhancedOptions, results) {
  const phase0 = {
    selector_validation: await validateTestSelectors(sdId, enhancedOptions),
    navigation_validation: await validateNavigationFlow(sdId, enhancedOptions),
    component_mapping: await analyzeTestComponentMapping(sdId, enhancedOptions)
  };
  results.findings.phase0_intelligence = phase0;

  if (phase0.selector_validation.mismatches_found > 0) {
    const mismatchCount = phase0.selector_validation.mismatches_found;
    results.warnings.push({
      severity: 'HIGH',
      issue: `Found ${mismatchCount} selector mismatch(es) in test files`,
      recommendation: 'Review Phase 0 suggestions and fix selectors before running tests',
      details: phase0.selector_validation.suggestions.slice(0, 3),
      confidence: phase0.selector_validation.confidence
    });

    if (phase0.selector_validation.confidence < 50) {
      results.confidence = Math.min(results.confidence, 60);
    }
  }

  if (phase0.navigation_validation.broken_paths.length > 0) {
    results.warnings.push({
      severity: 'HIGH',
      issue: `Found ${phase0.navigation_validation.broken_paths.length} broken navigation path(s)`,
      recommendation: 'Fix navigation sequences before running E2E tests',
      details: phase0.navigation_validation.broken_paths
    });
  }

  if (phase0.component_mapping.missing_components.length > 0) {
    results.warnings.push({
      severity: 'MEDIUM',
      issue: `${phase0.component_mapping.missing_components.length} component(s) referenced in tests not found`,
      recommendation: 'Verify component paths or remove invalid test references',
      details: phase0.component_mapping.missing_components
    });
  }
}

/**
 * Check for fresh test evidence to potentially skip test execution
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} validationMode - Validation mode
 * @param {Object} results - Results object to update
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Object with skipTestExecution and freshEvidence
 */
export async function checkForFreshEvidence(sdId, validationMode, results, supabase) {
  let skipTestExecution = false;
  let freshEvidence = null;

  try {
    const freshnessCheck = await checkTestEvidenceFreshness(sdId, 60);
    results.findings.phase2_5_evidence_check = freshnessCheck;

    if (freshnessCheck.isFresh && validationMode === 'retrospective') {
      console.log(`   [PASS] Found FRESH test evidence (${Math.round(freshnessCheck.ageMinutes || 0)} minutes old)`);
      console.log(`   Previous verdict: ${freshnessCheck.evidence?.verdict}, Pass rate: ${freshnessCheck.evidence?.pass_rate}%`);

      if (freshnessCheck.evidence?.verdict === 'PASS' || freshnessCheck.evidence?.pass_rate >= 95) {
        skipTestExecution = true;
        freshEvidence = freshnessCheck.evidence;
        console.log('   [SKIP] Skipping test execution - using existing evidence (retrospective mode)');
      }
    } else if (freshnessCheck.evidence) {
      console.log(`   [WARN] Test evidence is ${freshnessCheck.freshnessStatus} (${Math.round(freshnessCheck.ageMinutes || 0)} minutes old)`);
      console.log(`   ${freshnessCheck.recommendation || 'Consider re-running tests'}`);
    } else {
      console.log('   No E2E test evidence found in test_runs');
    }
  } catch (evidenceError) {
    console.log(`   [WARN] Could not check E2E test evidence: ${evidenceError.message}`);
  }

  if (!skipTestExecution) {
    const apiResult = await checkApiIntegrationTestEvidence(sdId, results, supabase);
    if (apiResult.skip) {
      skipTestExecution = true;
      freshEvidence = apiResult.evidence;
    }
  }

  return { skipTestExecution, freshEvidence };
}

/**
 * Check for API integration test evidence as fallback
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} results - Results object to update
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Object with skip flag and evidence
 */
async function checkApiIntegrationTestEvidence(sdId, results, supabase) {
  try {
    console.log('   Checking for API integration test evidence (sd_testing_status)...');
    const { data: apiTestEvidence, error: apiTestError } = await supabase
      .from('sd_testing_status')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    if (!apiTestError && apiTestEvidence && apiTestEvidence.tested) {
      const passRate = apiTestEvidence.test_pass_rate ||
        (apiTestEvidence.test_count > 0
          ? (apiTestEvidence.tests_passed / apiTestEvidence.test_count) * 100
          : 0);
      const ageMinutes = apiTestEvidence.last_tested_at
        ? Math.round((Date.now() - new Date(apiTestEvidence.last_tested_at).getTime()) / 60000)
        : null;
      const isFresh = ageMinutes !== null && ageMinutes <= 60;

      console.log('   [PASS] Found API integration test evidence');
      console.log(`      Framework: ${apiTestEvidence.test_framework || 'unknown'}`);
      console.log(`      Tests: ${apiTestEvidence.tests_passed}/${apiTestEvidence.test_count} passed (${passRate.toFixed(1)}%)`);
      console.log(`      Age: ${ageMinutes !== null ? ageMinutes + ' minutes' : 'unknown'}`);

      if (isFresh && passRate >= 95) {
        const evidence = {
          verdict: passRate >= 100 ? 'PASS' : 'CONDITIONAL_PASS',
          pass_rate: passRate,
          total_tests: apiTestEvidence.test_count,
          passed_tests: apiTestEvidence.tests_passed,
          failed_tests: apiTestEvidence.tests_failed,
          duration_ms: (apiTestEvidence.test_duration_seconds || 0) * 1000,
          age_minutes: ageMinutes,
          test_type: 'api_integration',
          framework: apiTestEvidence.test_framework
        };
        results.findings.phase2_5_api_test_evidence = evidence;
        console.log('   [SKIP] Using API integration test evidence (pass rate meets threshold)');
        return { skip: true, evidence };
      } else if (!isFresh) {
        console.log('   [WARN] API test evidence is stale (> 60 minutes)');
      } else {
        console.log(`   [WARN] API test pass rate ${passRate.toFixed(1)}% below threshold (95%)`);
      }
    } else if (apiTestError?.code !== 'PGRST116') {
      console.log(`   [WARN] Could not check API test evidence: ${apiTestError?.message || 'unknown error'}`);
    } else {
      console.log('   No API integration test evidence found');
    }
  } catch (apiCheckError) {
    console.log(`   [WARN] API test evidence check failed: ${apiCheckError.message}`);
  }

  return { skip: false, evidence: null };
}

/**
 * Build phase 3 results from cached evidence
 *
 * @param {Object} freshEvidence - Fresh evidence object
 * @returns {Object} Phase 3 results
 */
export function buildCachedPhase3Results(freshEvidence) {
  return {
    tests_executed: freshEvidence.total_tests,
    tests_passed: freshEvidence.passed_tests,
    failed_tests: freshEvidence.failed_tests,
    failures: [],
    report_url: freshEvidence.report_file_path,
    execution_time_ms: freshEvidence.duration_ms,
    evidence_reused: true,
    evidence_age_minutes: Math.round(freshEvidence.age_minutes || 0)
  };
}

/**
 * Process phase 3 results and update main results
 *
 * @param {Object} phase3 - Phase 3 execution results
 * @param {Object} results - Results object to update
 */
export function processPhase3Results(phase3, results) {
  const PASS_RATE_THRESHOLD = 95;

  if (phase3.failed_tests > 0) {
    const passRate = phase3.tests_executed > 0 ? (phase3.tests_passed / phase3.tests_executed) * 100 : 0;

    if (passRate >= PASS_RATE_THRESHOLD) {
      console.log(`   [WARN] ${phase3.failed_tests} test(s) failed, but pass rate ${passRate.toFixed(1)}% meets threshold (>=${PASS_RATE_THRESHOLD}%)`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${phase3.failed_tests} E2E test(s) failed`,
        recommendation: 'Consider fixing for 100% test coverage',
        details: phase3.failures,
        pass_rate: passRate
      });
    } else {
      console.log(`   [FAIL] ${phase3.failed_tests} test(s) failed (pass rate ${passRate.toFixed(1)}% below threshold)`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${phase3.failed_tests} E2E test(s) failed (pass rate ${passRate.toFixed(1)}% < ${PASS_RATE_THRESHOLD}%)`,
        recommendation: 'Fix test failures before proceeding',
        details: phase3.failures,
        pass_rate: passRate
      });
      results.verdict = 'BLOCKED';
    }
  } else if (phase3.tests_executed === 0) {
    console.log('   [WARN] No E2E tests executed');
    results.warnings.push({
      severity: 'HIGH',
      issue: 'No E2E tests executed',
      recommendation: 'Create and execute E2E tests (MANDATORY per protocol)',
      note: 'Cannot approve SD without E2E test evidence'
    });
    if (results.confidence > 60) results.confidence = 60;
  } else {
    console.log(`   [PASS] All ${phase3.tests_passed} test(s) passed`);
  }
}

/**
 * Verify user stories are fully implemented
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} results - Results object to update
 * @param {Object} supabase - Supabase client instance
 */
export async function verifyUserStories(sdId, results, supabase) {
  const { data: stories, error: storyError } = await supabase
    .from('user_stories')
    .select('story_key, title, status, e2e_test_path, e2e_test_status, validation_status')
    .eq('sd_id', sdId);

  if (!storyError && stories && stories.length > 0) {
    const incomplete = stories.filter(s =>
      !['completed', 'validated'].includes(s.status) ||
      !s.e2e_test_path ||
      (s.e2e_test_status !== 'passing' && s.validation_status !== 'validated')
    );

    if (incomplete.length > 0) {
      console.log(`   [FAIL] ${incomplete.length} user stories not fully implemented`);
      incomplete.forEach(s => {
        console.log(`      - ${s.story_key}: ${s.title}`);
        console.log(`        Status: ${s.status || 'NULL'}, E2E: ${s.e2e_test_path || 'NOT MAPPED'}, Result: ${s.e2e_test_status || 'NOT RUN'}, Validation: ${s.validation_status || 'pending'}`);
      });
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${incomplete.length} user stories not fully implemented`,
        stories: incomplete.map(s => ({ story_key: s.story_key, status: s.status, e2e_mapped: !!s.e2e_test_path })),
        recommendation: 'Complete implementation of all user stories before EXEC->PLAN handoff'
      });
      results.verdict = 'BLOCKED';
      results.confidence = Math.max(0, 100 - (incomplete.length / stories.length * 100));
    } else {
      console.log(`   [PASS] All ${stories.length} user stories fully implemented`);
    }
  } else if (storyError) {
    console.log('   [WARN] Could not verify user stories:', storyError.message);
    results.warnings.push('User story verification failed - check manually');
  }
}
