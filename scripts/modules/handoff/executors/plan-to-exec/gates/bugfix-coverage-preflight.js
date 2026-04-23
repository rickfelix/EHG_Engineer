/**
 * Bugfix Coverage Preflight Gate (advisory, non-blocking)
 * Part of SD-LEARN-FIX-ADDRESS-PAT-EXECTOPLAN-001 (FR-3)
 *
 * Addresses PAT-HF-EXECTOPLAN-a14ec7de: bugfix SDs repeatedly failing EXEC-TO-PLAN
 * with 0% score because USER_STORY_COVERAGE + MANDATORY_TESTING_VALIDATION both fire
 * post-implementation. This gate shifts DISCOVERY left — at PLAN-TO-EXEC, enumerate
 * what EXEC-TO-PLAN will require so the developer enters EXEC phase with clear
 * expectations.
 *
 * Never blocks — always passed=true, surfaces warnings only.
 */

const APPLICABLE_TYPES = new Set(['bugfix', 'feature', 'security']);

export function createBugfixCoveragePreflightGate(supabase) {
  return {
    name: 'BUGFIX_COVERAGE_PREFLIGHT',
    validator: async (ctx) => {
      console.log('\n📋 BUGFIX COVERAGE PREFLIGHT (advisory)');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      if (!APPLICABLE_TYPES.has(sdType)) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { skipped: true, reason: sdType } };
      }
      if (!supabase || !sdId) {
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { skipped: true, reason: 'missing_context' } };
      }

      const warnings = [];

      // Check 1: user_stories existence + AC coverage (advisory preview of USER_STORY_COVERAGE gate)
      const { data: stories, error: storyErr } = await supabase
        .from('user_stories')
        .select('story_key, status, validation_status, acceptance_criteria, title')
        .eq('sd_id', sdId);
      if (storyErr) {
        console.log(`   ⚠️  Could not query user_stories: ${storyErr.message}`);
      } else if (!stories || stories.length === 0) {
        warnings.push(`No user_stories rows for this ${sdType} SD. EXEC-TO-PLAN USER_STORY_COVERAGE will score 0 unless stories are created during EXEC.`);
      } else {
        const uncovered = stories.filter(s => !(s.acceptance_criteria && s.acceptance_criteria.length > 0));
        if (uncovered.length > 0) {
          warnings.push(`${uncovered.length}/${stories.length} user_stories lack acceptance_criteria (story_keys: ${uncovered.map(u => u.story_key).join(', ')}). EXEC must ensure AC + status before EXEC-TO-PLAN.`);
        }
        console.log(`   📊 user_stories: ${stories.length} rows, ${stories.length - uncovered.length} have AC`);
      }

      // Check 2: TESTING sub-agent reminder (advisory preview of MANDATORY_TESTING_VALIDATION)
      const { data: testingRuns, error: testErr } = await supabase
        .from('sub_agent_execution_results')
        .select('id, verdict, created_at')
        .eq('sd_id', sdId)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);
      if (testErr) {
        console.log(`   ⚠️  Could not query sub_agent_execution_results: ${testErr.message}`);
      } else if (!testingRuns || testingRuns.length === 0) {
        warnings.push(`No TESTING sub-agent execution yet. Required for ${sdType} SDs before EXEC-TO-PLAN. Run: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY ${sdId}`);
      } else {
        console.log(`   ✅ TESTING run exists: ${testingRuns[0].verdict} @ ${testingRuns[0].created_at}`);
      }

      if (warnings.length > 0) {
        console.log(`   ⚠️  ${warnings.length} preflight warning(s) for upcoming EXEC-TO-PLAN:`);
        warnings.forEach(w => console.log(`      - ${w}`));
      } else {
        console.log('   ✅ No preflight warnings — bugfix SD ready for EXEC');
      }

      return {
        passed: true, // advisory only, never blocks
        score: 100,
        max_score: 100,
        issues: [],
        warnings,
        details: { sdType, warningCount: warnings.length }
      };
    },
    required: false // advisory
  };
}
