/**
 * CHILD_SCOPE_COVERAGE Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 3)
 *
 * Verifies that children of an orchestrator SD collectively satisfy parent scope.
 * Applies ONLY to orchestrator SD types.
 *
 * Phase: PLAN-TO-LEAD (verification)
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'CHILD_SCOPE_COVERAGE';

export function createChildScopeCoverageGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n👶 SEMANTIC GATE: Child Scope Coverage');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      const { applicable } = getGateApplicability(GATE_NAME, sdType);
      if (!applicable) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType} (orchestrator-only gate)`);
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot check child scope — missing context']
        });
      }

      try {
        // Get parent SD deliverables
        const { data: parentDeliverables } = await supabase
          .from('sd_scope_deliverables')
          .select('id, deliverable_name, deliverable_type')
          .eq('sd_id', sdId);

        // Get children SDs
        const { data: children } = await supabase
          .from('strategic_directives_v2')
          .select('id, title, status')
          .eq('parent_sd_id', sdId);

        if (!children || children.length === 0) {
          console.log('   ⚠️  No children found — not an orchestrator');
          return buildSemanticResult({
            passed: true, score: 100, confidence: 0.9,
            warnings: ['No children found — gate not applicable'],
            details: { isOrchestrator: false }
          });
        }

        console.log(`   📊 Parent has ${parentDeliverables?.length || 0} deliverables, ${children.length} children`);

        if (!parentDeliverables || parentDeliverables.length === 0) {
          console.log('   ⚠️  No parent deliverables to check against');
          return buildSemanticResult({
            passed: true, score: 70, confidence: 0.5,
            warnings: ['No parent deliverables defined — cannot verify coverage'],
            details: { childCount: children.length, parentDeliverables: 0 }
          });
        }

        // Get all child deliverables
        const childIds = children.map(c => c.id);
        const { data: childDeliverables } = await supabase
          .from('sd_scope_deliverables')
          .select('sd_id, deliverable_name, deliverable_type, completion_status')
          .in('sd_id', childIds);

        // Check parent deliverable coverage by children
        const childTitles = (childDeliverables || []).map(d => d.deliverable_name.toLowerCase());
        let covered = 0;
        const uncovered = [];

        for (const pd of parentDeliverables) {
          const pdTitle = pd.deliverable_name.toLowerCase();
          // Simple keyword overlap check
          const isCovered = childTitles.some(ct =>
            ct.includes(pdTitle) || pdTitle.includes(ct) ||
            pdTitle.split(' ').filter(w => w.length > 3).some(word => ct.includes(word))
          );

          if (isCovered) {
            covered++;
          } else {
            uncovered.push(pd.deliverable_name);
          }
        }

        const score = Math.round((covered / parentDeliverables.length) * 100);
        const confidence = computeConfidence({
          dataPoints: (childDeliverables || []).length + parentDeliverables.length,
          expectedPoints: parentDeliverables.length * 2
        });
        const passed = score >= 80;

        // Check child completion status
        const completedChildren = children.filter(c => c.status === 'completed').length;

        console.log(`   📊 Coverage: ${covered}/${parentDeliverables.length} parent deliverables covered by children`);
        console.log(`   📊 Children: ${completedChildren}/${children.length} completed`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${score}/100 | Confidence: ${confidence}`);

        if (uncovered.length > 0) {
          console.log('   Uncovered parent deliverables:');
          uncovered.forEach(u => console.log(`      - ${u}`));
        }

        return buildSemanticResult({
          passed,
          score,
          confidence,
          issues: !passed ? [`${uncovered.length} parent deliverable(s) not covered by any child`] : [],
          details: {
            isOrchestrator: true,
            parentDeliverables: parentDeliverables.length,
            childCount: children.length,
            completedChildren,
            childDeliverables: (childDeliverables || []).length,
            covered,
            uncovered: uncovered.slice(0, 10)
          },
          remediation: !passed ? `Assign missing deliverables to children: ${uncovered.slice(0, 3).join(', ')}` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Child scope coverage error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 1.0
  };
}
