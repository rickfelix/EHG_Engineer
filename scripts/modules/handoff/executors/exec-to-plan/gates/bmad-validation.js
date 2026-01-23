/**
 * BMAD Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Validates BMAD (Business/Marketing Analysis Deliverables) for EXEC-TO-PLAN
 */

// External validator (will be lazy loaded)
let validateBMADForExecToPlan;

/**
 * Create the BMAD_EXEC_TO_PLAN gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createBMADValidationGate(supabase) {
  return {
    name: 'BMAD_EXEC_TO_PLAN',
    validator: async (ctx) => {
      // Load validator if not loaded
      if (!validateBMADForExecToPlan) {
        const bmad = await import('../../../../bmad-validation.js');
        validateBMADForExecToPlan = bmad.validateBMADForExecToPlan;
      }

      const result = await validateBMADForExecToPlan(ctx.sdId, supabase);
      ctx._bmadResult = result;
      return result;
    },
    required: true
  };
}
