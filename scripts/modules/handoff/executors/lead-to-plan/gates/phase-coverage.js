/**
 * ARCHITECTURE_PHASE_COVERAGE Semantic Gate
 * Part of SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001
 *
 * Validates that every implementation phase in an architecture plan
 * has a corresponding SD before LEAD-TO-PLAN passes.
 *
 * Phase: LEAD-TO-PLAN (blocking)
 */

import {
  validatePhaseCoverage,
  formatCoverageReport
} from '../../../validation/phase-coverage-validator.js';

import {
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'ARCHITECTURE_PHASE_COVERAGE';

export function createPhaseCoverageGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🏗️  GATE: Architecture Phase Coverage');
      console.log('-'.repeat(50));

      const sdId = ctx.sd?.id || ctx.sdId;
      const archKey = ctx.sd?.metadata?.arch_key || ctx.sd?.metadata?.architecture_plan_key;

      if (!archKey) {
        console.log('   ℹ️  No architecture plan linked — gate not applicable');
        return buildSkipResult(GATE_NAME, 'no_arch_key');
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot verify phase coverage — missing context']
        });
      }

      try {
        // Get architecture plan with sections
        const { data: plan, error: planError } = await supabase
          .from('eva_architecture_plans')
          .select('sections')
          .eq('plan_key', archKey)
          .single();

        if (planError || !plan) {
          console.log(`   ⚠️  Architecture plan '${archKey}' not found`);
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: [`Architecture plan '${archKey}' not found in database`]
          });
        }

        const phases = plan.sections?.implementation_phases;
        if (!phases || !Array.isArray(phases) || phases.length === 0) {
          console.log('   ℹ️  No structured phases in sections — gate not applicable');
          return buildSemanticResult({
            passed: true, score: 100, confidence: 0.5,
            warnings: ['Architecture plan has no structured phases in sections column']
          });
        }

        // Get all SDs linked to this architecture plan
        const { data: sds, error: sdsError } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, title, status, parent_sd_id')
          .or(`metadata->>arch_key.eq.${archKey},metadata->>architecture_plan_key.eq.${archKey}`);

        if (sdsError) {
          console.log(`   ⚠️  Error querying linked SDs: ${sdsError.message}`);
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: [`Error querying linked SDs: ${sdsError.message}`]
          });
        }

        const report = validatePhaseCoverage(phases, sds || []);
        console.log(formatCoverageReport(report));

        if (!report.passed) {
          const missingTitles = report.uncovered.map(u => u.phase.title).join(', ');
          return buildSemanticResult({
            passed: false,
            score: Math.round(report.coveragePercent),
            confidence: 1,
            issues: [`Architecture phase coverage incomplete: ${report.coveredCount}/${report.totalPhases} phases covered. Missing: ${missingTitles}`],
            details: {
              archKey,
              totalPhases: report.totalPhases,
              coveredCount: report.coveredCount,
              coveragePercent: report.coveragePercent,
              uncoveredPhases: report.uncovered.map(u => ({
                number: u.phase.number,
                title: u.phase.title,
                designation: u.phase.child_designation
              }))
            },
            remediation: `Create SDs for uncovered phases: ${missingTitles}. Then link them via metadata.arch_key = '${archKey}'.`
          });
        }

        return buildSemanticResult({
          passed: true,
          score: 100,
          confidence: 1,
          details: {
            archKey,
            totalPhases: report.totalPhases,
            coveredCount: report.coveredCount,
            coveragePercent: report.coveragePercent
          }
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Phase coverage verification error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.8
  };
}
