/**
 * RCA Gate Validation for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Validates that P0/P1 RCRs have verified CAPAs
 */

/**
 * Create the RCA_GATE validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createRCAGate(supabase) {
  return {
    name: 'RCA_GATE',
    validator: async (ctx) => {
      console.log('\n🔍 Step 1: RCA Gate Validation');
      console.log('-'.repeat(50));

      try {
        const { data: openRCRs } = await supabase
          .from('root_cause_analyses')
          .select('id, priority, capa_status')
          .eq('sd_id', ctx.sdId)
          .in('priority', ['P0', 'P1'])
          .neq('capa_status', 'verified');

        if (openRCRs && openRCRs.length > 0) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`${openRCRs.length} P0/P1 RCRs without verified CAPAs`],
            warnings: [],
            gate_status: 'BLOCKED',
            open_rcr_count: openRCRs.length,
            blocking_rcr_ids: openRCRs.map(r => r.id)
          };
        }

        console.log('✅ RCA gate passed');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          gate_status: 'PASS'
        };
      } catch (error) {
        // CRITICAL: Do not return PASS when root_cause_analyses table is missing.
        // Failing open here would allow SDs with unverified CAPAs to proceed.
        console.warn(`[RCAGate] RCA gate check failed: ${error.message || 'table may not exist'}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`RCA gate check failed: ${error.message || 'root_cause_analyses table may not exist'}. Cannot verify CAPA status.`],
          warnings: ['RCA table query failed — returning FAIL to prevent unverified CAPAs from passing'],
          gate_status: 'FAIL'
        };
      }
    },
    required: true
  };
}
