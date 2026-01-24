/**
 * DESIGN→DATABASE Workflow Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Validates DESIGN and DATABASE sub-agents have been executed (conditional)
 * Gap #2 Fix (2026-01-01): Auto-invoke missing sub-agents instead of just failing
 */

/**
 * Create the GATE1_DESIGN_DATABASE gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createDesignDatabaseGate(supabase) {
  return {
    name: 'GATE1_DESIGN_DATABASE',
    validator: async (ctx) => {
      console.log('\n🚪 GATE 1: DESIGN→DATABASE Workflow Validation');
      console.log('-'.repeat(50));

      // Lazy load validators
      const { validateGate1PlanToExec } = await import('../../../../design-database-gates-validation.js');

      // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) for database queries
      const sdUuidForQuery = ctx.sd?.id || ctx.sdId;

      // First check: Validate existing sub-agents
      const initialResult = await validateGate1PlanToExec(sdUuidForQuery, supabase);

      // Gap #2 Fix: If validation fails, auto-invoke missing sub-agents
      if (!initialResult.passed && !ctx._autoInvokeAttempted) {
        console.log('\n   🔄 Auto-invoking missing PLAN phase sub-agents...');
        ctx._autoInvokeAttempted = true;

        try {
          const { orchestrate } = await import('../../../../../orchestrate-phase-subagents.js');
          const orchestrationResult = await orchestrate('PLAN_PRD', sdUuidForQuery, {
            autoRemediate: true,
            skipIfExists: true
          });

          if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
            console.log('   ✅ Sub-agents invoked successfully');
            if (orchestrationResult.executed?.length > 0) {
              console.log(`      Executed: ${orchestrationResult.executed.join(', ')}`);
            }

            // Re-check after invocation
            console.log('\n   🔁 Re-validating after sub-agent invocation...');
            const reCheckResult = await validateGate1PlanToExec(sdUuidForQuery, supabase);
            return reCheckResult;
          } else {
            console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
            console.log('      Proceeding with original validation result');
          }
        } catch (orchestrationError) {
          console.error('   ⚠️  Auto-invocation failed:', orchestrationError.message);
          console.log('      Proceeding with original validation result');
        }
      }

      return initialResult;
    },
    required: true
  };
}

/**
 * Check if SD type requires DESIGN/DATABASE validation
 *
 * @param {Object} sd - Strategic Directive
 * @returns {boolean} True if validation is required
 */
export function shouldValidateDesignDatabase(sd) {
  // Sync check for getRequiredGates - async loading happens at runtime in createDesignDatabaseGate
  const sdType = (sd.sd_type || 'feature').toLowerCase();
  const skipTypes = ['bugfix', 'fix', 'hotfix', 'documentation', 'docs', 'process'];
  return !skipTypes.includes(sdType);
}
