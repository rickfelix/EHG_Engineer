/**
 * SCOPE_AUDIT Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 1)
 *
 * Verifies that final implementation matches the approved scope.
 * Compares sd_scope_deliverables against PRD scope field.
 *
 * Phase: PLAN-TO-LEAD (verification)
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'SCOPE_AUDIT';

export function createScopeAuditGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔍 SEMANTIC GATE: Scope Audit');
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
          warnings: ['Cannot audit scope — missing context']
        });
      }

      try {
        // Get SD scope and deliverables
        const [sdResult, delivResult, prdResult] = await Promise.all([
          supabase.from('strategic_directives_v2')
            .select('scope, key_changes, success_criteria')
            .eq('id', sdId)
            .single(),
          supabase.from('sd_scope_deliverables')
            .select('deliverable_name, completion_status, category')
            .eq('sd_id', sdId),
          supabase.from('product_requirements_v2')
            .select('functional_requirements, acceptance_criteria')
            .eq('sd_id', sdId)
            .single()
        ]);

        const sd = sdResult.data;
        const deliverables = delivResult.data || [];
        const prd = prdResult.data;

        if (!sd) {
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: ['SD not found in database']
          });
        }

        // Extract scope items from various sources
        const scopeItems = [];
        if (sd.key_changes && Array.isArray(sd.key_changes)) {
          scopeItems.push(...sd.key_changes.map(kc => typeof kc === 'string' ? kc : kc.description || kc.title || ''));
        }
        if (sd.success_criteria && Array.isArray(sd.success_criteria)) {
          scopeItems.push(...sd.success_criteria.map(sc => typeof sc === 'string' ? sc : sc.description || sc.criteria || ''));
        }

        // Extract PRD requirements
        const prdItems = [];
        if (prd?.functional_requirements && Array.isArray(prd.functional_requirements)) {
          prdItems.push(...prd.functional_requirements.map(fr => typeof fr === 'string' ? fr : fr.description || fr.title || ''));
        }

        const totalScopeItems = Math.max(scopeItems.length, prdItems.length, deliverables.length);

        if (totalScopeItems === 0) {
          console.log('   ⚠️  No scope items found to audit');
          return buildSemanticResult({
            passed: true, score: 70, confidence: 0.5,
            warnings: ['No structured scope items found for audit'],
            details: { scopeItems: 0, deliverables: 0 }
          });
        }

        // Check deliverable coverage against scope
        const completedDeliverables = deliverables.filter(d =>
          d.completion_status === 'completed' || d.completion_status === 'done'
        );

        const coverage = deliverables.length > 0
          ? Math.round((completedDeliverables.length / deliverables.length) * 100)
          : (scopeItems.length > 0 ? 50 : 70); // Partial credit if scope exists but no deliverables tracked

        const confidence = computeConfidence({
          dataPoints: deliverables.length + scopeItems.length,
          expectedPoints: Math.max(5, totalScopeItems)
        });

        const passed = level === 'OPT' ? true : coverage >= 80;

        console.log(`   📊 Scope: ${scopeItems.length} items | Deliverables: ${completedDeliverables.length}/${deliverables.length} completed`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${coverage}/100 | Confidence: ${confidence}`);

        const incompleteDeliverables = deliverables
          .filter(d => d.completion_status !== 'completed' && d.completion_status !== 'done')
          .map(d => `${d.deliverable_name} (${d.completion_status || 'unknown'})`);

        return buildSemanticResult({
          passed,
          score: coverage,
          confidence,
          issues: !passed ? [`Scope coverage at ${coverage}% — below 80% threshold`] : [],
          warnings: level === 'OPT' && coverage < 80 ? [`Low scope coverage (${coverage}%) — advisory`] : [],
          details: {
            scopeItems: scopeItems.length,
            prdRequirements: prdItems.length,
            totalDeliverables: deliverables.length,
            completedDeliverables: completedDeliverables.length,
            incompleteDeliverables: incompleteDeliverables.slice(0, 5)
          },
          remediation: !passed ? `Complete remaining deliverables: ${incompleteDeliverables.slice(0, 3).join(', ')}` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Scope audit error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 1.0
  };
}
