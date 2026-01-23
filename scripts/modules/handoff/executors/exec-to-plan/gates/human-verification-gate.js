/**
 * Human Verification Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.4.0: Validates that feature SDs have human-verifiable outcomes
 */

/**
 * Create the HUMAN_VERIFICATION_GATE validator
 *
 * @returns {Object} Gate configuration
 */
export function createHumanVerificationGate() {
  return {
    name: 'HUMAN_VERIFICATION_GATE',
    validator: async (ctx) => {
      console.log('\n👤 Human Verification Gate (LEO v4.4.0)');
      console.log('-'.repeat(50));

      // Load the human verification validator dynamically
      const { validateHumanVerification } = await import('../../../../human-verification-validator.js');

      const result = await validateHumanVerification(ctx.sd?.id || ctx.sdId);

      if (result.skipped) {
        console.log(`   ℹ️  Human verification skipped: ${result.reason}`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Human verification skipped for sd_type: ${result.sdType || 'unknown'}`],
          details: result
        };
      }

      if (result.passed) {
        console.log('   ✅ Human verification passed');
        if (result.llmUxScore) {
          console.log(`      LLM UX Score: ${result.llmUxScore}/100`);
        }
        if (result.smokeTestStepsCount) {
          console.log(`      Smoke test steps: ${result.smokeTestStepsCount}`);
        }
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: result
        };
      }

      // Failed - provide detailed issues
      console.log(`   ❌ Human verification failed: ${result.reason}`);
      const issues = result.issues?.map(i => i.message || i) || [result.reason];
      const actionRequired = result.issues?.find(i => i.actionRequired)?.actionRequired;

      if (actionRequired) {
        console.log(`\n   ACTION REQUIRED: ${actionRequired}`);
      }

      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues,
        warnings: [],
        details: result,
        remediation: actionRequired
      };
    },
    // LEO v4.4.1: Human verification now REQUIRED for feature/api SDs
    required: true,
    advisory: false
  };
}
