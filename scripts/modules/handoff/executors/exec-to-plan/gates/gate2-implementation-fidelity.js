/**
 * Gate 2: Implementation Fidelity Validation for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Validates implementation fidelity against requirements
 */

// External validator (will be lazy loaded)
let validateGate2ExecToPlan;

/**
 * Create the GATE2_IMPLEMENTATION_FIDELITY gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createGate2ImplementationFidelityGate(supabase) {
  return {
    name: 'GATE2_IMPLEMENTATION_FIDELITY',
    validator: async (ctx) => {
      console.log('\n🚪 GATE 2: Implementation Fidelity Validation');
      console.log('-'.repeat(50));

      // Load validator if not loaded
      if (!validateGate2ExecToPlan) {
        const gate2 = await import('../../../implementation-fidelity-validation.js');
        validateGate2ExecToPlan = gate2.validateGate2ExecToPlan;
      }

      return validateGate2ExecToPlan(ctx.sdId, supabase);
    },
    required: true
  };
}
