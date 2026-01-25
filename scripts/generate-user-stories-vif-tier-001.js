import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function generateUserStories() {
  try {
    console.log('\n=== GENERATING USER STORIES FOR PRD-SD-VIF-TIER-001 ===\n');

    const prdId = 'PRD-SD-VIF-TIER-001';

    // Get current PRD
    const { data: prd, error: fetchError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (fetchError) {
      console.error('Error fetching PRD:', fetchError.message);
      return;
    }

    console.log('Current PRD:', prd.title);

    // Generate user stories based on FR-1 through FR-6
    const userStories = [
      {
        id: 'US-TIER-001',
        title: 'Automatic Complexity Assessment',
        as_a: 'Chairman',
        i_want: 'the system to automatically analyze my venture idea complexity',
        so_that: 'I receive an intelligent tier recommendation without manual evaluation',
        acceptance_criteria: [
          'Given I enter a venture description, When I submit, Then assessComplexity() analyzes novelty, investment scale, and strategic alignment in <3 seconds',
          'Given complexity assessment completes, When results are ready, Then I see recommended tier (0, 1, or 2) with confidence score',
          'Given assessment is uncertain, When confidence is low, Then system defaults to Tier 1 (standard flow)',
          'Given multiple complexity signals detected, When analyzing, Then system prioritizes strategic alignment > investment scale > novelty'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: [],
        related_requirements: ['FR-1', 'TR-1']
      },
      {
        id: 'US-TIER-002',
        title: 'Tier Selection with AI Recommendation',
        as_a: 'Chairman',
        i_want: 'to see the AI-recommended tier with clear rationale',
        so_that: 'I can make an informed decision whether to accept or override',
        acceptance_criteria: [
          'Given complexity assessment completes, When tier selection UI appears, Then I see recommended tier highlighted with visual badge',
          'Given tier recommendation is displayed, When I review, Then I see human-readable rationale explaining why this tier was chosen',
          'Given I want more details, When I hover over rationale, Then I see complexity scores broken down by dimension (novelty, investment, alignment)',
          'Given tier UI is shown, When displayed, Then all 3 tiers (0, 1, 2) are visible with clear differentiation via color coding'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: ['US-TIER-001'],
        related_requirements: ['FR-2', 'TR-2']
      },
      {
        id: 'US-TIER-003',
        title: 'One-Click Chairman Override',
        as_a: 'Chairman',
        i_want: 'to override the AI tier recommendation with a single click',
        so_that: 'I maintain final control over venture complexity routing',
        acceptance_criteria: [
          'Given tier recommendation is Tier 1, When I click Tier 0 button, Then tier changes immediately without confirmation modal',
          'Given I override to different tier, When change is made, Then I see immediate visual feedback (badge color/text updates)',
          'Given I override tier, When system records change, Then metadata stores original recommendation and my selected tier',
          'Given override is recorded, When I view venture later, Then I see indicator showing I overrode the AI recommendation'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'S',
        dependencies: ['US-TIER-002'],
        related_requirements: ['FR-6', 'TR-2']
      },
      {
        id: 'US-TIER-004',
        title: 'Tier Metadata Persistence',
        as_a: 'System',
        i_want: 'to store tier and complexity assessment data in ventures.metadata',
        so_that: 'tier information persists and can be retrieved without schema migration',
        acceptance_criteria: [
          'Given venture is created with tier, When saved, Then ventures.metadata.tier stores selected tier number (0, 1, or 2)',
          'Given complexity assessment runs, When completed, Then ventures.metadata.complexity_assessment stores full assessment object with scores and rationale',
          'Given Chairman overrides tier, When recorded, Then ventures.metadata.tier_override stores original and selected tiers with timestamp',
          'Given venture is saved, When I reload page, Then tier and assessment data persist correctly from JSONB field'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'S',
        dependencies: [],
        related_requirements: ['FR-3', 'TR-4']
      },
      {
        id: 'US-TIER-005',
        title: 'Stage Routing by Tier',
        as_a: 'Workflow Orchestrator',
        i_want: 'to route venture stages based on selected tier',
        so_that: 'Tier 0 executes Stages 1-3, Tier 1 executes 1-10, Tier 2 executes 1-15',
        acceptance_criteria: [
          'Given venture has tier=0, When CompleteWorkflowOrchestrator starts, Then only Stages 1-3 execute (MVP validation)',
          'Given venture has tier=1, When workflow runs, Then Stages 1-10 execute (standard flow)',
          'Given venture has tier=2, When workflow runs, Then all Stages 1-15 execute (deep research)',
          'Given venture is in progress, When I check status, Then UI displays total stages for tier (e.g., "Stage 2 of 3" for Tier 0)'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: ['US-TIER-004'],
        related_requirements: ['FR-4', 'TR-5']
      },
      {
        id: 'US-TIER-006',
        title: 'TierIndicator Visual Component',
        as_a: 'User',
        i_want: 'to see venture tier displayed consistently across all views',
        so_that: 'I can quickly identify complexity level without opening details',
        acceptance_criteria: [
          'Given I view venture list, When ventures load, Then each venture shows TierIndicator badge with tier number',
          'Given TierIndicator is displayed, When shown, Then Tier 0 is green, Tier 1 is blue, Tier 2 is purple (distinct colors)',
          'Given I hover over TierIndicator, When tooltip appears, Then I see tier meaning (e.g., "Tier 0: MVP Sandbox, 15min, Stages 1-3")',
          'Given venture was overridden, When TierIndicator displays, Then I see small indicator showing Chairman changed the tier'
        ],
        priority: 'HIGH',
        estimated_effort: 'S',
        dependencies: ['US-TIER-004'],
        related_requirements: ['FR-5', 'TR-3']
      },
      {
        id: 'US-TIER-007',
        title: 'Tier 0 Fast-Track Flow',
        as_a: 'Chairman',
        i_want: 'Tier 0 ventures to complete in ~15 minutes',
        so_that: 'simple MVP ideas do not require unnecessary detailed analysis',
        acceptance_criteria: [
          'Given I create simple MVP idea, When tier assessment runs, Then system recommends Tier 0',
          'Given I accept Tier 0, When workflow starts, Then only 3 stages execute (Basic Validation, Quick Market Check, MVP Definition)',
          'Given Tier 0 workflow completes, When measured, Then average completion time is ≤15 minutes',
          'Given Tier 0 venture is done, When I review, Then I can upgrade to Tier 1 or Tier 2 for deeper analysis'
        ],
        priority: 'HIGH',
        estimated_effort: 'M',
        dependencies: ['US-TIER-005'],
        related_requirements: ['FR-1', 'FR-4']
      },
      {
        id: 'US-TIER-008',
        title: 'Tier Accuracy Tracking',
        as_a: 'Product Manager',
        i_want: 'to measure tier recommendation accuracy',
        so_that: 'I can verify ≥80% accuracy target is met',
        acceptance_criteria: [
          'Given ventures are created over 1 month, When I analyze data, Then I calculate acceptance rate (ventures where Chairman did NOT override)',
          'Given 100 ventures created, When accuracy is measured, Then ≥80 ventures accepted AI recommendation without override',
          'Given low accuracy detected, When threshold <80%, Then system flags for algorithm improvement',
          'Given override data collected, When analyzed, Then I see patterns in what types of ideas Chairman prefers to override'
        ],
        priority: 'MEDIUM',
        estimated_effort: 'S',
        dependencies: ['US-TIER-003', 'US-TIER-004'],
        related_requirements: ['FR-1']
      },
      {
        id: 'US-TIER-009',
        title: 'Backward Compatibility Verification',
        as_a: 'QA Engineer',
        i_want: 'tier system to not break existing venture creation',
        so_that: 'zero regressions occur when tier feature is deployed',
        acceptance_criteria: [
          'Given existing venture creation E2E tests, When tier feature is enabled, Then all existing tests pass without modification',
          'Given venture is created without tier selection, When saved, Then system defaults to Tier 1 and workflow proceeds normally',
          'Given tier feature flag is disabled, When venture created, Then standard workflow executes without tier UI',
          'Given venture has no tier metadata, When workflow runs, Then orchestrator defaults to full 15-stage execution (backward compatible)'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: ['US-TIER-005'],
        related_requirements: ['TR-6']
      },
      {
        id: 'US-TIER-010',
        title: 'Component Size Compliance',
        as_a: 'Tech Lead',
        i_want: 'all tier components to stay within 300-600 LOC',
        so_that: 'code remains testable and maintainable per LEO Protocol',
        acceptance_criteria: [
          'Given TierIndicator component is built, When measured, Then LOC count is ≤150 (target: simple reusable component)',
          'Given VentureCreationDialog is modified, When measured, Then total LOC remains ≤600 (with tier selection added)',
          'Given intelligenceAgents.ts is extended, When assessComplexity() added, Then module stays ≤800 LOC (or extracted to new file)',
          'Given all components are reviewed, When size audit runs, Then >80% of components fall within 300-600 LOC guideline'
        ],
        priority: 'MEDIUM',
        estimated_effort: 'S',
        dependencies: [],
        related_requirements: ['TR-6']
      }
    ];

    // Update PRD with user stories
    const updatedPlanChecklist = prd.plan_checklist.map(item => {
      if (item.text.includes('User stories generated')) {
        return { ...item, checked: true };
      }
      return item;
    });

    const { data: _updated, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({
        backlog_items: userStories,
        plan_checklist: updatedPlanChecklist,
        progress: 60,
        updated_at: new Date().toISOString()
      })
      .eq('id', prdId)
      .select();

    if (updateError) {
      console.error('Error updating PRD:', updateError.message);
      return;
    }

    console.log('\n✅ Successfully generated user stories for PRD-SD-VIF-TIER-001');
    console.log('\nUser Stories Created:');
    userStories.forEach(story => {
      console.log(`  • ${story.id}: ${story.title} (${story.priority}, ${story.estimated_effort})`);
    });

    console.log('\n📊 Summary:');
    console.log('  Total User Stories:', userStories.length);
    console.log('  Critical Priority:', userStories.filter(s => s.priority === 'CRITICAL').length);
    console.log('  High Priority:', userStories.filter(s => s.priority === 'HIGH').length);
    console.log('  Medium Priority:', userStories.filter(s => s.priority === 'MEDIUM').length);
    console.log('  Acceptance Criteria:', userStories.reduce((sum, s) => sum + s.acceptance_criteria.length, 0));
    console.log('  PRD Progress:', '60%');

    console.log('\n📋 Next Steps:');
    console.log('1. Execute PLAN-to-EXEC handoff verification');
    console.log('2. Begin EXEC phase implementation');
    console.log('3. Create E2E tests for each user story');

  } catch (err) {
    console.error('Failed to generate user stories:', err.message);
    console.error(err);
  }
}

generateUserStories();
