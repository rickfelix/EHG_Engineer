/**
 * Type-Aware Completion Validation
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-H
 *
 * Validates that an SD is properly completed based on its type-specific requirements:
 * - Whether UAT was executed (for types that require it)
 * - Whether human verification was performed (for types that require it)
 * - Whether E2E tests exist (for code-producing types)
 *
 * @module stop-subagent-enforcement/type-aware-validator
 */

import {
  getValidationRequirements,
  getUATRequirement
} from '../../../lib/utils/sd-type-validation.js';

/**
 * Validate type-specific completion requirements
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 */
export async function validateCompletionForType(supabase, sd, sdKey) {
  const requirements = getValidationRequirements(sd);
  const uatRequirement = getUATRequirement(sd.sd_type);

  const violations = [];
  const warnings = [];

  // 1. Check UAT execution for types that require it
  if (uatRequirement === 'REQUIRED' || requirements.requiresUATExecution) {
    const { data: uatRecords } = await supabase
      .from('uat_test_runs')
      .select('id, status, overall_result')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const hasPassingUAT = uatRecords?.some(r =>
      r.status === 'completed' && ['pass', 'partial_pass'].includes(r.overall_result)
    );

    if (!hasPassingUAT) {
      violations.push({
        type: 'UAT_MISSING',
        message: `SD type '${sd.sd_type}' requires UAT execution before completion`,
        requirement: uatRequirement,
        remediation: 'Run /uat to execute user acceptance testing'
      });
    }
  }

  // 2. Check human-verifiable outcome for types that require it
  if (requirements.requiresHumanVerifiableOutcome) {
    const { data: verificationRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'UAT')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasHumanVerification = verificationRecords?.some(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

    if (!hasHumanVerification) {
      warnings.push({
        type: 'HUMAN_VERIFICATION_MISSING',
        message: `SD type '${sd.sd_type}' recommends ${requirements.humanVerificationType} verification`,
        reason: requirements.humanVerificationReason
      });
    }
  }

  // 3. Check E2E tests for code-producing types
  if (requirements.requiresE2ETests) {
    const { data: e2eRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasPassingE2E = e2eRecords?.some(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

    if (!hasPassingE2E) {
      violations.push({
        type: 'E2E_TESTS_MISSING',
        message: `SD type '${sd.sd_type}' requires E2E tests before completion`,
        remediation: 'Run TESTING sub-agent to execute E2E tests'
      });
    }
  }

  // 4. Check LLM UX validation for types that require it
  if (requirements.requiresLLMUXValidation) {
    const { data: uxRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'DESIGN')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasPassingUX = uxRecords?.some(r => {
      if (!['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)) return false;
      const score = r.metadata?.ux_score || r.metadata?.score || 100;
      return score >= requirements.llmUxMinScore;
    });

    if (!hasPassingUX) {
      warnings.push({
        type: 'LLM_UX_VALIDATION_MISSING',
        message: `SD type '${sd.sd_type}' recommends LLM UX validation (min score: ${requirements.llmUxMinScore})`,
        lenses: requirements.llmUxRequiredLenses
      });
    }
  }

  // Output violations (BLOCK)
  if (violations.length > 0) {
    console.error(`\n⚠️  Type-Aware Completion Validation for ${sdKey}`);
    console.error(`   SD Type: ${sd.sd_type}`);
    console.error(`   UAT Requirement: ${uatRequirement}`);
    console.error('   ❌ BLOCKING VIOLATIONS:');
    violations.forEach(v => {
      console.error(`      - ${v.type}: ${v.message}`);
      if (v.remediation) console.error(`        Action: ${v.remediation}`);
    });

    if (warnings.length > 0) {
      console.error('   ⚠️  Additional warnings:');
      warnings.forEach(w => console.error(`      - ${w.type}: ${w.message}`));
    }

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sd.sd_type}) has type-specific completion violations`,
      details: {
        sd_key: sdKey,
        sd_type: sd.sd_type,
        uat_requirement: uatRequirement,
        violations: violations,
        warnings: warnings,
        requirements_summary: {
          requiresUAT: requirements.requiresUATExecution,
          requiresE2E: requirements.requiresE2ETests,
          requiresHumanVerification: requirements.requiresHumanVerifiableOutcome,
          requiresLLMUX: requirements.requiresLLMUXValidation
        }
      },
      remediation: {
        priority_actions: violations.map(v => v.remediation).filter(Boolean)
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Output warnings (non-blocking)
  if (warnings.length > 0) {
    console.error(`\n💡 Type-Aware Completion Advisory for ${sdKey}`);
    console.error(`   SD Type: ${sd.sd_type}`);
    warnings.forEach(w => console.error(`   - ${w.type}: ${w.message}`));
    console.error('   (Not blocking - these improve quality assurance)');
  } else {
    console.error(`✅ Type-Aware Completion: ${sdKey} (${sd.sd_type}) passed all type-specific checks`);
  }
}

// Re-export requirements functions for convenience
export { getValidationRequirements, getUATRequirement };
