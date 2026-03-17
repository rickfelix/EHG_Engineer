import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function generateUserStories() {
  try {
    console.log('\n=== GENERATING USER STORIES FOR PRD-SD-VIF-PARENT-001 ===\n');

    const prdId = 'PRD-SD-VIF-PARENT-001';

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

    // Generate comprehensive user stories based on PRD functional requirements
    const userStories = [
      {
        id: 'US-VIF-001',
        title: 'Quick Idea Capture (Tier 0)',
        as_a: 'Chairman',
        i_want: 'to capture a basic venture idea in under 30 seconds',
        so_that: 'I can quickly document inspiration without disrupting my workflow',
        acceptance_criteria: [
          'Given I am on the ideation page, When I click "Quick Capture", Then a minimal form appears with only essential fields (title, brief description)',
          'Given I fill in basic idea details, When I submit, Then the idea is saved and assigned Tier 0 status in under 30 seconds',
          'Given I submit a Tier 0 idea, When saved, Then I receive confirmation and option to "Expand Later" or "Continue to Tier 1"',
          'Given a Tier 0 idea is saved, When I view it later, Then I can upgrade it to Tier 1 or Tier 2 as needed'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: ['SD-VIF-TIER-001'],
        related_requirements: ['FR-1']
      },
      {
        id: 'US-VIF-002',
        title: 'Structured Idea Evaluation (Tier 1)',
        as_a: 'Chairman',
        i_want: 'to provide structured details for an idea in 5-10 minutes',
        so_that: 'I can capture enough context for meaningful evaluation without excessive time investment',
        acceptance_criteria: [
          'Given I am evaluating an idea, When I select Tier 1, Then a structured form appears with market, competition, value prop, and resource fields',
          'Given I am filling Tier 1 form, When I complete required fields, Then the system estimates time remaining and shows progress indicator',
          'Given I submit a Tier 1 idea, When saved, Then the system validates completeness and assigns quality score',
          'Given a Tier 1 idea is submitted, When validation passes, Then the idea becomes eligible for GCIA intelligence scan'
        ],
        priority: 'HIGH',
        estimated_effort: 'L',
        dependencies: ['SD-VIF-TIER-001'],
        related_requirements: ['FR-1', 'FR-2']
      },
      {
        id: 'US-VIF-003',
        title: 'Deep Analysis Mode (Tier 2)',
        as_a: 'Chairman',
        i_want: 'to conduct comprehensive analysis for strategic ventures',
        so_that: 'I can make informed decisions on high-potential opportunities',
        acceptance_criteria: [
          'Given I have a complex venture idea, When I select Tier 2, Then a comprehensive form appears with financial projections, risk analysis, and strategic alignment sections',
          'Given I am completing Tier 2 analysis, When I reach 50% completion, Then I can save draft and resume later',
          'Given I complete Tier 2 analysis, When I submit, Then the system validates all required sections and generates preliminary feasibility score',
          'Given a Tier 2 idea is validated, When I view the summary, Then I see integrated insights from STA and GCIA analyses'
        ],
        priority: 'MEDIUM',
        estimated_effort: 'XL',
        dependencies: ['SD-VIF-TIER-001', 'SD-VIF-INTEL-001'],
        related_requirements: ['FR-1', 'FR-3']
      },
      {
        id: 'US-VIF-004',
        title: 'Smart Complexity Routing',
        as_a: 'Chairman',
        i_want: 'the system to suggest the appropriate tier based on my idea description',
        so_that: 'I can save time deciding the right level of detail needed',
        acceptance_criteria: [
          'Given I start typing an idea description, When the system detects complexity signals (keywords, length, specificity), Then it suggests the most appropriate tier',
          'Given the system suggests Tier 2, When I prefer Tier 1, Then I can override the suggestion and proceed with my choice',
          'Given multiple ideas are submitted, When routing accuracy is measured, Then the system achieves >85% correct tier assignments',
          'Given a misrouted idea, When I manually change tiers, Then the system learns from this feedback to improve future routing'
        ],
        priority: 'HIGH',
        estimated_effort: 'L',
        dependencies: ['SD-VIF-TIER-001'],
        related_requirements: ['FR-2']
      },
      {
        id: 'US-VIF-005',
        title: 'LLM-Powered Competitive Intelligence',
        as_a: 'Chairman',
        i_want: 'to receive AI-generated competitive analysis for my venture ideas',
        so_that: 'I can understand market landscape without manual research',
        acceptance_criteria: [
          'Given I have a Tier 1+ idea, When I request GCIA scan, Then the system triggers LLM analysis and shows estimated cost ($0.10-0.17)',
          'Given GCIA scan is initiated, When analysis completes, Then I receive structured report with competitors, market trends, and strategic recommendations',
          'Given I view GCIA report, When I find insights valuable, Then I can bookmark key findings and integrate them into venture details',
          'Given multiple GCIA scans are run, When I view cost dashboard, Then I see real-time usage tracking and remaining budget ($50/month limit)'
        ],
        priority: 'HIGH',
        estimated_effort: 'XL',
        dependencies: ['SD-VIF-INTEL-001'],
        related_requirements: ['FR-3']
      },
      {
        id: 'US-VIF-006',
        title: 'GCIA Cost Management & Budget Controls',
        as_a: 'System Administrator',
        i_want: 'to enforce strict budget limits on GCIA API usage',
        so_that: 'monthly costs stay within $50 budget and prevent overruns',
        acceptance_criteria: [
          'Given monthly GCIA usage reaches $45, When I check dashboard, Then I see warning notification and usage summary',
          'Given monthly budget reaches $50, When a user attempts GCIA scan, Then the system blocks request and displays "Budget Limit Reached" message with manual override option',
          'Given budget is exceeded, When administrator approves override, Then scan proceeds but is logged as "over-budget" with justification',
          'Given month-end arrives, When budget resets, Then users receive notification and can resume GCIA scans'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'M',
        dependencies: ['SD-VIF-INTEL-001'],
        related_requirements: ['FR-4']
      },
      {
        id: 'US-VIF-007',
        title: 'Recursive Refinement Workflow',
        as_a: 'Chairman',
        i_want: 'to iteratively improve venture ideas based on feedback',
        so_that: 'ideas evolve from initial concept to refined strategic opportunity',
        acceptance_criteria: [
          'Given I view a venture idea, When I click "Request Refinement", Then I can provide structured feedback on specific sections',
          'Given feedback is submitted, When venture owner reviews, Then they see annotated suggestions with context and rationale',
          'Given refinement is completed, When I compare versions, Then I see side-by-side diff of changes and quality score improvement',
          'Given multiple refinement cycles occur, When I view history, Then I see progression timeline with quality scores and decision points'
        ],
        priority: 'MEDIUM',
        estimated_effort: 'L',
        dependencies: ['SD-VIF-REFINE-001'],
        related_requirements: ['FR-5']
      },
      {
        id: 'US-VIF-008',
        title: 'Venture Quality Scoring',
        as_a: 'Chairman',
        i_want: 'to see objective quality scores for venture ideas',
        so_that: 'I can prioritize evaluation efforts and identify promising opportunities',
        acceptance_criteria: [
          'Given a venture is submitted, When quality scoring runs, Then I see score breakdown by dimensions (market, competition, feasibility, resources)',
          'Given a Tier 1 venture scores <60%, When I review, Then the system suggests areas for improvement and offers "Refine" workflow',
          'Given ventures are scored, When I view portfolio, Then I can sort/filter by quality score and see aggregate statistics',
          'Given quality scoring is deployed, When measured over 3 months, Then 80%+ ventures pass Tier 1 validation (quality score >60%)'
        ],
        priority: 'MEDIUM',
        estimated_effort: 'M',
        dependencies: ['SD-VIF-TIER-001', 'SD-VIF-REFINE-001'],
        related_requirements: ['FR-6']
      },
      {
        id: 'US-VIF-009',
        title: 'Performance Monitoring - Time Reduction',
        as_a: 'Product Manager',
        i_want: 'to track idea-to-evaluation time metrics',
        so_that: 'I can verify 70% time reduction target (20min → 6min) is achieved',
        acceptance_criteria: [
          'Given ventures are submitted, When I view analytics dashboard, Then I see average time-to-evaluation by tier',
          'Given baseline is 20 minutes, When measured after 1 month, Then average time is <6 minutes for 80%+ of ventures',
          'Given time metrics are collected, When I export report, Then I see breakdown by user, tier, and complexity level',
          'Given performance targets are met, When I review quarterly, Then the system maintains <6min average consistently'
        ],
        priority: 'LOW',
        estimated_effort: 'S',
        dependencies: [],
        related_requirements: ['FR-1', 'FR-2']
      },
      {
        id: 'US-VIF-010',
        title: 'Integration Testing & Validation',
        as_a: 'QA Engineer',
        i_want: 'comprehensive E2E test coverage for all user workflows',
        so_that: 'system reliability meets LEO Protocol standards (>90% coverage)',
        acceptance_criteria: [
          'Given all features are implemented, When Playwright tests run, Then >90% of user stories have automated E2E coverage',
          'Given tests are executed, When CI/CD pipeline runs, Then all critical paths (Tier 0/1/2 capture, GCIA integration, refinement) pass',
          'Given component size is measured, When analyzed, Then >80% of components fall within 300-600 LOC optimal range',
          'Given system is deployed, When load tested with 50 concurrent users, Then response time remains <2 seconds for all tiers'
        ],
        priority: 'CRITICAL',
        estimated_effort: 'XL',
        dependencies: ['SD-VIF-TIER-001', 'SD-VIF-INTEL-001', 'SD-VIF-REFINE-001'],
        related_requirements: ['TR-5']
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
        progress: 75,
        updated_at: new Date().toISOString()
      })
      .eq('id', prdId)
      .select();

    if (updateError) {
      console.error('Error updating PRD:', updateError.message);
      return;
    }

    console.log('\n✅ Successfully generated user stories for PRD-SD-VIF-PARENT-001');
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
    console.log('  PRD Progress:', '75%');

    console.log('\n📋 Next Steps:');
    console.log('1. Execute PLAN verification sub-agents');
    console.log('2. Validate component architecture and dependencies');
    console.log('3. Create PLAN-to-EXEC handoff');

  } catch (err) {
    console.error('Failed to generate user stories:', err.message);
    console.error(err);
  }
}

generateUserStories();
