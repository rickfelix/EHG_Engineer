/**
 * Parent Orchestrator Gate Handling
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * PAT-PARENT-DET: Parent orchestrators get simplified gates since
 * implementation is delegated to child SDs
 */

/**
 * Get gates for parent orchestrator SDs
 *
 * Parent orchestrators don't need implementation gates like DESIGN/DATABASE
 * because the actual implementation is delegated to child SDs.
 *
 * Simplified gate set for parent orchestrators:
 * 1. PRD exists (orchestrator PRD with decomposition)
 * 2. Children are properly linked
 * 3. No implementation gates (DESIGN, DATABASE, BRANCH)
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} sd - Strategic Directive object
 * @param {Object} _options - Options (unused)
 * @returns {Array} Array of gate configurations
 */
export function getParentOrchestratorGates(supabase, prdRepo, sd, _options) {
  const gates = [];

  // Gate 1: PRD Exists with proper metadata
  gates.push({
    name: 'PARENT_PRD_EXISTS',
    validator: async () => {
      console.log('\n📋 GATE: Parent Orchestrator PRD Validation');
      console.log('-'.repeat(50));

      const prd = await prdRepo?.getBySdId(sd.id);

      if (!prd) {
        console.log('   ❌ No PRD found for parent orchestrator');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['Parent orchestrator must have a PRD with decomposition structure'],
          warnings: []
        };
      }

      // Check if it's a proper orchestrator PRD
      const isOrchestratorPRD = prd.metadata?.is_orchestrator_prd === true ||
                                 prd.metadata?.prd_type === 'parent_orchestrator';

      if (!isOrchestratorPRD) {
        console.log('   ⚠️  PRD exists but may not be orchestrator-formatted');
      }

      console.log('   ✅ Parent orchestrator PRD found:', prd.id);
      console.log(`      Type: ${prd.metadata?.prd_type || 'standard'}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: isOrchestratorPRD ? [] : ['PRD may not have orchestrator metadata'],
        details: { prdId: prd.id, isOrchestratorPRD }
      };
    },
    required: true
  });

  // Gate 2: Children Structure Validated
  gates.push({
    name: 'CHILDREN_STRUCTURE_VALID',
    validator: async () => {
      console.log('\n👶 GATE: Children Structure Validation');
      console.log('-'.repeat(50));

      const { data: children } = await supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, title, status, parent_sd_id')
        .eq('parent_sd_id', sd.id);

      if (!children || children.length === 0) {
        console.log('   ❌ No children found - parent orchestrator must have children');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['Parent orchestrator has no child SDs'],
          warnings: []
        };
      }

      console.log(`   ✅ Found ${children.length} child SDs:`);
      children.forEach(c => {
        const icon = c.status === 'completed' ? '✅' : '📋';
        console.log(`      ${icon} ${c.legacy_id || c.id} [${c.status}]`);
      });

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { childrenCount: children.length, children: children.map(c => c.legacy_id || c.id) }
      };
    },
    required: true
  });

  console.log('   ✓ SKIPPED: DESIGN sub-agent (delegated to children)');
  console.log('   ✓ SKIPPED: DATABASE sub-agent (delegated to children)');
  console.log('   ✓ SKIPPED: Branch enforcement (no direct implementation)');

  return gates;
}

/**
 * Check if SD is a parent orchestrator
 *
 * @param {Object} sd - Strategic Directive
 * @returns {boolean} True if SD is a parent orchestrator
 */
export function isParentOrchestrator(sd) {
  return sd.metadata?.is_parent === true;
}
