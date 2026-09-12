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
import { safeQuery } from '../../../../../../lib/db/safe-query.mjs';

const GATE_NAME = 'CHILD_SCOPE_COVERAGE';

// QF-20260911-793: the exact set of coordination-template FR titles parent-orchestrator-handler.js
// emits for every auto-generated orchestrator PRD. metadata.coordination_only alone is NOT trusted
// as sufficient — prd.functional_requirements is free-form JSONB writable by any PRD author (human,
// add-prd-to-database.js, or an LLM-authored PRD), so an unnamespaced flag could silently exempt a
// real deliverable from coverage scoring. Requiring BOTH the flag AND an exact name match against
// this known, narrow set keeps the exclusion pinned to what this file itself generates.
const COORDINATION_TEMPLATE_NAMES = new Set([
  'Child SD Orchestration',
  'Work Decomposition Structure',
  'Progress Tracking'
]);

function isCoordinationTemplate(deliverable) {
  return Boolean(deliverable?.metadata?.coordination_only) && COORDINATION_TEMPLATE_NAMES.has(deliverable?.deliverable_name);
}

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
        // QF-20260911-793: metadata IS requested — the coordination_only exclusion below
        // depends on it. PostgREST returns only projected columns; omitting this silently
        // makes the exclusion a no-op (pd.metadata reads undefined for every row).
        const parentDeliverables = await safeQuery(
          supabase
            .from('sd_scope_deliverables')
            .select('id, deliverable_name, deliverable_type, metadata')
            .eq('sd_id', sdId),
          { site: 'child-scope-coverage:parent_deliverables' }
        );

        // Get children SDs
        const children = await safeQuery(
          supabase
            .from('strategic_directives_v2')
            .select('id, title, status')
            .eq('parent_sd_id', sdId),
          { site: 'child-scope-coverage:children' }
        );

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

        // QF-20260911-793: parent-orchestrator-handler.js emits 3 hard-coded coordination-only
        // FRs ("Child SD Orchestration", "Work Decomposition Structure", "Progress Tracking")
        // for every auto-generated orchestrator PRD. They describe coordinator-only work no
        // child would ever phrase in its own scope, so they are structurally unpassable by
        // keyword overlap. Excluded from the coverage denominator entirely (never scored,
        // never counted as uncovered) — marked via metadata.coordination_only, threaded
        // through by extract-deliverables-from-prd.js. Checked BEFORE the child-deliverables
        // query below so the all-template case short-circuits without needing it.
        const substantiveDeliverables = parentDeliverables.filter(pd => !isCoordinationTemplate(pd));
        const templateOnlyCount = parentDeliverables.length - substantiveDeliverables.length;

        if (substantiveDeliverables.length === 0) {
          console.log(`   ℹ️  All ${parentDeliverables.length} parent deliverable(s) are auto-generated coordination template — nothing substantive for children to cover`);
          return buildSemanticResult({
            passed: true, score: 100, confidence: 0.8,
            warnings: ['Only auto-generated coordination-template deliverables present — gate auto-passes'],
            details: { isOrchestrator: true, childCount: children.length, parentDeliverables: parentDeliverables.length, templateOnly: templateOnlyCount }
          });
        }

        // Get all child deliverables
        const childIds = children.map(c => c.id);
        const childDeliverables = await safeQuery(
          supabase
            .from('sd_scope_deliverables')
            .select('sd_id, deliverable_name, deliverable_type, completion_status')
            .in('sd_id', childIds),
          { site: 'child-scope-coverage:child_deliverables' }
        );

        // Check parent deliverable coverage by children
        const childTitles = (childDeliverables || []).map(d => d.deliverable_name.toLowerCase());
        let covered = 0;
        const uncovered = [];

        for (const pd of substantiveDeliverables) {
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

        const score = Math.round((covered / substantiveDeliverables.length) * 100);
        const confidence = computeConfidence({
          dataPoints: (childDeliverables || []).length + substantiveDeliverables.length,
          expectedPoints: substantiveDeliverables.length * 2
        });
        const passed = score >= 80;

        // Check child completion status
        const completedChildren = children.filter(c => c.status === 'completed').length;

        console.log(`   📊 Coverage: ${covered}/${substantiveDeliverables.length} substantive parent deliverables covered by children (${templateOnlyCount} coordination-only excluded)`);
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
            parentDeliverables: substantiveDeliverables.length,
            templateExcluded: templateOnlyCount,
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
        // SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2: a genuine query-discipline failure must
        // not be swallowed into the same lenient advisory pass as an ordinary unexpected error.
        if (err.code === 'QUERY_FAILED' || err.code === 'COUNT_UNMEASURABLE') {
          // confidence must be >= 0.7: buildSemanticResult forces passed=true when confidence < 0.7
          // (its "degrade blocking to warning" rule), which would silently re-swallow this fix.
          return buildSemanticResult({
            passed: false, score: 0, confidence: 0.9,
            issues: [`Child scope coverage could not run — query failed: ${err.message}`]
          });
        }
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
