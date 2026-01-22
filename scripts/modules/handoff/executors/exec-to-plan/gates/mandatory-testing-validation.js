/**
 * Mandatory Testing Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.4.2: Enforce TESTING sub-agent execution
 * Evidence: 14.6% of SDs completed without TESTING validation
 *
 * SD-LEO-HARDEN-VALIDATION-001: Narrowed exemptions to documentation-only
 * - Infrastructure, orchestrator, database now use ADVISORY mode
 * - Only documentation types skip TESTING entirely
 */

/**
 * Create the MANDATORY_TESTING_VALIDATION gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createMandatoryTestingValidationGate(supabase) {
  return {
    name: 'MANDATORY_TESTING_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🧪 MANDATORY TESTING VALIDATION (LEO v4.4.2)');
      console.log('-'.repeat(50));

      // 1. Check SD type exemptions
      // SD-LEO-HARDEN-VALIDATION-001: Narrowed exemptions to documentation-only
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
      const EXEMPT_TYPES = ['documentation', 'docs'];
      const ADVISORY_TYPES = ['infrastructure', 'orchestrator', 'database'];

      if (EXEMPT_TYPES.includes(sdType)) {
        console.log(`   ℹ️  ${sdType} type SD - TESTING validation SKIPPED`);
        console.log('   → Documentation-only SDs have no code paths');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`TESTING skipped for ${sdType} type SD (documentation exemption)`],
          details: { skipped: true, reason: sdType }
        };
      }

      const isAdvisoryMode = ADVISORY_TYPES.includes(sdType);

      // 2. Query for TESTING sub-agent execution
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: testingResults, error } = await supabase
        .from('sub_agent_execution_results')
        .select('id, verdict, confidence, created_at')
        .eq('sd_id', sdUuid)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.log(`   ⚠️  Error checking TESTING execution: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Failed to verify TESTING execution: ${error.message}`],
          warnings: []
        };
      }

      // 3. Validate execution exists
      if (!testingResults?.length) {
        // SD-LEO-HARDEN-VALIDATION-001: Advisory mode for infrastructure types
        if (isAdvisoryMode) {
          console.log(`   ⚠️  TESTING not executed for ${sdType} SD (ADVISORY MODE)`);
          console.log('   → Infrastructure SDs should run TESTING for unit test coverage');
          console.log('   → This is a warning, not a blocker');
          return {
            passed: true,
            score: 70,
            max_score: 100,
            issues: [],
            warnings: [`TESTING not executed for ${sdType} SD - consider running for unit test coverage`],
            details: { advisory: true, reason: `${sdType} SD missing TESTING` }
          };
        }

        console.log('   ❌ ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN');
        console.log('\n   REMEDIATION:');
        console.log('   1. Run TESTING sub-agent before completing EXEC phase');
        console.log('   2. Command: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY ' + (ctx.sdId || sdUuid));
        console.log('   3. Ensure all E2E tests pass');
        console.log('   4. Re-run EXEC-TO-PLAN handoff');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN for feature/qa SDs'],
          warnings: []
        };
      }

      // 4. Validate verdict is acceptable
      const result = testingResults[0];
      console.log(`   📊 TESTING result found: ${result.verdict} (${result.confidence}% confidence)`);

      if (!['PASS', 'CONDITIONAL_PASS'].includes(result.verdict)) {
        console.log(`   ❌ TESTING verdict ${result.verdict} - must pass`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`TESTING verdict ${result.verdict} - must be PASS or CONDITIONAL_PASS`],
          warnings: []
        };
      }

      // 5. Validate freshness (default 24h)
      const maxAgeHours = parseInt(process.env.LEO_TESTING_MAX_AGE_HOURS || '24');
      const ageHours = (Date.now() - new Date(result.created_at)) / 3600000;

      if (ageHours > maxAgeHours) {
        console.log(`   ⚠️  TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`);
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`],
          warnings: []
        };
      }

      console.log('   ✅ TESTING validation passed');
      console.log(`      Verdict: ${result.verdict}`);
      console.log(`      Age: ${ageHours.toFixed(1)}h (max ${maxAgeHours}h)`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          verdict: result.verdict,
          confidence: result.confidence,
          age_hours: ageHours.toFixed(1),
          max_age_hours: maxAgeHours
        }
      };
    },
    required: true
  };
}
