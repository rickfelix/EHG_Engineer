import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  try {
    console.log('\n=== CREATING PRD FOR SD-VIF-PARENT-001 ===\n');

    const sdId = 'SD-VIF-PARENT-001';
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
      title: 'Venture Ideation Framework (VIF) - Product Requirements',
      version: '1.0',
      status: 'planning',
      category: 'product_feature',
      priority: 'critical',

      executive_summary: `Next-generation venture ideation system for EHG app that revolutionizes Chairman's workflow through intelligent tiered complexity routing, LLM-powered competitive intelligence, and recursive refinement capabilities.

Target: 70% reduction in idea-to-evaluation time (20min → 6min) while maintaining decision quality and cost efficiency ($50/month budget).`,

      // Functional Requirements
      functional_requirements: [
        {
          id: 'FR-1',
          requirement: 'Tiered Ideation Engine',
          description: 'Implement 3-tier capture system: Tier 0 (30sec quick capture), Tier 1 (5-10min structured), Tier 2 (20-30min deep analysis)',
          priority: 'CRITICAL',
          dependencies: ['SD-VIF-TIER-001']
        },
        {
          id: 'FR-2',
          requirement: 'Smart Complexity Routing',
          description: 'Auto-detect complexity signals in idea text to route to appropriate tier. Override capability for manual selection.',
          priority: 'HIGH',
          dependencies: ['FR-1']
        },
        {
          id: 'FR-3',
          requirement: 'LLM Intelligence Integration',
          description: 'Integrate Strategic Trend Analysis (STA) and Global Competitive Intelligence Analysis (GCIA) APIs with cost controls',
          priority: 'HIGH',
          dependencies: ['SD-VIF-INTEL-001']
        },
        {
          id: 'FR-4',
          requirement: 'GCIA Cost Management',
          description: 'Implement usage tracking, hard limits at $50/month, response caching, and real-time cost dashboard',
          priority: 'CRITICAL',
          dependencies: ['FR-3']
        },
        {
          id: 'FR-5',
          requirement: 'Recursive Refinement Loop',
          description: 'Enable iterative venture improvement with Chairman feedback integration and quality progression tracking',
          priority: 'MEDIUM',
          dependencies: ['SD-VIF-REFINE-001', 'FR-1']
        },
        {
          id: 'FR-6',
          requirement: 'Venture Quality Scoring',
          description: 'Implement scoring system to track venture quality and progression through tiers (target: 80%+ pass Tier 1)',
          priority: 'MEDIUM',
          dependencies: ['FR-1', 'FR-5']
        }
      ],

      // Technical Requirements
      technical_requirements: [
        {
          id: 'TR-1',
          requirement: 'React + TypeScript Frontend',
          description: 'Build UI components using Vite + React + Shadcn + TypeScript stack (EHG app standard)',
          technology: 'React 18, TypeScript 5, Vite, Shadcn',
          rationale: 'Aligns with existing EHG app architecture'
        },
        {
          id: 'TR-2',
          requirement: 'Supabase Database Integration',
          description: 'Design schema for ventures, ideation tiers, intelligence reports, refinement history',
          technology: 'Supabase PostgreSQL (liapbndqlqxdcgpwntbv)',
          rationale: 'Existing EHG app database'
        },
        {
          id: 'TR-3',
          requirement: 'LLM API Integration',
          description: 'Integrate OpenAI/Anthropic APIs for STA and GCIA with retry logic, fallbacks, and error handling',
          technology: 'OpenAI API / Anthropic Claude API',
          rationale: 'Industry-standard LLM providers'
        },
        {
          id: 'TR-4',
          requirement: 'Component Sizing',
          description: 'Maintain 300-600 LOC per component for testability and maintainability',
          technology: 'ESLint + custom rules',
          rationale: 'LEO Protocol best practices'
        },
        {
          id: 'TR-5',
          requirement: 'E2E Test Coverage',
          description: 'Achieve 100% user story coverage with Playwright E2E tests',
          technology: 'Playwright',
          rationale: 'LEO Protocol mandatory requirement'
        }
      ],

      // Test Scenarios
      test_scenarios: [
        {
          id: 'TS-1',
          scenario: 'Tier 0 Quick Capture',
          description: 'User creates basic idea in <30 seconds with minimal fields',
          expected_result: 'Idea saved, tier assigned, workflow initiated',
          priority: 'CRITICAL'
        },
        {
          id: 'TS-2',
          scenario: 'Smart Tier Routing',
          description: 'System analyzes idea complexity and suggests appropriate tier',
          expected_result: 'Correct tier suggestion >85% accuracy',
          priority: 'HIGH'
        },
        {
          id: 'TS-3',
          scenario: 'GCIA API Integration',
          description: 'Trigger competitive intelligence scan within budget',
          expected_result: 'Report generated, costs tracked, under $0.17/scan',
          priority: 'HIGH'
        },
        {
          id: 'TS-4',
          scenario: 'Cost Limit Enforcement',
          description: 'System blocks GCIA requests when $50/month limit reached',
          expected_result: 'Request blocked, user notified, manual override option',
          priority: 'CRITICAL'
        },
        {
          id: 'TS-5',
          scenario: 'Refinement Loop',
          description: 'Chairman provides feedback, venture iterates to next version',
          expected_result: 'Feedback recorded, venture updated, history tracked',
          priority: 'MEDIUM'
        }
      ],

      // Acceptance Criteria
      acceptance_criteria: [
        'All 3 sub-directives (TIER, INTEL, REFINE) completed and integrated',
        'Tier 0 capture completes in <30 seconds with basic validation',
        'Tier routing accuracy >85% based on complexity signals',
        'GCIA integration operational with hard $50/month limit',
        'Average idea-to-evaluation time <6 minutes (70% reduction from baseline 20min)',
        'Component sizing within 300-600 LOC guidelines (>80% compliance)',
        'E2E test coverage >90% via Playwright',
        'Venture quality score: 80%+ pass Tier 1 validation',
        'Chairman acceptance: Positive feedback on workflow improvement',
        'Zero cost overruns: GCIA stays under $50/month budget'
      ],

      // Risks
      risks: [
        {
          category: 'Technical',
          risk: 'LLM API Cost Variability',
          severity: 'MEDIUM',
          probability: 'MEDIUM',
          impact: 'Budget overruns if GCIA usage spikes unexpectedly',
          mitigation: 'Hard API limits, usage alerts, response caching, fallback to basic analysis'
        },
        {
          category: 'Technical',
          risk: 'Complexity Routing Accuracy',
          severity: 'LOW',
          probability: 'LOW',
          impact: 'Misrouted ventures require manual correction',
          mitigation: 'Conservative initial routing, manual override, refinement based on feedback'
        },
        {
          category: 'Adoption',
          risk: 'Workflow Change Resistance',
          severity: 'MEDIUM',
          probability: 'LOW',
          impact: 'Chairman prefers manual process, low adoption',
          mitigation: 'Gradual rollout, Tier 0 quick wins, optional usage, collect feedback'
        },
        {
          category: 'Implementation',
          risk: 'UI/UX Complexity',
          severity: 'MEDIUM',
          probability: 'MEDIUM',
          impact: 'Complex components exceed size limits, hard to test',
          mitigation: 'Component splitting, 300-600 LOC enforcement, comprehensive E2E testing'
        }
      ],

      // Constraints
      constraints: [
        'GCIA monthly budget: $50 (300-500 scans maximum)',
        'Timeline: 6 weeks (240 hours total across 3 sub-directives)',
        'Target application: /mnt/c/_EHG/EHG/ (EHG app, NOT EHG_Engineer)',
        'Technology stack: Vite + React + Shadcn + TypeScript',
        'Database: Supabase PostgreSQL (liapbndqlqxdcgpwntbv)',
        'Component sizing: 300-600 LOC optimal',
        'Testing: Playwright E2E mandatory (>90% coverage)',
        'Dependencies: 3 sub-directives must be completed sequentially (TIER first)'
      ],

      // Dependencies
      dependencies: [
        {
          id: 'DEP-1',
          type: 'sub_directive',
          name: 'SD-VIF-TIER-001',
          description: 'Tiered Ideation Engine - Foundation component',
          status: 'draft',
          blocker: true
        },
        {
          id: 'DEP-2',
          type: 'sub_directive',
          name: 'SD-VIF-INTEL-001',
          description: 'Intelligence Agent Integration (STA + GCIA)',
          status: 'draft',
          blocker: false
        },
        {
          id: 'DEP-3',
          type: 'sub_directive',
          name: 'SD-VIF-REFINE-001',
          description: 'Recursive Refinement Loop',
          status: 'draft',
          blocker: false
        }
      ],

      // System Architecture
      system_architecture: {
        target_application: '/mnt/c/_EHG/EHG/',
        database: 'Supabase PostgreSQL (liapbndqlqxdcgpwntbv)',
        frontend_stack: 'Vite + React 18 + TypeScript 5 + Shadcn',
        api_integrations: ['OpenAI API', 'Anthropic Claude API'],
        deployment: 'Vercel',
        testing: 'Playwright E2E + Vitest unit',
        components: [
          {
            name: 'IdeationCapture',
            description: 'Multi-tier form component (Tier 0/1/2)',
            estimated_loc: 450,
            dependencies: ['TierRouter', 'FormValidation']
          },
          {
            name: 'TierRouter',
            description: 'Complexity detection and tier suggestion',
            estimated_loc: 350,
            dependencies: ['VentureAnalyzer']
          },
          {
            name: 'GCIAIntegration',
            description: 'LLM API client with cost management',
            estimated_loc: 500,
            dependencies: ['CostTracker', 'APICache']
          },
          {
            name: 'RefinementWorkflow',
            description: 'Iterative improvement UI',
            estimated_loc: 400,
            dependencies: ['FeedbackForm', 'VersionHistory']
          }
        ]
      },

      // Implementation Approach
      implementation_approach: {
        strategy: 'Sequential sub-directive implementation with integration testing',
        phases: [
          {
            phase: 1,
            name: 'Tiered Engine Foundation',
            duration: '2 weeks (80 hours)',
            sub_directive: 'SD-VIF-TIER-001',
            deliverables: ['Tier 0/1/2 forms', 'Tier routing logic', 'Basic validation']
          },
          {
            phase: 2,
            name: 'Intelligence Integration',
            duration: '2 weeks (80 hours)',
            sub_directive: 'SD-VIF-INTEL-001',
            deliverables: ['STA integration', 'GCIA integration', 'Cost management dashboard']
          },
          {
            phase: 3,
            name: 'Refinement Loop',
            duration: '2 weeks (80 hours)',
            sub_directive: 'SD-VIF-REFINE-001',
            deliverables: ['Feedback workflow', 'Version tracking', 'Quality scoring']
          }
        ],
        integration_strategy: 'Incremental integration after each phase with Chairman feedback',
        rollout_strategy: 'Deploy when ready (no gradual rollout), optional feature toggle'
      },

      // Checklists
      plan_checklist: [
        { text: 'PRD created and saved to database', checked: true },
        { text: 'Functional requirements defined (6 FRs)', checked: true },
        { text: 'Technical requirements specified (5 TRs)', checked: true },
        { text: 'Test scenarios documented (5 scenarios)', checked: true },
        { text: 'Acceptance criteria established (10 criteria)', checked: true },
        { text: 'Risk assessment completed (4 risks)', checked: true },
        { text: 'System architecture designed', checked: true },
        { text: 'Component sizing estimated (4 components, 350-500 LOC)', checked: true },
        { text: 'Implementation approach documented (3 phases)', checked: true },
        { text: 'User stories generated via STORIES sub-agent', checked: false }
      ],

      exec_checklist: [
        { text: 'Navigate to /mnt/c/_EHG/EHG/ (NOT EHG_Engineer)', checked: false },
        { text: 'Create database schema for ventures and tiers', checked: false },
        { text: 'Implement Tier 0/1/2 capture forms', checked: false },
        { text: 'Build tier routing and complexity detection', checked: false },
        { text: 'Integrate GCIA API with cost management', checked: false },
        { text: 'Implement refinement workflow UI', checked: false },
        { text: 'Write unit tests for business logic', checked: false },
        { text: 'Create E2E tests for all user flows (Playwright)', checked: false },
        { text: 'Verify component sizing (300-600 LOC)', checked: false },
        { text: 'Test Chairman workflow end-to-end', checked: false }
      ],

      validation_checklist: [
        { text: 'All 10 acceptance criteria met', checked: false },
        { text: 'Tier 0 capture <30 seconds (measured)', checked: false },
        { text: 'Tier routing accuracy >85% (tested)', checked: false },
        { text: 'GCIA cost <$50/month (verified)', checked: false },
        { text: 'Average time <6 minutes (baseline 20min)', checked: false },
        { text: 'Component sizing compliance >80%', checked: false },
        { text: 'E2E test coverage >90% (Playwright report)', checked: false },
        { text: 'Venture quality: 80%+ pass Tier 1', checked: false },
        { text: 'Chairman acceptance feedback collected', checked: false },
        { text: 'CI/CD pipeline green (GitHub Actions)', checked: false }
      ],

      phase: 'planning',
      progress: 50,
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

    console.log('✅ PRD-SD-VIF-PARENT-001 created successfully!\n');
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
