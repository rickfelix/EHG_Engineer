#!/usr/bin/env node
/**
 * PRD Update Script for SD-2025-1102-7YM
 * Optimize Ventures Management Attributes - Technical Implementation
 *
 * This script updates the PRD with detailed functional requirements
 * based on codebase analysis.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey
);

const PRD_ID = 'PRD-SD-2025-1102-7YM';

// Detailed functional requirements based on codebase analysis
const functionalRequirements = [
  {
    id: 'FR-1',
    requirement: 'Add IDEATION Stage Metrics Summary Card to VentureDataTable',
    description: 'Create a new "Research Metrics" column or expandable row section in VentureDataTable that displays key IDEATION stage scores (composite_score, confidence) from stages 1-6',
    priority: 'HIGH',
    acceptance_criteria: [
      'VentureDataTable shows composite_score from latest completed IDEATION stage',
      'Confidence indicator (ConfidenceRing) displays stage confidence level',
      'Clicking metric expands to show stage-by-stage breakdown',
      'Data loads from stage_outputs or venture metadata without additional API calls'
    ]
  },
  {
    id: 'FR-2',
    requirement: 'Extend ConfigurableMetrics with IDEATION Stage Metrics',
    description: 'Leverage existing ConfigurableMetrics component to add new metric categories for preliminary research data including market potential, validation scores, and risk assessments',
    priority: 'HIGH',
    acceptance_criteria: [
      'New metric category "research" added to AVAILABLE_METRICS array',
      'Metrics include: avg_composite_score, avg_confidence, market_fit_score, pain_point_validation_score',
      'Metrics persist via localStorage like existing metrics',
      'Each metric is toggleable via settings dialog'
    ]
  },
  {
    id: 'FR-3',
    requirement: 'Create ResearchMetricsSummaryCard component',
    description: 'New component displaying aggregated research metrics from IDEATION stages (1-6) including composite scores, gate decisions, and key findings',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'Component displays aggregated scores from Stage 1-6 outputs',
      'Shows gate decision distribution (GO/REVISE/NO_GO counts)',
      'Displays average composite_score and confidence across stages',
      'Links to detailed StageOutputViewer for drill-down',
      'Follows existing Card/CardHeader/CardContent pattern from shadcn'
    ]
  },
  {
    id: 'FR-4',
    requirement: 'Add Advancement Criteria Display to VentureOverviewTab',
    description: 'Extend VentureOverviewTab to show clear advancement criteria including required scores, validation status, and blocking issues',
    priority: 'HIGH',
    acceptance_criteria: [
      'Shows minimum scores required for advancement (e.g., composite_score >= 60)',
      'Displays current scores vs required thresholds',
      'Highlights blocking red_flags from stage outputs',
      'Uses progress bars or badges to indicate advancement readiness',
      'Links to relevant gate decision documentation'
    ]
  },
  {
    id: 'FR-5',
    requirement: 'Create Preset View Configuration for Research Metrics',
    description: 'Add a "Research Focus" preset to VenturesPage that pre-configures the view to show research-related metrics prominently',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'New preset available in VenturesPage view selector',
      'Preset enables research-related metrics by default',
      'Preset sorts ventures by composite_score or attention_score',
      'Preset configuration persists via localStorage or URL params',
      'User can customize and save modified preset'
    ]
  },
  {
    id: 'FR-6',
    requirement: 'Integrate Stage Output Data with VentureCard',
    description: 'Extend VentureCard to display key research metrics (composite_score, unified_decision) as badges or indicators',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'VentureCard shows latest stage composite_score as badge',
      'DecisionBadge (GO/REVISE/NO_GO) displayed when available',
      'Hover tooltip shows stage name and confidence',
      'Does not significantly increase card height (max 10% increase)',
      'Performance maintained (no additional API calls per card)'
    ]
  }
];

// Non-functional requirements
const nonFunctionalRequirements = [
  {
    type: 'performance',
    requirement: 'Page load time under 2 seconds with 50+ ventures',
    target_metric: '<2s load time, <100ms interaction latency'
  },
  {
    type: 'usability',
    requirement: 'Research metrics visible without scrolling on standard viewport',
    target_metric: '1440x900 viewport shows key metrics above fold'
  },
  {
    type: 'maintainability',
    requirement: 'Components follow existing patterns from ConfigurableMetrics',
    target_metric: '80% code reuse from existing stage-outputs components'
  },
  {
    type: 'accessibility',
    requirement: 'All metrics accessible via keyboard and screen readers',
    target_metric: 'WCAG 2.1 AA compliance for new components'
  }
];

// Technical requirements
const technicalRequirements = [
  {
    id: 'TR-1',
    requirement: 'Leverage existing StageOutputViewer infrastructure',
    description: 'Reuse Stage1Viewer, Stage2Viewer, Stage3Viewer patterns for data display',
    dependencies: ['@/components/stage-outputs/*']
  },
  {
    id: 'TR-2',
    requirement: 'Extend VentureDetail type with research metrics',
    description: 'Add ideation_metrics: { composite_score, confidence, gate_decision } to VentureDetail interface',
    dependencies: ['@/types/venture.ts']
  },
  {
    id: 'TR-3',
    requirement: 'Use existing ConfigurableMetrics pattern',
    description: 'Follow AVAILABLE_METRICS array pattern for adding new research metrics',
    dependencies: ['@/components/ventures/ConfigurableMetrics.tsx']
  }
];

// Test scenarios
const testScenarios = [
  {
    id: 'TS-1',
    scenario: 'Research metrics display on VenturesPage',
    description: 'Verify research metrics are visible on default VenturesPage view',
    expected_result: 'Research metrics card shows aggregate scores and gate decisions',
    test_type: 'e2e'
  },
  {
    id: 'TS-2',
    scenario: 'ConfigurableMetrics toggle functionality',
    description: 'Test enabling/disabling research metrics via settings dialog',
    expected_result: 'Metrics appear/disappear based on toggle state, persists after refresh',
    test_type: 'e2e'
  },
  {
    id: 'TS-3',
    scenario: 'VentureCard research badge display',
    description: 'Verify VentureCard shows composite_score badge',
    expected_result: 'Badge visible with correct score value from stage outputs',
    test_type: 'unit'
  },
  {
    id: 'TS-4',
    scenario: 'Advancement criteria display',
    description: 'Test VentureOverviewTab shows advancement requirements',
    expected_result: 'Current scores vs thresholds displayed, blocking issues highlighted',
    test_type: 'e2e'
  },
  {
    id: 'TS-5',
    scenario: 'Research Focus preset functionality',
    description: 'Verify preset configures view with research metrics',
    expected_result: 'Selecting preset shows research-focused metrics and sorting',
    test_type: 'e2e'
  },
  {
    id: 'TS-6',
    scenario: 'Performance with 50+ ventures',
    description: 'Load VenturesPage with 50 ventures and verify load time',
    expected_result: 'Page loads in <2s, metrics render without blocking UI',
    test_type: 'e2e'
  }
];

// Acceptance criteria
const acceptanceCriteria = [
  'All 6 functional requirements implemented and verified',
  'Research metrics visible on Ventures Management page without additional navigation',
  'ConfigurableMetrics includes new research category with 4+ metrics',
  'Advancement criteria clearly displayed with pass/fail indicators',
  'Preset view available for research-focused venture evaluation',
  'Unit tests pass (80%+ coverage on new components)',
  'E2E tests pass (all 6 test scenarios)',
  'Performance meets <2s load time requirement',
  'No regression in existing VenturesPage functionality'
];

// Implementation approach
const implementationApproach = `
## Phase 1: Foundation (FR-2, TR-1, TR-2)
- Extend VentureDetail type with ideation_metrics
- Add research metrics category to ConfigurableMetrics AVAILABLE_METRICS
- Create utility functions for extracting stage output scores

## Phase 2: Core Components (FR-3, FR-6)
- Build ResearchMetricsSummaryCard using existing Card patterns
- Extend VentureCard with composite_score badge
- Implement data loading from stage_outputs/venture metadata

## Phase 3: Integration (FR-1, FR-4)
- Add research metrics column/expandable to VentureDataTable
- Extend VentureOverviewTab with advancement criteria display
- Wire up drill-down to StageOutputViewer

## Phase 4: Polish & Presets (FR-5)
- Create Research Focus preset configuration
- Implement preset persistence via localStorage
- Add URL param support for preset sharing

## Phase 5: Testing & Validation
- Write unit tests for new components (80%+ coverage)
- Create E2E tests for all test scenarios
- Performance testing with 50+ ventures
- Accessibility audit for new components
`.trim();

// System architecture
const systemArchitecture = `
## Architecture Overview
This implementation leverages existing Ventures infrastructure with minimal new components:

### Data Flow
1. IDEATION stage outputs (stages 1-6) stored in venture metadata or stage_outputs table
2. VenturesPage fetches ventures with stage data via useVentures hook
3. Research metrics extracted and aggregated client-side
4. ConfigurableMetrics renders selected metrics
5. ResearchMetricsSummaryCard provides detailed breakdown

### Component Hierarchy
VenturesPage
├── ConfigurableMetrics (extended with research category)
├── ResearchMetricsSummaryCard (NEW)
├── VentureDataTable
│   └── Research metrics column (extended)
└── VentureOverviewTab
    └── AdvancementCriteriaCard (NEW)

### Integration Points
- Existing: VentureDetail type, ConfigurableMetrics, StageOutputViewer
- Extended: VentureCard, VentureDataTable, VentureOverviewTab
- New: ResearchMetricsSummaryCard, AdvancementCriteriaCard
`.trim();

async function updatePRD() {
  console.log(`\n📋 Updating PRD: ${PRD_ID}`);
  console.log('='.repeat(70));

  // Check if PRD exists
  const { data: existing, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, progress')
    .eq('id', PRD_ID)
    .single();

  if (fetchError || !existing) {
    console.error(`❌ PRD ${PRD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found PRD: ${existing.title}`);
  console.log(`   Status: ${existing.status}, Progress: ${existing.progress}%`);

  // Update PRD with detailed requirements
  const updateData = {
    // Core requirements
    functional_requirements: functionalRequirements,
    non_functional_requirements: nonFunctionalRequirements,
    technical_requirements: technicalRequirements,
    test_scenarios: testScenarios,
    acceptance_criteria: acceptanceCriteria,

    // Architecture & approach
    implementation_approach: implementationApproach,
    system_architecture: systemArchitecture,

    // Executive summary
    executive_summary: `
      This PRD defines the technical implementation for optimizing Ventures Management attributes display.

      **What**: Enhance the Ventures Management page to display key research metrics from IDEATION stages (1-6), including composite scores, confidence levels, gate decisions, and advancement criteria.

      **Why**: Currently, users must navigate to individual venture detail pages to see research metrics. This creates friction in decision-making and slows venture pipeline evaluation.

      **Impact**: Enables data-driven advancement decisions by surfacing key metrics prominently on the main Ventures page, reducing evaluation time by 50%+ and improving decision accuracy.
    `.trim(),

    // Business context
    business_context: `
      **User Pain Points**:
      - Research metrics buried in venture detail pages
      - No clear visibility into advancement criteria
      - Manual comparison required for portfolio analysis

      **Business Objectives**:
      - Accelerate venture evaluation decisions
      - Improve visibility into research quality
      - Enable portfolio-level analysis

      **Success Metrics**:
      - Reduced clicks to access research data (from 3+ to 0)
      - Faster venture evaluation time
      - Higher user satisfaction with Ventures page
    `.trim(),

    // Technical context
    technical_context: `
      **Existing Systems**:
      - VenturesPage with ConfigurableMetrics, VentureDataTable, TriageSummary
      - StageOutputViewer with Stage1-6 Viewers for IDEATION framework
      - VentureDetail type with metadata for stage data

      **Architecture Patterns**:
      - React + TypeScript components
      - Shadcn UI component library
      - ConfigurableMetrics for customizable dashboard

      **Integration Points**:
      - stage_outputs or venture.metadata for stage data
      - localStorage for metric preferences
      - URL params for view sharing
    `.trim(),

    // Data model updates
    data_model: {
      tables: [
        {
          name: 'ventures (existing)',
          columns: ['id', 'metadata.ideation_metrics (new)'],
          relationships: ['stage_outputs via venture_id']
        }
      ],
      types: [
        {
          name: 'VentureDetail (extended)',
          fields: ['ideation_metrics: { composite_score, confidence, gate_decision, last_stage }']
        },
        {
          name: 'IdeationMetrics (new)',
          fields: ['composite_score: number', 'confidence: number', 'gate_decision: GO|REVISE|NO_GO', 'last_stage: 1-6']
        }
      ]
    },

    // UI/UX requirements
    ui_ux_requirements: [
      {
        component: 'ResearchMetricsSummaryCard',
        description: 'Card showing aggregated research metrics with drill-down to stage details',
        wireframe: 'Based on existing ConfigurableMetrics card design'
      },
      {
        component: 'AdvancementCriteriaCard',
        description: 'Card in VentureOverviewTab showing thresholds and current progress',
        wireframe: 'Progress bars with pass/fail indicators'
      },
      {
        component: 'VentureCard research badge',
        description: 'Small badge/indicator on VentureCard showing composite score',
        wireframe: 'Similar to existing status badge positioning'
      }
    ],

    // Technology stack
    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Shadcn UI (Card, Badge, Progress)',
      'Existing: ConfigurableMetrics, StageOutputViewer',
      'Vitest for unit tests',
      'Playwright for E2E tests'
    ],

    // Dependencies
    dependencies: [
      {
        type: 'internal',
        name: 'StageOutputViewer infrastructure',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'ConfigurableMetrics component',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'VentureDetail type definition',
        status: 'completed',
        blocker: false
      }
    ],

    // Risks
    risks: [
      {
        category: 'Technical',
        risk: 'Stage output data structure varies between ventures',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'May require defensive null checking and fallback values',
        mitigation: 'Add robust type guards and default values in extraction utilities'
      },
      {
        category: 'Performance',
        risk: 'Loading stage data for 50+ ventures may impact page load',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Could exceed 2s load time target',
        mitigation: 'Aggregate metrics server-side or use metadata cache'
      }
    ],

    // Progress tracking
    status: 'planning',
    phase: 'planning',
    progress: 40,
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 40,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: true },
      { text: 'DATABASE sub-agent review (if needed)', checked: false },
      { text: 'SECURITY sub-agent review (if needed)', checked: false }
    ],

    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update(updateData)
    .eq('id', PRD_ID)
    .select('id, title, status, progress, phase')
    .single();

  if (error) {
    console.error('❌ Failed to update PRD:', error.message);
    process.exit(1);
  }

  console.log('\n✅ PRD updated successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${data.id}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Phase: ${data.phase}`);
  console.log(`   Progress: ${data.progress}%`);
  console.log(`\n   Functional Requirements: ${functionalRequirements.length}`);
  console.log(`   Non-Functional Requirements: ${nonFunctionalRequirements.length}`);
  console.log(`   Technical Requirements: ${technicalRequirements.length}`);
  console.log(`   Test Scenarios: ${testScenarios.length}`);
  console.log(`   Acceptance Criteria: ${acceptanceCriteria.length}`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Review PRD requirements for completeness');
  console.log('   2. Update user stories with implementation context');
  console.log('   3. Create PLAN-TO-EXEC handoff when ready');
  console.log('');
}

updatePRD().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
