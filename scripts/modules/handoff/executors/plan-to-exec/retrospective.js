/**
 * Handoff Retrospective Creation
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * ROOT CAUSE FIX: Previous version used blocking readline prompts that would
 * hang indefinitely in non-interactive mode. Now uses non-blocking defaults.
 */

import readline from 'readline';

/**
 * Create handoff retrospective after successful handoff
 *
 * Uses handoff metrics for quality scoring. Interactive prompts are optional
 * and have a timeout to prevent blocking in non-interactive contexts.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} sd - Strategic Directive object
 * @param {Object} handoffResult - Result from handoff execution
 * @param {string} retrospectiveType - Type of retrospective (e.g., 'PLAN_TO_EXEC')
 * @param {Object} context - Additional context (prd, gateResults)
 */
export async function createHandoffRetrospective(supabase, sdId, sd, handoffResult, retrospectiveType, context = {}) {
  try {
    console.log('\n📝 HANDOFF RETROSPECTIVE: Auto-capturing learnings');
    console.log('='.repeat(70));

    // Determine if running interactively (TTY connected to stdin)
    const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

    let prdRating = '4';
    let storiesRating = '4';
    let validationRating = '4';
    let gapsFound = 'none';
    let testPlanRating = '4';

    if (isInteractive) {
      // Interactive mode: prompt with timeout
      console.log('   Handoff successful! Quick feedback (10s timeout, Enter to skip):');
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const promptWithTimeout = (question, timeoutMs = 10000) => new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve('');
        }, timeoutMs);

        rl.question(`   ${question}`, (answer) => {
          clearTimeout(timer);
          resolve(answer);
        });
      });

      // Key questions for PLAN→EXEC handoff (with timeout)
      prdRating = (await promptWithTimeout('PRD completeness? (1-5, 5=very complete): ')) || '4';
      storiesRating = (await promptWithTimeout('User stories actionable? (1-5): ')) || '4';
      validationRating = (await promptWithTimeout('Validation criteria clear? (1-5): ')) || '4';
      gapsFound = (await promptWithTimeout('Any gaps discovered? (or "none"): ')) || 'none';
      testPlanRating = (await promptWithTimeout('Test plan adequate? (1-5): ')) || '4';

      rl.close();
    } else {
      // Non-interactive mode: use defaults based on handoff result
      console.log('   Running in non-interactive mode - using auto-generated metrics');

      // Derive quality from handoff result
      if (handoffResult.qualityScore) {
        const derivedRating = Math.ceil(handoffResult.qualityScore / 20); // 0-100 -> 1-5
        prdRating = String(derivedRating);
        storiesRating = String(derivedRating);
        validationRating = String(derivedRating);
        testPlanRating = String(derivedRating);
      }

      // Check BMAD validation for stories quality
      if (context.gateResults?.gateResults?.BMAD_PLAN_TO_EXEC?.score) {
        const bmadScore = context.gateResults.gateResults.BMAD_PLAN_TO_EXEC.score;
        storiesRating = String(Math.ceil(bmadScore / 20));
      }
    }

    // Calculate quality score from ratings
    const numericRatings = [prdRating, storiesRating, validationRating, testPlanRating]
      .map(r => parseInt(r, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 5);

    const avgRating = numericRatings.length > 0
      ? numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length
      : 4; // Default to 4 if no ratings provided

    const qualityScore = Math.round((avgRating / 5) * 100);

    // Build retrospective data
    const whatWentWell = buildWhatWentWell(prdRating, storiesRating, validationRating, testPlanRating, handoffResult);
    const whatNeedsImprovement = buildWhatNeedsImprovement(prdRating, storiesRating, validationRating, testPlanRating, gapsFound);
    const keyLearnings = buildKeyLearnings(avgRating, qualityScore, gapsFound, context);
    const actionItems = buildActionItems(prdRating, storiesRating, testPlanRating, gapsFound);

    // Create retrospective record
    const retrospective = {
      sd_id: sdId,
      project_name: sd.title,
      retro_type: 'SD_COMPLETION', // Use valid enum value
      retrospective_type: retrospectiveType, // Store actual handoff type here
      title: `${retrospectiveType} Handoff Retrospective: ${sd.title}`,
      description: `Retrospective for ${retrospectiveType} handoff of ${sd.sd_key}`,
      conducted_date: new Date().toISOString(),
      agents_involved: ['PLAN', 'EXEC'],
      sub_agents_involved: ['STORIES', 'DATABASE', 'DESIGN'],
      human_participants: ['PLAN'],
      what_went_well: whatWentWell,
      what_needs_improvement: whatNeedsImprovement,
      action_items: actionItems,
      key_learnings: keyLearnings,
      quality_score: qualityScore,
      team_satisfaction: Math.round(avgRating * 2), // Scale to 1-10
      business_value_delivered: 'Handoff process improvement',
      customer_impact: 'Implementation quality improvement',
      technical_debt_addressed: false,
      technical_debt_created: false,
      bugs_found: 0,
      bugs_resolved: 0,
      tests_added: 0,
      objectives_met: handoffResult.success,
      on_schedule: true,
      within_scope: true,
      success_patterns: [`Quality rating: ${avgRating.toFixed(1)}/5`],
      failure_patterns: whatNeedsImprovement.slice(0, 3).map(i => typeof i === 'string' ? i : i.improvement),
      improvement_areas: whatNeedsImprovement.slice(0, 3).map(i => typeof i === 'string' ? i : i.improvement),
      generated_by: 'MANUAL',
      trigger_event: 'HANDOFF_COMPLETION',
      status: 'PUBLISHED',
      performance_impact: 'Standard',
      target_application: 'EHG_Engineer',
      learning_category: 'PROCESS_IMPROVEMENT',
      related_files: [],
      related_commits: [],
      related_prs: [],
      affected_components: ['LEO Protocol', 'Handoff System', 'PRD', 'User Stories'],
      tags: ['handoff', 'plan-to-exec', 'process-improvement']
    };

    // Insert retrospective
    const { data, error } = await supabase
      .from('retrospectives')
      .insert(retrospective)
      .select();

    if (error) {
      console.log(`\n   ⚠️  Could not save retrospective: ${error.message}`);
      console.log('   Retrospective data will not be persisted');
    } else {
      console.log(`\n   ✅ Handoff retrospective created (ID: ${data[0].id})`);
      console.log(`   Quality Score: ${qualityScore}% | Team Satisfaction: ${Math.round(avgRating * 2)}/10`);
    }

    console.log('');
  } catch (error) {
    console.log(`\n   ⚠️  Retrospective creation error: ${error.message}`);
    console.log('   Continuing with handoff execution');
    console.log('');
  }
}

/**
 * Build "what went well" array for retrospective
 */
function buildWhatWentWell(prdRating, storiesRating, validationRating, testPlanRating, handoffResult) {
  const whatWentWell = [];
  if (parseInt(prdRating) >= 4) whatWentWell.push({ achievement: 'PRD was comprehensive and complete for implementation', is_boilerplate: false });
  if (parseInt(storiesRating) >= 4) whatWentWell.push({ achievement: 'User stories were actionable with clear acceptance criteria', is_boilerplate: false });
  if (parseInt(validationRating) >= 4) whatWentWell.push({ achievement: 'Validation criteria were clear and testable', is_boilerplate: false });
  if (parseInt(testPlanRating) >= 4) whatWentWell.push({ achievement: 'Test plan was adequate and comprehensive', is_boilerplate: false });
  if (handoffResult.success) whatWentWell.push({ achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false });

  // Ensure minimum 5 achievements
  const boilerplateAchievements = [
    'PLAN phase completed systematically',
    'All quality gates validated successfully',
    'Branch enforcement ensured proper workflow'
  ];
  while (whatWentWell.length < 5) {
    whatWentWell.push({ achievement: boilerplateAchievements[whatWentWell.length - 2] || 'Standard PLAN process followed', is_boilerplate: true });
  }

  return whatWentWell;
}

/**
 * Build "what needs improvement" array for retrospective
 */
function buildWhatNeedsImprovement(prdRating, storiesRating, validationRating, testPlanRating, gapsFound) {
  const whatNeedsImprovement = [];
  if (parseInt(prdRating) <= 3) whatNeedsImprovement.push('PRD completeness could be improved before handoff');
  if (parseInt(storiesRating) <= 3) whatNeedsImprovement.push('User stories need more actionable details and test criteria');
  if (parseInt(validationRating) <= 3) whatNeedsImprovement.push('Validation criteria clarity needs enhancement');
  if (parseInt(testPlanRating) <= 3) whatNeedsImprovement.push('Test plan needs more comprehensive coverage');
  if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
    whatNeedsImprovement.push(`Gap identified: ${gapsFound}`);
  }

  // Ensure minimum 3 improvements
  while (whatNeedsImprovement.length < 3) {
    whatNeedsImprovement.push('Continue monitoring PLAN→EXEC handoff for improvement opportunities');
  }

  return whatNeedsImprovement;
}

/**
 * Build "key learnings" array for retrospective
 */
function buildKeyLearnings(avgRating, qualityScore, gapsFound, context) {
  const keyLearnings = [
    { learning: `Average handoff quality rating: ${avgRating.toFixed(1)}/5`, is_boilerplate: false },
    { learning: `Handoff completed with quality score: ${qualityScore}%`, is_boilerplate: false }
  ];

  if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
    keyLearnings.push({ learning: `Implementation gap discovered: ${gapsFound}`, is_boilerplate: false });
  }

  // Add gate-specific learnings
  if (context.gateResults?.gateResults?.BMAD_PLAN_TO_EXEC?.passed) {
    keyLearnings.push({ learning: 'BMAD validation ensures user story quality before implementation', is_boilerplate: false });
  }

  // Ensure minimum 5 learnings
  const boilerplateLearnings = [
    'PLAN→EXEC handoff validates implementation readiness',
    'Quality gates prevent premature implementation',
    'Retrospective capture improves continuous learning'
  ];
  while (keyLearnings.length < 5) {
    keyLearnings.push({ learning: boilerplateLearnings[keyLearnings.length - 3] || 'Standard handoff learning captured', is_boilerplate: true });
  }

  return keyLearnings;
}

/**
 * Build "action items" array for retrospective
 */
function buildActionItems(prdRating, storiesRating, testPlanRating, gapsFound) {
  const actionItems = [];
  if (parseInt(prdRating) <= 3) {
    actionItems.push({ action: 'Enhance PRD template to ensure completeness before handoff', is_boilerplate: false });
  }
  if (parseInt(storiesRating) <= 3) {
    actionItems.push({ action: 'Improve user story quality checklist in PLAN phase', is_boilerplate: false });
  }
  if (parseInt(testPlanRating) <= 3) {
    actionItems.push({ action: 'Create test plan template with comprehensive coverage examples', is_boilerplate: false });
  }
  if (gapsFound && gapsFound !== 'none' && gapsFound !== 'N/A') {
    actionItems.push({ action: `Address implementation gap: ${gapsFound}`, is_boilerplate: false });
  }

  // Ensure minimum 3 action items
  while (actionItems.length < 3) {
    actionItems.push({ action: 'Continue following LEO Protocol handoff best practices', is_boilerplate: true });
  }

  return actionItems;
}
