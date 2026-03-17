/**
 * SMOKE_TEST_VALIDATION Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 5)
 *
 * Verifies that smoke test steps reference real files and are executable.
 * Checks product_requirements_v2 test_scenarios for smoke test evidence.
 *
 * Phase: EXEC-TO-PLAN
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'SMOKE_TEST_VALIDATION';

export function createSmokeTestValidationGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🧪 SEMANTIC GATE: Smoke Test Validation');
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
          warnings: ['Cannot validate smoke tests — missing context']
        });
      }

      try {
        // Get PRD test scenarios
        const { data: prd, error } = await supabase
          .from('product_requirements_v2')
          .select('test_scenarios, exec_checklist')
          .eq('sd_id', sdId)
          .single();

        if (error || !prd) {
          console.log('   ⚠️  No PRD found');
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.4,
            warnings: ['No PRD found for smoke test validation']
          });
        }

        const scenarios = prd.test_scenarios || [];
        const execChecklist = prd.exec_checklist || [];

        if (scenarios.length === 0 && execChecklist.length === 0) {
          // Fallback: check SD smoke_test_steps before scoring 0
          let sdSmokeSteps = ctx.sd?.smoke_test_steps || [];
          if (sdSmokeSteps.length === 0 && supabase && sdId) {
            const { data: sdData } = await supabase
              .from('strategic_directives_v2')
              .select('smoke_test_steps')
              .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
              .limit(1)
              .single();
            sdSmokeSteps = sdData?.smoke_test_steps || [];
          }

          if (sdSmokeSteps.length > 0) {
            console.log(`   ℹ️  No PRD test scenarios, using ${sdSmokeSteps.length} SD smoke_test_steps as fallback`);
            return buildSemanticResult({
              passed: true, score: 60, confidence: 0.5,
              warnings: ['Using SD smoke_test_steps as fallback (no PRD test_scenarios)'],
              details: { source: 'sd_smoke_test_steps', count: sdSmokeSteps.length }
            });
          }

          console.log('   ⚠️  No test scenarios defined in PRD');
          return buildSemanticResult({
            passed: level === 'OPT',
            score: level === 'OPT' ? 50 : 0,
            confidence: 0.7,
            issues: level === 'REQ' ? ['No test scenarios defined in PRD'] : [],
            warnings: level === 'OPT' ? ['No test scenarios — optional for this SD type'] : [],
            remediation: 'Add test_scenarios to PRD with specific test steps'
          });
        }

        // Validate that scenarios have substantive content
        let validScenarios = 0;
        let totalScenarios = scenarios.length;
        const issues = [];

        for (const scenario of scenarios) {
          const desc = typeof scenario === 'string' ? scenario : scenario?.scenario || scenario?.description || scenario?.title || '';
          if (desc.length > 20) {
            validScenarios++;
          } else {
            issues.push(`Scenario too brief: "${desc}"`);
          }
        }

        const score = totalScenarios > 0 ? Math.round((validScenarios / totalScenarios) * 100) : 0;
        const confidence = computeConfidence({ dataPoints: totalScenarios, expectedPoints: 3 });
        const passed = level === 'OPT' ? true : score >= 70;

        console.log(`   📊 Scenarios: ${validScenarios}/${totalScenarios} valid`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${score}/100 | Confidence: ${confidence}`);

        return buildSemanticResult({
          passed,
          score,
          confidence,
          issues: !passed ? issues : [],
          warnings: level === 'OPT' && score < 70 ? [`Low smoke test coverage (${score}%) — advisory`] : [],
          details: {
            totalScenarios, validScenarios,
            hasExecChecklist: execChecklist.length > 0
          },
          remediation: !passed ? 'Add substantive test scenarios to PRD test_scenarios field' : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Smoke test validation error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.8
  };
}
