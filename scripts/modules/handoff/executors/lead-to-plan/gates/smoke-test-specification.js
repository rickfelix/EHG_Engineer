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

import { isLightweightSDType, detectCodeProduction } from '../../../validation/sd-type-applicability-policy.js';
import { safeTruncate } from '../../../../../../lib/utils/safe-truncate.js';
import { isAllPlaceholderSmokeSteps } from '../../../smoke-test-defaults.js';

/** Parse a smoke_test_steps value that may be a JSONB array or a TEXT-column JSON string. */
function parseStepsValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch (e) { console.debug('[SmokeTestSpec] JSON parse suppressed:', e?.message || e); return []; }
  }
  return [];
}

/**
 * Resolve smoke test steps with a metadata fallback.
 *
 * SD-FDBK-FIX-FIX-SMOKE-TEST-001: the canonical location is the TOP-LEVEL
 * strategic_directives_v2.smoke_test_steps column, but workers remediating a
 * gate failure historically wrote metadata.smoke_test_steps (the failure
 * message never named the column — ~20 gate fails/7d). Prefer top-level;
 * fall back to metadata and report the source so the caller can warn + hoist.
 *
 * @param {Object} sd - Strategic Directive
 * @returns {{steps: Array, source: 'top_level'|'metadata'|'none'}}
 */
export function resolveSmokeTestSteps(sd) {
  const topLevel = parseStepsValue(sd.smoke_test_steps);
  if (topLevel.length > 0) return { steps: topLevel, source: 'top_level' };
  const fromMetadata = parseStepsValue(sd.metadata?.smoke_test_steps);
  if (fromMetadata.length > 0) return { steps: fromMetadata, source: 'metadata' };
  return { steps: [], source: 'none' };
}

/**
 * Hoist metadata-stranded steps into the canonical top-level column.
 * Idempotent and guarded: pre-reads the live row and writes ONLY when the
 * live top-level column is still empty. Fail-open — a write error never
 * blocks validation (the steps already validated from the fallback read).
 */
async function hoistStepsToTopLevel(supabase, sd, steps) {
  const filterCol = sd.id ? 'id' : 'sd_key';
  const filterVal = sd.id || sd.sd_key;
  if (!filterVal) return { hoisted: false, reason: 'no id/sd_key on SD object' };
  try {
    const { data: live, error: readErr } = await supabase
      .from('strategic_directives_v2')
      .select('smoke_test_steps')
      .eq(filterCol, filterVal)
      .maybeSingle();
    if (readErr) return { hoisted: false, reason: readErr.message };
    if (parseStepsValue(live?.smoke_test_steps).length > 0) {
      return { hoisted: false, reason: 'live top-level column already populated' };
    }
    const { error: writeErr } = await supabase
      .from('strategic_directives_v2')
      .update({ smoke_test_steps: steps })
      .eq(filterCol, filterVal);
    if (writeErr) return { hoisted: false, reason: writeErr.message };
    return { hoisted: true };
  } catch (e) {
    return { hoisted: false, reason: e?.message || String(e) };
  }
}

/**
 * Validate smoke test specification
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} [supabase] - Optional client enabling the metadata→top-level hoist
 * @returns {Object} Validation result
 */
export async function validateSmokeTestSpecification(sd, supabase) {
  const sdType = (sd.sd_type || 'feature').toLowerCase();

  // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
  // SD-LEO-INFRA-ENFORCE-EXECUTION-SMOKE-001: Check if infrastructure SD produces code
  if (isLightweightSDType(sdType)) {
    // For infrastructure SDs, check if they produce code before auto-skipping
    if (sdType === 'infrastructure') {
      const detection = detectCodeProduction(sd);
      console.log(`   ℹ️  SD Type: infrastructure — code production check: ${detection.producesCode ? 'YES' : 'NO'}`);
      console.log(`   ℹ️  Reason: ${detection.reason}`);

      if (detection.producesCode) {
        console.log('   ⚠️  Code-producing infrastructure SD — smoke test specification REQUIRED');
        // Fall through to the normal validation below (do NOT return early)
      } else {
        console.log('   ℹ️  Non-code infrastructure SD — smoke test specification not required');
        return {
          pass: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Smoke test skipped for non-code infrastructure SD'],
          details: { skipped: true, reason: 'non-code infrastructure SD exempt', codeDetection: detection }
        };
      }
    } else {
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
  }

  console.log(`   SD Type: ${sdType} - smoke test specification REQUIRED`);

  // Check if smoke_test_steps exists and is valid.
  // SD-FDBK-FIX-FIX-SMOKE-TEST-001: resolve with metadata fallback — the gate
  // reads the TOP-LEVEL column, but steps stranded in metadata.smoke_test_steps
  // are recovered (warn + hoist) instead of failing generically.
  const { steps: smokeTestSteps, source: stepsSource } = resolveSmokeTestSteps(sd);
  const stepCount = smokeTestSteps.length;

  console.log(`   Smoke test steps: ${stepCount} defined${stepsSource === 'metadata' ? ' (in metadata.smoke_test_steps — see warning)' : ''}`);

  const sourceWarnings = [];
  if (stepsSource === 'metadata') {
    console.log('   ⚠️  Steps found in metadata.smoke_test_steps — the canonical location is the TOP-LEVEL strategic_directives_v2.smoke_test_steps column.');
    if (supabase) {
      const hoist = await hoistStepsToTopLevel(supabase, sd, smokeTestSteps);
      if (hoist.hoisted) {
        console.log('   ✅ Auto-hoisted steps into the top-level strategic_directives_v2.smoke_test_steps column.');
        sourceWarnings.push('smoke_test_steps were auto-hoisted from metadata.smoke_test_steps into the canonical top-level column');
      } else {
        console.log(`   ⚠️  Auto-hoist skipped (${hoist.reason}) — move them manually to the top-level column.`);
        sourceWarnings.push(`smoke_test_steps read from metadata.smoke_test_steps (hoist skipped: ${hoist.reason}) — write future steps to the top-level strategic_directives_v2.smoke_test_steps column`);
      }
    } else {
      sourceWarnings.push('smoke_test_steps read from metadata.smoke_test_steps — move them to the top-level strategic_directives_v2.smoke_test_steps column (no DB client available for auto-hoist)');
    }
  }

  if (stepCount === 0) {
    console.log('   ❌ BLOCKING: No smoke test steps defined');
    console.log('\n   LEAD Question 9: "Describe the 30-second demo that proves this SD delivered value."');
    console.log('   If you cannot answer this question, the SD is too vague.\n');
    console.log('   Required: Add smoke_test_steps (3-5 user-observable steps) to the TOP-LEVEL');
    console.log('   strategic_directives_v2.smoke_test_steps column — NOT metadata.smoke_test_steps.');
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
        'BLOCKING: Feature SD requires smoke_test_steps for LEAD approval — write them to the top-level strategic_directives_v2.smoke_test_steps column (NOT metadata.smoke_test_steps)',
        'Answer LEAD Q9: "Describe the 30-second demo that proves this SD delivered value"'
      ],
      warnings: [],
      remediation: 'Add a smoke_test_steps JSONB array with 3-5 user-observable verification steps to the top-level strategic_directives_v2.smoke_test_steps column (NOT metadata.smoke_test_steps)'
    };
  }

  // Validate step quality
  const issues = [];
  const warnings = [...sourceWarnings];

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
      console.log(`   ✅ Step ${step.step_number || validSteps}: ${safeTruncate(hasInstruction, 50)}...`);
    } else {
      warnings.push(`Step ${step.step_number || '?'} missing instruction or expected_outcome`);
    }
  }

  if (validSteps === 0) {
    issues.push('No valid smoke test steps (each must have instruction and expected_outcome)');
  }

  // QF-20260529-985: a code-producing SD reaching here must NOT pass on the generic
  // auto-generated placeholder (buildDefaultSmokeTestSteps). Require a real LEAD Q9
  // 30-second demo. (Lightweight / non-code SDs already returned above.)
  if (isAllPlaceholderSmokeSteps(smokeTestSteps)) {
    issues.push('Smoke test steps are the generic auto-generated placeholder — replace with a real 30-second demo (LEAD Q9): a concrete instruction + observable expected_outcome per step');
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
  } catch (e) {
    // Intentionally suppressed: AI validation optional
    console.debug('[SmokeTestSpec] AI validation suppressed:', e?.message || e);
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
      stepsSource,
      aiValidation: aiValidation?.isConcreteEnough ?? null
    }
  };
}

/**
 * Create the smoke test specification gate
 *
 * @param {Object} [supabase] - Optional client enabling the metadata→top-level
 *   auto-hoist (SD-FDBK-FIX-FIX-SMOKE-TEST-001). Omitted => pure validation.
 * @returns {Object} Gate configuration
 */
export function createSmokeTestSpecificationGate(supabase) {
  return {
    name: 'SMOKE_TEST_SPECIFICATION',
    validator: async (ctx) => {
      console.log('\n👤 GATE: Smoke Test Specification (LEO v4.4.0)');
      console.log('-'.repeat(50));
      return validateSmokeTestSpecification(ctx.sd, supabase);
    },
    required: true,
    remediation: 'Add a smoke_test_steps array with 3-5 user-observable verification steps to the TOP-LEVEL strategic_directives_v2.smoke_test_steps column (NOT metadata.smoke_test_steps). Example: [{step_number: 1, instruction: "Navigate to /dashboard", expected_outcome: "Dashboard loads with venture list visible"}]'
  };
}
