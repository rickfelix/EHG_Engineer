/**
 * Story Auto-Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-FIX-STORIES-SUB-AGENT-001
 *
 * Validates user stories automatically after EXEC completion.
 * Wraps the existing auto-validate-user-stories-on-exec-complete.js
 * into the handoff gate pipeline.
 */

import { autoValidateUserStories } from '../../../../../auto-validate-user-stories-on-exec-complete.js';

/**
 * Create the STORY_AUTO_VALIDATION gate validator
 *
 * @param {Object} supabase - Supabase client passed to auto-validate function
 * @returns {Object} Gate configuration
 */
export function createStoryAutoValidationGate(supabase) {
  return {
    name: 'STORY_AUTO_VALIDATION',
    validator: async (ctx) => {
      console.log('\n📝 GATE: Story Auto-Validation');
      console.log('-'.repeat(50));

      const sdId = ctx.sd?.id || ctx.sdId;

      try {
        const result = await autoValidateUserStories(sdId, supabase);

        // SD-LEO-INFRA-VALIDATE-DESIGN-ONLY-STORIES-001: surface per-story design-only quality
        // warnings (thin/boilerplate stories that did NOT meet the bar) through the gate. Advisory
        // only (required:false) — a failing design-only quality bar must NOT hard-block the wave.
        const designWarnings = Array.isArray(result.warnings) ? result.warnings : [];

        if (result.validated) {
          console.log(`   ✅ Story auto-validation passed (${result.count} stories)`);
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [...(result.message ? [result.message] : []), ...designWarnings]
          };
        }

        // Not validated but not necessarily a failure (deliverables incomplete, or a design-only
        // SD with thin stories / zero stories — surfaced as advisory warnings, not a hard block).
        console.log(`   ⚠️  Story auto-validation: ${result.message}`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`Story auto-validation: ${result.message}`, ...designWarnings]
        };
      } catch (error) {
        console.log(`   ⚠️  Story auto-validation error: ${error.message}`);
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`Story auto-validation error: ${error.message}`]
        };
      }
    },
    required: false // Non-blocking - advisory gate
  };
}
