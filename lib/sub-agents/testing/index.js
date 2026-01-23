/**
 * TESTING Sub-Agent (QA Engineering Director v3.0 - Intelligence Enhanced)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Mission-Critical Testing Automation - Comprehensive E2E validation
 * Code: TESTING
 * Priority: 5
 *
 * Philosophy: "Do it right, not fast." E2E testing is MANDATORY, not optional.
 *
 * v3.0 Enhancements (2025-11-21):
 * - Phase 0: Intelligent Test Analysis
 *   - Selector validation: Auto-detect mismatches before running tests
 *   - Navigation flow validation: Verify navigation paths exist
 *   - Component mapping: Ensure test-to-component alignment
 *   - Contextual error analysis: Smart fix suggestions
 *
 * v3.1 Refactored (2026-01-23):
 * - Modular architecture: Split into phases/ and utils/ directories
 * - Each phase is a separate module for maintainability
 * - SD: SD-LEO-REFAC-TESTING-INFRA-001
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Updated: 2025-11-15 (SD-LEO-PROTOCOL-V4-4-0: Adaptive validation support)
 * Updated: 2025-11-21 (v3.0: Phase 1 Intelligence Module - SD-FOUND-DATA-003)
 * Refactored: 2026-01-23 (v3.1: Modular architecture - SD-LEO-REFAC-TESTING-INFRA-001)
 */

import dotenv from 'dotenv';
import {
  detectValidationMode,
  logValidationMode
} from '../../utils/adaptive-validation.js';
import {
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping
} from '../../utils/test-intelligence.js';
import { createSupabaseServiceClient } from '../../../scripts/lib/supabase-connection.js';
import { checkTestEvidenceFreshness } from '../../../scripts/lib/test-evidence-ingest.js';
import { quickPreflightCheck } from '../../../scripts/lib/handoff-preflight.js';
import { resolveBranch } from '../../../scripts/lib/branch-resolver.js';

// Phase modules
import { preflightChecks } from './phases/phase1-preflight.js';
import { generateTestCases } from './phases/phase2-generation.js';
import { executeE2ETests } from './phases/phase3-execution.js';
import { collectEvidence, verifyUserStories } from './phases/phase4-evidence.js';
import { generateVerdict } from './phases/phase5-verdict.js';

dotenv.config();

let supabase = null;

/**
 * Execute TESTING sub-agent
 * Implements QA Engineering Director v3.0 workflow
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Testing results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🧪 Starting TESTING for ${sdId}...`);
  console.log('   QA Engineering Director v3.1 - Modular Architecture');

  // Initialize Supabase client
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // TIER 1.5: Handoff Preflight Check
  await performHandoffPreflight(sdId);

  // Resolve feature branch for branch-aware test scanning
  const branchContext = await resolveFeatureBranch(sdId);

  // Fetch semantic patterns from user stories
  const semanticPatterns = await fetchSemanticPatterns(sdId);

  // Build enhanced options with branch context
  const enhancedOptions = {
    ...options,
    ...(branchContext && {
      branch: branchContext.branch,
      featureBranch: branchContext.branch,
      repoPath: branchContext.repoPath
    }),
    semanticPatterns
  };

  // Detect validation mode (prospective vs retrospective)
  const validationMode = await detectValidationMode(sdId, options);
  logValidationMode('TESTING', validationMode, {
    'Prospective': 'BLOCKED if --full-e2e flag missing',
    'Retrospective': 'CONDITIONAL_PASS if E2E tests exist and pass'
  });

  // Check for non-UI SD types that don't require E2E tests
  const skipResult = await checkForNonUISdType(sdId, validationMode, options);
  if (skipResult) return skipResult;

  // Initialize results structure
  const results = createResultsStructure(validationMode, options);

  try {
    // Phase 0: Intelligent Test Analysis
    await executePhase0(results, sdId, enhancedOptions);

    // Phase 1: Pre-flight Checks
    console.log('\n🔍 Phase 1: Pre-flight Checks...');
    const phase1 = await preflightChecks(sdId, options, supabase);
    results.findings.phase1_preflight = phase1;

    if (phase1.blocked) {
      results.verdict = 'BLOCKED';
      results.confidence = 100;
      results.critical_issues.push(...phase1.critical_issues);
      return results;
    }
    if (phase1.warnings.length > 0) {
      results.warnings.push(...phase1.warnings);
      if (results.confidence > 90) results.confidence = 90;
    }

    // Phase 2: Test Case Generation
    console.log('\n📝 Phase 2: Test Case Generation...');
    const phase2 = await generateTestCases(sdId, options, supabase);
    results.findings.phase2_test_generation = phase2;

    if (phase2.user_stories_count === 0) {
      console.log('   ⚠️  No user stories found - cannot generate test cases');
      results.warnings.push({
        severity: 'HIGH',
        issue: 'No user stories found for SD',
        recommendation: 'Create user stories before testing (Product Requirements Expert)',
        note: 'E2E tests should map to user stories (100% coverage required)'
      });
      if (results.confidence > 70) results.confidence = 70;
    }

    // Phase 2.5: Check for fresh test evidence
    const { skipTestExecution, freshEvidence } = await checkTestEvidence(sdId, results, validationMode);

    // Phase 3: E2E Test Execution
    console.log('\n🚀 Phase 3: E2E Test Execution (MANDATORY)...');
    let phase3;
    if (skipTestExecution && freshEvidence) {
      phase3 = buildPhase3FromEvidence(freshEvidence);
      console.log(`   📋 Using cached evidence: ${phase3.tests_passed}/${phase3.tests_executed} tests passed`);
    } else {
      phase3 = await executeE2ETests(sdId, options, supabase);
    }
    results.findings.phase3_execution = phase3;
    processPhase3Results(results, phase3);

    // Phase 4: Evidence Collection
    console.log('\n📸 Phase 4: Evidence Collection...');
    const phase4 = await collectEvidence(sdId, phase3);
    results.findings.phase4_evidence = phase4;

    // Phase 4.5: User Story Verification
    const phase4_5 = await verifyUserStories(sdId, supabase);
    if (!phase4_5.verified && phase4_5.incomplete?.length > 0) {
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${phase4_5.incomplete.length} user stories not fully implemented`,
        stories: phase4_5.incomplete,
        recommendation: 'Complete implementation of all user stories before EXEC→PLAN handoff'
      });
      results.verdict = 'BLOCKED';
      results.confidence = Math.max(0, 100 - (phase4_5.incomplete.length / phase4_5.stories_count * 100));
    }

    // Phase 5: Verdict & Testing Learnings
    console.log('\n🏁 Phase 5: Verdict & Testing Learnings...');
    const phase5 = generateVerdict(results, validationMode);
    results.findings.phase5_verdict = phase5;

    results.verdict = phase5.verdict;
    results.confidence = phase5.confidence;
    results.recommendations = phase5.recommendations;
    if (phase5.justification) results.justification = phase5.justification;
    if (phase5.conditions) results.conditions = phase5.conditions;

    console.log(`\n✅ TESTING Complete: ${results.verdict} (${results.confidence}% confidence)`);
    return results;

  } catch (error) {
    console.error('\n❌ TESTING error:', error.message);
    results.verdict = 'FAIL';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'TESTING sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

// Helper functions

async function performHandoffPreflight(sdId) {
  try {
    console.log('   🔗 Checking handoff chain status...');
    const preflightResult = await quickPreflightCheck(sdId, 'EXEC');

    if (preflightResult.ready) {
      console.log('   ✅ Handoff chain verified for EXEC phase');
    } else {
      console.log('   ⚠️  Handoff chain incomplete:');
      (preflightResult.missing || []).forEach(h => console.log(`      • Missing: ${h}`));
      console.log('   💡 Consider running: node scripts/handoff.js create --sd ' + sdId);
      console.log('   ⚠️  Proceeding with TESTING validation (advisory check)');
    }
  } catch (preflightError) {
    console.log(`   ⚠️  Handoff preflight skipped: ${preflightError.message}`);
  }
}

async function resolveFeatureBranch(sdId) {
  try {
    console.log('   🌿 Resolving feature branch...');
    const branchResult = await resolveBranch(supabase, sdId, {
      verbose: false,
      autoStore: true
    });

    if (branchResult.success) {
      console.log(`   ✅ Feature branch resolved: ${branchResult.branch}`);
      console.log(`      Source: ${branchResult.source}, Repo: ${branchResult.repoPath}`);
      return {
        branch: branchResult.branch,
        repoPath: branchResult.repoPath,
        source: branchResult.source,
        validated: branchResult.validated
      };
    } else {
      console.log(`   ⚠️  Could not resolve feature branch: ${branchResult.error}`);
      console.log('   💡 Falling back to filesystem scan (may miss tests on feature branch)');
      return null;
    }
  } catch (branchError) {
    console.log(`   ⚠️  Branch resolution error: ${branchError.message}`);
    return null;
  }
}

async function fetchSemanticPatterns(sdId) {
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
      console.log(`   📝 Semantic patterns from user stories: ${uniqueFilenames.join(', ')}`);
      return uniqueFilenames;
    }
  } catch (e) {
    console.log(`   ⚠️  Could not fetch semantic patterns: ${e.message}`);
  }
  return [];
}

async function checkForNonUISdType(sdId, validationMode, options) {
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('category')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  const sdCategory = sdData?.category?.toLowerCase() || '';
  const skipE2ESdTypes = ['database', 'infrastructure', 'documentation', 'protocol', 'refactor'];

  if (skipE2ESdTypes.includes(sdCategory)) {
    const isRefactor = sdCategory === 'refactor';
    console.log(`\n🗄️  SD Type Detection: ${sdCategory.toUpperCase()}`);
    console.log(isRefactor
      ? '   💡 Refactor SDs use REGRESSION sub-agent for validation'
      : '   💡 Database/Infrastructure SDs do not require UI E2E tests');
    console.log(isRefactor
      ? '   ✅ Validation via REGRESSION sub-agent (before/after behavior comparison)'
      : '   ✅ Validation via DATABASE/SECURITY sub-agents + table existence');

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
  return null;
}

function createResultsStructure(validationMode, options) {
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

async function executePhase0(results, sdId, options) {
  console.log('\n🧠 Phase 0: Intelligent Test Analysis (v3.0 Enhanced)...');
  const phase0 = {
    selector_validation: await validateTestSelectors(sdId, options),
    navigation_validation: await validateNavigationFlow(sdId, options),
    component_mapping: await analyzeTestComponentMapping(sdId, options)
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

async function checkTestEvidence(sdId, results, validationMode) {
  console.log('\n🔍 Phase 2.5: Checking for existing test evidence...');
  let skipTestExecution = false;
  let freshEvidence = null;

  try {
    const freshnessCheck = await checkTestEvidenceFreshness(sdId, 60);
    results.findings.phase2_5_evidence_check = freshnessCheck;

    if (freshnessCheck.isFresh && validationMode === 'retrospective') {
      console.log(`   ✅ Found FRESH test evidence (${Math.round(freshnessCheck.ageMinutes || 0)} minutes old)`);
      console.log(`   📊 Previous verdict: ${freshnessCheck.evidence?.verdict}, Pass rate: ${freshnessCheck.evidence?.pass_rate}%`);

      if (freshnessCheck.evidence?.verdict === 'PASS' || freshnessCheck.evidence?.pass_rate >= 95) {
        skipTestExecution = true;
        freshEvidence = freshnessCheck.evidence;
        console.log('   ⏭️  Skipping test execution - using existing evidence (retrospective mode)');
      }
    } else if (freshnessCheck.evidence) {
      console.log(`   ⚠️  Test evidence is ${freshnessCheck.freshnessStatus} (${Math.round(freshnessCheck.ageMinutes || 0)} minutes old)`);
      console.log(`   ${freshnessCheck.recommendation || 'Consider re-running tests'}`);
    } else {
      console.log('   📭 No E2E test evidence found in test_runs');
    }
  } catch (evidenceError) {
    console.log(`   ⚠️  Could not check E2E test evidence: ${evidenceError.message}`);
  }

  // Fallback: Check for API integration tests
  if (!skipTestExecution) {
    const apiResult = await checkApiTestEvidence(sdId, results);
    if (apiResult.skipTestExecution) {
      skipTestExecution = true;
      freshEvidence = apiResult.freshEvidence;
    }
  }

  if (!skipTestExecution) {
    console.log('   📋 Proceeding with standard test execution');
  }

  return { skipTestExecution, freshEvidence };
}

async function checkApiTestEvidence(sdId, results) {
  try {
    console.log('   🔍 Checking for API integration test evidence (sd_testing_status)...');
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

      console.log('   ✅ Found API integration test evidence');
      console.log(`      Framework: ${apiTestEvidence.test_framework || 'unknown'}`);
      console.log(`      Tests: ${apiTestEvidence.tests_passed}/${apiTestEvidence.test_count} passed (${passRate.toFixed(1)}%)`);
      console.log(`      Age: ${ageMinutes !== null ? ageMinutes + ' minutes' : 'unknown'}`);

      if (isFresh && passRate >= 95) {
        const freshEvidence = {
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
        results.findings.phase2_5_api_test_evidence = freshEvidence;
        console.log('   ⏭️  Using API integration test evidence (pass rate meets threshold)');
        return { skipTestExecution: true, freshEvidence };
      } else if (!isFresh) {
        console.log('   ⚠️  API test evidence is stale (> 60 minutes)');
      } else {
        console.log(`   ⚠️  API test pass rate ${passRate.toFixed(1)}% below threshold (95%)`);
      }
    } else if (apiTestError?.code !== 'PGRST116') {
      console.log(`   ⚠️  Could not check API test evidence: ${apiTestError?.message || 'unknown error'}`);
    } else {
      console.log('   📭 No API integration test evidence found');
    }
  } catch (apiCheckError) {
    console.log(`   ⚠️  API test evidence check failed: ${apiCheckError.message}`);
  }
  return { skipTestExecution: false, freshEvidence: null };
}

function buildPhase3FromEvidence(freshEvidence) {
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

function processPhase3Results(results, phase3) {
  if (phase3.failed_tests > 0) {
    const passRate = phase3.tests_executed > 0 ? (phase3.tests_passed / phase3.tests_executed) * 100 : 0;
    const PASS_RATE_THRESHOLD = 95;

    if (passRate >= PASS_RATE_THRESHOLD) {
      console.log(`   ⚠️  ${phase3.failed_tests} test(s) failed, but pass rate ${passRate.toFixed(1)}% meets threshold (≥${PASS_RATE_THRESHOLD}%)`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${phase3.failed_tests} E2E test(s) failed`,
        recommendation: 'Consider fixing for 100% test coverage',
        details: phase3.failures,
        pass_rate: passRate
      });
    } else {
      console.log(`   ❌ ${phase3.failed_tests} test(s) failed (pass rate ${passRate.toFixed(1)}% below threshold)`);
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
    console.log('   ⚠️  No E2E tests executed');
    results.warnings.push({
      severity: 'HIGH',
      issue: 'No E2E tests executed',
      recommendation: 'Create and execute E2E tests (MANDATORY per protocol)',
      note: 'Cannot approve SD without E2E test evidence'
    });
    if (results.confidence > 60) results.confidence = 60;
  } else {
    console.log(`   ✅ All ${phase3.tests_passed} test(s) passed`);
  }
}
