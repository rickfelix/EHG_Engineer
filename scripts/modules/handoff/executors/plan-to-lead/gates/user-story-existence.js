/**
 * User Story Existence Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * SD-LEO-COMPLETION-GATES-001 US-002: Validates user stories exist when required
 * Prevents "Silent Success" anti-pattern
 */

/**
 * Create the USER_STORY_EXISTENCE_GATE validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createUserStoryExistenceGate(supabase) {
  return {
    name: 'USER_STORY_EXISTENCE_GATE',
    validator: async (ctx) => {
      console.log('\n📋 USER STORY EXISTENCE GATE (Silent Success Prevention)');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sdLegacyId = ctx.sdId;
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();

      // ORCHESTRATOR BYPASS
      const { data: childSDs, error: childError } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      const isParentOrchestrator = childSDs && childSDs.length > 0 && !childError;
      if (isParentOrchestrator) {
        console.log(`   ℹ️  Parent orchestrator SD detected (${childSDs.length} children)`);
        console.log('   ✅ User stories managed by child SDs - bypassing check');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Parent orchestrator - user stories belong to child SDs'],
          details: {
            sd_type: sdType,
            is_parent_orchestrator: true,
            child_count: childSDs.length,
            stories_required: false
          }
        };
      }

      // Get SD type validation profile
      const { data: profile, error: profileError } = await supabase
        .from('sd_type_validation_profiles')
        .select('requires_user_stories, requires_e2e_tests, description')
        .eq('sd_type', sdType)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.log(`   ⚠️  Profile query error: ${profileError.message}`);
      }

      // Determine if stories are required
      const storiesRequired = profile?.requires_user_stories ?? profile?.requires_e2e_tests ?? true;

      console.log(`   SD Type: ${sdType}`);
      console.log(`   Stories Required: ${storiesRequired ? 'YES' : 'NO'}`);

      if (!storiesRequired) {
        console.log('   ✅ User stories not required for this SD type');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`SD type '${sdType}' does not require user stories`],
          details: {
            sd_type: sdType,
            stories_required: false,
            profile_description: profile?.description
          }
        };
      }

      // Count user stories for this SD
      const sdIdForStories = sdUuid || sdLegacyId.toUpperCase().replace(/^(?!SD-)/, 'SD-');
      const { data: userStories, error: storyError } = await supabase
        .from('user_stories')
        .select('id, title, status, validation_status')
        .eq('sd_id', sdIdForStories);

      if (storyError) {
        console.log(`   ⚠️  User story query error: ${storyError.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Database error checking user stories: ${storyError.message}`],
          warnings: [],
          remediation: 'Check database connectivity and retry'
        };
      }

      const storyCount = userStories?.length || 0;
      console.log(`   User Stories Found: ${storyCount}`);

      if (storyCount === 0) {
        console.log('   ❌ BLOCKED: SD type requires user stories but none exist');
        console.log('');
        console.log('   This is the "Silent Success" anti-pattern:');
        console.log('   - SD claims to deliver functionality');
        console.log('   - No user stories defined to verify delivery');
        console.log('   - SD could complete without actually doing the work');
        console.log('');
        console.log('   REMEDIATION:');
        console.log(`   1. Create user stories for SD: ${sdLegacyId}`);
        console.log('   2. Run: node scripts/add-user-stories-to-database.js');
        console.log('   3. Or change SD type if stories are not applicable');

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [
            `BLOCKING: SD type '${sdType}' requires user stories but none exist`,
            'Silent Success Prevention: Cannot complete SD without defined acceptance criteria'
          ],
          warnings: [],
          remediation: `Create user stories for ${sdLegacyId} or change sd_type if stories are not applicable`,
          details: {
            sd_type: sdType,
            stories_required: true,
            stories_found: 0,
            anti_pattern: 'Silent Success'
          }
        };
      }

      // Stories exist - check their status
      const completedStories = userStories.filter(s =>
        s.status === 'completed' || s.validation_status === 'validated'
      );
      const draftStories = userStories.filter(s =>
        s.status === 'draft' || s.status === 'pending'
      );

      console.log(`   Completed/Validated: ${completedStories.length}/${storyCount}`);
      console.log(`   Draft/Pending: ${draftStories.length}/${storyCount}`);
      console.log('   ✅ User stories exist - gate passed');

      const warnings = [];
      if (draftStories.length > 0) {
        warnings.push(
          `${draftStories.length} of ${storyCount} user stories still in draft/pending status`
        );
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings,
        details: {
          sd_type: sdType,
          stories_required: true,
          stories_found: storyCount,
          stories_completed: completedStories.length,
          stories_draft: draftStories.length,
          story_titles: userStories.map(s => s.title)
        }
      };
    },
    required: true
  };
}
