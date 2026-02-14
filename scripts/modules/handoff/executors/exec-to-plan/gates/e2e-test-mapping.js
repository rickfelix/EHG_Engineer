/**
 * E2E Test Mapping Gate for EXEC-TO-PLAN
 * Part of SD-LEO-FIX-STORIES-SUB-AGENT-001
 *
 * Maps E2E test files to user stories during EXEC-TO-PLAN handoff.
 * Wraps the existing map-e2e-tests-to-stories.js into the gate pipeline.
 */

import { mapE2ETestsToUserStories } from '../../../map-e2e-tests-to-stories.js';
import { isLightweightSDType } from '../../../validation/sd-type-applicability-policy.js';

/**
 * Create the E2E_TEST_MAPPING gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createE2ETestMappingGate(supabase) {
  return {
    name: 'E2E_TEST_MAPPING',
    validator: async (ctx) => {
      console.log('\n🔗 GATE: E2E Test Mapping');
      console.log('-'.repeat(50));

      const sdId = ctx.sd?.id || ctx.sdId;
      const sdType = (ctx.sd?.sd_type || '').toLowerCase();

      // Skip for lightweight SD types (infrastructure, documentation, etc.)
      if (isLightweightSDType(sdType)) {
        console.log(`   ℹ️  E2E test mapping skipped for ${sdType} SD type`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`E2E test mapping skipped for ${sdType} SD type`]
        };
      }

      try {
        const result = await mapE2ETestsToUserStories(sdId, supabase);

        if (result.success) {
          const score = result.total === 0 ? 100 : Math.round((result.matched / result.total) * 100);
          console.log(`   ✅ E2E mapping complete: ${result.matched}/${result.total} stories mapped (${result.coverage}%)`);

          const warnings = [];
          if (result.unmatched > 0) {
            warnings.push(`${result.unmatched} stories without E2E test coverage`);
          }

          return {
            passed: true,
            score: Math.max(score, 50), // Floor at 50 since this is advisory
            max_score: 100,
            issues: [],
            warnings,
            details: {
              matched: result.matched,
              unmatched: result.unmatched,
              total: result.total,
              coverage: result.coverage,
              unmatchedStories: result.unmatchedStories
            }
          };
        }

        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: ['E2E test mapping returned unsuccessful result']
        };
      } catch (error) {
        console.log(`   ⚠️  E2E test mapping error: ${error.message}`);
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`E2E test mapping error: ${error.message}`]
        };
      }
    },
    required: false // Non-blocking - advisory gate
  };
}
