#!/usr/bin/env node
/**
 * Create User Stories for SD-VISION-TRANSITION-001D3 (Phase 3: THE IDENTITY)
 *
 * Covers:
 * - Stage 10: Strategic Narrative (Vision positioning)
 * - Stage 11: Strategic Naming (Venture naming)
 * - Stage 12: Resource Allocation (Resource planning)
 *
 * Following INVEST criteria:
 * - Independent: Each story can be developed standalone
 * - Negotiable: Details can be refined with team
 * - Valuable: Delivers clear user value
 * - Estimable: Story points assigned (3-8 range)
 * - Small: Completable in one iteration
 * - Testable: Clear acceptance criteria with Given-When-Then
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

const SD_ID = 'SD-VISION-TRANSITION-001D3';
const PRD_ID = 'PRD-SD-VISION-TRANSITION-001D3';

const userStories = [
  // ========================================
  // STAGE 10: STRATEGIC NARRATIVE
  // ========================================
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 10: Strategic Narrative Creation',
    user_role: 'Venture Founder',
    user_want: 'to craft a compelling strategic narrative that articulates my venture\'s vision, mission, and positioning in the market',
    user_benefit: 'so I can communicate my venture\'s purpose and differentiation to stakeholders, investors, and team members',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Strategic narrative editor displays with sections: Vision Statement, Mission Statement, Market Positioning, Competitive Advantage',
        testable: true
      },
      {
        criterion: 'AI-assisted narrative generation provides suggestions based on earlier stage inputs (customer segments, value proposition, business model)',
        testable: true
      },
      {
        criterion: 'Character count and quality indicators shown for each narrative section',
        testable: true
      },
      {
        criterion: 'Artifact saved as strategic_narrative to venture_artifacts table with stage_number=10',
        testable: true
      },
      {
        criterion: 'Narrative persists across sessions and can be edited',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder on Stage 10 Strategic Narrative',
        when: 'they request AI assistance for vision statement',
        then: 'the system generates 2-3 vision statement options based on venture context from earlier stages'
      },
      {
        given: 'a founder has completed vision and mission statements',
        when: 'they click Save & Continue',
        then: 'the strategic_narrative artifact is saved with quality_score ≥60% and stage completion advances'
      }
    ],
    implementation_context: 'Stage10Narrative component with rich text editor, AI integration for narrative suggestions, and artifact persistence. Consolidates insights from Phases 1-2 into coherent strategic story.',
    architecture_references: [
      'src/components/vision-transition/stages/Stage6RiskMatrix.tsx - Pattern for stage component structure',
      'src/hooks/useVentureArtifacts.ts - Artifact persistence hook',
      'src/hooks/useAIAssistance.ts - AI integration pattern',
      'src/lib/ai/narrative-generator.ts - To be created for AI-assisted narrative generation'
    ],
    example_code_patterns: [
      {
        pattern: 'Artifact Save',
        code: `const { saveArtifact } = useVentureArtifacts(ventureId);
await saveArtifact({
  stage_number: 10,
  artifact_type: 'strategic_narrative',
  artifact_data: {
    vision: visionStatement,
    mission: missionStatement,
    positioning: marketPositioning,
    competitive_advantage: competitiveAdvantage
  },
  quality_score: calculateQualityScore(narrative)
});`
      }
    ],
    testing_scenarios: [
      'E2E test: Complete narrative with all 4 sections populated',
      'E2E test: AI-assisted generation provides relevant suggestions',
      'E2E test: Artifact persistence and retrieval works correctly',
      'E2E test: Quality score calculation reflects completeness'
    ]
  },

  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 10: Cultural Design Style Selection',
    user_role: 'Venture Founder',
    user_want: 'to select a cultural design style that reflects my venture\'s identity and values',
    user_benefit: 'so I can ensure consistent branding, communication tone, and visual identity throughout my venture',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Display available cultural design styles from cultural_design_styles table with name, description, visual example',
        testable: true
      },
      {
        criterion: 'Style selection UI allows browsing and previewing different styles',
        testable: true
      },
      {
        criterion: 'Selected style persists to ventures.cultural_design_style column',
        testable: true
      },
      {
        criterion: 'Selected style flows through VentureDesignProvider context to all venture components',
        testable: true
      },
      {
        criterion: 'Style influences AI-generated content in subsequent stages (naming, messaging)',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder on Stage 10 cultural design selection',
        when: 'they select "Innovator" style',
        then: 'the style is saved to database and VentureDesignProvider updates to reflect selected style'
      },
      {
        given: 'a cultural style has been selected',
        when: 'the founder moves to Stage 11 naming',
        then: 'AI-generated name suggestions reflect the selected cultural style tone and positioning'
      }
    ],
    implementation_context: 'Cultural design style picker integrated with Stage 10. Leverages existing cultural_design_styles table and VentureDesignProvider context system. Style selection affects downstream AI generation.',
    architecture_references: [
      'src/contexts/VentureDesignContext.tsx - Cultural design provider',
      'src/components/ventures/CulturalStylePicker.tsx - Style selection component',
      'src/hooks/useCulturalDesignStyles.ts - Fetch available styles from database',
      'database/migrations/007_cultural_design_styles.sql - Cultural styles schema'
    ],
    example_code_patterns: [
      {
        pattern: 'Style Selection',
        code: `const { styles } = useCulturalDesignStyles();
const { updateCulturalStyle } = useVentureDesign();

const handleStyleSelect = async (styleId: string) => {
  await updateCulturalStyle(ventureId, styleId);
  // Context automatically updates all components
};`
      }
    ],
    testing_scenarios: [
      'E2E test: Browse and select cultural design style',
      'E2E test: Style persists to database correctly',
      'E2E test: VentureDesignProvider reflects selected style',
      'E2E test: Style influences AI generation in Stage 11'
    ]
  },

  // ========================================
  // STAGE 11: STRATEGIC NAMING
  // ========================================
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 11: AI-Assisted Venture Naming',
    user_role: 'Venture Founder',
    user_want: 'to generate and evaluate potential venture names using AI that reflects my strategic narrative and cultural design style',
    user_benefit: 'so I can choose a memorable, distinctive name that aligns with my venture\'s identity and market positioning',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'AI name generation produces 5-10 name suggestions based on strategic narrative and cultural style',
        testable: true
      },
      {
        criterion: 'Name suggestions show rationale explaining why the name fits the venture',
        testable: true
      },
      {
        criterion: 'Domain availability checking for suggested names (optional integration)',
        testable: true
      },
      {
        criterion: 'Trademark search suggestions or warnings displayed (informational only)',
        testable: true
      },
      {
        criterion: 'Selected or custom name validated against existing ventures in database',
        testable: true
      },
      {
        criterion: 'Artifact saved as venture_name to venture_artifacts with selected name and rationale',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder on Stage 11 with strategic narrative completed and "Innovator" cultural style',
        when: 'they click Generate Name Suggestions',
        then: 'the system provides 5-10 name options that reflect innovation theme and strategic positioning'
      },
      {
        given: 'a founder reviewing name suggestions',
        when: 'they select a suggested name or enter a custom name',
        then: 'the system validates uniqueness against existing ventures and shows availability status'
      },
      {
        given: 'a founder has selected a venture name',
        when: 'they click Save & Continue',
        then: 'the venture_name artifact is saved and ventures.name column is updated'
      }
    ],
    implementation_context: 'Stage11Naming component with AI-powered name generation influenced by strategic narrative (Stage 10) and cultural design style. Includes validation against existing ventures and optional domain/trademark checking.',
    architecture_references: [
      'src/components/vision-transition/stages/Stage11Naming.tsx - To be created',
      'src/lib/ai/name-generator.ts - AI name generation service',
      'src/hooks/useVentureArtifacts.ts - Artifact persistence',
      'src/api/ventures.ts - Venture name uniqueness validation'
    ],
    example_code_patterns: [
      {
        pattern: 'AI Name Generation',
        code: `const { generateNames } = useAIAssistance();
const { strategicNarrative } = useVentureArtifacts(ventureId, 10);
const { culturalStyle } = useVentureDesign();

const suggestions = await generateNames({
  narrative: strategicNarrative,
  culturalStyle: culturalStyle,
  industry: venture.industry,
  keywords: extractKeywords(strategicNarrative)
});`
      },
      {
        pattern: 'Name Validation',
        code: `const { checkNameAvailability } = useVentures();
const isAvailable = await checkNameAvailability(selectedName);
if (!isAvailable) {
  showError('This name is already taken by another venture');
}`
      }
    ],
    testing_scenarios: [
      'E2E test: Generate name suggestions with AI',
      'E2E test: Validate name uniqueness against database',
      'E2E test: Select suggested name and save artifact',
      'E2E test: Enter custom name and validate',
      'E2E test: Cultural style influences name suggestions'
    ]
  },

  // ========================================
  // STAGE 12: RESOURCE ALLOCATION
  // ========================================
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 12: Resource Type Planning',
    user_role: 'Venture Founder',
    user_want: 'to identify and categorize the types of resources my venture will need (human, financial, technical, infrastructure)',
    user_benefit: 'so I can create a comprehensive resource plan that ensures I have the capabilities needed to execute my business model',
    story_points: 6,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Resource type selector displays 4 categories: Human Capital, Financial Capital, Technical Assets, Infrastructure',
        testable: true
      },
      {
        criterion: 'Each category allows adding multiple resource items with description and priority',
        testable: true
      },
      {
        criterion: 'Pre-population suggestions based on business model canvas (Stage 8) Key Resources',
        testable: true
      },
      {
        criterion: 'Resource items can be tagged as: Critical, Important, Nice-to-Have',
        testable: true
      },
      {
        criterion: 'Visual summary shows resource distribution across categories',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder on Stage 12 Resource Allocation',
        when: 'they view the resource planning interface',
        then: 'the system pre-populates suggested resources from Stage 8 Business Model Canvas Key Resources'
      },
      {
        given: 'a founder adding resources',
        when: 'they add "Senior Software Engineer" under Human Capital and mark it Critical',
        then: 'the resource appears in the list with Critical priority badge'
      }
    ],
    implementation_context: 'Stage12Resources component with multi-category resource planning. Integrates with Stage 8 BMC data for intelligent pre-population. Foundation for budget estimation in US-005.',
    architecture_references: [
      'src/components/vision-transition/stages/Stage12Resources.tsx - To be created',
      'src/hooks/useVentureArtifacts.ts - Artifact retrieval (Stage 8 BMC)',
      'src/components/ventures/ResourceCategoryCard.tsx - Resource category UI component'
    ],
    example_code_patterns: [
      {
        pattern: 'Pre-populate from Stage 8',
        code: `const { artifact: bmcArtifact } = useVentureArtifacts(ventureId, 8);
const keyResources = bmcArtifact?.artifact_data?.key_resources || [];

// Suggest resources from BMC
const suggestedResources = keyResources.map(resource => ({
  category: categorizeResource(resource),
  description: resource,
  priority: 'important'
}));`
      }
    ],
    testing_scenarios: [
      'E2E test: Add resources across all 4 categories',
      'E2E test: Pre-population from Stage 8 BMC works',
      'E2E test: Priority tagging and visual display',
      'E2E test: Resource summary chart updates'
    ]
  },

  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 12: Budget Estimation',
    user_role: 'Venture Founder',
    user_want: 'to estimate the budget required for each resource category and see total capital needs',
    user_benefit: 'so I can understand the financial requirements to launch and operate my venture and plan fundraising accordingly',
    story_points: 6,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Budget input interface allows cost estimation for each resource item',
        testable: true
      },
      {
        criterion: 'Support for one-time costs vs recurring costs (monthly/annual)',
        testable: true
      },
      {
        criterion: 'Automatic calculation of total budget across all categories',
        testable: true
      },
      {
        criterion: 'Timeline selection: 6 months, 1 year, 2 years runway calculation',
        testable: true
      },
      {
        criterion: 'Integration with Stage 7 pricing model and Stage 9 exit valuation for runway analysis',
        testable: true
      },
      {
        criterion: 'Artifact saved as resource_allocation to venture_artifacts with complete budget breakdown',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder has added resources in Stage 12',
        when: 'they enter budget estimates: Senior Engineer $120k/year, AWS Infrastructure $500/month',
        then: 'the system calculates total monthly burn rate and shows 6-month runway requirements'
      },
      {
        given: 'a founder reviewing budget summary',
        when: 'they select 1-year runway',
        then: 'the system shows total capital needed: one-time costs + 12 months of recurring costs'
      },
      {
        given: 'a founder completes budget estimation',
        when: 'they click Save & Continue',
        then: 'resource_allocation artifact is saved with budget breakdown and quality_score ≥60%'
      }
    ],
    implementation_context: 'Budget estimation interface within Stage12Resources. Calculates runway requirements and integrates with earlier financial stages (7, 9) for holistic financial planning.',
    architecture_references: [
      'src/components/vision-transition/stages/Stage12Resources.tsx - Budget UI',
      'src/lib/calculations/budget-calculator.ts - Budget calculation utilities',
      'src/hooks/useVentureArtifacts.ts - Retrieve Stage 7 & 9 data for analysis'
    ],
    example_code_patterns: [
      {
        pattern: 'Budget Calculation',
        code: `const calculateRunway = (resources, timeframe) => {
  const oneTimeCosts = resources
    .filter(r => r.cost_type === 'one_time')
    .reduce((sum, r) => sum + r.cost, 0);

  const monthlyRecurring = resources
    .filter(r => r.cost_type === 'recurring')
    .reduce((sum, r) => sum + r.monthly_cost, 0);

  const months = timeframe === '6_months' ? 6 : timeframe === '1_year' ? 12 : 24;

  return {
    oneTimeCosts,
    monthlyBurn: monthlyRecurring,
    totalRunway: oneTimeCosts + (monthlyRecurring * months)
  };
};`
      }
    ],
    testing_scenarios: [
      'E2E test: Enter one-time and recurring costs',
      'E2E test: Runway calculation for different timeframes',
      'E2E test: Budget summary displays correctly',
      'E2E test: Artifact persistence with complete budget data'
    ]
  },

  // ========================================
  // PHASE 3 WORKFLOW ORCHESTRATION
  // ========================================
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Phase 3 Workflow Component',
    user_role: 'Venture Founder',
    user_want: 'to navigate smoothly through Stages 10-12 with clear progress tracking and stage completion validation',
    user_benefit: 'so I can complete Phase 3 (THE IDENTITY) efficiently with confidence that all required information is captured',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Phase3Workflow component renders with stage navigation: Stage 10 → Stage 11 → Stage 12',
        testable: true
      },
      {
        criterion: 'Progress indicator shows current stage, completed stages, and remaining stages',
        testable: true
      },
      {
        criterion: 'Stage completion validation requires artifact quality_score ≥60% before advancing',
        testable: true
      },
      {
        criterion: 'Navigation between stages persists progress to venture_stage_progress table',
        testable: true
      },
      {
        criterion: 'Phase completion triggers update to ventures.current_stage and ventures.current_phase',
        testable: true
      },
      {
        criterion: 'Follows same pattern as Phase1Workflow and Phase2Workflow for consistency',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a founder starts Phase 3 workflow',
        when: 'they view the interface',
        then: 'Stage 10 (Strategic Narrative) is active, Stages 11-12 are locked until Stage 10 completes'
      },
      {
        given: 'a founder completes Stage 10 with quality_score=75%',
        when: 'they click Continue',
        then: 'Stage 11 unlocks and founder navigates to Stage11Naming component'
      },
      {
        given: 'a founder completes all stages 10-12',
        when: 'they finish Stage 12',
        then: 'venture.current_phase updates to "phase_4" and ventures.current_stage advances'
      }
    ],
    implementation_context: 'Phase3Workflow orchestrator component following established Phase1Workflow and Phase2Workflow patterns. Manages stage progression, validation, and database persistence.',
    architecture_references: [
      'src/components/vision-transition/Phase1Workflow.tsx - Pattern reference',
      'src/components/vision-transition/Phase2Workflow.tsx - Pattern reference',
      'src/components/vision-transition/Phase3Workflow.tsx - To be created',
      'src/hooks/useVentureStageProgress.ts - Stage progression hook',
      'src/hooks/useVentureArtifacts.ts - Artifact quality validation'
    ],
    example_code_patterns: [
      {
        pattern: 'Stage Progression',
        code: `const { currentStage, completeStage, canAdvance } = useVentureStageProgress(ventureId);
const { artifact } = useVentureArtifacts(ventureId, currentStage);

const handleContinue = async () => {
  if (artifact?.quality_score >= 60) {
    await completeStage(currentStage);
    // Automatically advances to next stage
  } else {
    showValidationError('Please complete all required fields before continuing');
  }
};`
      }
    ],
    testing_scenarios: [
      'E2E test: Navigate through Phase 3 stages sequentially',
      'E2E test: Stage locking/unlocking based on completion',
      'E2E test: Quality validation prevents premature advancement',
      'E2E test: Progress persistence across page refreshes',
      'E2E test: Phase completion updates venture record correctly'
    ]
  }
];

async function main() {
  console.log('=== CREATING USER STORIES FOR SD-VISION-TRANSITION-001D3 ===\n');
  console.log(`Total Stories to Create: ${userStories.length}\n`);

  // Check if stories already exist
  const { data: existing, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('⚠️  WARNING: Found existing user stories for this SD:');
    existing.forEach(s => console.log(`   - ${s.story_key}`));
    console.log('\nDeleting existing stories before inserting new ones...\n');

    const { error: deleteError } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', SD_ID);

    if (deleteError) {
      console.error('Error deleting existing stories:', deleteError.message);
      process.exit(1);
    }
    console.log('✓ Deleted existing stories\n');
  }

  // Insert user stories
  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    console.log(`Creating: ${story.story_key} - ${story.title}`);

    const { error } = await supabase
      .from('user_stories')
      .insert({
        ...story,
        created_by: 'STORIES_AGENT_v2.0',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errorCount++;
    } else {
      console.log('  ✓ Created successfully');
      successCount++;
    }
  }

  // Verification
  console.log('\n=== SUMMARY ===');
  console.log(`✓ Success: ${successCount} stories`);
  console.log(`✗ Errors: ${errorCount} stories`);
  console.log(`📊 Total: ${userStories.length} stories`);

  // Final verification query
  console.log('\n=== VERIFICATION ===');
  const { data: verification, error: verifyError } = await supabase
    .from('user_stories')
    .select('story_key, title, story_points, priority, status')
    .eq('sd_id', SD_ID)
    .order('story_key');

  if (verifyError) {
    console.error('Error verifying stories:', verifyError.message);
  } else {
    console.log('\nUser Stories in Database:');
    console.log('────────────────────────────────────────────────────────────────');
    verification?.forEach(s => {
      console.log(`${s.story_key.padEnd(35)} | ${s.story_points}pt | ${s.priority.padEnd(10)} | ${s.title}`);
    });
    console.log('────────────────────────────────────────────────────────────────');

    // Calculate totals
    const totalPoints = verification?.reduce((sum, s) => sum + s.story_points, 0) || 0;
    const criticalCount = verification?.filter(s => s.priority === 'critical').length || 0;
    const highCount = verification?.filter(s => s.priority === 'high').length || 0;

    console.log(`\nTotal Story Points: ${totalPoints}`);
    console.log(`Priority Breakdown: ${criticalCount} Critical, ${highCount} High`);
    console.log('\n✅ User stories created successfully for SD-VISION-TRANSITION-001D3');
  }
}

main().catch(console.error);
