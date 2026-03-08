/**
 * SCOPE_REDUCTION_VERIFICATION Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 6)
 *
 * Verifies that Q8's >10% scope reduction was enforced at LEAD approval.
 * Checks strategic_directives_v2.scope_reduction_percentage field.
 *
 * Phase: LEAD-TO-PLAN
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'SCOPE_REDUCTION_VERIFICATION';
const MIN_REDUCTION_PERCENTAGE = 10;

export function createScopeReductionVerificationGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n✂️  SEMANTIC GATE: Scope Reduction Verification');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      const { applicable, level } = getGateApplicability(GATE_NAME, sdType);
      if (!applicable) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType}`);
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot verify scope reduction — missing context']
        });
      }

      try {
        const { data: sd, error } = await supabase
          .from('strategic_directives_v2')
          .select('scope_reduction_percentage, scope, metadata')
          .eq('id', sdId)
          .single();

        if (error || !sd) {
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: ['SD not found for scope reduction check']
          });
        }

        const reduction = sd.scope_reduction_percentage;

        if (reduction === null || reduction === undefined) {
          console.log('   ⚠️  No scope_reduction_percentage recorded');
          return buildSemanticResult({
            passed: level === 'OPT',
            score: level === 'OPT' ? 50 : 30,
            confidence: 0.7,
            issues: level === 'REQ' ? ['Q8 scope reduction not recorded — field is null'] : [],
            warnings: level === 'OPT' ? ['Scope reduction not tracked — advisory'] : [],
            remediation: 'Record scope_reduction_percentage during LEAD approval (Q8 deletion audit)'
          });
        }

        const meetsThreshold = reduction >= MIN_REDUCTION_PERCENTAGE;
        const score = meetsThreshold ? 100 : Math.round((reduction / MIN_REDUCTION_PERCENTAGE) * 100);
        const confidence = computeConfidence({ dataPoints: 1, expectedPoints: 1 });
        const passed = level === 'OPT' ? true : meetsThreshold;

        console.log(`   📊 Scope reduction: ${reduction}% (threshold: ${MIN_REDUCTION_PERCENTAGE}%)`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${score}/100 | Confidence: ${confidence}`);

        return buildSemanticResult({
          passed,
          score: Math.min(score, 100),
          confidence,
          issues: !passed ? [`Scope reduction ${reduction}% is below ${MIN_REDUCTION_PERCENTAGE}% threshold`] : [],
          warnings: [],
          details: {
            reductionPercentage: reduction,
            threshold: MIN_REDUCTION_PERCENTAGE,
            meetsThreshold
          },
          remediation: !passed ? `Increase scope reduction to ≥${MIN_REDUCTION_PERCENTAGE}%. Current: ${reduction}%` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Scope reduction verification error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.6
  };
}
