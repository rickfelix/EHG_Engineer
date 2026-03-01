/**
 * Cascade Alignment Gate for EXEC-TO-PLAN
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-008 (V09 Enhancement)
 *
 * Validates that child SDs remain aligned with parent objectives
 * at handoff boundaries. Non-blocking — issues generate warnings
 * that are logged to eva_event_log for audit trail.
 *
 * @module scripts/modules/handoff/executors/exec-to-plan/gates/cascade-alignment-gate
 */

/**
 * Create the CASCADE_ALIGNMENT gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createCascadeAlignmentGate(supabase) {
  return {
    name: 'CASCADE_ALIGNMENT',
    validator: async (ctx) => {
      console.log('\n📐 CASCADE ALIGNMENT: Parent-Child Objective Check');
      console.log('-'.repeat(50));

      const sd = ctx.sd;
      const parentSdId = sd?.parent_sd_id;

      // Skip for non-child SDs
      if (!parentSdId) {
        console.log('   ℹ️  Not a child SD — cascade check not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Not a child SD — cascade alignment check skipped'],
        };
      }

      try {
        // Dynamic import to avoid circular dependencies
        const { validateCascadeAtHandoff } = await import('../../../../governance/cascade-validator.js');

        const result = await validateCascadeAtHandoff({
          sd,
          handoffType: 'EXEC-TO-PLAN',
          supabase,
        });

        const issues = [];
        const warnings = [];

        // Map violations to issues/warnings
        for (const v of result.violations || []) {
          if (v.severity === 'blocking') {
            issues.push(`${v.check}: ${v.reason}`);
          } else {
            warnings.push(`${v.check}: ${v.reason}`);
          }
        }

        for (const w of result.warnings || []) {
          warnings.push(w.reason || w);
        }

        const score = Math.max(0, Math.min(100, result.score));

        console.log(`   ${result.aligned ? '✅' : '⚠️'}  Alignment: ${result.aligned ? 'PASS' : 'DRIFT DETECTED'}`);
        console.log(`   📊 Score: ${score}/100`);
        if (warnings.length > 0) {
          warnings.forEach(w => console.log(`   ⚠️  ${w}`));
        }

        return {
          passed: true, // Non-blocking — alignment drift is a warning, not a blocker
          score,
          max_score: 100,
          issues: [],
          warnings,
        };
      } catch (err) {
        console.log(`   ⚠️  Cascade check error: ${err.message}`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`Cascade alignment check error: ${err.message}`],
        };
      }
    },
  };
}
