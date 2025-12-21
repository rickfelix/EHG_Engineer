import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  try {
    console.log('\n=== CREATING PRD FOR SD-VIF-TIER-001 ===\n');

    const sdId = 'SD-VIF-TIER-001';
    const prdId = `PRD-${sdId}`;

    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('id', prdId)
      .single();

    if (existing) {
      console.log(`⚠️  PRD ${prdId} already exists. Skipping...`);
      return;
    }

    
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdData = {
      id: prdId,
      directive_id: sdId,
      title: 'Tiered Ideation Engine - Complexity Routing System',
      version: '1.0',
      status: 'planning',
      category: 'product_feature',
      priority: 'critical',

      executive_summary: `Implement 3-tier venture creation system with automatic complexity assessment for EHG app. System analyzes venture idea complexity and routes to appropriate workflow tier: Tier 0 (MVP sandbox, 70% gates, 15 min), Tier 1 (standard flow, 85% gates, 4 hours), Tier 2 (deep research, 90% gates, 12 hours).

Target: Enable Chairman to capture simple ideas in 15 minutes while preserving deep analysis for complex ventures. Maintain Chairman override control throughout.`,

      // Functional Requirements
      functional_requirements: [
        {
          id: 'FR-1',
          requirement: 'Complexity Assessment Algorithm',
          description: 'Implement assessComplexity() function in intelligenceAgents.ts that analyzes novelty, investment scale, and strategic alignment to recommend appropriate tier',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'Completes assessment in <3 seconds',
            'Returns tier recommendation (0, 1, or 2) with confidence score',
            'Provides human-readable rationale for recommendation',
            'Defaults to Tier 1 when assessment is uncertain'
          ]
        },
        {
          id: 'FR-2',
          requirement: 'Tier Selection UI Component',
          description: 'Add tier selection step to VentureCreationDialog after idea capture, showing AI recommendation with override capability',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'Display recommended tier with visual indicator (badges/icons)',
            'Show rationale text explaining why this tier was recommended',
            'Provide 1-click override buttons for all 3 tiers',
            'Tier selection does not block submission',
            'Clear visual differentiation between tiers (color coding)'
          ]
        },
        {
          id: 'FR-3',
          requirement: 'Metadata Schema Extension',
          description: 'Extend ventures.metadata JSONB field to store tier and complexity_assessment data without schema migration',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'ventures.metadata.tier stores selected tier (0, 1, 2)',
            'ventures.metadata.complexity_assessment stores full assessment object',
            'ventures.metadata.tier_override_reason captured when Chairman overrides',
            'Data persists correctly and retrieves without corruption'
          ]
        },
        {
          id: 'FR-4',
          requirement: 'Stage Routing Logic',
          description: 'Wire tier selection to CompleteWorkflowOrchestrator to route stages: Tier 0 (1-3), Tier 1 (1-10), Tier 2 (1-15)',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'Tier 0 ventures execute only Stages 1-3 (MVP validation)',
            'Tier 1 ventures execute Stages 1-10 (standard flow)',
            'Tier 2 ventures execute all Stages 1-15 (deep research)',
            'Stage count displayed correctly in UI based on tier',
            'Workflow respects tier throughout execution'
          ]
        },
        {
          id: 'FR-5',
          requirement: 'TierIndicator Display Component',
          description: 'Create visual component to show venture tier status throughout app (venture list, details, dashboard)',
          priority: 'HIGH',
          acceptance_criteria: [
            'Badge shows tier number (0, 1, 2) with distinct colors',
            'Hover tooltip explains tier meaning',
            'Component reusable across multiple views',
            'Shows override indicator if Chairman changed tier'
          ]
        },
        {
          id: 'FR-6',
          requirement: 'Chairman Override Capability',
          description: 'Allow Chairman to override tier recommendation at any time with single click',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'Override takes 1 click (no confirmation modal)',
            'System stores override reason in metadata',
            'Chairman sees immediate visual feedback of change',
            'Override persists across page refreshes'
          ]
        }
      ],

      // Technical Requirements
      technical_requirements: [
        {
          id: 'TR-1',
          requirement: 'assessComplexity() Function',
          description: 'Implement in src/services/intelligenceAgents.ts with TypeScript typing',
          technology: 'TypeScript 5, async/await pattern',
          rationale: 'Existing intelligence agent module location'
        },
        {
          id: 'TR-2',
          requirement: 'VentureCreationDialog Modification',
          description: 'Extend existing dialog component with tier selection step (maintain < 600 LOC)',
          technology: 'React 18, Shadcn Dialog',
          rationale: 'Existing venture creation UI component'
        },
        {
          id: 'TR-3',
          requirement: 'TierIndicator Component',
          description: 'Create new component at src/components/ventures/TierIndicator.tsx (~150 LOC)',
          technology: 'React 18, Shadcn Badge',
          rationale: 'Reusable tier display component'
        },
        {
          id: 'TR-4',
          requirement: 'Metadata JSONB Extension',
          description: 'No schema migration needed - extend existing metadata field via application logic',
          technology: 'Supabase PostgreSQL JSONB',
          rationale: 'Zero-downtime deployment, no migration risk'
        },
        {
          id: 'TR-5',
          requirement: 'CompleteWorkflowOrchestrator Routing',
          description: 'Modify orchestrator to read tier from metadata and route stages accordingly',
          technology: 'TypeScript 5, existing orchestrator pattern',
          rationale: 'Existing workflow execution engine'
        },
        {
          id: 'TR-6',
          requirement: 'Component Sizing Compliance',
          description: 'Maintain all components within 300-600 LOC guideline',
          technology: 'ESLint rules, manual review',
          rationale: 'LEO Protocol testability and maintainability standard'
        }
      ],

      // Test Scenarios
      test_scenarios: [
        {
          id: 'TS-1',
          scenario: 'Complexity Assessment Performance',
          description: 'Measure time for assessComplexity() to return tier recommendation',
          expected_result: 'Assessment completes in <3 seconds for typical venture description (100-500 chars)',
          priority: 'CRITICAL'
        },
        {
          id: 'TS-2',
          scenario: 'Tier 0 Routing (Simple MVP)',
          description: 'Create venture with simple MVP idea, verify Tier 0 recommendation, accept, verify only Stages 1-3 execute',
          expected_result: 'System recommends Tier 0, stages limited to 3, workflow completes in ~15 minutes',
          priority: 'CRITICAL'
        },
        {
          id: 'TS-3',
          scenario: 'Tier 1 Routing (Standard)',
          description: 'Create venture with moderate complexity, verify Tier 1 recommendation, workflow uses Stages 1-10',
          expected_result: 'System recommends Tier 1, 10 stages execute, completion in ~4 hours',
          priority: 'HIGH'
        },
        {
          id: 'TS-4',
          scenario: 'Tier 2 Routing (Complex)',
          description: 'Create venture with high complexity indicators, verify Tier 2 recommendation, all 15 stages execute',
          expected_result: 'System recommends Tier 2, all 15 stages execute, deep research completed',
          priority: 'HIGH'
        },
        {
          id: 'TS-5',
          scenario: 'Chairman Override (Upgrade Tier)',
          description: 'System recommends Tier 0, Chairman overrides to Tier 1, verify Stage 1-10 execution',
          expected_result: 'Override recorded in metadata, workflow uses Tier 1 stages (10 total)',
          priority: 'CRITICAL'
        },
        {
          id: 'TS-6',
          scenario: 'Chairman Override (Downgrade Tier)',
          description: 'System recommends Tier 2, Chairman overrides to Tier 0 for quick MVP test',
          expected_result: 'Override accepted, workflow limited to Stages 1-3, metadata records override',
          priority: 'HIGH'
        },
        {
          id: 'TS-7',
          scenario: 'TierIndicator Display',
          description: 'Verify tier badge displays correctly in venture list, details page, and dashboard',
          expected_result: 'Badge shows correct tier number, color-coded, tooltip explains tier',
          priority: 'MEDIUM'
        },
        {
          id: 'TS-8',
          scenario: 'Metadata Persistence',
          description: 'Create venture with tier, refresh page, verify tier persists',
          expected_result: 'Tier and complexity_assessment data intact after page reload',
          priority: 'HIGH'
        }
      ],

      // Acceptance Criteria
      acceptance_criteria: [
        'Complexity assessment completes in <3 seconds (measured via performance tests)',
        'Tier recommendations are accurate ≥80% of time (measured via Chairman acceptance rate)',
        'Chairman can override tier in 1 click (no confirmation modal)',
        'Tier 0 ventures limited to Stages 1-3 (verified via E2E tests)',
        'Tier 1 ventures use Stages 1-10 (verified via E2E tests)',
        'Tier 2 ventures use Stages 1-15 (verified via E2E tests)',
        'Zero regressions in existing venture creation (all E2E tests pass)',
        'All components sized within 300-600 LOC guideline (>80% compliance)',
        'TierIndicator component displays correctly across all views',
        'Metadata persists correctly through JSONB extension (no corruption)'
      ],

      // Risks
      risks: [
        {
          category: 'Technical',
          risk: 'Tier recommendation accuracy below 80% threshold',
          severity: 'MEDIUM',
          probability: 'MEDIUM',
          impact: 'High Chairman override rate leads to distrust of system',
          mitigation: 'Extensive testing with historical ventures, conservative defaults (Tier 1 when uncertain), collect override feedback for algorithm improvement'
        },
        {
          category: 'Usability',
          risk: 'Chairman override friction causes workflow disruption',
          severity: 'LOW',
          probability: 'LOW',
          impact: 'Chairman forced to use recommended tier, reduces adoption',
          mitigation: 'Design override as prominent 1-click action, no confirmation modal, immediate visual feedback'
        },
        {
          category: 'Performance',
          risk: 'Complexity assessment performance exceeds 3-second SLA',
          severity: 'LOW',
          probability: 'LOW',
          impact: 'Adds delay to venture creation, poor user experience',
          mitigation: 'Async processing with loading indicator, optimize algorithm, implement timeout fallback to Tier 1'
        },
        {
          category: 'Integration',
          risk: 'Backward compatibility issues with existing venture creation',
          severity: 'LOW',
          probability: 'LOW',
          impact: 'Breaks existing workflows, regression in production',
          mitigation: 'Comprehensive E2E testing, staged rollout with feature flag, maintain existing workflow as fallback'
        },
        {
          category: 'Data',
          risk: 'Tier metadata not properly persisted or retrieved',
          severity: 'LOW',
          probability: 'LOW',
          impact: 'Ventures lose tier information, routing fails',
          mitigation: 'Validate JSONB schema extensions, add E2E tests for persistence, implement data validation layer'
        }
      ],

      // Constraints
      constraints: [
        'Target application: /mnt/c/_EHG/EHG/ (EHG app, NOT EHG_Engineer)',
        'No database schema migration allowed (use JSONB metadata only)',
        'Maintain existing VentureCreationDialog structure (no rebuild)',
        'Component sizing: 300-600 LOC optimal (enforce via code review)',
        'Complexity assessment: <3 seconds maximum latency',
        'Technology stack: Vite + React 18 + TypeScript 5 + Shadcn',
        'Testing: Playwright E2E mandatory (>90% coverage for tier flows)',
        'Timeline: 2 weeks (80 hours estimated effort)'
      ],

      // Dependencies
      dependencies: [
        {
          id: 'DEP-1',
          type: 'component',
          name: 'VentureCreationDialog',
          description: 'Existing venture creation UI component (must be modified)',
          status: 'existing',
          blocker: false
        },
        {
          id: 'DEP-2',
          type: 'component',
          name: 'CompleteWorkflowOrchestrator',
          description: 'Existing workflow execution engine (must add tier routing)',
          status: 'existing',
          blocker: false
        },
        {
          id: 'DEP-3',
          type: 'service',
          name: 'intelligenceAgents.ts',
          description: 'Existing intelligence service module (add assessComplexity function)',
          status: 'existing',
          blocker: false
        },
        {
          id: 'DEP-4',
          type: 'database',
          name: 'ventures table',
          description: 'Existing ventures table with metadata JSONB field',
          status: 'existing',
          blocker: false
        }
      ],

      // System Architecture
      system_architecture: {
        target_application: '/mnt/c/_EHG/EHG/',
        database: 'Supabase PostgreSQL (liapbndqlqxdcgpwntbv)',
        frontend_stack: 'Vite + React 18 + TypeScript 5 + Shadcn',
        backend_services: ['intelligenceAgents.ts (complexity assessment)'],
        deployment: 'Vercel',
        testing: 'Playwright E2E + Vitest unit',
        components: [
          {
            name: 'TierIndicator.tsx',
            path: 'src/components/ventures/TierIndicator.tsx',
            description: 'Visual badge component for tier display',
            type: 'NEW',
            estimated_loc: 150,
            dependencies: ['Shadcn Badge']
          },
          {
            name: 'VentureCreationDialog.tsx',
            path: 'src/components/ventures/VentureCreationDialog.tsx',
            description: 'Existing dialog - add tier selection step',
            type: 'MODIFY',
            estimated_loc: 550,
            dependencies: ['TierIndicator', 'intelligenceAgents.assessComplexity']
          },
          {
            name: 'CompleteWorkflowOrchestrator.tsx',
            path: 'src/services/CompleteWorkflowOrchestrator.tsx',
            description: 'Existing orchestrator - add tier routing logic',
            type: 'MODIFY',
            estimated_loc: 480,
            dependencies: ['ventures.metadata.tier']
          },
          {
            name: 'intelligenceAgents.ts',
            path: 'src/services/intelligenceAgents.ts',
            description: 'Existing service - add assessComplexity() function',
            type: 'MODIFY',
            estimated_loc: 200,
            dependencies: []
          }
        ],
        data_model: {
          table: 'ventures',
          field: 'metadata (JSONB)',
          schema_extension: {
            tier: 'number (0 | 1 | 2)',
            complexity_assessment: {
              recommended_tier: 'number',
              confidence: 'number (0-1)',
              rationale: 'string',
              signals: {
                novelty_score: 'number',
                investment_scale: 'number',
                strategic_alignment: 'number'
              },
              assessed_at: 'ISO timestamp'
            },
            tier_override: {
              original_tier: 'number',
              selected_tier: 'number',
              reason: 'string',
              overridden_at: 'ISO timestamp'
            }
          }
        }
      },

      // Implementation Approach
      implementation_approach: {
        strategy: 'Incremental feature addition with backward compatibility',
        phases: [
          {
            phase: 1,
            name: 'Complexity Assessment Algorithm',
            duration: '3 days (24 hours)',
            tasks: [
              'Implement assessComplexity() in intelligenceAgents.ts',
              'Add TypeScript types for assessment results',
              'Write unit tests for complexity scoring logic',
              'Performance test to ensure <3s latency'
            ],
            deliverables: ['assessComplexity() function', 'Unit tests', 'Performance benchmarks']
          },
          {
            phase: 2,
            name: 'Tier Selection UI',
            duration: '4 days (32 hours)',
            tasks: [
              'Create TierIndicator component',
              'Add tier selection step to VentureCreationDialog',
              'Implement 1-click override buttons',
              'Add visual feedback and rationale display'
            ],
            deliverables: ['TierIndicator.tsx', 'Modified VentureCreationDialog', 'UI tests']
          },
          {
            phase: 3,
            name: 'Metadata & Routing Integration',
            duration: '4 days (32 hours)',
            tasks: [
              'Extend metadata schema logic',
              'Modify CompleteWorkflowOrchestrator for tier routing',
              'Add data validation layer',
              'Test metadata persistence'
            ],
            deliverables: ['Metadata schema extension', 'Modified orchestrator', 'Integration tests']
          },
          {
            phase: 4,
            name: 'E2E Testing & Validation',
            duration: '3 days (24 hours)',
            tasks: [
              'Write Playwright E2E tests for all tier scenarios',
              'Test Chairman override workflows',
              'Performance validation (3s SLA)',
              'Regression testing for existing workflows'
            ],
            deliverables: ['E2E test suite', 'Performance report', 'Regression test report']
          }
        ],
        integration_strategy: 'Feature flag controlled rollout - default disabled until E2E tests pass',
        rollout_strategy: 'Enable feature flag after Chairman UAT approval'
      },

      // Checklists
      plan_checklist: [
        { text: 'PRD created and saved to database', checked: true },
        { text: 'Functional requirements defined (6 FRs)', checked: true },
        { text: 'Technical requirements specified (6 TRs)', checked: true },
        { text: 'Test scenarios documented (8 scenarios)', checked: true },
        { text: 'Acceptance criteria established (10 criteria)', checked: true },
        { text: 'Risk assessment completed (5 risks)', checked: true },
        { text: 'System architecture designed (4 components)', checked: true },
        { text: 'Data model schema extension specified', checked: true },
        { text: 'Implementation approach documented (4 phases)', checked: true },
        { text: 'User stories generated via STORIES sub-agent', checked: false }
      ],

      exec_checklist: [
        { text: 'Navigate to /mnt/c/_EHG/EHG/ (NOT EHG_Engineer)', checked: false },
        { text: 'Create TierIndicator.tsx component (~150 LOC)', checked: false },
        { text: 'Implement assessComplexity() in intelligenceAgents.ts', checked: false },
        { text: 'Modify VentureCreationDialog - add tier selection step', checked: false },
        { text: 'Modify CompleteWorkflowOrchestrator - add tier routing', checked: false },
        { text: 'Add metadata validation layer', checked: false },
        { text: 'Write unit tests for complexity algorithm', checked: false },
        { text: 'Create E2E tests for all tier scenarios (Playwright)', checked: false },
        { text: 'Performance test <3s SLA', checked: false },
        { text: 'Verify component sizing compliance', checked: false }
      ],

      validation_checklist: [
        { text: 'All 10 acceptance criteria met', checked: false },
        { text: 'Complexity assessment <3s (performance test passed)', checked: false },
        { text: 'Tier recommendation accuracy ≥80% (UAT data)', checked: false },
        { text: 'Chairman override is 1-click (UI test)', checked: false },
        { text: 'Tier 0 limited to Stages 1-3 (E2E test)', checked: false },
        { text: 'Tier 1 uses Stages 1-10 (E2E test)', checked: false },
        { text: 'Tier 2 uses Stages 1-15 (E2E test)', checked: false },
        { text: 'Zero regressions in venture creation (E2E suite green)', checked: false },
        { text: 'Component sizing >80% compliance', checked: false },
        { text: 'Metadata persistence verified (integration test)', checked: false }
      ],

      phase: 'planning',
      progress: 40,
      created_by: 'PLAN (Claude Code)',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    sd_uuid: sdUuid, // FIX: Added for handoff validation
    };

    // Insert PRD
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      console.error('Error:', error.message);
      return;
    }

    console.log('✅ PRD-SD-VIF-TIER-001 created successfully!\n');
    console.log('Summary:');
    console.log('  ID:', data.id);
    console.log('  Title:', data.title);
    console.log('  Functional Requirements:', prdData.functional_requirements.length);
    console.log('  Technical Requirements:', prdData.technical_requirements.length);
    console.log('  Test Scenarios:', prdData.test_scenarios.length);
    console.log('  Acceptance Criteria:', prdData.acceptance_criteria.length);
    console.log('  Risks:', prdData.risks.length);
    console.log('  Dependencies:', prdData.dependencies.length);
    console.log('  Components:', prdData.system_architecture.components.length);
    console.log('  Implementation Phases:', prdData.implementation_approach.phases.length);
    console.log('  Progress:', data.progress + '%');

    console.log('\n📋 Next Steps:');
    console.log('1. Generate user stories via STORIES sub-agent');
    console.log('2. Execute PLAN verification sub-agents');
    console.log('3. Create PLAN-to-EXEC handoff');

  } catch (err) {
    console.error('Failed:', err.message);
    console.error(err);
  }
}

createPRD();
