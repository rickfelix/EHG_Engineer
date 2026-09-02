/**
 * Mandatory Testing Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.4.2: Enforce TESTING sub-agent execution
 * Evidence: 14.6% of SDs completed without TESTING validation
 *
 * SD-LEO-HARDEN-VALIDATION-001: Narrowed exemptions to documentation-only
 * - Infrastructure, orchestrator, database now use ADVISORY mode
 * - Only documentation types skip TESTING entirely
 *
 * SD-LEO-TESTING-ENFORCEMENT-001: Type-aware dynamic validation
 * - Uses getValidationRequirements() instead of hardcoded type lists
 * - Git diff detection to detect actual code changes
 * - Infrastructure SDs that produce code now require TESTING (ADVISORY mode)
 */

import { getValidationRequirements } from '../../../../../../lib/utils/sd-type-validation.js';
// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-044: Import centralized policy for advisory mode override
import { getValidatorRequirement } from '../../../validation/sd-type-applicability-policy.js';
// SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001 (FR-3): WHITELIST-based timeout classifier
import { buildWaitResult, buildFailResult, classifyTestRunnerExit } from '../../../../../../lib/handoff/wait-verdict.js';
import { execSync } from 'child_process';
// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 SC#6: read the ONE structured test-execution
// representation when present (either writer path); ad-hoc metadata.measured is the
// backward-compatible fallback for rows written before this field existed.
import { isMeasuredExecution } from '../../../../../../lib/sub-agents/testing/test-execution-record.js';

/**
 * SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-3: resolve the "measured" state of a TESTING
 * result row into three DISTINCT outcomes: `true`/object (measured, real evidence — including the
 * legacy "measured as a fact-object" shape some rows carry), `false` (explicitly measured and
 * found unmeasured), or `null` (checked, and there is genuinely nothing to measure — neither a
 * test_execution block nor a metadata.measured key exists at all).
 *
 * Pure function, exported for direct unit testing without mocking the full gate's supabase calls.
 * Previously this resolved to `undefined` in the null case, which `=== false` never matches, so
 * the row silently fell through to "TESTING validation passed" (100/100) with zero evidence
 * backing it (database-agent finding, mandatory-testing-validation.js:304, 2026-09-02).
 * @param {{metadata?: {test_execution?: unknown, measured?: unknown}}} result
 * @returns {boolean|object|null}
 */
export function resolveMeasuredState(result) {
  const testExecution = result?.metadata?.test_execution;
  const hasMeasuredKey = result?.metadata?.measured !== undefined;
  if (testExecution !== undefined) return isMeasuredExecution(testExecution);
  return hasMeasuredKey ? result.metadata.measured : null;
}

/**
 * FR-3: Resolve test-runner exit info for WAIT classification.
 * Prefers executor-supplied ctx.testRunner = { exitCode, output|stderr|message };
 * falls back to the stored TESTING result row's exit fields (metadata.exit_code /
 * metadata.runner_output / details). Returns null when no runner info is available
 * (→ caller keeps the unchanged verdict-based FAIL).
 *
 * @param {Object} ctx
 * @param {Object} [testingRow] - The latest sub_agent_execution_results row.
 * @returns {{ exitCode:(number|null), message:string }|null}
 */
function resolveTestRunnerExit(ctx, testingRow) {
  const tr = ctx?.testRunner || ctx?.test_runner;
  if (tr && (tr.exitCode !== undefined || tr.exit_code !== undefined || tr.output || tr.stderr || tr.message)) {
    return {
      exitCode: tr.exitCode ?? tr.exit_code ?? null,
      message: String(tr.output || tr.stderr || tr.message || '')
    };
  }
  const md = testingRow?.metadata || testingRow?.details;
  if (md && (md.exit_code !== undefined || md.exitCode !== undefined || md.runner_output || md.output || md.stderr)) {
    return {
      exitCode: md.exit_code ?? md.exitCode ?? null,
      message: String(md.runner_output || md.output || md.stderr || '')
    };
  }
  return null;
}

/**
 * Detect code file changes in the current branch/working directory
 * Checks git diff for common code file extensions
 *
 * @returns {Object} { hasCodeFiles: boolean, codeFileCount: number, codeFiles: string[] }
 */
function detectCodeChanges() {
  const CODE_EXTENSIONS = /\.(js|ts|tsx|jsx|mjs|cjs|py|rb|go|rs|java|cs|php|sql)$/i;

  try {
    // Get list of modified files (staged + unstaged + recent commits)
    // Use git diff HEAD~10 to catch recent changes, fallback to just working tree
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-only HEAD~10 2>nul || git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch (e) {
      // Intentionally suppressed: Fallback to working tree changes
      console.debug('[MandatoryTestingValidation] git diff HEAD~10 suppressed:', e?.message || e);
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
      codeFiles: codeFiles.slice(0, 10) // Limit for logging
    };
  } catch (error) {
    // If git fails, assume there might be code changes (safer default)
    console.log(`   ⚠️  Git diff detection failed: ${error.message}`);
    return { hasCodeFiles: true, codeFileCount: 0, codeFiles: [] };
  }
}

/**
 * Create the MANDATORY_TESTING_VALIDATION gate validator
 *
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001 (FR-3): a non-passing TESTING verdict is
 * re-classified. An ENVIRONMENTAL test timeout returns WAIT (preserve retry
 * budget; re-check later); a REAL test failure returns FAIL (unchanged).
 *
 * WAIT-detection WHITELIST (RISK-2 — the ONLY signals that yield WAIT):
 *   - exit codes 124 (coreutils timeout), 137 (SIGKILL/OOM), 143 (SIGTERM)
 *   - vitest `--reporter=json` duration timeout / "Test timed out in <N>ms"
 *   - jest "Timeout - Async callback was not invoked"
 *   - playwright "Test timeout of <N>ms exceeded"
 * Everything else — assertion errors, AND user-thrown errors whose messages
 * merely contain the word "timeout" (e.g. "connection timeout") — is a REAL
 * failure → FAIL. We NEVER pattern-match arbitrary user error text for the word
 * "timeout"; misclassifying a real failure as environmental would let bad code
 * through, the worst outcome of this SD.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createMandatoryTestingValidationGate(supabase) {
  return {
    name: 'MANDATORY_TESTING_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🧪 MANDATORY TESTING VALIDATION (LEO v4.4.3)');
      console.log('-'.repeat(50));

      // 1. Get type-aware validation requirements (replaces hardcoded lists)
      // SD-LEO-TESTING-ENFORCEMENT-001: Dynamic validation based on sd_type
      const validationReqs = getValidationRequirements(ctx.sd);
      const sdType = validationReqs.sd_type;

      console.log(`   📋 SD Type: ${sdType}`);
      console.log(`   📋 requiresTesting (type-based): ${validationReqs.requiresTesting}`);
      console.log(`   📋 skipCodeValidation: ${validationReqs.skipCodeValidation}`);

      // 2. Detect actual code changes via git diff
      const codeEvidence = detectCodeChanges();
      console.log(`   📋 Code files detected: ${codeEvidence.hasCodeFiles} (${codeEvidence.codeFileCount} files)`);

      if (codeEvidence.codeFiles.length > 0) {
        console.log(`      Files: ${codeEvidence.codeFiles.slice(0, 5).join(', ')}${codeEvidence.codeFiles.length > 5 ? '...' : ''}`);
      }

      // 3. TIER: SKIP - truly non-code SD with no code changes
      // Only skip if type says skip AND no actual code files changed
      if (validationReqs.skipCodeValidation && !codeEvidence.hasCodeFiles) {
        console.log(`   ℹ️  ${sdType} type SD with no code changes - TESTING validation SKIPPED`);
        console.log('   → No code paths to test');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`TESTING skipped for ${sdType} type SD (no code changes detected)`],
          details: { skipped: true, reason: sdType, tier: 'SKIP' }
        };
      }

      // 4. Determine enforcement tier based on type + code evidence
      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-044: Check centralized policy for TESTING requirement
      // Types where policy says OPTIONAL (e.g., corrective) use advisory mode even if
      // sd-type-validation.js says requiresTesting=true (reconciles dual-system mismatch)
      const policyTestingReq = getValidatorRequirement(sdType, 'TESTING');
      const policyAllowsAdvisory = policyTestingReq === 'OPTIONAL' || policyTestingReq === 'NON_APPLICABLE';
      // REQUIRED: Type requires testing (feature, bugfix, security, etc.)
      // ADVISORY: Type doesn't require testing OR policy says OPTIONAL, BUT code changes detected
      const requiresTesting = (validationReqs.requiresTesting && !policyAllowsAdvisory) || codeEvidence.hasCodeFiles;
      const isAdvisoryMode = (!validationReqs.requiresTesting || policyAllowsAdvisory) && codeEvidence.hasCodeFiles;

      if (isAdvisoryMode) {
        console.log(`   ⚠️  ${sdType} SD type doesn't require TESTING but code changes detected`);
        console.log('   → ADVISORY mode: TESTING recommended but not blocking');
      }

      // 5. Query for TESTING sub-agent execution
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: testingResults, error } = await supabase
        .from('sub_agent_execution_results')
        .select('id, verdict, confidence, created_at, metadata')
        .eq('sd_id', sdUuid)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.log(`   ⚠️  Error checking TESTING execution: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Failed to verify TESTING execution: ${error.message}`],
          warnings: [],
          details: { tier: requiresTesting ? 'REQUIRED' : 'ADVISORY' }
        };
      }

      // 6. Validate execution exists
      if (!testingResults?.length) {
        // TIER: ADVISORY - non-blocking for infrastructure/orchestrator/database with code changes
        // SD-LEO-TESTING-ENFORCEMENT-001: Improved warning with code evidence
        if (isAdvisoryMode) {
          console.log(`   ⚠️  TESTING not executed for ${sdType} SD with code changes (ADVISORY MODE)`);
          console.log(`   → ${codeEvidence.codeFileCount} code file(s) detected but type doesn't require TESTING`);
          console.log('   → Consider running TESTING for test coverage validation');
          console.log('   → This is a warning, not a blocker');
          return {
            passed: true,
            score: 70,
            max_score: 100,
            issues: [],
            warnings: [
              `TESTING not executed for ${sdType} SD with ${codeEvidence.codeFileCount} code file(s)`,
              'Consider running TESTING sub-agent for test coverage validation'
            ],
            details: {
              advisory: true,
              reason: `${sdType} SD with code changes missing TESTING`,
              tier: 'ADVISORY',
              codeFileCount: codeEvidence.codeFileCount,
              codeFiles: codeEvidence.codeFiles
            }
          };
        }

        // TIER: REQUIRED - blocking for feature/bugfix/security types
        console.log(`   ❌ ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN for ${sdType} SDs`);
        console.log('\n   REMEDIATION:');
        console.log('   1. Run TESTING sub-agent before completing EXEC phase');
        console.log('   2. Command: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY ' + (ctx.sdId || sdUuid));
        console.log('   3. Ensure all E2E tests pass');
        console.log('   4. Re-run EXEC-TO-PLAN handoff');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN for ${sdType} SDs`],
          warnings: [],
          details: { tier: 'REQUIRED' }
        };
      }

      // 8. Validate verdict is acceptable
      const result = testingResults[0];
      console.log(`   📊 TESTING result found: ${result.verdict} (${result.confidence}% confidence)`);

      if (!['PASS', 'CONDITIONAL_PASS'].includes(result.verdict)) {
        // FR-3: re-classify the non-passing verdict. ENVIRONMENTAL timeout → WAIT
        // (preserve retry budget); everything else → FAIL (unchanged). WHITELIST
        // only (RISK-2): see createMandatoryTestingValidationGate JSDoc.
        const runnerExit = resolveTestRunnerExit(ctx, result);
        if (runnerExit) {
          const classification = classifyTestRunnerExit(runnerExit.exitCode, runnerExit.message);
          if (classification === 'timeout') {
            console.log(`   ⏳ WAIT: environmental test timeout (exit=${runnerExit.exitCode}) — not a real failure`);
            return buildWaitResult({
              score: 0,
              max_score: 100,
              wait_reason: `Environmental test timeout (exit code ${runnerExit.exitCode ?? 'n/a'}); re-running may succeed`,
              details: {
                reason: 'TEST_TIMEOUT',
                verdict: result.verdict,
                runner_exit_code: runnerExit.exitCode ?? null,
                classification
              },
              remediation: 'Re-run the test suite — the timeout appears environmental (CI slowness / OOM-kill), not a code defect. If it persists past the wait ceiling it will surface as a real failure.'
            });
          }
        }
        console.log(`   ❌ TESTING verdict ${result.verdict} - must pass`);
        return buildFailResult({
          score: 0,
          max_score: 100,
          issues: [`TESTING verdict ${result.verdict} - must be PASS or CONDITIONAL_PASS`],
          details: { verdict: result.verdict }
        });
      }

      // 9. Validate freshness (default 24h)
      const maxAgeHours = parseInt(process.env.LEO_TESTING_MAX_AGE_HOURS || '24');
      const ageHours = (Date.now() - new Date(result.created_at)) / 3600000;

      if (ageHours > maxAgeHours) {
        console.log(`   ⚠️  TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`);
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`],
          warnings: [],
          details: { tier: requiresTesting ? 'REQUIRED' : 'ADVISORY' }
        };
      }

      // 9b. SD-FDBK-INFRA-TESTING-SUB-AGENT-001: an unmeasured verdict (metadata.measured===false)
      // must never satisfy this gate identically to a genuinely measured PASS.
      // SC#6: prefer the structured field (source-agnostic — works for either writer path);
      // fall back to the ad-hoc boolean for rows written before test_execution existed.
      const measured = resolveMeasuredState(result);
      if (measured === false) {
        if (isAdvisoryMode) {
          // ADVISORY tier: same honest-but-non-blocking shape as the missing-row ADVISORY path
          // above — surfaced, not silently trusted, but this SD introduces no new blocking tier.
          console.log(`   ⚠️  TESTING verdict ${result.verdict} is UNMEASURED for ${sdType} SD (ADVISORY MODE)`);
          console.log('   → This is a warning, not a blocker');
          return {
            passed: true,
            score: 70,
            max_score: 100,
            issues: [],
            warnings: [`TESTING verdict ${result.verdict} for ${sdType} SD carries metadata.measured=false — no real test evidence backs it`],
            details: { advisory: true, reason: `${sdType} SD TESTING verdict is unmeasured`, tier: 'ADVISORY', measured: false }
          };
        }
        // REQUIRED tier: reuse the SAME ERR_TESTING_REQUIRED-class blocking path already used
        // for a missing row — an unmeasured row is absence of real evidence, not a new severity.
        console.log(`   ❌ ERR_TESTING_REQUIRED: TESTING verdict ${result.verdict} for ${sdType} SD carries metadata.measured=false (no real test evidence)`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`ERR_TESTING_REQUIRED: TESTING verdict ${result.verdict} carries metadata.measured=false — required tier needs measured test evidence, not an unmeasured verdict`],
          warnings: [],
          details: { tier: 'REQUIRED', measured: false }
        };
      }

      // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-3: `measured === null` means "checked, and
      // neither test_execution nor a metadata.measured key exists" -- distinct from `false`
      // (explicitly measured and found unmeasured). This is DELIBERATELY NEVER BLOCKING, in
      // EITHER tier -- flipping absence from warn to hard-reject is explicitly OUT OF SCOPE for
      // this SD (LEAD-narrowed scope; this migration's own comment: "would immediately break
      // ~27 evidence writes/day ... deliberately deferred"). RCA measurement (2026-09-02):
      // ~73% of TESTING rows in the gate's own <24h freshness window carry neither key, and many
      // of those DO carry real measurement facts under other key names (tests_run,
      // vitest_summary, primary_suite_tests_passed, ...) this check does not look at -- so the
      // warning below says "block absent", never "no evidence exists", which would be false.
      if (measured === null) {
        console.log(`   ⚠️  TESTING verdict ${result.verdict} for ${sdType} SD has no test_execution/measured key (never a blocker)`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`TESTING verdict ${result.verdict} for ${sdType} SD carries no test_execution block and no metadata.measured flag — this check cannot confirm measured evidence (other fields may still exist under different key names; presence-enforcement is explicitly out of scope for this SD)`],
          details: { advisory: true, reason: `${sdType} SD TESTING row has no test_execution/measured key`, tier: isAdvisoryMode ? 'ADVISORY' : 'REQUIRED', measured: null, verdict: result.verdict }
        };
      }

      // 10. TESTING validation passed
      console.log('   ✅ TESTING validation passed');
      console.log(`      Verdict: ${result.verdict}`);
      console.log(`      Age: ${ageHours.toFixed(1)}h (max ${maxAgeHours}h)`);
      console.log(`      Tier: ${requiresTesting ? 'REQUIRED' : 'ADVISORY'}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          verdict: result.verdict,
          confidence: result.confidence,
          age_hours: ageHours.toFixed(1),
          max_age_hours: maxAgeHours,
          tier: requiresTesting ? 'REQUIRED' : 'ADVISORY'
        }
      };
    },
    required: true
  };
}
