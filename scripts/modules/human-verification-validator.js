/**
 * Human Verification Validator
 * LEO Protocol v4.4.0 - Human-Verifiable Outcome Validation
 *
 * Purpose: Validates that SDs produce human-verifiable outcomes based on SD type.
 * Integrates with:
 *   - UAT Agent (Playwright MCP execution)
 *   - LLM UX Oracle (GPT-5.2 evaluation)
 *   - sd_type_validation_profiles (database configuration)
 *
 * Philosophy:
 *   "Every SD should have a smoke test that a non-technical person could run
 *    to verify it works. The current plan optimizes for completing SDs rather
 *    than delivering working software."
 *
 * @module human-verification-validator
 * @version 1.0.0
 * @created 2026-01-04
 */

import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { getValidationRequirements } from '../../lib/utils/sd-type-validation.js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase client - initialized lazily
let supabase = null;

/**
 * Human Verification Validator
 */
export class HumanVerificationValidator {
  constructor() {
    this.DEBUG = process.env.HUMAN_VERIFICATION_DEBUG === 'true';
  }

  /**
   * Initialize Supabase client
   */
  async initSupabase() {
    if (!supabase) {
      supabase = await createSupabaseServiceClient('engineer', { verbose: false });
    }
    return supabase;
  }

  /**
   * Main validation entry point
   * Called by handoff validators to check if SD passes human verification gate
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<Object>} Validation result
   */
  async validate(sdId) {
    await this.initSupabase();

    const logPrefix = `[HumanVerify:${sdId.substring(0, 8)}]`;
    if (this.DEBUG) console.log(`${logPrefix} Starting human verification validation...`);

    try {
      // Step 1: Load SD and validation profile
      const { sd, validationProfile, error } = await this.loadSDWithProfile(sdId);
      if (error) {
        return this.createResult(false, `Failed to load SD: ${error}`, { sdId });
      }

      // Step 2: Get validation requirements
      const requirements = getValidationRequirements(sd, validationProfile);

      if (this.DEBUG) {
        console.log(`${logPrefix} SD Type: ${sd.sd_type}`);
        console.log(`${logPrefix} Requires Human Verification: ${requirements.requiresHumanVerifiableOutcome}`);
        console.log(`${logPrefix} Verification Type: ${requirements.humanVerificationType}`);
      }

      // Step 3: If no human verification required, auto-pass
      if (!requirements.requiresHumanVerifiableOutcome) {
        return this.createResult(true, requirements.humanVerificationReason, {
          sdId,
          sdType: sd.sd_type,
          skipped: true
        });
      }

      // Step 4: Check current verification status
      const statusCheck = await this.checkVerificationStatus(sd, requirements);
      if (!statusCheck.shouldContinue) {
        return statusCheck.result;
      }

      // Step 5: Run type-specific verification
      let verificationResult;
      switch (requirements.humanVerificationType) {
        case 'ui_smoke_test':
          verificationResult = await this.validateUISmokeTest(sd, requirements);
          break;
        case 'api_test':
          verificationResult = await this.validateAPITest(sd, requirements);
          break;
        case 'cli_verification':
          verificationResult = await this.validateCLI(sd, requirements);
          break;
        default:
          verificationResult = this.createResult(true, 'No specific verification required', { skipped: true });
      }

      // Step 6: Update SD status based on result
      await this.updateVerificationStatus(sdId, verificationResult.passed ? 'passed' : 'failed');

      return verificationResult;

    } catch (error) {
      console.error(`${logPrefix} Validation error:`, error.message);
      return this.createResult(false, `Validation error: ${error.message}`, { sdId, error: error.message });
    }
  }

  /**
   * Load SD with its validation profile from database
   */
  async loadSDWithProfile(sdId) {
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select(`
        id, sd_key, title, sd_type, status, scope, description,
        smoke_test_steps, human_verification_status, llm_ux_score
      `)
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      return { error: sdError?.message || 'SD not found' };
    }

    // Load validation profile for this SD type
    const { data: profile, error: profileError } = await supabase
      .from('sd_type_validation_profiles')
      .select(`
        requires_human_verifiable_outcome,
        human_verification_type,
        requires_llm_ux_validation,
        llm_ux_min_score,
        llm_ux_required_lenses,
        requires_uat_execution,
        smoke_test_template
      `)
      .eq('sd_type', sd.sd_type || 'feature')
      .single();

    // Profile is optional - use defaults if not found
    const validationProfile = profile || null;

    return { sd, validationProfile };
  }

  /**
   * Check if verification has already been completed
   */
  async checkVerificationStatus(sd, requirements) {
    // Already passed - no need to re-verify
    if (sd.human_verification_status === 'passed') {
      // But still check LLM UX if required
      if (requirements.requiresLLMUXValidation) {
        if (sd.llm_ux_score === null) {
          return {
            shouldContinue: false,
            result: this.createResult(false, 'Human verification passed but LLM UX evaluation missing', {
              sdId: sd.id,
              humanVerificationPassed: true,
              llmUxMissing: true,
              actionRequired: 'Run LLM UX Oracle evaluation'
            })
          };
        }
        if (sd.llm_ux_score < requirements.llmUxMinScore) {
          return {
            shouldContinue: false,
            result: this.createResult(false, `LLM UX score (${sd.llm_ux_score}) below threshold (${requirements.llmUxMinScore})`, {
              sdId: sd.id,
              llmUxScore: sd.llm_ux_score,
              llmUxMinScore: requirements.llmUxMinScore,
              actionRequired: 'Improve UX and re-run LLM UX Oracle'
            })
          };
        }
      }

      return {
        shouldContinue: false,
        result: this.createResult(true, 'Human verification already completed', {
          sdId: sd.id,
          status: 'passed',
          llmUxScore: sd.llm_ux_score
        })
      };
    }

    // Failed previously - block until fixed
    if (sd.human_verification_status === 'failed') {
      return {
        shouldContinue: false,
        result: this.createResult(false, 'Human verification previously failed - fix required', {
          sdId: sd.id,
          status: 'failed',
          actionRequired: 'Fix issues and re-run UAT Agent'
        })
      };
    }

    // Pending or not started - continue with verification
    return { shouldContinue: true };
  }

  /**
   * Validate UI smoke test (for feature SDs)
   * Checks:
   *   1. Smoke test steps defined
   *   2. UAT Agent execution completed
   *   3. LLM UX Oracle score meets threshold (if required)
   *
   * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: For UAT-exempt SDs, accepts automated test evidence
   */
  async validateUISmokeTest(sd, requirements) {
    const issues = [];
    const warnings = [];

    // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Check if this SD is UAT-exempt
    const isUatExempt = requirements.uatExempt === true;

    // Check 1: Smoke test steps defined (skip for UAT-exempt SDs)
    const smokeTestSteps = sd.smoke_test_steps || [];
    if (!isUatExempt && smokeTestSteps.length === 0) {
      issues.push({
        type: 'missing_smoke_test_steps',
        message: 'No smoke test steps defined for this feature SD',
        actionRequired: 'Add smoke_test_steps to SD using template from sd_type_validation_profiles'
      });
    }

    // Check 2: Verification evidence
    // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Branch logic based on UAT exemption
    if (isUatExempt) {
      // For UAT-exempt SDs, check for automated test evidence instead
      if (requirements.acceptsAutomatedEvidence) {
        const automatedEvidence = await this.checkAutomatedTestEvidence(sd.id);

        // Log the decision as structured JSON (FR-4)
        const verificationDecision = {
          timestamp: new Date().toISOString(),
          sdId: sd.id,
          sdType: sd.sd_type,
          uatExempt: true,
          uatExemptReason: requirements.uatExemptReason,
          verificationMethod: 'automated_e2e_integration_tests',
          evidenceFound: automatedEvidence.found,
          evidenceType: 'automated_test'
        };

        if (this.DEBUG) {
          console.log('   📋 UAT Exemption Decision:', JSON.stringify(verificationDecision, null, 2));
        }

        if (!automatedEvidence.found) {
          issues.push({
            type: 'missing_automated_test_evidence',
            message: `UAT-exempt SD requires automated test evidence: ${automatedEvidence.reason || 'No passing test runs found'}`,
            errorCode: 'ERR_UAT_EXEMPT_NO_EVIDENCE',
            actionRequired: 'Run E2E or integration tests and ensure they pass',
            uatExempt: true,
            verificationDecision
          });
        } else if (!automatedEvidence.passed) {
          issues.push({
            type: 'automated_tests_failed',
            message: `Automated test evidence exists but tests failed (pass rate: ${automatedEvidence.passRate}%)`,
            errorCode: 'ERR_UAT_EXEMPT_TESTS_FAILED',
            evidence: automatedEvidence,
            verificationDecision
          });
        } else {
          // Success - log the evidence (FR-3)
          console.log('   ✅ UAT-exempt SD verified via automated tests');
          console.log(`      Test Run ID: ${automatedEvidence.testRunId}`);
          console.log(`      Pass Rate: ${automatedEvidence.passRate}%`);
          console.log(`      Commit SHA: ${automatedEvidence.commitSha || 'N/A'}`);
          console.log(`      CI URL: ${automatedEvidence.ciUrl || 'N/A'}`);

          // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Store evidence for handoff recording (FR-3)
          // This will be captured in createResult and flow to the handoff metadata
          warnings.push({
            type: 'uat_exempt_verified',
            message: `UAT-exempt SD verified via automated tests (pass rate: ${automatedEvidence.passRate}%)`,
            automatedTestEvidence: {
              testRunId: automatedEvidence.testRunId,
              verdict: automatedEvidence.verdict,
              passRate: automatedEvidence.passRate,
              totalTests: automatedEvidence.totalTests,
              passedTests: automatedEvidence.passedTests,
              failedTests: automatedEvidence.failedTests,
              testFramework: automatedEvidence.testFramework,
              commitSha: automatedEvidence.commitSha,
              ciUrl: automatedEvidence.ciUrl,
              storiesCovered: automatedEvidence.storiesCovered
            },
            verificationDecision
          });
        }
      }
    } else if (requirements.requiresUATExecution) {
      // Standard UAT requirement for non-exempt SDs
      const uatEvidence = await this.checkUATEvidence(sd.id);
      if (!uatEvidence.found) {
        issues.push({
          type: 'missing_uat_evidence',
          message: 'UAT Agent execution not found',
          actionRequired: 'Run UAT Agent to execute smoke tests via Playwright MCP'
        });
      } else if (!uatEvidence.passed) {
        issues.push({
          type: 'uat_failed',
          message: `UAT execution failed: ${uatEvidence.failureReason}`,
          evidence: uatEvidence
        });
      }
    }

    // Check 3: LLM UX Oracle score (if required)
    if (requirements.requiresLLMUXValidation) {
      if (sd.llm_ux_score === null) {
        issues.push({
          type: 'missing_llm_ux_evaluation',
          message: 'LLM UX Oracle evaluation not performed',
          requiredLenses: requirements.llmUxRequiredLenses,
          actionRequired: 'Run LLM UX Oracle with required lenses'
        });
      } else if (sd.llm_ux_score < requirements.llmUxMinScore) {
        issues.push({
          type: 'llm_ux_below_threshold',
          message: `LLM UX score (${sd.llm_ux_score}) below minimum (${requirements.llmUxMinScore})`,
          score: sd.llm_ux_score,
          minScore: requirements.llmUxMinScore,
          actionRequired: 'Improve UX based on LLM UX Oracle feedback'
        });
      }
    }

    // Determine pass/fail
    const passed = issues.length === 0;
    const reason = passed
      ? (isUatExempt ? 'UAT-exempt SD verification passed (automated tests)' : 'UI smoke test validation passed')
      : `UI smoke test failed with ${issues.length} issue(s)`;

    // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Extract automated test evidence from warnings for handoff recording (FR-3)
    const uatExemptWarning = warnings.find(w => w.type === 'uat_exempt_verified');
    const automatedTestEvidence = uatExemptWarning?.automatedTestEvidence || null;

    return this.createResult(passed, reason, {
      sdId: sd.id,
      sdType: sd.sd_type,
      verificationType: isUatExempt ? 'automated_e2e_integration' : 'ui_smoke_test',
      uatExempt: isUatExempt,
      uatExemptReason: isUatExempt ? requirements.uatExemptReason : null,
      // Include evidence for handoff metadata recording
      automatedTestEvidence: automatedTestEvidence,
      smokeTestStepsCount: smokeTestSteps.length,
      llmUxScore: sd.llm_ux_score,
      llmUxMinScore: requirements.llmUxMinScore,
      issues,
      warnings
    });
  }

  /**
   * Validate API test (for database/security/performance SDs)
   */
  async validateAPITest(sd, requirements) {
    const issues = [];

    // Check smoke test steps for API verification
    const smokeTestSteps = sd.smoke_test_steps || [];
    if (smokeTestSteps.length === 0) {
      issues.push({
        type: 'missing_smoke_test_steps',
        message: 'No API test steps defined',
        actionRequired: 'Add API verification steps to smoke_test_steps'
      });
    }

    // For database SDs, check migration evidence
    if (sd.sd_type === 'database') {
      // TODO: Check for migration success evidence
      // This could query leo_test_plans or migration logs
    }

    // For security SDs, check auth test evidence
    if (sd.sd_type === 'security') {
      // TODO: Check for security test evidence
      // This could verify RLS policy tests ran
    }

    const passed = issues.length === 0;
    return this.createResult(passed,
      passed ? 'API test validation passed' : `API test failed: ${issues.length} issue(s)`,
      { sdId: sd.id, verificationType: 'api_test', issues }
    );
  }

  /**
   * Validate CLI verification (for infrastructure SDs)
   * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Accept automated E2E/integration test evidence
   */
  async validateCLI(sd, requirements) {
    const issues = [];
    const warnings = [];

    // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Infrastructure SDs are verified via automated tests
    if (requirements.acceptsAutomatedEvidence) {
      const automatedEvidence = await this.checkAutomatedTestEvidence(sd.id);

      // Log the decision as structured JSON (FR-4)
      const verificationDecision = {
        timestamp: new Date().toISOString(),
        sdId: sd.id,
        sdType: sd.sd_type,
        uatExempt: true,
        uatExemptReason: requirements.uatExemptReason || 'Infrastructure SDs have no user-facing UI',
        verificationMethod: 'automated_e2e_integration_tests',
        evidenceFound: automatedEvidence.found,
        evidenceType: 'automated_test'
      };

      if (this.DEBUG) {
        console.log('   📋 Infrastructure Verification Decision:', JSON.stringify(verificationDecision, null, 2));
      }

      if (automatedEvidence.found && automatedEvidence.passed) {
        // Success - log the evidence (FR-3)
        console.log('   ✅ Infrastructure SD verified via automated tests');
        console.log(`      Test Run ID: ${automatedEvidence.testRunId}`);
        console.log(`      Pass Rate: ${automatedEvidence.passRate}%`);
        console.log(`      Framework: ${automatedEvidence.testFramework || 'N/A'}`);
        console.log(`      Commit SHA: ${automatedEvidence.commitSha || 'N/A'}`);
        console.log(`      CI URL: ${automatedEvidence.ciUrl || 'N/A'}`);

        // SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Include evidence in result for handoff recording (FR-3)
        return this.createResult(true, 'Infrastructure SD verified via automated tests', {
          sdId: sd.id,
          sdType: sd.sd_type,
          verificationType: 'cli_verification_automated',
          uatExempt: true,
          uatExemptReason: requirements.uatExemptReason,
          // Evidence for handoff metadata recording
          automatedTestEvidence: {
            testRunId: automatedEvidence.testRunId,
            verdict: automatedEvidence.verdict,
            passRate: automatedEvidence.passRate,
            totalTests: automatedEvidence.totalTests,
            passedTests: automatedEvidence.passedTests,
            failedTests: automatedEvidence.failedTests,
            testFramework: automatedEvidence.testFramework,
            commitSha: automatedEvidence.commitSha,
            ciUrl: automatedEvidence.ciUrl,
            storiesCovered: automatedEvidence.storiesCovered
          },
          verificationDecision
        });
      }

      if (automatedEvidence.found && !automatedEvidence.passed) {
        // Tests exist but failed
        issues.push({
          type: 'automated_tests_failed',
          message: `Infrastructure SD has failing automated tests (pass rate: ${automatedEvidence.passRate}%)`,
          errorCode: 'ERR_INFRA_TESTS_FAILED',
          evidence: automatedEvidence,
          actionRequired: 'Fix failing tests before handoff',
          verificationDecision
        });
      }

      // No evidence found - advisory warning only for infrastructure SDs
      if (!automatedEvidence.found) {
        warnings.push({
          type: 'no_automated_test_evidence',
          message: 'No automated test evidence found for infrastructure SD',
          suggestion: 'Consider adding E2E or integration tests for verification',
          verificationDecision
        });
      }
    }

    // Infrastructure SDs pass by default (advisory mode) but with warning if no evidence
    const passed = issues.length === 0;
    return this.createResult(passed,
      passed
        ? 'Infrastructure SD verification passed (automated tests optional)'
        : `Infrastructure SD verification failed: ${issues.length} issue(s)`,
      {
        sdId: sd.id,
        sdType: sd.sd_type,
        verificationType: 'cli_verification',
        uatExempt: true,
        uatExemptReason: requirements.uatExemptReason,
        issues,
        warnings
      }
    );
  }

  /**
   * Check for UAT Agent execution evidence
   */
  async checkUATEvidence(sdId) {
    // Check leo_test_plans for UAT evidence
    const { data: testPlans, error } = await supabase
      .from('leo_test_plans')
      .select('smoke_tests, updated_at')
      .eq('sd_id', sdId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !testPlans || testPlans.length === 0) {
      return { found: false };
    }

    const smokTests = testPlans[0].smoke_tests || [];
    if (smokTests.length === 0) {
      return { found: false };
    }

    // Check if all smoke tests passed
    const allPassed = smokTests.every(test => test.status === 'passed');
    const failedTests = smokTests.filter(test => test.status === 'failed');

    return {
      found: true,
      passed: allPassed,
      failureReason: failedTests.length > 0
        ? `${failedTests.length} smoke test(s) failed`
        : null,
      testsRun: smokTests.length,
      lastUpdated: testPlans[0].updated_at
    };
  }

  /**
   * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: Check for automated E2E/integration test evidence
   * Used as UAT verification for infrastructure and other UAT-exempt SDs
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<Object>} Automated test evidence result
   */
  async checkAutomatedTestEvidence(sdId) {
    // Query test_runs table for passing E2E or integration tests
    const { data: testRuns, error } = await supabase
      .from('test_runs')
      .select(`
        id, sd_id, verdict, pass_rate, total_tests, passed_tests, failed_tests,
        test_framework, commit_sha, ci_url, created_at, metadata
      `)
      .eq('sd_id', sdId)
      .in('verdict', ['PASS', 'CONDITIONAL_PASS'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log(`   ⚠️  Error checking automated test evidence: ${error.message}`);
      return {
        found: false,
        error: error.message,
        evidenceType: 'automated_test'
      };
    }

    if (!testRuns || testRuns.length === 0) {
      return {
        found: false,
        reason: 'No passing automated test runs found',
        evidenceType: 'automated_test'
      };
    }

    // Get the most recent passing test run
    const latestRun = testRuns[0];
    const hasCommitSha = !!latestRun.commit_sha;
    const hasCiUrl = !!latestRun.ci_url;

    // Also check story_test_mappings for test coverage evidence
    const { data: testMappings, error: mappingError } = await supabase
      .from('story_test_mappings')
      .select('story_id, test_status, tested_at')
      .eq('sd_id', sdId)
      .eq('test_status', 'passed')
      .order('tested_at', { ascending: false })
      .limit(10);

    const storiesCovered = testMappings?.length || 0;

    return {
      found: true,
      passed: latestRun.verdict === 'PASS' || latestRun.verdict === 'CONDITIONAL_PASS',
      evidenceType: 'automated_test',
      testRunId: latestRun.id,
      verdict: latestRun.verdict,
      passRate: latestRun.pass_rate,
      totalTests: latestRun.total_tests,
      passedTests: latestRun.passed_tests,
      failedTests: latestRun.failed_tests,
      testFramework: latestRun.test_framework,
      commitSha: latestRun.commit_sha,
      ciUrl: latestRun.ci_url,
      hasCommitSha,
      hasCiUrl,
      storiesCovered,
      lastUpdated: latestRun.created_at,
      metadata: latestRun.metadata
    };
  }

  /**
   * Update SD's human verification status
   */
  async updateVerificationStatus(sdId, status) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ human_verification_status: status })
      .eq('id', sdId);

    if (error) {
      console.error(`Failed to update verification status for ${sdId}:`, error.message);
    }
  }

  /**
   * Create standardized result object
   */
  createResult(passed, reason, details = {}) {
    return {
      passed,
      reason,
      timestamp: new Date().toISOString(),
      validator: 'HumanVerificationValidator',
      version: '1.0.0',
      ...details
    };
  }

  /**
   * Generate smoke test steps from template and SD context
   * Called during SD creation/update to populate smoke_test_steps
   */
  async generateSmokeTestSteps(sdId) {
    await this.initSupabase();

    // Load SD and its validation profile
    const { sd, validationProfile, error } = await this.loadSDWithProfile(sdId);
    if (error) {
      return { error };
    }

    // Get template from profile
    const template = validationProfile?.smoke_test_template || [];
    if (template.length === 0) {
      return { steps: [], message: 'No smoke test template for this SD type' };
    }

    // Extract context from SD for template substitution
    const context = this.extractSDContext(sd);

    // Generate steps by substituting context into template
    const steps = template.map(templateStep => ({
      step_number: templateStep.step_number,
      instruction: this.substituteTemplate(templateStep.instruction_template, context),
      expected_outcome: this.substituteTemplate(templateStep.expected_outcome_template, context),
      evidence_url: null,  // To be filled during UAT execution
      status: 'pending'
    }));

    // Update SD with generated steps
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        smoke_test_steps: steps,
        human_verification_status: 'pending'
      })
      .eq('id', sdId);

    if (updateError) {
      return { error: updateError.message };
    }

    return { steps, generated: true };
  }

  /**
   * Extract context variables from SD for template substitution
   */
  extractSDContext(sd) {
    // Extract feature URL from scope/description
    const urlMatch = (sd.scope || sd.description || '').match(/\/[\w-/]+/);
    const featureUrl = urlMatch ? urlMatch[0] : '/dashboard';

    // Extract primary action from scope
    const actionMatch = (sd.scope || '').match(/(create|update|delete|view|submit|navigate|configure)\s+(\w+)/i);
    const primaryAction = actionMatch
      ? `${actionMatch[1]} ${actionMatch[2]}`
      : 'interact with the feature';

    return {
      feature_url: featureUrl,
      primary_action: primaryAction,
      sd_title: sd.title,
      sd_type: sd.sd_type
    };
  }

  /**
   * Substitute template variables with context values
   */
  substituteTemplate(template, context) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => context[key] || match);
  }
}

/**
 * Convenience function for handoff validators
 */
export async function validateHumanVerification(sdId) {
  const validator = new HumanVerificationValidator();
  return validator.validate(sdId);
}

/**
 * Convenience function for generating smoke test steps
 */
export async function generateSmokeTestSteps(sdId) {
  const validator = new HumanVerificationValidator();
  return validator.generateSmokeTestSteps(sdId);
}

// CLI interface for testing
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node human-verification-validator.js <SD-ID>');
    console.log('       node human-verification-validator.js --generate <SD-ID>');
    process.exit(1);
  }

  if (args[0] === '--generate' && args[1]) {
    console.log(`\nGenerating smoke test steps for ${args[1]}...`);
    const result = await generateSmokeTestSteps(args[1]);
    console.log('\nResult:', JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  }

  console.log(`\nValidating human verification for ${args[0]}...`);
  const result = await validateHumanVerification(args[0]);
  console.log('\nResult:', JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

// Execute if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default HumanVerificationValidator;
