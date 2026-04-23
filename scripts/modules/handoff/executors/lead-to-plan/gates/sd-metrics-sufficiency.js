/**
 * SD Metrics Sufficiency Gate for LEAD-TO-PLAN
 *
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 1:
 *   Promotes the minimumMetrics + dedup check from the LEAD-TO-PLAN
 *   VERIFIER into a named GATE so handoff.js precheck runs it too.
 *
 *   Previously the verifier ran only during execute, so precheck could
 *   report PASS while execute returned FAIL on the same SD — observed
 *   during ORCH-001-A on 2026-04-22 (precheck 94% → execute SD_INCOMPLETE).
 *
 *   Gate delegates to validateMetricsSufficiency() in sd-validation.js,
 *   which is the canonical implementation (also called by the verifier).
 *
 * BLOCKING when metrics-sufficiency fails (issues non-empty).
 */

import { validateMetricsSufficiency, SD_REQUIREMENTS } from '../../../verifiers/lead-to-plan/sd-validation.js';

/**
 * Validate SD has sufficient unique success_metrics or success_criteria.
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Gate result (pass, score, max_score, issues, warnings, details)
 */
export async function validateSdMetricsSufficiency(sd) {
  const result = validateMetricsSufficiency(sd);

  const score = result.pass
    ? (result.warnings.length > 0 ? 90 : 100)
    : 0;

  return {
    pass: result.pass,
    score,
    max_score: 100,
    issues: result.issues,
    warnings: result.warnings,
    details: {
      uniqueCount: result.uniqueCount,
      originalCount: result.originalCount,
      collapsedCount: result.collapsedCount,
      minimumMetrics: SD_REQUIREMENTS.minimumMetrics
    }
  };
}

/**
 * Create the SD Metrics Sufficiency gate.
 */
export function createSdMetricsSufficiencyGate() {
  return {
    name: 'GATE_SD_METRICS_SUFFICIENCY',
    validator: async (ctx) => {
      console.log('\n📏 GATE: SD Metrics Sufficiency (precheck/execute parity)');
      console.log('-'.repeat(50));
      const result = await validateSdMetricsSufficiency(ctx.sd);
      const uc = result.details.uniqueCount;
      const tot = result.details.originalCount;
      const min = result.details.minimumMetrics;
      if (result.pass) {
        console.log(`   ✅ ${uc}/${min} unique metrics (${tot} total entries)`);
        if (result.details.collapsedCount > 0) {
          console.log(`   ℹ️  ${result.details.collapsedCount} duplicate(s) collapsed — check SD metadata if this was unintentional`);
        }
      } else {
        console.log(`   ❌ ${uc}/${min} unique metrics (${tot} total entries)`);
      }
      return result;
    },
    required: true,
    remediation: 'Add distinct success_metrics entries (each with metric, target, and measurement identity fields). The minimumMetrics threshold is ' + SD_REQUIREMENTS.minimumMetrics + '. Literal-duplicate entries are collapsed before the count.'
  };
}
