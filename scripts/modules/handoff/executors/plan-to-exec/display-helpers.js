/**
 * Display Helpers for PLAN-TO-EXEC Handoff
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Pre-handoff warnings and EXEC phase requirements display
 */

/**
 * Display pre-handoff warnings from recent retrospectives
 *
 * Query recent retrospectives to surface common issues before handoff execution.
 * This allows the team to proactively address known friction points.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} handoffType - Type of handoff (e.g., 'PLAN_TO_EXEC')
 */
export async function displayPreHandoffWarnings(supabase, handoffType) {
  try {
    console.log('\n⚠️  PRE-HANDOFF WARNINGS: Recent Friction Points');
    console.log('='.repeat(70));

    // Query recent retrospectives of this handoff type
    const { data: retrospectives, error } = await supabase
      .from('retrospectives')
      .select('what_needs_improvement, action_items, key_learnings')
      .eq('retrospective_type', handoffType)
      .eq('status', 'PUBLISHED')
      .order('conducted_date', { ascending: false })
      .limit(10);

    if (error || !retrospectives || retrospectives.length === 0) {
      console.log('   ℹ️  No recent retrospectives found for this handoff type');
      console.log('');
      return;
    }

    // Aggregate common issues
    const issueFrequency = {};
    retrospectives.forEach(retro => {
      const improvements = Array.isArray(retro.what_needs_improvement)
        ? retro.what_needs_improvement
        : [];

      improvements.forEach(item => {
        const improvement = typeof item === 'string' ? item : item.improvement || item;
        if (improvement) {
          issueFrequency[improvement] = (issueFrequency[improvement] || 0) + 1;
        }
      });
    });

    // Sort by frequency and display top 3
    const topIssues = Object.entries(issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topIssues.length > 0) {
      console.log('   📊 Most Common Issues (last 10 retrospectives):');
      topIssues.forEach(([issue, count], index) => {
        console.log(`   ${index + 1}. [${count}x] ${issue}`);
      });
    } else {
      console.log('   ✅ No common issues identified in recent retrospectives');
    }

    console.log('');
  } catch (error) {
    console.log(`   ⚠️  Could not load warnings: ${error.message}`);
    console.log('');
  }
}

/**
 * Display EXEC phase requirements
 *
 * Proactive guidance showing what needs to be completed during EXEC phase.
 * This prevents the "forgot to create E2E tests" pattern by listing all
 * requirements at the START of EXEC rather than failing at handoff.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} _prd - PRD object (unused, for future expansion)
 * @param {Object} [options] - Options
 * @param {string} [options.sdType] - SD type (e.g., 'infrastructure') for conditional display
 */
export async function displayExecPhaseRequirements(supabase, sdId, _prd, options = {}) {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📋 EXEC PHASE REQUIREMENTS');
    console.log('   To complete EXEC-TO-PLAN handoff, you must:');
    console.log('='.repeat(70));

    // Get user stories for this SD
    const { data: userStories, error } = await supabase
      .from('user_stories')
      .select('id, title, status, e2e_test_path, e2e_test_status')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('\n   ⚠️  Could not retrieve user stories');
    } else if (userStories && userStories.length > 0) {
      console.log(`\n   □ Implement ${userStories.length} user stories:`);
      userStories.forEach((story, idx) => {
        const statusIcon = story.status === 'completed' ? '✓' : '○';
        console.log(`     ${statusIcon} US-${String(idx + 1).padStart(3, '0')}: ${story.title}`);
      });

      // E2E test requirements
      // PAT-E2E-STATUS-001 FIX: Infrastructure/documentation SDs don't require E2E tests.
      // The DB progress function uses OR logic (validation_status='validated' OR e2e_test_status='passing'),
      // so infra SDs complete via validation_status alone. Don't display E2E requirements for them.
      const sdType = (options.sdType || '').toLowerCase();
      const infraTypes = ['infrastructure', 'documentation', 'discovery_spike', 'orchestrator', 'uat', 'refactor'];
      const isInfraType = infraTypes.includes(sdType);

      if (isInfraType) {
        console.log('\n   ✓ E2E tests: NOT REQUIRED for this SD type');
        console.log(`     (sd_type="${sdType}" uses validation_status for progress)`);
      } else {
        const needsE2E = userStories.filter(s => !s.e2e_test_path);
        if (needsE2E.length > 0) {
          console.log(`\n   □ Create E2E tests for ${needsE2E.length} user stories:`);
          console.log('     - Each user story must have e2e_test_path populated');
          console.log('     - Tests must pass (e2e_test_status = "passing")');
          console.log('     - Example: tests/e2e/phase-N-stages.spec.ts');
        } else {
          console.log('\n   ✓ E2E test paths already mapped');
        }
      }
    } else {
      console.log('\n   ⚠️  No user stories found - create them during EXEC');
    }

    // Deliverables reminder
    console.log('\n   □ Complete all deliverables:');
    console.log('     - UI components implemented and functional');
    console.log('     - API endpoints working and tested');
    console.log('     - Database migrations applied (if applicable)');

    // Final steps
    console.log('\n   □ Final verification:');
    console.log('     - All unit tests passing');
    console.log('     - All E2E tests passing');
    console.log('     - Changes committed and pushed to feature branch');

    console.log('\n' + '='.repeat(70));
    console.log('   Run: node scripts/handoff.js execute EXEC-TO-PLAN ' + sdId);
    console.log('   when all requirements are complete.');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.log(`\n   ⚠️  Could not display EXEC requirements: ${error.message}`);
  }
}
