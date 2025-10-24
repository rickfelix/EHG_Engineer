#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-CUSTOMER-INTEL-UI-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-CUSTOMER-INTEL-UI-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Surface Hidden Customer Intelligence System - Technical Implementation'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    id: prdId,
    sd_uuid: sdData.uuid_id,        // CRITICAL: Required for handoff validation
    directive_id: SD_ID,             // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'product_feature',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Create UI layer for the complete customer intelligence system (796 LOC service, 5 database tables) that currently has ZERO user interface. Build 4 core components (CustomerPersonasManager, ICPScoringDashboard, CustomerJourneyVisualizer, WillingnessToPayAnalysis) plus integrations into existing venture stages.

      This unlocks massive hidden value - users cannot currently view AI-generated personas, ICP scores (0-100), 4-stage customer journeys, or willingness-to-pay analysis despite complete backend infrastructure being production-ready. Estimated 785 LOC UI across 10 files to surface existing data.

      Impact: Immediate ROI by unlocking 7-10 days of sunk backend development cost. Progressive disclosure pattern (inline widgets in Stage 3/15/17 + dedicated /customer-intelligence page) enables data-driven venture validation decisions.
    `.trim(),

    business_context: `
      **User Pain Points**:
      - Complete customer intelligence system exists but is completely inaccessible (dark matter problem)
      - Users cannot view AI-generated personas for their ventures
      - ICP scoring (0-100) calculations happen but results are invisible
      - Customer journey maps (4 stages) are stored but not visualized
      - Willingness-to-pay analysis data cannot inform pricing decisions

      **Business Objectives**:
      - Unlock existing $7k+ sunk cost investment (796 LOC service layer + 5 tables)
      - Enable data-driven venture validation through customer intelligence
      - Surface AI-generated insights at critical decision points (Stage 3, 15, 17)
      - Progressive disclosure: quick widgets in-stage, full analysis in dedicated page

      **Success Metrics**:
      - User feedback on persona/ICP usefulness (qualitative)
      - /customer-intelligence page views per week (adoption tracking)
      - % of ventures with intelligence data generated (coverage)
      - "View Intelligence" button clicks from Stage 3 (engagement)
    `.trim(),

    technical_context: `
      **Existing Systems** (100% backend reuse):
      - Service Layer: src/services/customerIntelligence.ts (796 LOC, production-ready)
      - Database: 5 tables (customer_personas, icp_profiles, customer_journeys, market_segments, willingness_to_pay)
      - Migration: supabase/migrations/20251011_customer_intelligence_system.sql
      - E2E scaffold: tests/e2e/customer-intelligence.spec.ts (needs UI-specific scenarios)

      **Architecture Patterns**:
      - Progressive disclosure: Inline widgets (Stage 3/15/17) → Full page (/customer-intelligence)
      - Read-only Phase 1: Display existing data, no write operations
      - Shadcn UI + Recharts for visualization consistency
      - Service layer already integrated into venture stages

      **Integration Points**:
      - Stage 3 (Comprehensive Validation): "View Customer Intelligence" button
      - Stage 15 (Pricing Strategy): Inline WTP widget
      - Stage 17 (GTM Strategy): Inline journey map widget
      - ModernNavigationSidebar: Add /customer-intelligence link (Intelligence section)
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'CustomerPersonasManager Component',
        description: 'Display AI-generated customer personas with demographics, psychographics, pain points, and jobs-to-be-done. Read-only view with persona card layout.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Display all personas for selected venture',
          'Show demographics, psychographics, pain points, JTBD fields',
          'Handle empty state gracefully (no personas generated yet)',
          'Accessible via Stage 3 "View Intelligence" button',
          'Card-based UI with Shadcn components'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'ICPScoringDashboard Component',
        description: 'Visualize ICP score (0-100) with category breakdown and confidence rationales. Display firmographics, decision makers, and buying signals.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Display ICP score 0-100 with visual gauge/progress bar',
          'Show category breakdowns with individual scores',
          'Display firmographics, decision makers, buying signals',
          'Show AI confidence scores and rationales',
          'Handle ventures without ICP data (empty state)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'CustomerJourneyVisualizer Component',
        description: 'Visualize 4-stage customer journey (awareness → consideration → decision → retention) with touchpoints, channels, and pain points per stage.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Display all 4 journey stages in flow diagram',
          'Show touchpoints, channels, pain points for each stage',
          'Inline widget in Stage 17 (GTM Strategy)',
          'Full page view with expanded details',
          'Recharts or custom SVG visualization'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'WillingnessToPayAnalysis Component',
        description: 'Display WTP pricing tiers, value metrics, and price sensitivity analysis. Inline widget in Stage 15 (Pricing Strategy).',
        priority: 'HIGH',
        acceptance_criteria: [
          'Display pricing tiers with WTP ranges',
          'Show value metrics and price sensitivity',
          'Inline in Stage 15 Pricing Strategy page',
          'Full page view with expanded analysis',
          'Handle no WTP data (empty state)'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Stage Integration Points',
        description: 'Add "View Customer Intelligence" button in Stage 3, embed WTP widget in Stage 15, embed journey map widget in Stage 17.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Stage 3: "View Intelligence" button navigates to /customer-intelligence',
          'Stage 15: WTP widget displays inline (no navigation)',
          'Stage 17: Journey map widget displays inline',
          'All integrations respect venture context',
          'No duplicate data fetches (reuse service layer)'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Standalone Customer Intelligence Page',
        description: 'Create /customer-intelligence page with tabs for Personas, ICP, Journey, WTP. Add navigation link in Intelligence section.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Route /customer-intelligence accessible',
          'Tab navigation between 4 sections',
          'Venture selector dropdown (view any venture)',
          'Navigation link in ModernNavigationSidebar (Intelligence section)',
          'Page respects RLS policies (user can only see their ventures)'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Fast component rendering with existing data',
        target_metric: '<2s page load time for /customer-intelligence'
      },
      {
        type: 'security',
        requirement: 'RLS policies enforced on all 5 customer intelligence tables',
        target_metric: 'Users can only access their own ventures data'
      },
      {
        type: 'usability',
        requirement: 'Progressive disclosure pattern reduces cognitive load',
        target_metric: 'Quick widgets in stages, full details in dedicated page'
      },
      {
        type: 'accessibility',
        requirement: 'WCAG 2.1 AA compliance',
        target_metric: 'All components keyboard navigable, proper ARIA labels'
      },
      {
        type: 'reliability',
        requirement: 'Graceful empty state handling',
        target_metric: 'Clear messaging when no intelligence data exists yet'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: '100% Backend Reuse',
        description: 'Use existing customerIntelligence.ts service (796 LOC) - no new API endpoints, no database changes.',
        dependencies: ['src/services/customerIntelligence.ts']
      },
      {
        id: 'TR-2',
        requirement: 'Shadcn UI + Recharts Visualization',
        description: 'Use Shadcn Card, Tabs, Button components. Use Recharts for ICP score gauge and journey flow diagrams.',
        dependencies: ['shadcn/ui', 'recharts']
      },
      {
        id: 'TR-3',
        requirement: 'Component Size Constraints',
        description: 'Each component 300-600 LOC (CustomerPersonasManager ~150, ICPScoringDashboard ~120, CustomerJourneyVisualizer ~130, WillingnessToPayAnalysis ~100).',
        dependencies: []
      },
      {
        id: 'TR-4',
        requirement: 'TypeScript Strict Mode',
        description: 'Full type safety using existing TypeScript interfaces from customerIntelligence.ts.',
        dependencies: ['typescript']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      4 core UI components + 1 page component + 3 stage integrations = 10 total files (~785 LOC):
      - src/components/customer-intelligence/CustomerPersonasManager.tsx (~150 LOC)
      - src/components/customer-intelligence/ICPScoringDashboard.tsx (~120 LOC)
      - src/components/customer-intelligence/CustomerJourneyVisualizer.tsx (~130 LOC)
      - src/components/customer-intelligence/WillingnessToPayAnalysis.tsx (~100 LOC)
      - src/pages/CustomerIntelligencePage.tsx (~50 LOC)
      - Modifications to Stage3ComprehensiveValidation.tsx (+20 LOC)
      - Modifications to Stage15PricingStrategy (+30 LOC)
      - Modifications to Stage17GTMStrategy (+30 LOC)
      - Modifications to ModernNavigationSidebar (+5 LOC)
      - tests/e2e/customer-intelligence.spec.ts (~150 LOC)

      ## Data Flow
      1. User navigates to /customer-intelligence or clicks "View Intelligence" in Stage 3
      2. Component fetches venture ID from context/URL
      3. Component calls existing customerIntelligence.ts service methods
      4. Service queries Supabase (customer_personas, icp_profiles, customer_journeys, willingness_to_pay, market_segments)
      5. RLS policies enforce user can only see their ventures
      6. Component renders data using Shadcn UI + Recharts
      7. Empty states display if no intelligence data exists yet

      ## Integration Points
      - Service Layer: src/services/customerIntelligence.ts (796 LOC) - 100% reuse, zero changes
      - Database: 5 existing tables via Supabase client
      - UI Library: Shadcn UI (Card, Tabs, Button, Badge components)
      - Charts: Recharts (for ICP gauge, journey flow diagram)
      - Routing: React Router - add /customer-intelligence route
      - Navigation: ModernNavigationSidebar - add Intelligence section link
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'customer_personas',
          columns: ['id', 'venture_id', 'demographics', 'psychographics', 'pain_points', 'jobs_to_be_done', 'ai_confidence', 'created_at'],
          relationships: ['venture_id → ventures.id']
        },
        {
          name: 'icp_profiles',
          columns: ['id', 'venture_id', 'firmographics', 'decision_makers', 'buying_signals', 'icp_score', 'category_scores', 'created_at'],
          relationships: ['venture_id → ventures.id']
        },
        {
          name: 'customer_journeys',
          columns: ['id', 'venture_id', 'stage', 'touchpoints', 'channels', 'pain_points', 'opportunities', 'created_at'],
          relationships: ['venture_id → ventures.id', 'stage: awareness | consideration | decision | retention']
        },
        {
          name: 'willingness_to_pay',
          columns: ['id', 'venture_id', 'pricing_tiers', 'value_metrics', 'price_sensitivity', 'recommendations', 'created_at'],
          relationships: ['venture_id → ventures.id']
        },
        {
          name: 'market_segments',
          columns: ['id', 'venture_id', 'segment_name', 'size_estimate', 'scanning_sources', 'chairman_approved', 'created_at'],
          relationships: ['venture_id → ventures.id']
        }
      ],
      note: 'All tables already exist - no schema changes needed. All have RLS policies enforcing venture ownership.'
    },

    api_specifications: [
      {
        endpoint: '/api/TODO',
        method: 'GET',
        description: 'TODO: Endpoint description',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'TODO: Component name',
        description: 'TODO: UI/UX requirements',
        wireframe: 'TODO: Link to wireframe'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Core Components (Day 1-2, 300 LOC)
      1. Create CustomerPersonasManager.tsx (~150 LOC)
         - Fetch personas from customerIntelligence service
         - Render persona cards with Shadcn UI
         - Handle empty state
      2. Create ICPScoringDashboard.tsx (~120 LOC)
         - Fetch ICP profile from service
         - Render ICP score gauge with Recharts
         - Display category breakdowns, firmographics
         - Handle empty state

      ## Phase 2: Journey & WTP Components (Day 2-3, 230 LOC)
      3. Create CustomerJourneyVisualizer.tsx (~130 LOC)
         - Fetch journey stages from service
         - Render 4-stage flow diagram with Recharts/custom SVG
         - Show touchpoints, channels, pain points per stage
      4. Create WillingnessToPayAnalysis.tsx (~100 LOC)
         - Fetch WTP data from service
         - Display pricing tiers, value metrics, sensitivity

      ## Phase 3: Page & Navigation (Day 3, 55 LOC)
      5. Create CustomerIntelligencePage.tsx (~50 LOC)
         - Tab navigation between 4 components
         - Venture selector dropdown
         - Route setup
      6. Update ModernNavigationSidebar (+5 LOC)
         - Add /customer-intelligence link in Intelligence section

      ## Phase 4: Stage Integrations (Day 4, 80 LOC)
      7. Modify Stage3ComprehensiveValidation.tsx (+20 LOC)
         - Add "View Customer Intelligence" button
      8. Modify Stage15PricingStrategy (+30 LOC)
         - Embed WTP widget inline
      9. Modify Stage17GTMStrategy (+30 LOC)
         - Embed journey map widget inline

      ## Phase 5: Testing & Deployment (Day 4-5, 150 LOC)
      10. Complete tests/e2e/customer-intelligence.spec.ts (~150 LOC)
          - Implement all 10 test scenarios
          - Verify empty states, RLS policies
      11. Run unit tests, E2E tests, verify CI/CD green
      12. Performance testing, accessibility audit

      Total: ~785 LOC across 10 files (3-5 days)
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL'
      // Add specific technologies for this PRD
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Navigate to Customer Intelligence Page',
        description: 'User navigates to /customer-intelligence from navigation sidebar',
        expected_result: 'Page loads, shows venture selector, displays 4 tabs (Personas, ICP, Journey, WTP)',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'View Customer Personas (with data)',
        description: 'User selects venture with existing persona data',
        expected_result: 'Displays persona cards with demographics, psychographics, pain points, JTBD',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'View ICP Score Dashboard',
        description: 'User clicks ICP tab, views ICP score and breakdown',
        expected_result: 'Displays ICP score 0-100 with gauge, shows category scores, firmographics, decision makers',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'View Customer Journey Visualization',
        description: 'User clicks Journey tab, views 4-stage flow',
        expected_result: 'Displays awareness→consideration→decision→retention flow with touchpoints per stage',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'View WTP Analysis',
        description: 'User clicks WTP tab, views pricing recommendations',
        expected_result: 'Displays pricing tiers, value metrics, price sensitivity analysis',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'Stage 3 Integration - View Intelligence Button',
        description: 'User navigates from Stage 3 "View Intelligence" button',
        expected_result: 'Navigates to /customer-intelligence with venture context preserved',
        test_type: 'e2e'
      },
      {
        id: 'TS-7',
        scenario: 'Stage 15 Inline WTP Widget',
        description: 'User views Stage 15 (Pricing Strategy) page',
        expected_result: 'WTP widget displays inline with pricing recommendations (no navigation)',
        test_type: 'e2e'
      },
      {
        id: 'TS-8',
        scenario: 'Stage 17 Inline Journey Map Widget',
        description: 'User views Stage 17 (GTM Strategy) page',
        expected_result: 'Journey map widget displays inline with 4-stage visualization',
        test_type: 'e2e'
      },
      {
        id: 'TS-9',
        scenario: 'Empty State Handling',
        description: 'User selects venture with no intelligence data generated',
        expected_result: 'Clear empty state message: "No customer intelligence generated yet. Generate personas to get started."',
        test_type: 'e2e'
      },
      {
        id: 'TS-10',
        scenario: 'RLS Policy Enforcement',
        description: 'User tries to access another users venture intelligence data',
        expected_result: 'No data returned, proper authorization error or empty state',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      'All 6 functional requirements (FR-1 through FR-6) implemented',
      'All 4 core components render with real data from service layer',
      'Stage 3 "View Intelligence" button navigates correctly',
      'Stage 15 WTP widget displays inline',
      'Stage 17 journey map widget displays inline',
      '/customer-intelligence page accessible with tab navigation',
      'Navigation link added to Intelligence section',
      'All 10 E2E test scenarios passing',
      'Unit tests for component logic passing',
      'Empty states handle gracefully',
      'RLS policies enforced (users see only their ventures)',
      'WCAG 2.1 AA accessibility compliance',
      'Performance: <2s page load time',
      'No backend changes (100% service layer reuse verified)',
      'CI/CD pipeline green'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'Visualization complexity - journey maps and ICP gauges require careful UX design',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Poor UX could make valuable data hard to interpret, reducing adoption',
        mitigation: 'Design sub-agent review (85% pass), iterative polish phase, user testing'
      },
      {
        category: 'Security',
        risk: 'Non-critical security issues flagged by security sub-agent during LEAD',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Minor security improvements needed',
        mitigation: 'Address in PLAN phase, security sub-agent re-review before EXEC'
      },
      {
        category: 'Data',
        risk: 'Empty states - many ventures may not have intelligence data generated yet',
        severity: 'LOW',
        probability: 'HIGH',
        impact: 'Users see empty UI, unclear how to generate data',
        mitigation: 'Clear empty state messaging with "Generate Intelligence" CTA, progressive disclosure'
      },
      {
        category: 'Technical',
        risk: 'Service layer integration assumptions may be incorrect (96 LOC service)',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'May need service layer changes, invalidating 100% reuse assumption',
        mitigation: 'EXEC pre-implementation checklist verifies service methods, read service code before coding'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing service layer (no backend changes)',
        impact: 'UI limited to displaying data available from customerIntelligence.ts methods'
      },
      {
        type: 'technical',
        constraint: 'Component size: 300-600 LOC per component',
        impact: 'May need to split large components (e.g., CustomerJourneyVisualizer) into sub-components'
      },
      {
        type: 'business',
        constraint: 'Read-only Phase 1 (no editing/generation)',
        impact: 'Users cannot manually edit personas or trigger AI regeneration in Phase 1'
      }
    ],

    assumptions: [
      {
        assumption: 'customerIntelligence.ts service layer is production-ready and requires zero changes',
        validation_method: 'Read service file during EXEC pre-implementation checklist, verify all methods return expected data structures'
      },
      {
        assumption: 'RLS policies on 5 tables already enforce venture ownership correctly',
        validation_method: 'E2E test TS-10 verifies RLS enforcement, security sub-agent review'
      },
      {
        assumption: 'Recharts library is already installed in EHG app',
        validation_method: 'Check package.json dependencies, npm install recharts if needed'
      },
      {
        assumption: 'Stages 3, 15, 17 components are modifiable without breaking existing functionality',
        validation_method: 'E2E tests for those stages must pass before and after modifications'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
