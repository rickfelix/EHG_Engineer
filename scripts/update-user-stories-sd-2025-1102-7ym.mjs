#!/usr/bin/env node
/**
 * User Stories Update Script for SD-2025-1102-7YM
 * Updates placeholder user stories with implementation context
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey
);

const SD_ID = 'SD-2025-1102-7YM';
const PRD_ID = 'PRD-SD-2025-1102-7YM';

// Updated user stories with implementation context
const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    title: 'View research metrics on Ventures Management page',
    user_role: 'Venture Manager',
    user_want: 'see research metrics (composite scores, confidence levels) directly on the Ventures Management page',
    user_benefit: 'I can quickly assess venture readiness without navigating to detail pages',
    acceptance_criteria: [
      'Given I am on the Ventures Management page',
      'When the page loads with ventures that have completed IDEATION stages',
      'Then I see a Research Metrics card showing average composite_score and confidence',
      'And I can see gate decision distribution (GO/REVISE/NO_GO counts)',
      'And I can click to drill down into stage-by-stage details'
    ],
    priority: 'high',
    story_points: 5,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/pages/VenturesPage.tsx - Add ResearchMetricsSummaryCard',
        'src/components/ventures/ConfigurableMetrics.tsx - Add research category'
      ],
      components_to_create: [
        'src/components/ventures/ResearchMetricsSummaryCard.tsx'
      ],
      data_sources: [
        'venture.metadata.ideation_metrics',
        'stage_outputs table via StageOutputViewer'
      ],
      dependencies: ['FR-2', 'FR-3'],
      estimated_loc: 150
    },
    technical_notes: 'Leverage existing ConfigurableMetrics pattern. Data should come from venture.metadata to avoid N+1 queries.',
    test_scenarios: [
      'Research metrics card displays aggregate scores',
      'Clicking card navigates to detailed stage view',
      'Empty state shows when no IDEATION data exists'
    ]
  },
  {
    story_key: `${SD_ID}:US-002`,
    title: 'Configure visible research metrics',
    user_role: 'Chairman',
    user_want: 'configure which research metrics are displayed on my dashboard',
    user_benefit: 'I can focus on the metrics most relevant to my decision-making',
    acceptance_criteria: [
      'Given I am on the Ventures Management page',
      'When I click the Configure button on the metrics section',
      'Then I see a dialog with research metrics toggle options',
      'And I can enable/disable individual research metrics',
      'And my preferences persist after page refresh'
    ],
    priority: 'high',
    story_points: 3,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/components/ventures/ConfigurableMetrics.tsx - Extend AVAILABLE_METRICS'
      ],
      new_metrics: [
        'avg_composite_score - Average score across ventures',
        'avg_confidence - Average confidence level',
        'market_fit_score - From Stage 3 strategic_fit analysis',
        'pain_point_validation_score - From Stage 3 pain_point_validation'
      ],
      data_sources: ['VentureDetail.metadata.ideation_metrics'],
      dependencies: ['FR-2'],
      estimated_loc: 80
    },
    technical_notes: 'Follow existing metric configuration pattern using localStorage. Add "research" category to AVAILABLE_METRICS.',
    test_scenarios: [
      'Toggle enables/disables metrics',
      'Preferences persist in localStorage',
      'Reset to defaults button works'
    ]
  },
  {
    story_key: `${SD_ID}:US-003`,
    title: 'View advancement criteria for a venture',
    user_role: 'Venture Manager',
    user_want: 'see clear advancement criteria for each venture',
    user_benefit: 'I understand what thresholds must be met for the venture to progress',
    acceptance_criteria: [
      'Given I am viewing a venture detail page',
      'When I look at the Overview tab',
      'Then I see current scores compared to required thresholds',
      'And I see which criteria are passing (green) or failing (red)',
      'And I see any blocking red_flags highlighted',
      'And I can click to see the stage that generated each criterion'
    ],
    priority: 'high',
    story_points: 5,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/components/ventures/VentureOverviewTab.tsx - Add AdvancementCriteriaCard'
      ],
      components_to_create: [
        'src/components/ventures/AdvancementCriteriaCard.tsx'
      ],
      threshold_logic: [
        'composite_score >= 60 for advancement',
        'confidence >= 0.7 for advancement',
        'unified_decision != REJECT',
        'red_flags.length === 0 for clean advancement'
      ],
      dependencies: ['FR-4'],
      estimated_loc: 120
    },
    technical_notes: 'Use existing Progress and Badge components. Thresholds should be configurable via constants/gating.ts.',
    test_scenarios: [
      'Passing criteria show green indicators',
      'Failing criteria show red indicators',
      'Red flags are prominently displayed'
    ]
  },
  {
    story_key: `${SD_ID}:US-004`,
    title: 'See research score on venture cards',
    user_role: 'Venture Manager',
    user_want: 'see the composite research score on each venture card',
    user_benefit: 'I can quickly compare ventures in the grid/list view',
    acceptance_criteria: [
      'Given I am viewing the ventures in grid or list view',
      'When ventures have completed IDEATION stages',
      'Then each VentureCard shows a composite_score badge',
      'And the badge color indicates score level (green >70, yellow 50-70, red <50)',
      'And hovering shows the stage name and confidence level'
    ],
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/components/ventures/VentureCard.tsx - Add score badge'
      ],
      badge_colors: {
        high: 'bg-green-100 text-green-800 (score >= 70)',
        medium: 'bg-yellow-100 text-yellow-800 (score 50-69)',
        low: 'bg-red-100 text-red-800 (score < 50)'
      },
      data_sources: ['venture.metadata.ideation_metrics.composite_score'],
      dependencies: ['FR-6'],
      estimated_loc: 40
    },
    technical_notes: 'Reuse Badge component with dynamic variant. Data should already be in venture object.',
    test_scenarios: [
      'Badge shows correct score value',
      'Color matches score threshold',
      'Tooltip shows additional info on hover'
    ]
  },
  {
    story_key: `${SD_ID}:US-005`,
    title: 'Use Research Focus preset view',
    user_role: 'Chairman',
    user_want: 'quickly switch to a Research Focus preset view',
    user_benefit: 'I can evaluate ventures primarily by their research metrics',
    acceptance_criteria: [
      'Given I am on the Ventures Management page',
      'When I select the "Research Focus" preset from the view selector',
      'Then the page shows research metrics prominently',
      'And ventures are sorted by composite_score (highest first)',
      'And the research metrics column is visible in the table view',
      'And I can modify and save my custom preset'
    ],
    priority: 'medium',
    story_points: 5,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/pages/VenturesPage.tsx - Add preset selector',
        'src/components/ventures/ConfigurableMetrics.tsx - Preset support'
      ],
      preset_configuration: {
        name: 'Research Focus',
        metrics: ['avg_composite_score', 'avg_confidence', 'gate_decisions'],
        sort: { field: 'composite_score', order: 'desc' },
        storage_key: 'ventures-preset-research-focus'
      },
      dependencies: ['FR-5'],
      estimated_loc: 100
    },
    technical_notes: 'Build on existing view mode switching. Presets stored in localStorage similar to metrics config.',
    test_scenarios: [
      'Preset selection applies correct metrics',
      'Sort order changes to composite_score desc',
      'Custom preset modifications save correctly'
    ]
  },
  {
    story_key: `${SD_ID}:US-006`,
    title: 'View research data in table column',
    user_role: 'Venture Manager',
    user_want: 'see research metrics in a dedicated table column',
    user_benefit: 'I can sort and filter ventures by their research performance',
    acceptance_criteria: [
      'Given I am viewing the VentureDataTable',
      'When the Research Focus preset is active or column is enabled',
      'Then I see a "Research Score" column',
      'And I can sort by composite_score ascending/descending',
      'And I can click to expand row for stage-by-stage breakdown',
      'And filtering by score range is available'
    ],
    priority: 'high',
    story_points: 5,
    status: 'draft',
    implementation_context: {
      components_to_modify: [
        'src/components/ventures/VentureDataTable.tsx - Add research column'
      ],
      column_definition: {
        id: 'researchScore',
        header: 'Research Score',
        accessorFn: 'row.metadata?.ideation_metrics?.composite_score',
        cell: 'ScoreBar with confidence indicator',
        sortable: true,
        filterable: true
      },
      expandable_row: 'Stage-by-stage breakdown with ScoreBar per stage',
      dependencies: ['FR-1'],
      estimated_loc: 80
    },
    technical_notes: 'Use existing ScoreBar and ConfidenceRing components. Consider virtual scrolling for large datasets.',
    test_scenarios: [
      'Column renders with correct data',
      'Sorting works correctly',
      'Expanded row shows stage breakdown'
    ]
  }
];

async function updateUserStories() {
  console.log(`\n📋 Updating User Stories for ${SD_ID}`);
  console.log('='.repeat(70));

  // First, get the PRD UUID for linking
  const { data: prdData, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('uuid_id, id, title')
    .eq('id', PRD_ID)
    .single();

  if (prdError || !prdData) {
    console.warn(`⚠️  PRD ${PRD_ID} not found, will use PRD_ID as prd_id`);
  } else {
    console.log(`✅ Found PRD: ${prdData.title}`);
  }

  // Delete existing stories for this SD
  const { error: deleteError } = await supabase
    .from('user_stories')
    .delete()
    .eq('sd_id', SD_ID);

  if (deleteError) {
    console.warn('⚠️  Could not delete existing stories:', deleteError.message);
  } else {
    console.log(`✅ Cleared existing user stories for ${SD_ID}`);
  }

  // Insert new user stories
  let insertedCount = 0;
  for (const story of userStories) {
    const storyData = {
      story_key: story.story_key,
      sd_id: SD_ID,
      prd_id: PRD_ID,
      title: story.title,
      user_role: story.user_role,
      user_want: story.user_want,
      user_benefit: story.user_benefit,
      acceptance_criteria: story.acceptance_criteria,
      priority: story.priority,
      story_points: story.story_points,
      status: story.status,
      implementation_context: story.implementation_context,
      technical_notes: story.technical_notes,
      test_scenarios: story.test_scenarios,
      created_at: new Date().toISOString(),
      created_by: 'PLAN_AGENT',
      updated_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase
      .from('user_stories')
      .insert(storyData);

    if (insertError) {
      console.error(`❌ Failed to insert ${story.story_key}:`, insertError.message);
    } else {
      console.log(`   ✅ ${story.story_key}: ${story.title}`);
      insertedCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Updated ${insertedCount}/${userStories.length} user stories`);
  console.log(`   Total story points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('');
}

updateUserStories().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
