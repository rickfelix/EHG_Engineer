/**
 * Smoke Test Specification Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * LEO v4.4.0: "Describe the 30-second demo that proves this SD delivered value."
 * If you can't answer this at LEAD, the SD is too vague.
 *
 * BLOCKS feature SDs without smoke_test_steps
 * SKIPS for infrastructure/documentation/orchestrator SDs
 *
 * SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
 */

import { isLightweightSDType } from '../../../validation/sd-type-applicability-policy.js';

/**
 * Validate smoke test specification
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Validation result
 */
export async function validateSmokeTestSpecification(sd) {
  const sdType = (sd.sd_type || 'feature').toLowerCase();

  // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
  if (isLightweightSDType(sdType)) {
    console.log(`   ℹ️  SD Type: ${sdType} - smoke test specification not required`);
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [`Smoke test skipped for ${sdType} SD type`],
      details: { skipped: true, reason: `${sdType} SD type exempt` }
    };
  }

  console.log(`   SD Type: ${sdType} - smoke test specification REQUIRED`);

  // Check if smoke_test_steps exists and is valid
  const smokeTestSteps = sd.smoke_test_steps || [];
  const isArray = Array.isArray(smokeTestSteps);
  const stepCount = isArray ? smokeTestSteps.length : 0;

  console.log(`   Smoke test steps: ${stepCount} defined`);

  if (stepCount === 0) {
    console.log('   ❌ BLOCKING: No smoke test steps defined');
    console.log('\n   LEAD Question 9: "Describe the 30-second demo that proves this SD delivered value."');
    console.log('   If you cannot answer this question, the SD is too vague.\n');
    console.log('   Required: Add smoke_test_steps array with 3-5 user-observable steps');
    console.log('   Example:');
    console.log('   [');
    console.log('     { "step_number": 1, "instruction": "Navigate to /dashboard", "expected_outcome": "Dashboard loads with venture list" },');
    console.log('     { "step_number": 2, "instruction": "Click Create Venture button", "expected_outcome": "New venture form appears" },');
    console.log('     { "step_number": 3, "instruction": "Fill form and click Save", "expected_outcome": "Success toast + venture in list" }');
    console.log('   ]');

    return {
      pass: false,
      score: 0,
      max_score: 100,
      issues: [
        'BLOCKING: Feature SD requires smoke_test_steps for LEAD approval',
        'Answer LEAD Q9: "Describe the 30-second demo that proves this SD delivered value"'
      ],
      warnings: [],
      remediation: 'Add smoke_test_steps JSONB array with 3-5 user-observable verification steps'
    };
  }

  // Validate step quality
  const issues = [];
  const warnings = [];

  if (stepCount < 3) {
    warnings.push(`Only ${stepCount} smoke test steps - recommend 3-5 for comprehensive verification`);
  }

  // Check each step has required fields
  let validSteps = 0;
  for (const step of smokeTestSteps) {
    const hasInstruction = step.instruction || step.instruction_template;
    const hasOutcome = step.expected_outcome || step.expected_outcome_template;

    if (hasInstruction && hasOutcome) {
      validSteps++;
      console.log(`   ✅ Step ${step.step_number || validSteps}: ${(hasInstruction).substring(0, 50)}...`);
    } else {
      warnings.push(`Step ${step.step_number || '?'} missing instruction or expected_outcome`);
    }
  }

  if (validSteps === 0) {
    issues.push('No valid smoke test steps (each must have instruction and expected_outcome)');
  }

  // Use GPT-5 Mini to validate smoke test is concrete (if available)
  let aiValidation = null;
  try {
    const { validateSmokeTestQuality } = await import('../../../../human-verification-validator.js').catch(() => ({}));
    if (validateSmokeTestQuality) {
      aiValidation = await validateSmokeTestQuality(smokeTestSteps, sd);
      if (aiValidation && !aiValidation.isConcreteEnough) {
        warnings.push(`AI review: ${aiValidation.feedback || 'Smoke test steps may be too vague'}`);
      }
    }
  } catch {
    // AI validation optional - continue without it
  }

  const passed = issues.length === 0;
  const score = passed ? (warnings.length > 0 ? 85 : 100) : 0;

  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'} (${validSteps}/${stepCount} valid steps)`);

  return {
    pass: passed,
    score,
    max_score: 100,
    issues,
    warnings,
    details: {
      stepCount,
      validSteps,
      aiValidation: aiValidation?.isConcreteEnough ?? null
    }
  };
}

/**
 * Create the smoke test specification gate
 *
 * @returns {Object} Gate configuration
 */
export function createSmokeTestSpecificationGate() {
  return {
    name: 'SMOKE_TEST_SPECIFICATION',
    validator: async (ctx) => {
      console.log('\n👤 GATE: Smoke Test Specification (LEO v4.4.0)');
      console.log('-'.repeat(50));
      return validateSmokeTestSpecification(ctx.sd);
    },
    required: true,
    remediation: 'Add smoke_test_steps array with 3-5 user-observable verification steps. Example: [{step_number: 1, instruction: "Navigate to /dashboard", expected_outcome: "Dashboard loads with venture list visible"}]'
  };
}
