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
import { resolveEvaluatedCommitSha, resolveCommitTimestamp } from '../../sub-agent-executor/results-storage.js';
import {
  readArtifactWithSha,
  isArtifactFresh,
  isReportHashMismatch,
  classifyProvenance,
  deriveCountsFromArtifact,
  computeArtifactSha
} from './artifact-verification.js';
// SD-FDBK-INFRA-TESTING-SUB-AGENT-001: single-source applicability policy, replacing the two
// private per-file exemption lists that used to decide this independently (and disagreed with
// each other) here and in phases/phase4-evidence.js.
import { detectCodeProduction, isE2EApplicabilityExempt } from '../../../scripts/modules/handoff/validation/sd-type-applicability-policy.js';
// QF-20260902-796: a non-exempt-by-type SD can still be zero-UI BY MEASURED DIFF (e.g. a
// bugfix touching only lib/scripts) -- classify the actual diff rather than only the label.
import { classifySDAsUITouching } from '../../testing/ui-touching-classifier.js';
import { getScopedUnitTestFiles } from '../../../scripts/modules/complete-quick-fix/git-operations.js';
import { runTests } from '../../../scripts/modules/complete-quick-fix/test-runner.js';
import { execSync } from 'node:child_process';
// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 SC#6: the ONE structured test-execution representation,
// shared with any worker-authored (source='manual') evidence script.
import { buildTestExecution, isMeasuredExecution } from './test-execution-record.js';
// no-process-cwd-in-sub-agents-lint: repo-root fallback via the canonical resolver, not process.cwd().
import { resolveSubAgentRepo } from '../resolve-repo.js';

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

  // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (TR-4): computeReposForSD(sd) needs the
  // SD row (id, target_application, metadata), which resolveFeatureBranch's internal
  // resolveBranch() already fetches but discards. Threaded as an ADDITIVE field on
  // enhancedOptions (never a positional signature change) so Phase 3 can multi-repo-resolve
  // without a second implicit query buried in phase3-execution.js.
  const sdRow = await fetchSdRowForRepoResolution(sdId);

  // Build enhanced options with branch context
  const enhancedOptions = {
    ...options,
    ...(branchContext && {
      branch: branchContext.branch,
      featureBranch: branchContext.branch,
      repoPath: branchContext.repoPath
    }),
    sdRow,
    semanticPatterns
  };

  // Detect validation mode (prospective vs retrospective)
  const validationMode = await detectValidationMode(sdId, options);
  logValidationMode('TESTING', validationMode, {
    'Prospective': 'BLOCKED if --full-e2e flag missing',
    'Retrospective': 'CONDITIONAL_PASS if E2E tests exist and pass'
  });

  // Check for non-UI SD types that don't require E2E tests
  const skipResult = await checkForNonUISdType(sdId, validationMode, options, branchContext);
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
    const { skipTestExecution, freshEvidence } = await checkTestEvidence(sdId, results, validationMode, enhancedOptions.repoPath);

    // Phase 3: E2E Test Execution
    console.log('\n🚀 Phase 3: E2E Test Execution (MANDATORY)...');
    let phase3;
    if (skipTestExecution && freshEvidence) {
      phase3 = buildPhase3FromEvidence(freshEvidence);
      console.log(`   📋 Using cached evidence: ${phase3.tests_passed}/${phase3.tests_executed} tests passed`);
    } else {
      // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D: was passing the un-enhanced `options`,
      // so enhancedOptions.repoPath (resolved above) never reached Phase 3 execution.
      phase3 = await executeE2ETests(sdId, enhancedOptions, supabase);
    }
    results.findings.phase3_execution = phase3;
    processPhase3Results(results, phase3);
    // SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-4: the mainline executed-test branch previously
    // never populated metadata.test_execution -- only the policy_non_applicable_* early-exit
    // branches below call buildTestExecution(). Without this, storeSubAgentResults' new
    // PASS/CONDITIONAL_PASS guard (FR-1) would refuse the sub-agent's OWN real, successful runs.
    const mainlineTestExecution = buildMainlinePhase3TestExecution(phase3);
    results.metadata = { ...(results.metadata || {}), measured: isMeasuredExecution(mainlineTestExecution), test_execution: mainlineTestExecution };

    // Phase 4: Evidence Collection
    console.log('\n📸 Phase 4: Evidence Collection...');
    const phase4 = await collectEvidence(sdId, phase3);
    results.findings.phase4_evidence = phase4;

    // Phase 4.5: User Story Verification
    // SD-LEARN-FIX-011: Pass sdType so exempt types skip e2e_test_path requirement
    const { data: sdTypeData } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type')
      .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
      .single();
    const phase4_5 = await verifyUserStories(sdId, supabase, { sdType: sdTypeData?.sd_type || '' });
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

/**
 * QF-20260831-960: derive the branchContext to hand downstream from a resolveBranch() result.
 * repoPath resolution and branch-NAME discovery are independent facts (resolveBranch()
 * computes repoPath from sd.target_application before it ever tries to discover a branch
 * name) -- a branch-discovery miss does not mean repoPath is unknown. Previously, discarding
 * the whole result to null on any !success caused runFullE2ESuite to fail-loud-refuse to run
 * entirely on any SD whose branch name couldn't be independently discovered, turning a benign
 * "couldn't name the branch" condition into a total E2E blackout.
 * @param {{success: boolean, branch?: string|null, repoPath?: string|null, source?: string, validated?: boolean, error?: string}} branchResult
 * @returns {{branch: string|null, repoPath: string, source?: string, validated: boolean}|null}
 */
export function deriveBranchContext(branchResult) {
  if (branchResult.success) {
    return {
      branch: branchResult.branch,
      repoPath: branchResult.repoPath,
      source: branchResult.source,
      validated: branchResult.validated
    };
  }
  if (branchResult.repoPath) {
    return {
      branch: null,
      repoPath: branchResult.repoPath,
      source: branchResult.source,
      validated: false
    };
  }
  return null;
}

async function resolveFeatureBranch(sdId) {
  try {
    console.log('   🌿 Resolving feature branch...');
    const branchResult = await resolveBranch(supabase, sdId, {
      verbose: false,
      autoStore: true
    });

    const context = deriveBranchContext(branchResult);
    if (branchResult.success) {
      console.log(`   ✅ Feature branch resolved: ${branchResult.branch}`);
      console.log(`      Source: ${branchResult.source}, Repo: ${branchResult.repoPath}`);
    } else {
      console.log(`   ⚠️  Could not resolve feature branch: ${branchResult.error}`);
      if (context) {
        console.log(`      Still have repoPath from ${branchResult.source || 'resolution'}: ${branchResult.repoPath}`);
      } else {
        console.log('   💡 Falling back to filesystem scan (may miss tests on feature branch)');
      }
    }
    return context;
  } catch (branchError) {
    console.log(`   ⚠️  Branch resolution error: ${branchError.message}`);
    return null;
  }
}

/**
 * Fetch the minimal SD fields computeReposForSD(sd) needs (id, sd_key, target_application,
 * metadata) for Phase 3's multi-repo resolution.
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (TR-4).
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} [supabaseClient] - Injectable Supabase client (defaults to the module
 *   singleton); exported/parameterized so unit tests can exercise the REAL query shape
 *   against a mock, rather than re-implementing it (adversarial /ship review finding).
 * @returns {Promise<Object|null>} the SD row, or null if unresolvable (non-fatal)
 */
export async function fetchSdRowForRepoResolution(sdId, supabaseClient = supabase) {
  // SECURITY (SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F EXEC review): an .or() template
  // string (`id.eq.${sdId},sd_key.eq.${sdId}`) is NOT parameterized -- it's parsed as a raw
  // PostgREST filter expression, so a comma/`)` in sdId can inject additional clauses and
  // resolve a DIFFERENT SD's row (confirmed live: a crafted sdId returned an unrelated SD's
  // full row with no error). Two sequential .eq() lookups (mirrors lib/supabase-client.js
  // fetchSD's canonical id-then-sd_key pattern) are immune -- each is a single equality
  // predicate, never string-interpolated into a filter expression.
  const columns = 'id, sd_key, target_application, metadata';
  try {
    const { data: byId, error: idError } = await supabaseClient
      .from('strategic_directives_v2')
      .select(columns)
      .eq('id', sdId)
      .maybeSingle();
    if (byId) return byId;
    if (idError) return null;

    const { data: byKey, error: keyError } = await supabaseClient
      .from('strategic_directives_v2')
      .select(columns)
      .eq('sd_key', sdId)
      .maybeSingle();
    if (keyError || !byKey) return null;
    return byKey;
  } catch {
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

/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-4: translate the mainline E2E-execution phase3
 * object (tests_executed/tests_passed/failed_tests/skipped_tests) into the canonical
 * test_execution shape via buildTestExecution() -- pure and exported for direct unit testing,
 * without needing to mock the full executeE2ETests/DB pipeline.
 *
 * SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 FR-1/FR-3: also stamps artifact_path/artifact_sha/
 * source, so the fields already on the canonical shape stop being write-only. No signature
 * change was needed -- phase3.evidence_reused (buildPhase3FromEvidence, always true on the
 * reuse branch, absent on every fresh branch) and phase3.artifact_sha (already set on the
 * reuse branch by the existing verifyArtifact() fastpath) are both already present on the
 * object this function already receives.
 *   - Reused/cached run: reuse the ALREADY-verified artifact_sha as-is (never recompute) so a
 *     cached artifact's hash can never be presented as if it came from a fresh run.
 *   - Fresh run, single repo (report_url is a string): hash the on-disk artifact via the
 *     EXISTING computeArtifactSha() (TR-1 -- no new hashing logic).
 *   - Fresh run, multi-repo aggregate (aggregateE2EResults, report_url is an ARRAY): omit
 *     artifact_path/artifact_sha/source entirely (FR-3) rather than silently picking one
 *     repo's path/sha to misrepresent the aggregate.
 *   - Any unreadable/malformed artifact (computeArtifactSha returns null): omit, fail-soft.
 * @param {{tests_executed?: number, tests_passed?: number, failed_tests?: number,
 *   skipped_tests?: number, report_url?: string|string[]|null, evidence_reused?: boolean,
 *   artifact_sha?: string|null}} phase3
 * @returns {ReturnType<typeof buildTestExecution>}
 */
export function buildMainlinePhase3TestExecution(phase3) {
  const base = {
    executed: phase3?.tests_executed,
    passed: phase3?.tests_passed,
    failed: phase3?.failed_tests,
    skipped: phase3?.skipped_tests,
    runner: 'playwright',
  };

  const reportUrl = phase3?.report_url;
  // FR-3: a multi-repo aggregate's report_url is an ARRAY (aggregateE2EResults) -- never
  // collapse it to a single path/sha that would misrepresent which repo it verifies.
  if (Array.isArray(reportUrl)) return buildTestExecution(base);
  if (!reportUrl) return buildTestExecution(base);

  // SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 / phase5-verdict.js:171,201: from_cache is a
  // DIFFERENT, older reuse signal, co-equal to evidence_reused -- getCachedTestResults()
  // currently never returns report_url, so this branch is unreachable today, but keying on
  // only evidence_reused already shipped as a defect once (that CHANGELOG entry) and would
  // silently recompute (and mislabel as 'fresh') a cached artifact_sha the moment report_url
  // is added to the cache path.
  if (phase3?.evidence_reused === true || phase3?.from_cache === true) {
    if (!phase3.artifact_sha) return buildTestExecution(base);
    return buildTestExecution({ ...base, artifactPath: reportUrl, artifactSha: phase3.artifact_sha, source: 'reused' });
  }

  // SECURITY review (evidence bdbe3d54, SEC-1): prefer phase3.artifact_sha when the caller
  // already computed it from the SAME read that produced the counts (runFullE2ESuite,
  // phases/phase3-execution.js) -- avoids a second readFileSync of reportUrl at stamp time,
  // which is exactly the split-read TOCTOU window readArtifactWithSha's own docblock warns
  // against. Falls back to computeArtifactSha() only for a phase3 producer that has a real
  // report_url but no precomputed sha (defensive, not the live production path today).
  const sha = phase3.artifact_sha || computeArtifactSha(reportUrl);
  if (!sha) return buildTestExecution(base);
  return buildTestExecution({ ...base, artifactPath: reportUrl, artifactSha: sha, source: 'fresh' });
}

// Exported (supabaseClient injectable, mirrors fetchSdRowForRepoResolution) for unit testing —
// SD-FDBK-INFRA-TESTING-SUB-AGENT-001.
export async function checkForNonUISdType(sdId, validationMode, options, branchContext, supabaseClient = supabase) {
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-010: Query sd_type (authoritative) AND category (fallback)
  // ROOT CAUSE FIX (SAL-TESTING-REC): Previously only checked category field, missing infrastructure
  // SDs that have sd_type='infrastructure' but category='technical'
  const { data: sdData } = await supabaseClient
    .from('strategic_directives_v2')
    .select('sd_type, category, key_changes, scope, title')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  // Use sd_type first (declared, authoritative), fall back to category
  const sdType = sdData?.sd_type?.toLowerCase() || '';
  const sdCategory = sdData?.category?.toLowerCase() || '';
  const effectiveType = sdType || sdCategory;

  // repoPath/changedFiles are resolved lazily (only when actually needed) so a non-exempt,
  // non-zero-UI SD returns null exactly as before without an extra repo-resolution call.
  let repoPath = branchContext?.repoPath || null;
  let changedFiles = null;
  async function resolveChangedFiles() {
    if (changedFiles !== null) return changedFiles;
    try {
      repoPath = repoPath || (await resolveSubAgentRepo({ sdId, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' })).repoPath;
      changedFiles = execSync('git diff --name-only main...HEAD', { encoding: 'utf-8', cwd: repoPath, timeout: 15000 })
        .split('\n').map((f) => f.trim()).filter(Boolean);
    } catch (e) {
      console.log(`   ⚠️  Could not resolve changed files via git diff: ${e.message}`);
      changedFiles = [];
    }
    return changedFiles;
  }

  let applicabilitySource = 'declared_type';
  if (!isE2EApplicabilityExempt(effectiveType)) {
    // Not exempt by declared type. Check the MEASURED diff instead of only the label -- but an
    // empty/unresolvable diff FAILS CLOSED (E2E still required): a missing diff must never exempt
    // a type-required SD (QF-20260902-796, RCA on SD-LEO-FIX-HUMAN-ACTION-FENCES-001).
    const diffFiles = await resolveChangedFiles();
    const uiClassification = classifySDAsUITouching(diffFiles);
    const zeroUiByDiff = diffFiles.length > 0 && !uiClassification.ui_touching;
    if (!zeroUiByDiff) return null; // fall through to the normal E2E flow, unchanged
    applicabilitySource = 'measured_diff';
    console.log(`\n🗄️  Zero-UI-by-diff: ${diffFiles.length} changed file(s), none match UI patterns (type '${effectiveType}' not declared-exempt)`);
  }

  const isRefactor = effectiveType === 'refactor';
  const isInfra = ['infrastructure', 'database', 'process', 'orchestrator'].includes(effectiveType);
  console.log(`\n🗄️  SD Type Detection: ${effectiveType.toUpperCase()} (source: ${sdType ? 'sd_type' : 'category'})`);

  // SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001's override, consumed here directly instead of via
  // the type-only shortcut this SD deletes: a code-producing exempt-type SD must be MEASURED,
  // not auto-passed. detectCodeProduction() only recognizes sd_type='infrastructure' (keyword
  // sniffing on key_changes/scope) -- for a measured_diff SD we already have direct proof of
  // code production (a non-empty, non-UI diff), so that guess would wrongly say "no code" for
  // every non-infrastructure type reaching this point via the diff gate (QF-20260902-796).
  const codeDetection = applicabilitySource === 'measured_diff'
    ? { producesCode: true, reason: `measured non-empty, non-UI diff (${changedFiles.length} file(s))` }
    : detectCodeProduction({
      sd_type: sdType || sdCategory,
      key_changes: sdData?.key_changes,
      scope: sdData?.scope,
      title: sdData?.title
    });
  console.log(`   Code production check: ${codeDetection.producesCode ? 'YES' : 'NO'} (${codeDetection.reason})`);

  if (!codeDetection.producesCode) {
    // Genuinely nothing to test — an honest PASS (measured=false because there is nothing to
    // measure, not because we skipped measuring something that existed).
    console.log(isRefactor
      ? '   💡 Refactor SDs use REGRESSION sub-agent for validation'
      : `   💡 ${effectiveType} SD produces no code — E2E/unit validation not applicable`);
    return {
      verdict: 'PASS',
      confidence: 90,
      validation_mode: validationMode,
      critical_issues: [],
      warnings: [],
      recommendations: [{
        severity: 'INFO',
        issue: `${effectiveType} SD produces no code — E2E tests not applicable`,
        recommendation: isRefactor
          ? 'Behavior validated via REGRESSION sub-agent (before/after comparison)'
          : isInfra
            ? 'Schema validated via DATABASE sub-agent and table existence checks.'
            : `Validation via appropriate sub-agents for ${effectiveType} SD type`
      }],
      detailed_analysis: {
        sd_type: effectiveType,
        sd_type_source: sdType ? 'declared' : 'category_fallback',
        skip_reason: `${effectiveType} SD produces no code (${codeDetection.reason}) — nothing to measure`,
        applicability_rule: 'policy_non_applicable_no_code'
      },
      findings: {
        phase0_intelligence: { skipped: true, reason: `${effectiveType} SD - no code produced` },
        phase1_preflight: { skipped: true },
        phase2_test_generation: { skipped: true },
        phase3_execution: { skipped: true, reason: 'no code produced' },
        phase4_evidence: { type: isInfra ? 'schema_validation' : 'non_ui_validation' }
      },
      metadata: { measured: false, test_execution: buildTestExecution(), applicability_rule: 'policy_non_applicable_no_code' },
      options
    };
  }

  // Code-producing exempt (by type OR by measured zero-UI diff) SD: run REAL scoped non-UI
  // validation instead of fabricating a PASS. resolveChangedFiles() is a no-op if the diff
  // check above already resolved `changedFiles`; a declared-exempt type resolves it here.
  console.log('   ⚠️  Code-producing exempt-type SD — running scoped non-UI validation (no fabricated PASS)');
  changedFiles = await resolveChangedFiles();

  const scopedTestFiles = getScopedUnitTestFiles(changedFiles, repoPath);
  if (scopedTestFiles.length === 0) {
    console.log('   ⚠️  No unit-test file maps to the changed files — CONDITIONAL_PASS, not a fabricated PASS');
    return {
      verdict: 'CONDITIONAL_PASS',
      confidence: 50,
      validation_mode: validationMode,
      critical_issues: [],
      warnings: [`No scoped unit test resolvable for ${changedFiles.length} changed file(s) on a code-producing ${effectiveType} SD`],
      recommendations: [{
        severity: 'WARNING',
        issue: `${effectiveType} SD changed code but no scoped unit test could be resolved`,
        recommendation: 'Add a co-located *.test.js for the changed source files, or declare an explicit test command in the PRD.'
      }],
      detailed_analysis: {
        sd_type: effectiveType,
        sd_type_source: sdType ? 'declared' : 'category_fallback',
        applicability_source: applicabilitySource,
        skip_reason: `code-producing ${effectiveType} SD with no resolvable scoped unit test — CONDITIONAL_PASS, not PASS`,
        changed_files: changedFiles,
        applicability_rule: 'policy_non_applicable_code_no_scoped_test'
      },
      findings: {
        phase0_intelligence: { skipped: true, reason: `${effectiveType} SD - non-UI` },
        phase1_preflight: { skipped: true },
        phase2_test_generation: { skipped: true },
        phase3_execution: { skipped: true, reason: 'no scoped unit test resolvable' },
        phase4_evidence: { type: isInfra ? 'schema_validation' : 'non_ui_validation' }
      },
      metadata: { measured: false, test_execution: buildTestExecution(), applicability_rule: 'policy_non_applicable_code_no_scoped_test' },
      options
    };
  }

  const testResult = runTests('unit', { testFiles: scopedTestFiles, testDir: repoPath });
  const summary = testResult.summary || { passed: 0, failed: 0, total: 0 };
  const verdict = testResult.passed ? 'PASS' : 'FAIL';
  console.log(`   ${testResult.passed ? '✅' : '❌'} Scoped unit run: ${summary.passed}/${summary.total} passed`);
  const testExecution = buildTestExecution({
    executed: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    runner: 'vitest'
  });

  return {
    verdict,
    confidence: testResult.passed ? 92 : 60,
    validation_mode: validationMode,
    critical_issues: testResult.passed ? [] : [`Scoped unit run failed: ${summary.failed}/${summary.total} test(s) failed`],
    warnings: [],
    recommendations: [{
      severity: testResult.passed ? 'INFO' : 'CRITICAL',
      issue: `${effectiveType} SD scoped unit validation`,
      recommendation: testResult.passed
        ? `${summary.passed}/${summary.total} scoped unit test(s) passed for the changed files.`
        : `${summary.failed}/${summary.total} scoped unit test(s) failed — fix before proceeding.`
    }],
    detailed_analysis: {
      sd_type: effectiveType,
      sd_type_source: sdType ? 'declared' : 'category_fallback',
      applicability_source: applicabilitySource,
      skip_reason: `E2E not applicable for ${effectiveType} SDs; real scoped unit validation ran instead`,
      changed_files: changedFiles,
      scoped_test_files: scopedTestFiles,
      applicability_rule: 'policy_non_applicable_code_measured'
    },
    findings: {
      phase0_intelligence: { skipped: true, reason: `${effectiveType} SD - no UI components` },
      phase1_preflight: { skipped: true },
      phase2_test_generation: { skipped: true },
      phase3_execution: { skipped: false, executed: summary.total, passed: summary.passed, failed: summary.failed },
      phase4_evidence: { type: isInfra ? 'schema_validation' : 'non_ui_validation' }
    },
    metadata: {
      measured: isMeasuredExecution(testExecution),
      test_execution: testExecution,
      applicability_rule: 'policy_non_applicable_code_measured'
    },
    options
  };
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

/**
 * Verifies a candidate artifact against the current commit (SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001,
 * FR-1/FR-3): reads+shape-validates the file, refuses when missing/malformed, and refuses when the
 * artifact predates the commit it would certify. Fails toward refusing reuse on any ambiguity --
 * never toward trusting an unverifiable claim. Returns null when the artifact cannot be verified.
 * @param {string|null|undefined} artifactPath
 * @param {string|null|undefined} repoPath
 * @returns {{expected:number, unexpected:number, skipped:number, flaky:number, startTime:string, artifact_sha:string|null}|null}
 */
export function verifyArtifact(artifactPath, repoPath) {
  const { artifact, sha } = readArtifactWithSha(artifactPath);
  if (!artifact) return null;
  const commitSha = resolveEvaluatedCommitSha(repoPath);
  const commitTimestamp = commitSha ? resolveCommitTimestamp(commitSha, repoPath) : null;
  if (!isArtifactFresh(artifact.startTime, commitTimestamp)) return null;
  return { ...artifact, artifact_sha: sha };
}

export async function checkTestEvidence(sdId, results, validationMode, repoPath) {
  console.log('\n🔍 Phase 2.5: Checking for existing test evidence...');
  let skipTestExecution = false;
  let freshEvidence = null;

  try {
    const freshnessCheck = await checkTestEvidenceFreshness(sdId, 60);
    results.findings.phase2_5_evidence_check = freshnessCheck;

    if (freshnessCheck.isFresh && validationMode === 'retrospective') {
      console.log(`   ✅ Found FRESH test evidence (${Math.round(freshnessCheck.ageMinutes || 0)} minutes old)`);
      console.log(`   📊 Previous verdict: ${freshnessCheck.evidence?.verdict}, Pass rate: ${freshnessCheck.evidence?.pass_rate}%`);

      // SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 (FR-1): the row's own passed_tests/
      // failed_tests are NEVER trusted directly -- only an independently re-parsed,
      // freshness-verified artifact may grant reuse. A row with no report_file_path,
      // an unreadable/malformed artifact, or a stale artifact falls through to a real run.
      const verified = verifyArtifact(freshnessCheck.evidence?.report_file_path, repoPath);
      if (verified) {
        skipTestExecution = true;
        freshEvidence = {
          ...deriveCountsFromArtifact(verified),
          expected: verified.expected,
          unexpected: verified.unexpected,
          skipped_count: verified.skipped,
          flaky: verified.flaky,
          startTime: verified.startTime,
          artifact_sha: verified.artifact_sha,
          report_file_path: freshnessCheck.evidence.report_file_path,
          age_minutes: freshnessCheck.ageMinutes,
          provenance_ok: classifyProvenance(freshnessCheck.evidence?.triggered_by),
          ingest_source: freshnessCheck.evidence?.triggered_by ?? null
        };
        // SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 (FR-5 AC-4): a mismatch between the
        // freshly-computed artifact_sha and the row's OWN report_hash means the row is
        // pointing at an artifact it was not actually ingested with (e.g. a fabricated row
        // borrowing a different run's genuinely-clean artifact). Non-blocking -- older rows
        // predate this SD and may carry no/stale report_hash -- but surfaced as a warning so
        // it is never silently invisible.
        if (isReportHashMismatch(verified.artifact_sha, freshnessCheck.evidence.report_hash)) {
          results.warnings.push({
            severity: 'MEDIUM',
            issue: 'Reused artifact_sha does not match the row\'s own report_hash -- possible artifact substitution',
            recommendation: 'Verify the artifact at ' + freshnessCheck.evidence.report_file_path + ' is genuinely the one this row was ingested with'
          });
        }
        console.log('   ⏭️  Skipping test execution - artifact-verified evidence (retrospective mode)');
      } else {
        console.log('   ⚠️  Evidence row present but artifact could not be verified (missing/malformed/stale) -- proceeding to real execution');
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
    const apiResult = await checkApiTestEvidence(sdId, results, repoPath);
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

export async function checkApiTestEvidence(sdId, results, repoPath) {
  try {
    console.log('   🔍 Checking for API integration test evidence (sd_testing_status)...');
    const { data: apiTestEvidence, error: apiTestError } = await supabase
      .from('sd_testing_status')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    if (!apiTestError && apiTestEvidence && apiTestEvidence.tested) {
      const ageMinutes = apiTestEvidence.last_tested_at
        ? Math.round((Date.now() - new Date(apiTestEvidence.last_tested_at).getTime()) / 60000)
        : null;
      const isFresh = ageMinutes !== null && ageMinutes <= 60;

      console.log('   ✅ Found API integration test evidence');
      console.log(`      Framework: ${apiTestEvidence.test_framework || 'unknown'}`);
      console.log(`      Tests: ${apiTestEvidence.tests_passed}/${apiTestEvidence.test_count} (row-reported, not yet artifact-verified)`);
      console.log(`      Age: ${ageMinutes !== null ? ageMinutes + ' minutes' : 'unknown'}`);

      // SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 (FR-2): sd_testing_status has NO dedicated
      // artifact column at all -- the row's own tested/tests_passed/test_count is NEVER
      // sufficient for an unqualified PASS (this table's tests_passed=51/test_count=51 with
      // no real artifact behind it is the exact shape of the witnessed 2026-09-01 false-PASS).
      // The only path to a verified artifact here is an ad hoc test_results.e2e_evidence
      // string path, when present. Absent/unresolvable/stale/malformed -> real execution.
      const e2eEvidencePath = apiTestEvidence.test_results?.e2e_evidence;
      const verified = isFresh && typeof e2eEvidencePath === 'string'
        ? verifyArtifact(e2eEvidencePath, repoPath)
        : null;

      if (verified) {
        const freshEvidence = {
          ...deriveCountsFromArtifact(verified),
          expected: verified.expected,
          unexpected: verified.unexpected,
          skipped_count: verified.skipped,
          flaky: verified.flaky,
          startTime: verified.startTime,
          artifact_sha: verified.artifact_sha,
          report_file_path: e2eEvidencePath,
          age_minutes: ageMinutes,
          test_type: 'api_integration',
          framework: apiTestEvidence.test_framework,
          provenance_ok: classifyProvenance(apiTestEvidence.updated_by),
          ingest_source: apiTestEvidence.updated_by ?? null
        };
        results.findings.phase2_5_api_test_evidence = freshEvidence;
        console.log('   ⏭️  Using artifact-verified API/E2E evidence');
        return { skipTestExecution: true, freshEvidence };
      }
      console.log('   ⚠️  sd_testing_status row present but no verifiable artifact (missing/malformed/stale e2e_evidence, or stale row) -- cannot grant unqualified reuse from this table alone');
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

/**
 * Builds the phase3-shaped result from artifact-verified reused evidence.
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 (FR-5): counts come from
 * deriveCountsFromArtifact (mirroring runFullE2ESuite's own formula), so the
 * EXISTING processPhase3Results consumer already BLOCKs on a low pass rate and
 * treats tests_executed===0 (the all-skipped/nothing-ran shape) as no-evidence,
 * with no separate invariant check needed here. provenance_verified/ingest_source
 * are threaded through so phase5 can cap non-runner-provenance reuse at
 * CONDITIONAL_PASS (FR-4) even when the artifact itself is clean.
 *
 * The raw artifact stat is named skipped_count here (not skipped) -- other phase result
 * objects in this file (e.g. phase0_intelligence/phase1_preflight/phase3_execution) use
 * `skipped: true` as a boolean sentinel meaning "this phase did not run at all"; reusing
 * that key name for a numeric per-test count on the same phase3_execution object would let
 * a nonzero skipped-test count be misread as that boolean sentinel (REGRESSION finding,
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001).
 */
export function buildPhase3FromEvidence(freshEvidence) {
  return {
    tests_executed: freshEvidence.tests_executed,
    tests_passed: freshEvidence.tests_passed,
    failed_tests: freshEvidence.failed_tests,
    skipped_tests: freshEvidence.skipped_tests,
    failures: [],
    report_url: freshEvidence.report_file_path || null,
    execution_time_ms: freshEvidence.duration_ms || 0,
    evidence_reused: true,
    evidence_age_minutes: Math.round(freshEvidence.age_minutes || 0),
    expected: freshEvidence.expected,
    unexpected: freshEvidence.unexpected,
    skipped_count: freshEvidence.skipped_count,
    flaky: freshEvidence.flaky,
    startTime: freshEvidence.startTime,
    artifact_sha: freshEvidence.artifact_sha,
    provenance_verified: freshEvidence.provenance_ok === true,
    ingest_source: freshEvidence.ingest_source ?? null
  };
}

export function processPhase3Results(results, phase3) {
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
  } else if (phase3.e2e_not_applicable) {
    // SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D: tests_executed===0 here is the
    // zero-infra short-circuit, not missing evidence -- phase5 already emits a PASS@90
    // verdict for this case. Pushing the "cannot approve without E2E evidence" HIGH
    // warning below would contradict that verdict in the same results object (deep-tier
    // adversarial review finding).
    console.log(`   ℹ️  E2E not applicable: ${phase3.reason || 'no E2E infrastructure in target repo'}`);
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
