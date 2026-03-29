/**
 * SD_TYPE_COMPATIBILITY Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 9)
 *
 * Verifies parent/child SD type compatibility for orchestrator children.
 * Applies ONLY to orchestrator child creation (LEAD-TO-PLAN).
 *
 * Phase: LEAD-TO-PLAN
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'SD_TYPE_COMPATIBILITY';

/**
 * Valid parent-child SD type combinations.
 * Parent type → allowed child types
 */
const TYPE_COMPATIBILITY = {
  orchestrator: ['orchestrator', 'feature', 'infrastructure', 'bugfix', 'fix', 'security', 'refactor', 'database', 'enhancement', 'documentation', 'ux_debt'],
  feature: ['feature', 'infrastructure', 'database', 'enhancement'],
  infrastructure: ['infrastructure', 'database'],
  security: ['security', 'fix', 'infrastructure']
};

export function createSdTypeCompatibilityGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔀 SEMANTIC GATE: SD Type Compatibility');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      // This gate only applies to SDs with parents (orchestrator children)
      const parentSdId = ctx.sd?.parent_sd_id;

      if (!parentSdId) {
        console.log('   ℹ️  No parent SD — standalone SD, skipping compatibility check');
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot check type compatibility — missing supabase']
        });
      }

      try {
        // Get parent SD type
        const { data: parent, error } = await supabase
          .from('strategic_directives_v2')
          .select('sd_type, title')
          .eq('id', parentSdId)
          .single();

        if (error || !parent) {
          console.log('   ⚠️  Parent SD not found');
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.4,
            warnings: ['Parent SD not found — cannot verify compatibility']
          });
        }

        const parentType = (parent.sd_type || 'orchestrator').toLowerCase();
        const childType = sdType.toLowerCase();

        console.log(`   📊 Parent: ${parentType} | Child: ${childType}`);

        const allowedChildren = TYPE_COMPATIBILITY[parentType] || TYPE_COMPATIBILITY.orchestrator;
        const isCompatible = allowedChildren.includes(childType);
        const confidence = computeConfidence({ dataPoints: 2, expectedPoints: 2 });

        console.log(`   ${isCompatible ? '✅' : '❌'} Compatible: ${isCompatible}`);

        return buildSemanticResult({
          passed: isCompatible,
          score: isCompatible ? 100 : 0,
          confidence,
          issues: !isCompatible ? [`Child type '${childType}' is not compatible with parent type '${parentType}'`] : [],
          details: {
            parentType,
            childType,
            parentTitle: parent.title,
            allowedChildren,
            isCompatible
          },
          remediation: !isCompatible ? `Change child SD type to one of: ${allowedChildren.join(', ')}` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`SD type compatibility error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.6
  };
}
