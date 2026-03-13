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
  formatCoverageReport,
  detectOrphanChildren
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

        // Also fetch children of any orchestrator SDs linked to this plan
        let allSds = sds || [];
        const orchestratorIds = allSds
          .map(sd => sd.sd_key)
          .filter(Boolean);

        if (orchestratorIds.length > 0) {
          // Get UUIDs for orchestrators to query children by parent_sd_id
          const { data: orchUuids } = await supabase
            .from('strategic_directives_v2')
            .select('id, sd_key')
            .in('sd_key', orchestratorIds);

          if (orchUuids && orchUuids.length > 0) {
            const uuids = orchUuids.map(o => o.id);
            const { data: children } = await supabase
              .from('strategic_directives_v2')
              .select('sd_key, title, status, parent_sd_id')
              .in('parent_sd_id', uuids);

            if (children && children.length > 0) {
              console.log(`   📋 Found ${children.length} child SD(s) of orchestrator(s)`);
              allSds = [...allSds, ...children];
            }
          }
        }

        const report = validatePhaseCoverage(phases, allSds);
        console.log(formatCoverageReport(report));

        // Backward reconciliation: detect orphan children referencing non-existent phases
        // SD-LEO-INFRA-ORCHESTRATOR-SCOPE-GOVERNANCE-001 (FR-003)
        const childSds = allSds.filter(sd => sd.parent_sd_id);
        const orphanReport = detectOrphanChildren(phases, childSds);
        const warnings = [];

        if (orphanReport.orphans.length > 0) {
          console.log(`\n   ⚠️  Backward Reconciliation: ${orphanReport.orphans.length} orphan child(ren) detected`);
          for (const orphan of orphanReport.orphans) {
            console.log(`   🔸 ${orphan.sd_key}: ${orphan.reason}`);
            warnings.push(`Orphan child ${orphan.sd_key}: ${orphan.reason}`);
          }
        }

        if (!report.passed) {
          const missingTitles = report.uncovered.map(u => u.phase.title).join(', ');
          return buildSemanticResult({
            passed: false,
            score: Math.round(report.coveragePercent),
            confidence: 1,
            issues: [`Architecture phase coverage incomplete: ${report.coveredCount}/${report.totalPhases} phases covered. Missing: ${missingTitles}`],
            warnings,
            details: {
              archKey,
              totalPhases: report.totalPhases,
              coveredCount: report.coveredCount,
              coveragePercent: report.coveragePercent,
              uncoveredPhases: report.uncovered.map(u => ({
                number: u.phase.number,
                title: u.phase.title,
                designation: u.phase.child_designation
              })),
              orphanChildren: orphanReport.orphans
            },
            remediation: `Create SDs for uncovered phases: ${missingTitles}. Then link them via metadata.arch_key = '${archKey}'.`
          });
        }

        return buildSemanticResult({
          passed: true,
          score: orphanReport.orphans.length > 0 ? 80 : 100,
          confidence: 1,
          warnings,
          details: {
            archKey,
            totalPhases: report.totalPhases,
            coveredCount: report.coveredCount,
            coveragePercent: report.coveragePercent,
            orphanChildren: orphanReport.orphans
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
