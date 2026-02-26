/**
 * Decomposition Check Gate (CONST-014)
 * Part of SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-D
 *
 * Blocks PLAN-TO-EXEC when PRD reveals multi-phase complexity,
 * recommending SD decomposition into orchestrator + children.
 */

const PHASE_SIGNALS = [
  'phase 1', 'phase 2', 'phase 3', 'phase 4',
  'step 1', 'step 2', 'step 3', 'step 4',
  'stage 1', 'stage 2', 'stage 3', 'stage 4',
  'layer 1', 'layer 2', 'layer 3'
];

const PHASE_THRESHOLD = 3;
const FR_THRESHOLD = 8;

/**
 * Create the DECOMPOSITION_CHECK gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createDecompositionCheckGate(supabase) {
  return {
    name: 'DECOMPOSITION_CHECK',
    validator: async (ctx) => {
      console.log('\n🔒 GATE: Decomposition Check (CONST-014)');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;

      // Orchestrator SDs (with children) skip this gate
      const { data: children } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (children && children.length > 0) {
        console.log('   ℹ️  Orchestrator SD — decomposition already applied');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Orchestrator SD — decomposition check skipped']
        };
      }

      // Child SDs skip this gate (already decomposed)
      if (ctx.sd?.parent_sd_id) {
        console.log('   ℹ️  Child SD — decomposition check not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Child SD — decomposition check skipped']
        };
      }

      // Look up PRD
      const { data: prdData, error } = await supabase
        .from('product_requirements_v2')
        .select('id, functional_requirements, implementation_approach')
        .eq('sd_id', sdUuid)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !prdData || prdData.length === 0) {
        console.log('   ⚠️  No PRD found — skipping decomposition check');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['No PRD found — decomposition check skipped']
        };
      }

      const prd = prdData[0];

      // Count functional requirements
      const frs = prd.functional_requirements || [];
      const frCount = frs.length;

      // Count phase signals in implementation_approach
      const approachText = (prd.implementation_approach || '').toLowerCase();
      const phaseCount = PHASE_SIGNALS.filter(s => approachText.includes(s)).length;

      console.log(`   📊 PRD Complexity Analysis:`);
      console.log(`      Functional Requirements: ${frCount} (threshold: ${FR_THRESHOLD})`);
      console.log(`      Phase signals detected: ${phaseCount} (threshold: ${PHASE_THRESHOLD})`);

      const exceedsThreshold = phaseCount >= PHASE_THRESHOLD || frCount >= FR_THRESHOLD;

      if (exceedsThreshold) {
        const reasons = [];
        if (phaseCount >= PHASE_THRESHOLD) {
          reasons.push(`${phaseCount} implementation phases detected (max ${PHASE_THRESHOLD - 1})`);
        }
        if (frCount >= FR_THRESHOLD) {
          reasons.push(`${frCount} functional requirements (max ${FR_THRESHOLD - 1})`);
        }

        console.log(`   ❌ DECOMPOSITION RECOMMENDED`);
        console.log(`      Reasons: ${reasons.join(', ')}`);
        console.log('');
        console.log('   💡 Recommendation: Convert this SD to an orchestrator with children.');
        console.log('      Each implementation phase should be a separate child SD.');
        console.log('      Run: node scripts/leo-create-sd.js --child <parent-key>');

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `CONST-014: SD complexity exceeds decomposition threshold — ${reasons.join('; ')}`
          ],
          warnings: [],
          remediation: 'Decompose this SD into an orchestrator with child SDs. Each phase should be a separate child.',
          details: { phaseCount, frCount, reasons }
        };
      }

      console.log('   ✅ SD complexity within acceptable bounds');
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { phaseCount, frCount }
      };
    },
    required: true
  };
}
