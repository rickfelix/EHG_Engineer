/**
 * Acceptance Criteria Validation Gate for PLAN-TO-LEAD
 *
 * Validates that user stories have acceptance criteria defined AND that
 * those criteria have been verified (via validation_status, story_test_mappings,
 * or e2e_test_status). Prevents completion of SDs where acceptance criteria
 * exist on paper but were never actually validated.
 *
 * BLOCKING gate — score >= 60 AND no story scores 0.
 */

export function createAcceptanceCriteriaValidationGate(supabase) {
  return {
    name: 'ACCEPTANCE_CRITERIA_VALIDATION',
    validator: async (ctx) => {
      console.log('\n✅ ACCEPTANCE CRITERIA VALIDATION GATE');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const _sdKey = ctx.sd?.sd_key || ctx.sdId;
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();

      // ORCHESTRATOR BYPASS
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Parent orchestrator SD (${childSDs.length} children) — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Orchestrator SD — acceptance criteria deferred to children'],
          details: { is_orchestrator: true, child_count: childSDs.length }
        };
      }

      // SD TYPE CHECK — does this type require user stories?
      const { data: profile } = await supabase
        .from('sd_type_validation_profiles')
        .select('requires_user_stories')
        .eq('sd_type', sdType)
        .single();

      const storiesRequired = profile?.requires_user_stories ?? true;
      if (!storiesRequired) {
        console.log(`   ℹ️  SD type '${sdType}' does not require user stories — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [`SD type '${sdType}' does not require acceptance criteria`],
          details: { sd_type: sdType, stories_required: false }
        };
      }

      // Query user stories
      const { data: stories, error: storyError } = await supabase
        .from('user_stories')
        .select('id, title, status, validation_status, acceptance_criteria, e2e_test_status, e2e_test_path')
        .eq('sd_id', sdUuid);

      if (storyError) {
        console.log(`   ⚠️  User story query error: ${storyError.message}`);
        return {
          passed: false, score: 0, max_score: 100,
          issues: [`Database error: ${storyError.message}`],
          warnings: [], remediation: 'Check database connectivity and retry'
        };
      }

      // No stories found — pass (USER_STORY_EXISTENCE_GATE handles that case)
      if (!stories || stories.length === 0) {
        console.log('   ℹ️  No user stories found — deferring to USER_STORY_EXISTENCE_GATE');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['No user stories to validate acceptance criteria against'],
          details: { story_count: 0 }
        };
      }

      // Check for test mappings
      const storyIds = stories.map(s => s.id);
      const { data: testMappings } = await supabase
        .from('story_test_mappings')
        .select('story_id')
        .in('story_id', storyIds);

      const storiesWithTests = new Set((testMappings || []).map(m => m.story_id));

      // Score each story
      const storyScores = [];
      for (const story of stories) {
        const hasAcceptanceCriteria = story.acceptance_criteria &&
          (Array.isArray(story.acceptance_criteria)
            ? story.acceptance_criteria.length > 0
            : typeof story.acceptance_criteria === 'string' && story.acceptance_criteria.trim().length > 0);

        if (!hasAcceptanceCriteria) {
          storyScores.push({ story, score: 0, reason: 'Missing acceptance criteria' });
          continue;
        }

        const isValidated = story.validation_status === 'validated' ||
                           story.status === 'completed';
        const hasTestEvidence = storiesWithTests.has(story.id) ||
                               (story.e2e_test_status && ['passing', 'created'].includes(story.e2e_test_status));

        if (isValidated && hasTestEvidence) {
          storyScores.push({ story, score: 100, reason: 'Validated with test evidence' });
        } else if (isValidated) {
          storyScores.push({ story, score: 70, reason: 'Validated but no test mapping' });
        } else {
          storyScores.push({ story, score: 50, reason: 'Has criteria but not validated' });
        }
      }

      // Calculate overall score
      const overallScore = Math.round(
        storyScores.reduce((sum, s) => sum + s.score, 0) / storyScores.length
      );
      const hasZeroScore = storyScores.some(s => s.score === 0);
      const passed = overallScore >= 60 && !hasZeroScore;

      // Build issues and warnings
      const issues = [];
      const warnings = [];

      for (const { story, score, reason } of storyScores) {
        const label = `${story.title || story.id}: ${reason} (score: ${score})`;
        if (score === 0) {
          issues.push(label);
          console.log(`   ❌ ${label}`);
        } else if (score <= 70) {
          warnings.push(label);
          console.log(`   ⚠️  ${label}`);
        } else {
          console.log(`   ✅ ${label}`);
        }
      }

      console.log(`\n   Overall Score: ${overallScore}/100 (threshold: 60, no zeros allowed)`);
      console.log(`   ${passed ? '✅ PASSED' : '❌ FAILED'}`);

      if (!passed) {
        console.log('\n   REMEDIATION:');
        if (hasZeroScore) {
          console.log('   - Add acceptance_criteria to all user stories');
        }
        if (overallScore < 60) {
          console.log('   - Validate stories and add test evidence');
        }
      }

      return {
        passed,
        score: overallScore,
        max_score: 100,
        issues,
        warnings,
        ...((!passed) && {
          remediation: 'Add acceptance criteria to all stories and validate them with test evidence'
        }),
        details: {
          story_count: stories.length,
          story_scores: storyScores.map(({ story, score, reason }) => ({
            id: story.id, title: story.title, score, reason
          })),
          overall_score: overallScore,
          has_zero_score: hasZeroScore
        }
      };
    },
    required: true
  };
}
