/**
 * EXEC-TO-PLAN Parent Orchestrator Gate Set
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-2
 *
 * Parents do not write code — their EXEC phase is a "delegated-completion" state:
 *   PRD is published, decomposition into children is documented, children have
 *   been spawned, and the parent is now waiting for children to ship.
 *
 * The standard EXEC-TO-PLAN gate set (SCOPE_COMPLETION_VERIFICATION, integration
 * contract gate, E2E mapping, wireframe QA, etc.) all assume the parent's own
 * branch holds the implementation. For parents, those gates produce hard fails
 * because the work lives in CHILD branches that the parent's worktree never sees.
 *
 * This file mirrors plan-to-exec/parent-orchestrator.js for the EXEC-TO-PLAN
 * direction — a reduced gate set that asserts only what's actually verifiable
 * for a parent: that its children exist and the decomposition is wired up.
 *
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001: PARENT_DELEGATED_COMPLETION previously asserted
 * only "children.length > 0" — it never compared the children's union against the
 * parent's declared scope/success_criteria. A real incident shipped a parent titled
 * "Develop MarketLens Landing Page with Hero and CTA" to completion with children that
 * only built an API layer; no landing page was ever built. The gate now also computes a
 * scope-coverage verdict (lib/sd/scope-coverage.js) and, when incomplete, raises a
 * non-blocking needs_decision completion_flag naming the uncovered elements. The gate's
 * passed/score return value is UNCHANGED by coverage — this is visibility, not enforcement.
 */

import { computeScopeCoverage } from '../../../../../lib/sd/scope-coverage.js';
import { captureCompletionFlags } from '../../../../capture-completion-flags.js';

/**
 * Get reduced EXEC-TO-PLAN gates for parent orchestrator SDs.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive object (must have id)
 * @returns {Array} Array of gate configurations
 */
export function getParentOrchestratorExecToPlanGates(supabase, sd) {
  const gates = [];

  gates.push({
    name: 'PARENT_DELEGATED_COMPLETION',
    validator: async () => {
      console.log('\n📋 GATE: Parent Orchestrator Delegated Completion (EXEC-TO-PLAN)');
      console.log('-'.repeat(50));

      const { data: children, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, status, current_phase, title, scope, scope_slice')
        .eq('parent_sd_id', sd.id);

      if (error) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`DB error querying children: ${error.message}`],
          warnings: [],
          remediation: 'Check DB connectivity; retry handoff.',
        };
      }

      if (!children || children.length === 0) {
        console.log('   ❌ Parent has no children — orchestrator decomposition missing');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['Parent orchestrator has no child SDs — decomposition required before EXEC-TO-PLAN'],
          warnings: [],
          remediation: 'Run scripts/create-orchestrator-from-plan.js --auto-children to decompose the orchestrator.',
        };
      }

      console.log(`   ✅ Found ${children.length} child SDs:`);
      children.forEach(c => {
        console.log(`      - ${c.sd_key || c.id} [${c.status} / ${c.current_phase || '?'}]`);
      });

      console.log('   ✅ Parent EXEC = delegated-completion; children carry implementation work');
      console.log('   ✓ SKIPPED: SCOPE_COMPLETION_VERIFICATION (deliverables tracked by children)');
      console.log('   ✓ SKIPPED: integration/E2E/wireframe gates (no parent-owned UI/code)');

      // Scope-coverage advisory (SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001): never affects
      // passed/score above — visibility only, wrapped so a failure here cannot fail the gate.
      let coverage = null;
      try {
        coverage = computeScopeCoverage(sd, children);
        console.log(`   📊 Scope coverage: ${coverage.coverage_pct}% (${coverage.elements.length} declared element(s))`);

        const baseMetadata = (sd.metadata && typeof sd.metadata === 'object' && !Array.isArray(sd.metadata)) ? sd.metadata : {};
        const { error: metaErr } = await supabase
          .from('strategic_directives_v2')
          .update({ metadata: { ...baseMetadata, scope_coverage: coverage } })
          .eq('id', sd.id);
        if (metaErr) console.warn(`   ⚠️  scope-coverage metadata write non-fatal: ${metaErr.message}`);

        if (coverage.coverage_pct < 100) {
          const uncovered = coverage.elements.filter(e => !e.covered).map(e => e.element);
          console.warn(`   ⚠️  ${uncovered.length} scope element(s) not covered by any child: ${uncovered.join('; ')}`);
          await captureCompletionFlags({
            supabase,
            sdKey: sd.sd_key,
            flags: [{
              type: 'needs_decision',
              item: `Parent scope coverage incomplete (${coverage.coverage_pct}%) — uncovered element(s): ${uncovered.join('; ')}`,
            }],
          });
        }
      } catch (covErr) {
        console.warn(`   ⚠️  scope-coverage check failed (non-fatal, gate unaffected): ${covErr.message}`);
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          childrenCount: children.length,
          children: children.map(c => ({ sd_key: c.sd_key, status: c.status, phase: c.current_phase })),
          delegated_to_children: true,
          scope_coverage: coverage ? { coverage_pct: coverage.coverage_pct, elementCount: coverage.elements.length } : null,
        },
      };
    },
    required: true,
  });

  return gates;
}
