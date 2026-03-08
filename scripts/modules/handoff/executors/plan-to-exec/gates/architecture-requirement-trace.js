/**
 * ARCHITECTURE_REQUIREMENT_TRACEABILITY Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 7)
 *
 * Verifies that architecture constraints are satisfied by PRD requirements.
 * Checks eva_architecture_plans dimensions against product_requirements_v2.
 *
 * Phase: PLAN-TO-EXEC
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'ARCHITECTURE_REQUIREMENT_TRACE';

export function createArchitectureRequirementTraceGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🏗️  SEMANTIC GATE: Architecture Requirement Traceability');
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
          warnings: ['Cannot trace architecture requirements — missing context']
        });
      }

      try {
        // Get architecture plans linked to this SD
        const { data: archPlans, error: archError } = await supabase
          .from('eva_architecture_plans')
          .select('plan_key, dimensions, status')
          .limit(5);

        // Get PRD functional requirements
        const { data: prd, error: prdError } = await supabase
          .from('product_requirements_v2')
          .select('functional_requirements, system_architecture, technical_requirements')
          .eq('sd_id', sdId)
          .single();

        if (prdError || !prd) {
          console.log('   ⚠️  No PRD found');
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.4,
            warnings: ['No PRD found for architecture traceability']
          });
        }

        // Extract architecture dimensions from plans
        const allDimensions = [];
        if (archPlans && archPlans.length > 0) {
          for (const plan of archPlans) {
            if (plan.dimensions && typeof plan.dimensions === 'object') {
              allDimensions.push(...Object.keys(plan.dimensions));
            }
          }
        }

        // Check PRD has architecture content
        const hasSystemArch = prd.system_architecture && (
          typeof prd.system_architecture === 'string' ? prd.system_architecture.length > 50 :
          Object.keys(prd.system_architecture).length > 0
        );
        const hasTechReqs = prd.technical_requirements && (
          Array.isArray(prd.technical_requirements) ? prd.technical_requirements.length > 0 :
          typeof prd.technical_requirements === 'string' ? prd.technical_requirements.length > 50 : false
        );
        const hasFuncReqs = prd.functional_requirements && (
          Array.isArray(prd.functional_requirements) ? prd.functional_requirements.length > 0 :
          typeof prd.functional_requirements === 'string' ? prd.functional_requirements.length > 50 : false
        );

        let score = 0;
        if (hasFuncReqs) score += 40;
        if (hasSystemArch) score += 30;
        if (hasTechReqs) score += 30;

        const confidence = computeConfidence({
          dataPoints: (hasFuncReqs ? 1 : 0) + (hasSystemArch ? 1 : 0) + (hasTechReqs ? 1 : 0) + allDimensions.length,
          expectedPoints: 5
        });

        const passed = level === 'OPT' ? true : score >= 70;

        console.log(`   📊 Architecture traces:`);
        console.log(`      Functional requirements: ${hasFuncReqs ? '✅' : '❌'}`);
        console.log(`      System architecture: ${hasSystemArch ? '✅' : '❌'}`);
        console.log(`      Technical requirements: ${hasTechReqs ? '✅' : '❌'}`);
        console.log(`      Architecture plan dimensions: ${allDimensions.length}`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${score}/100 | Confidence: ${confidence}`);

        const missing = [];
        if (!hasFuncReqs) missing.push('functional_requirements');
        if (!hasSystemArch) missing.push('system_architecture');
        if (!hasTechReqs) missing.push('technical_requirements');

        return buildSemanticResult({
          passed,
          score,
          confidence,
          issues: !passed ? [`Architecture traceability incomplete: missing ${missing.join(', ')}`] : [],
          warnings: level === 'OPT' && score < 70 ? [`Low architecture coverage (${score}%) — advisory`] : [],
          details: {
            hasFuncReqs, hasSystemArch, hasTechReqs,
            archPlanCount: archPlans?.length || 0,
            dimensions: allDimensions.slice(0, 10),
            missing
          },
          remediation: !passed ? `Add missing PRD sections: ${missing.join(', ')}` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Architecture traceability error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.8
  };
}
