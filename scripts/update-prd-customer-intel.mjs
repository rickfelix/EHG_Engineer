#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdId = 'PRD-SD-CUSTOMER-INTEL-001';

console.log('📋 Updating PRD with comprehensive requirements...\n');

const prdUpdate = {
  status: 'approved',
  functional_requirements: [
    {
      id: 'FR-001',
      title: 'AI-Powered Persona Generation',
      description: 'Generate 3-5 detailed customer personas using Customer Intelligence Agent with demographics, psychographics, pain points, and jobs-to-be-done',
      priority: 'critical',
      acceptance_criteria: [
        'Customer Intelligence Agent executes 5 sequential tasks (Market Research → Personas → ICP → Journey → WTP)',
        'Personas stored in customer_personas table with JSONB demographics and psychographics',
        'AI confidence score (0.00-1.00) displayed for each persona',
        'Persona generation completes within 10 minutes'
      ]
    },
    {
      id: 'FR-002',
      title: 'Ideal Customer Profile (ICP) Scoring',
      description: 'Calculate and display ICP score (0-100) with breakdown: Company Size (30), Industry Fit (25), Decision Maker Access (20), Buying Signals (25)',
      priority: 'critical',
      acceptance_criteria: [
        'ICP score stored in icp_profiles table (one per venture, UNIQUE constraint)',
        'Firmographics stored as JSONB (company size, revenue, industry, tech stack)',
        'Buying signals displayed with strength indicators',
        'ICP criteria clearly defined (must-have vs nice-to-have)'
      ]
    },
    {
      id: 'FR-003',
      title: '4-Stage Customer Journey Mapping',
      description: 'Map customer journey across Awareness → Consideration → Decision → Retention stages with touchpoints, pain points, and decision factors',
      priority: 'high',
      acceptance_criteria: [
        '4 journey stages stored in customer_journeys table (stage_order 1-4 enforced via CHECK constraint)',
        'Each stage includes: 3-5 touchpoints, 2-4 pain points, 3-5 decision factors, information needs',
        'Critical path insights synthesized across all stages',
        'Competitive advantages identified per stage'
      ]
    },
    {
      id: 'FR-004',
      title: 'Willingness-to-Pay (WTP) Analysis',
      description: 'Analyze price sensitivity using Van Westendorp methodology with 3-tier pricing recommendations',
      priority: 'high',
      acceptance_criteria: [
        'Price sensitivity data stored in willingness_to_pay table',
        'Price points displayed: Too Cheap, Min Acceptable, Optimal, Max Acceptable, Too Expensive',
        'Competitive anchors (3-5 competitors with pricing) displayed',
        '3-tier pricing recommendations: Starter, Professional, Enterprise'
      ]
    },
    {
      id: 'FR-005',
      title: 'Stage 3 Integration',
      description: 'Integrate Customer Intelligence tab into Stage 3 Comprehensive Validation as 4th tab',
      priority: 'critical',
      acceptance_criteria: [
        'Customer Intelligence tab added to Stage 3 after Financial Modeling',
        'Tab displays "Generate Customer Intelligence" button when no data exists',
        'Tab loads existing data from database if already generated',
        'Loading states displayed during 10-minute AI generation process'
      ]
    },
    {
      id: 'FR-006',
      title: 'Data Persistence and RLS',
      description: 'Persist all persona data in database with multi-tenant Row Level Security',
      priority: 'critical',
      acceptance_criteria: [
        'All data persists across page reloads',
        'RLS policies ensure company-level data isolation using auth.uid()',
        'CASCADE deletes clean up persona data when ventures are deleted',
        'Automatic updated_at timestamp management via triggers'
      ]
    },
    {
      id: 'FR-007',
      title: 'Downstream Integration',
      description: 'Enable downstream stages to query and use persona data',
      priority: 'medium',
      acceptance_criteria: [
        'Stage 4 can query personas for competitor mapping',
        'Stage 15 can pre-populate pricing from WTP data',
        'Stage 17 can use personas for GTM channel strategy',
        'Stage 32 can use retention data for onboarding flows'
      ]
    }
  ],

  system_architecture: {
    overview: 'Customer Intelligence system uses multi-layer architecture: Database (5 tables) → CrewAI Agent → API Layer → React UI Components',
    components: [
      {
        name: 'Database Layer',
        description: '5 PostgreSQL tables with JSONB columns, GIN indexes, RLS policies, and audit triggers',
        tables: ['customer_personas', 'icp_profiles', 'customer_journeys', 'willingness_to_pay', 'market_segments']
      },
      {
        name: 'Agent Layer',
        description: 'Customer Intelligence Agent (CrewAI) with 5 sequential tasks',
        file: 'agent-platform/app/agents/research/customer_intelligence_agent.py',
        tasks: ['Market Research', 'Persona Generation', 'ICP Scoring', 'Journey Mapping', 'WTP Analysis']
      },
      {
        name: 'API Layer',
        description: 'RESTful API endpoints for persona generation and retrieval',
        endpoints: [
          'POST /api/customer-intelligence/generate',
          'GET /api/customer-intelligence/:ventureId',
          'POST /api/customer-intelligence/:ventureId/regenerate'
        ]
      },
      {
        name: 'UI Layer',
        description: '5 React components integrated via CustomerIntelligenceTab',
        components: ['PersonaBuilder', 'ICPScoreCard', 'CustomerJourneyMap', 'WTPMatrix', 'CustomerIntelligenceTab']
      }
    ],
    data_flow: 'User triggers generation → API calls CrewAI agent → Agent executes 5 tasks → Results stored in database → UI polls/subscribes for completion → Data displays in tabs'
  },

  acceptance_criteria: [
    'Database migration applied: 5 tables created with indexes, RLS, triggers',
    'Customer Intelligence Agent registered in CrewAI platform',
    'All 5 UI components render correctly in Stage 3',
    'User can generate personas and see results within 10 minutes',
    'User can switch between personas via dropdown',
    'User can view ICP score with breakdown',
    'User can navigate 4-stage customer journey',
    'User can see WTP analysis with pricing tiers',
    'User can regenerate personas (confirmation modal)',
    'All data persists across page reloads',
    'RLS policies prevent cross-company data access',
    'E2E test passes: Generate → Display → Verify all tabs'
  ],

  test_scenarios: [
    {
      id: 'TS-001',
      title: 'Persona Generation Happy Path',
      steps: [
        'User navigates to Stage 3 in a venture',
        'User clicks "Customer Intelligence" tab',
        'User clicks "Generate Customer Intelligence" button',
        'System displays loading spinner with progress (Market Research → Personas → ICP → Journey → WTP)',
        'After 5-10 minutes, system displays success notification',
        'UI loads 3-5 personas in PersonaBuilder component',
        'User can view demographics, psychographics, pain points, JTBD across 4 tabs'
      ],
      expected_result: 'All personas display correctly with AI confidence scores'
    },
    {
      id: 'TS-002',
      title: 'ICP Scoring Display',
      steps: [
        'User has generated customer intelligence',
        'User clicks "ICP Score" tab',
        'System displays ICP score (e.g., 78/100)',
        'System shows breakdown: Company Size (23/30), Industry (21/25), Decision Maker (18/20), Buying Signals (16/25)',
        'User views firmographics section',
        'User views ideal customer criteria',
        'User views buying signals'
      ],
      expected_result: 'ICP score displays with detailed breakdown and supporting data'
    },
    {
      id: 'TS-003',
      title: '4-Stage Journey Navigation',
      steps: [
        'User clicks "Journey Map" tab',
        'System displays 4 stages: Awareness → Consideration → Decision → Retention',
        'User clicks "Consideration" stage',
        'System expands stage details: 3-5 touchpoints, 2-4 pain points, 3-5 decision factors',
        'User views information needs for this stage',
        'User views critical path insights below journey map'
      ],
      expected_result: 'Journey map displays all 4 stages with expandable details'
    },
    {
      id: 'TS-004',
      title: 'WTP Pricing Analysis',
      steps: [
        'User clicks "Pricing" tab',
        'System displays Van Westendorp Price Sensitivity Meter',
        'System shows price points: $49 (too cheap), $99 (min acceptable), $149 (optimal), $299 (max acceptable), $499 (too expensive)',
        'User views competitive anchors (3-5 competitors)',
        'User views 3-tier pricing: Starter ($99/mo), Professional ($149/mo), Enterprise ($299/mo)',
        'User views feature-value map'
      ],
      expected_result: 'Pricing analysis displays with sensitivity meter and tier recommendations'
    },
    {
      id: 'TS-005',
      title: 'Data Persistence',
      steps: [
        'User generates customer intelligence',
        'User refreshes browser page (Ctrl+R)',
        'System loads existing data from database',
        'All tabs display same data as before refresh'
      ],
      expected_result: 'Data persists across page reloads'
    },
    {
      id: 'TS-006',
      title: 'Regeneration Flow',
      steps: [
        'User has existing customer intelligence',
        'User clicks "Regenerate" button',
        'System displays confirmation modal: "This will replace existing data. Continue?"',
        'User clicks "Confirm"',
        'System starts generation (loading spinner)',
        'After 5-10 minutes, new personas replace old ones'
      ],
      expected_result: 'Regeneration completes and displays new data'
    }
  ],

  implementation_approach: {
    phase_1: {
      name: 'Database & Agent Setup',
      duration: '1-2 days',
      tasks: [
        'Apply database migration (20251011_customer_intelligence_schema.sql)',
        'Verify 5 tables created with correct schema',
        'Register Customer Intelligence Agent in CrewAI platform',
        'Test agent execution end-to-end'
      ]
    },
    phase_2: {
      name: 'API Layer',
      duration: '1-2 days',
      tasks: [
        'Create POST /api/customer-intelligence/generate endpoint',
        'Create GET /api/customer-intelligence/:ventureId endpoint',
        'Create POST /api/customer-intelligence/:ventureId/regenerate endpoint',
        'Test API endpoints with Postman'
      ]
    },
    phase_3: {
      name: 'UI Integration',
      duration: '2-3 days',
      tasks: [
        'Integrate CustomerIntelligenceTab into Stage3ComprehensiveValidation.tsx',
        'Replace mock data generators with real API calls',
        'Implement loading states and error handling',
        'Test UI rendering and data flow'
      ]
    },
    phase_4: {
      name: 'Testing & Refinement',
      duration: '1-2 days',
      tasks: [
        'Write E2E test: tests/e2e/customer-intelligence.spec.ts',
        'Execute E2E test and verify pass',
        'Fix any UI/UX issues discovered',
        'Document integration in STAGE3_CUSTOMER_INTEL_INTEGRATION_GUIDE.md'
      ]
    },
    total_estimate: '5-9 days'
  },

  risks: [
    {
      id: 'RISK-001',
      description: 'CrewAI agent execution time >10 minutes',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Implement streaming updates, show progress per task, optimize agent task execution'
    },
    {
      id: 'RISK-002',
      description: 'JSONB query performance degrades at scale (>10K personas)',
      likelihood: 'low',
      impact: 'medium',
      mitigation: 'Monitor query performance, add additional GIN indexes if needed, consider partitioning at 100K rows'
    },
    {
      id: 'RISK-003',
      description: 'AI-generated personas lack accuracy for niche industries',
      likelihood: 'medium',
      impact: 'low',
      mitigation: 'Allow manual persona editing, implement feedback mechanism for AI training'
    },
    {
      id: 'RISK-004',
      description: 'RLS policy performance issues with nested subqueries',
      likelihood: 'low',
      impact: 'low',
      mitigation: 'Monitor query performance, create materialized view user_accessible_ventures if needed'
    }
  ],

  updated_at: new Date().toISOString()
};

const { error } = await supabase
  .from('product_requirements_v2')
  .update(prdUpdate)
  .eq('id', prdId);

if (error) {
  console.error('❌ Error updating PRD:', error.message);
  process.exit(1);
}

console.log('✅ PRD updated successfully!');
console.log('\n📊 Summary:');
console.log(`   Functional Requirements: ${prdUpdate.functional_requirements.length}`);
console.log(`   System Architecture: Defined with 4 layers`);
console.log(`   Acceptance Criteria: ${prdUpdate.acceptance_criteria.length}`);
console.log(`   Test Scenarios: ${prdUpdate.test_scenarios.length}`);
console.log(`   Risks: ${prdUpdate.risks.length}`);
console.log(`   Status: ${prdUpdate.status}`);
console.log('\n🔄 Retry handoff: node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-CUSTOMER-INTEL-001');
