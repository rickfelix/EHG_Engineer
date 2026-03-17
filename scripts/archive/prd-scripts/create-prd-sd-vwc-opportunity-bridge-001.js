#!/usr/bin/env node

/**
 * PRD for SD-VWC-OPPORTUNITY-BRIDGE-001
 * Bridge AI Opportunity Sourcing to Venture Creation Wizard
 *
 * Connects existing ventureIdeationService (471 LOC) to VentureCreationPage wizard
 * to enable "Browse-first" venture creation flow alongside existing "Idea-first" flow.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-VWC-OPPORTUNITY-BRIDGE-001';
const PRD_TITLE = 'Bridge AI Opportunity Sourcing to Venture Creation Wizard - Technical Implementation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch SD
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);

  // Build PRD
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,

    // Core Metadata
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'product_feature',
    priority: 'high',

    // Executive Summary
    executive_summary: `
Enable users to discover and launch AI-generated opportunity blueprints directly into the venture creation wizard. This connects two existing systems (ventureIdeationService + VentureCreationPage) that are currently architecturally isolated, unlocking $10k+ of prior development investment.

The integration adds a "Browse-first" venture creation flow alongside the existing "Idea-first" flow, where users can browse competitive intelligence insights, select promising opportunities, and launch them into the wizard with pre-filled data.

Impact: Activates hidden infrastructure (471 LOC service + 5 database tables + complete UI), reduces user friction, enables conversion analytics, and provides foundation for AI-assisted venture discovery.
    `.trim(),

    business_context: `
**User Pain Points:**
- Users must manually enter venture ideas from scratch
- No discovery mechanism for AI-generated opportunities
- Valuable competitive intelligence system goes unused
- Time-consuming wizard data entry

**Business Objectives:**
- Unlock value of existing competitive intelligence infrastructure
- Improve venture creation UX with pre-filled data
- Track blueprint→venture conversion for ROI measurement
- Enable data-driven refinement of opportunity scoring

**Success Metrics:**
- Browse button clicks tracked (adoption rate)
- Blueprint→venture conversion rate measured
- Time-to-create compared (pre-filled vs manual)
- Venture quality scores compared (blueprint-sourced vs manual)
- Chairman qualitative feedback on discovery experience
    `.trim(),

    technical_context: `
**Existing Systems:**
- ventureIdeationService.ts (471 LOC) - Fully functional opportunity sourcing
- OpportunitySourcingDashboard - Complete UI at /opportunity-sourcing
- VentureCreationPage - 5-step wizard at /ventures/new
- 5 database tables: market_segments, competitor_tracking, customer_feedback_sources, opportunity_blueprints, listening_radar_config

**Architecture Patterns:**
- React + TypeScript + Vite
- Supabase PostgreSQL backend
- Service-layer pattern for business logic
- Component composition for UI

**Integration Gap:**
- Opportunity sourcing and venture wizard are architecturally isolated
- No navigation path from opportunities to wizard
- No data transformation layer between systems
- No conversion tracking in database
    `.trim(),

    // Functional Requirements
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Browse Opportunities Button in Wizard',
        description: 'Add "Browse AI Opportunities" button in VentureCreationPage Step 1 that navigates to opportunity sourcing dashboard',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Button visible in Step 1 of venture creation wizard',
          'Button has proper keyboard accessibility (Enter key works)',
          'Click navigates to /opportunity-sourcing route',
          'Return URL preserved so user can navigate back to wizard'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Deep Link from Opportunity Cards',
        description: 'Add "Create Venture" button on each opportunity blueprint card that deep links to wizard with blueprintId parameter',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Each opportunity card shows "Create Venture" button',
          'Click navigates to /ventures/new?blueprintId=<uuid>',
          'Navigation preserves blueprint UUID correctly',
          'Button disabled for unapproved blueprints (chairman_status != approved)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Blueprint Data Pre-fill in Wizard',
        description: 'Parse blueprintId URL parameter and pre-fill wizard form with 6 fields from blueprint data',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'URL parameter ?blueprintId=<uuid> parsed on mount',
          'Blueprint fetched from opportunity_blueprints table',
          'Form pre-fills: name, description, problem, target_market, competitive_gaps, unique_value_proposition',
          'Pre-filled data is editable by user',
          'Loading state shown during blueprint fetch',
          'User can clear pre-filled data and start fresh'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Opportunity-to-Venture Adapter Service',
        description: 'Create transformation service that maps opportunity blueprint data structure to venture wizard data structure',
        priority: 'HIGH',
        acceptance_criteria: [
          'Service file created: src/services/opportunityToVentureAdapter.ts',
          'transformBlueprint() function maps all 6 wizard fields',
          'Handles missing/null blueprint fields gracefully',
          'Returns TypeScript-typed venture data object',
          'Unit tests for transformation logic'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Source Blueprint Tracking',
        description: 'Add source_blueprint_id column to ventures table to track which ventures originated from blueprints',
        priority: 'HIGH',
        acceptance_criteria: [
          'Migration adds nullable source_blueprint_id UUID column',
          'Foreign key constraint to opportunity_blueprints table',
          'Column populated when venture created from blueprint',
          'Column NULL when venture created from scratch (idea-first flow)',
          'Analytics query: COUNT ventures grouped by source_blueprint_id'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Error Handling for Invalid Blueprints',
        description: 'Handle edge cases: invalid blueprintId, unapproved blueprint, missing blueprint, network failure',
        priority: 'HIGH',
        acceptance_criteria: [
          'Invalid UUID format: Show error toast, remove parameter',
          'Blueprint not found: Show error message, fallback to empty wizard',
          'Unapproved blueprint: Show warning, allow editing but warn',
          'Network error: Show retry button with error message',
          'All error messages are user-friendly (no technical jargon)'
        ]
      },
      {
        id: 'FR-7',
        requirement: 'Zero Regressions in Existing Wizard',
        description: 'Ensure all existing wizard functionality (idea-first flow) continues to work identically',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Wizard loads without blueprintId parameter (existing flow)',
          'All 5 wizard steps function correctly',
          'Voice capture still works',
          'EVA quality scoring still works',
          'Auto-save functionality still works',
          'E2E tests validate zero regressions'
        ]
      }
    ],

    // Non-Functional Requirements
    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Blueprint fetch does not block wizard loading',
        target_metric: 'Wizard UI loads immediately, blueprint fetch async in background'
      },
      {
        type: 'usability',
        requirement: 'Browse feature is discoverable but non-intrusive',
        target_metric: 'Button visible in Step 1, but wizard works identically without it'
      },
      {
        type: 'maintainability',
        requirement: 'Minimal code changes to leverage existing infrastructure',
        target_metric: '375 LOC total across 5 files (95% infrastructure reuse)'
      },
      {
        type: 'reliability',
        requirement: 'Graceful degradation if opportunity service unavailable',
        target_metric: 'Wizard falls back to empty state, no crashes'
      }
    ],

    // Technical Requirements
    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Adapter Service Implementation',
        description: 'Create TypeScript service for blueprint→wizard data transformation',
        dependencies: ['@/services/ventureIdeationService', 'opportunity_blueprints table schema']
      },
      {
        id: 'TR-2',
        requirement: 'VentureCreationPage Modifications',
        description: 'Add browse button, URL parameter handler, pre-fill logic',
        dependencies: ['React Router useSearchParams', 'opportunityToVentureAdapter service']
      },
      {
        id: 'TR-3',
        requirement: 'OpportunitySourcingDashboard Modifications',
        description: 'Add "Create Venture" button to opportunity cards',
        dependencies: ['React Router Link component', 'opportunity_blueprints.chairman_status field']
      },
      {
        id: 'TR-4',
        requirement: 'Database Migration',
        description: 'Add source_blueprint_id to ventures table',
        dependencies: ['Supabase migration system', 'opportunity_blueprints table']
      },
      {
        id: 'TR-5',
        requirement: 'E2E Test Suite',
        description: 'Comprehensive Playwright tests for complete browse→create→venture journey',
        dependencies: ['Playwright test framework', 'Test database with sample blueprints']
      }
    ],

    // Architecture
    system_architecture: `
## Component Architecture

**Three Components Modified:**
1. **VentureCreationPage.tsx** (+50 LOC)
   - Add browse button in Step 1
   - Add useSearchParams hook for blueprintId
   - Add useEffect for blueprint fetch and pre-fill
   - Add error handling UI

2. **OpportunitySourcingDashboard.jsx** (+30 LOC)
   - Add "Create Venture" button to opportunity cards
   - Add conditional rendering (show button only for approved blueprints)
   - Add Link component with blueprintId parameter

3. **opportunityToVentureAdapter.ts** (NEW, 80 LOC)
   - transformBlueprint(blueprint) → ventureFormData
   - Field mappings (6 fields)
   - Null/undefined handling
   - TypeScript types

## Data Flow

1. **Browse-First Flow:**
   User clicks "Browse" → Navigate to /opportunity-sourcing → Browse blueprints → Click "Create Venture" → Navigate to /ventures/new?blueprintId=X → Fetch blueprint → Transform data → Pre-fill wizard → User edits → Submit → Venture created with source_blueprint_id

2. **Idea-First Flow (Unchanged):**
   User navigates to /ventures/new → Empty wizard → User fills form → Submit → Venture created with source_blueprint_id=NULL

## Integration Points

- **Frontend:** React Router for navigation and URL parameters
- **Service Layer:** opportunityToVentureAdapter bridges ventureIdeationService and VentureCreationPage
- **Database:** Foreign key from ventures.source_blueprint_id to opportunity_blueprints.id
- **Analytics:** Query ventures table grouped by source_blueprint_id for conversion tracking
    `.trim(),

    // Data Model
    data_model: {
      tables: [
        {
          name: 'ventures',
          columns: ['id', 'name', 'description', 'source_blueprint_id (NEW, nullable UUID)', 'created_at', 'updated_at'],
          relationships: ['source_blueprint_id → opportunity_blueprints.id (FK)']
        },
        {
          name: 'opportunity_blueprints',
          columns: ['id', 'name', 'description', 'problem_statement', 'target_market', 'competitive_gaps', 'value_proposition', 'chairman_status', 'created_at'],
          relationships: ['← ventures.source_blueprint_id (FK)']
        }
      ]
    },

    // API Specifications (No new APIs, using existing Supabase queries)
    api_specifications: [
      {
        endpoint: 'supabase.from("opportunity_blueprints").select("*").eq("id", blueprintId)',
        method: 'GET',
        description: 'Fetch single blueprint by ID',
        request: { blueprintId: 'UUID' },
        response: { blueprint: 'OpportunityBlueprint object or null' }
      },
      {
        endpoint: 'supabase.from("ventures").insert({ ...data, source_blueprint_id })',
        method: 'POST',
        description: 'Create venture with optional source_blueprint_id',
        request: { venture_data: 'object', source_blueprint_id: 'UUID | null' },
        response: { venture: 'Created venture object' }
      }
    ],

    // UI/UX Requirements
    ui_ux_requirements: [
      {
        component: 'VentureCreationPage - Step 1',
        description: 'Add "Browse AI Opportunities" button below venture name input field',
        wireframe: 'Button with icon, secondary styling, non-intrusive placement'
      },
      {
        component: 'OpportunitySourcingDashboard - Opportunity Card',
        description: 'Add "Create Venture" button to each approved opportunity card',
        wireframe: 'Primary button, prominent but not blocking card content'
      },
      {
        component: 'VentureCreationPage - Loading State',
        description: 'Show skeleton loader while fetching blueprint data',
        wireframe: 'Shimmer effect on form fields during fetch'
      },
      {
        component: 'VentureCreationPage - Error State',
        description: 'Toast notification for blueprint fetch errors with retry action',
        wireframe: 'Error toast with "Retry" and "Dismiss" buttons'
      }
    ],

    // Implementation Approach
    implementation_approach: `
## Phase 1: Adapter Service (1 hour)
1. Create src/services/opportunityToVentureAdapter.ts
2. Define TypeScript types for blueprint and venture data
3. Implement transformBlueprint() with field mappings
4. Write unit tests for transformation logic
5. Handle null/undefined cases

## Phase 2: UI Integration (2 hours)
1. Modify VentureCreationPage.tsx:
   - Add browse button with onClick handler
   - Add useSearchParams for blueprintId
   - Add useEffect for blueprint fetch
   - Implement pre-fill logic
   - Add loading and error states
2. Modify OpportunitySourcingDashboard.jsx:
   - Add "Create Venture" button to cards
   - Add conditional rendering for chairman_status
   - Add Link with blueprintId parameter

## Phase 3: Database Migration (30 minutes)
1. Create migration file: YYYYMMDD_add_source_blueprint_id_to_ventures.sql
2. Add nullable source_blueprint_id UUID column
3. Add foreign key constraint to opportunity_blueprints
4. Test migration rollback
5. Run migration on dev database

## Phase 4: Testing (1.5 hours)
1. Write E2E test: tests/e2e/opportunity-to-venture-bridge.spec.ts
2. Test scenarios:
   - Browse button click
   - Navigation to opportunity sourcing
   - Deep link with blueprintId
   - Form pre-fill verification
   - End-to-end flow
   - Error handling
   - Zero regressions
3. Run test suite, fix any issues
4. Verify CI/CD pipeline passes

## Phase 5: Deployment (30 minutes)
1. Git commit with conventional format
2. Create PR with screenshots
3. Code review
4. Merge to main
5. Run database migration on production
6. Verify functionality in production
    `.trim(),

    // Technology Stack
    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'React Router (useSearchParams, Link)',
      'Shadcn UI (Button, Toast)',
      'Supabase PostgreSQL',
      'Playwright (E2E testing)'
    ],

    // Dependencies
    dependencies: [
      {
        type: 'internal',
        name: 'ventureIdeationService.ts',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'OpportunitySourcingDashboard.jsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'VentureCreationPage.tsx',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'opportunity_blueprints table',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'ventures table',
        status: 'completed',
        blocker: false
      }
    ],

    // Test Scenarios
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Browse Button Visibility and Accessibility',
        description: 'User sees browse button in wizard Step 1, can click or press Enter',
        expected_result: 'Button renders, is keyboard accessible, navigates to /opportunity-sourcing',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Navigation to Opportunity Sourcing',
        description: 'Click browse button navigates to opportunity sourcing dashboard',
        expected_result: 'Route changes to /opportunity-sourcing, dashboard loads',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Deep Link from Opportunity Card',
        description: 'Click "Create Venture" on opportunity card navigates to wizard with blueprintId',
        expected_result: 'Route changes to /ventures/new?blueprintId=<uuid>',
        test_type: 'e2e'
      },
      {
        id: 'TS-4',
        scenario: 'Form Pre-fill from Blueprint',
        description: 'Wizard fetches blueprint and pre-fills 6 form fields',
        expected_result: 'All 6 fields populated: name, description, problem, target_market, competitive_gaps, value_proposition',
        test_type: 'e2e'
      },
      {
        id: 'TS-5',
        scenario: 'End-to-End Browse→Create→Venture Flow',
        description: 'Complete journey from opportunity browsing to venture creation',
        expected_result: 'Venture created with source_blueprint_id populated correctly',
        test_type: 'e2e'
      },
      {
        id: 'TS-6',
        scenario: 'Error Handling - Invalid Blueprint ID',
        description: 'Navigate with invalid blueprintId UUID',
        expected_result: 'Error toast shown, wizard falls back to empty state',
        test_type: 'e2e'
      },
      {
        id: 'TS-7',
        scenario: 'Error Handling - Blueprint Not Found',
        description: 'Navigate with valid UUID but blueprint does not exist',
        expected_result: 'Error message shown, wizard falls back to empty state',
        test_type: 'e2e'
      },
      {
        id: 'TS-8',
        scenario: 'Zero Regressions - Idea-First Flow',
        description: 'Navigate to /ventures/new without blueprintId parameter',
        expected_result: 'Wizard loads normally, all existing functionality works',
        test_type: 'e2e'
      },
      {
        id: 'TS-9',
        scenario: 'Adapter Service - Data Transformation',
        description: 'transformBlueprint() correctly maps all fields',
        expected_result: 'Blueprint object transformed to venture form data structure',
        test_type: 'unit'
      },
      {
        id: 'TS-10',
        scenario: 'Adapter Service - Null Handling',
        description: 'transformBlueprint() handles missing/null blueprint fields',
        expected_result: 'Returns empty strings for null fields, no crashes',
        test_type: 'unit'
      }
    ],

    // Acceptance Criteria
    acceptance_criteria: [
      'All 7 functional requirements (FR-1 through FR-7) implemented',
      'All 10 test scenarios (TS-1 through TS-10) passing',
      'Both unit tests and E2E tests passing (100% user story coverage)',
      'CI/CD pipeline green (GitHub Actions passing)',
      'Browse button visible and functional in wizard Step 1',
      'Deep link navigation working (/ventures/new?blueprintId=<uuid>)',
      'Form pre-fills all 6 fields from blueprint data',
      'Error handling complete for all edge cases',
      'Ventures table tracks source_blueprint_id correctly',
      'Zero regressions in existing wizard functionality',
      'Performance requirements met (<2s wizard load)',
      'Code review completed and approved',
      'Documentation updated (inline comments + README)',
      'Database migration successful (dev + prod)'
    ],

    // Performance Requirements
    performance_requirements: {
      page_load_time: '<2s (wizard UI loads immediately, blueprint fetch async)',
      api_response_time: '<500ms (blueprint fetch from Supabase)',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined (10 scenarios)', checked: true },
      { text: 'Acceptance criteria established (14 criteria)', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (source_blueprint_id column)', checked: true },
      { text: 'Security assessment completed (low risk, no auth changes)', checked: true }
    ],

    exec_checklist: [
      { text: 'Development environment setup (EHG app, ../ehg/)', checked: false },
      { text: 'Adapter service implemented (opportunityToVentureAdapter.ts)', checked: false },
      { text: 'VentureCreationPage modified (browse button + pre-fill)', checked: false },
      { text: 'OpportunitySourcingDashboard modified (Create Venture button)', checked: false },
      { text: 'Database migration created and tested', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated (<2s load)', checked: false }
    ],

    validation_checklist: [
      { text: 'All 14 acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'CI/CD pipeline green', checked: false },
      { text: 'Database migration successful (dev + prod)', checked: false },
      { text: 'Zero regressions validated via E2E tests', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress
    progress: 20,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 20,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks
    risks: [
      {
        category: 'Technical',
        risk: 'VentureCreationPage state management conflicts with pre-fill logic',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Could cause form state bugs or race conditions',
        mitigation: 'Use useEffect with proper dependency array, test thoroughly with E2E'
      },
      {
        category: 'Technical',
        risk: 'Database foreign key constraint fails if orphaned blueprints exist',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Migration would fail',
        mitigation: 'Migration uses nullable column, no data changes, easy rollback'
      },
      {
        category: 'Business',
        risk: 'Users confused by browse button placement or functionality',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Low adoption of browse feature',
        mitigation: 'Progressive enhancement design, optional feature, gather user feedback'
      },
      {
        category: 'Integration',
        risk: 'Blueprint data structure changes break adapter service',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Pre-fill would fail',
        mitigation: 'TypeScript types for blueprint schema, unit tests validate mappings'
      }
    ],

    // Constraints
    constraints: [
      {
        type: 'technical',
        constraint: 'Must not modify ventureIdeationService.ts (leverage as-is)',
        impact: 'Adapter service must handle any data structure mismatches'
      },
      {
        type: 'technical',
        constraint: 'Must maintain backward compatibility (idea-first flow unchanged)',
        impact: 'All wizard modifications must be additive, no breaking changes'
      },
      {
        type: 'technical',
        constraint: 'Database migration must be rollback-safe',
        impact: 'Use nullable column, no data changes, test rollback procedure'
      },
      {
        type: 'scope',
        constraint: 'Phase 1 only (no filtering, comparison, or feedback loop features)',
        impact: 'Future enhancements (Phase 2/3) deferred until Phase 1 proves value'
      }
    ],

    // Assumptions
    assumptions: [
      {
        assumption: 'ventureIdeationService and OpportunitySourcingDashboard are fully functional',
        validation_method: 'Verify routes /opportunity-sourcing loads, blueprints table has data'
      },
      {
        assumption: 'VentureCreationPage wizard accepts pre-filled data via initial state',
        validation_method: 'Review VentureCreationPage state management, test pre-fill manually'
      },
      {
        assumption: 'Users will discover browse button organically (no onboarding needed)',
        validation_method: 'Monitor browse button clicks, gather user feedback post-launch'
      },
      {
        assumption: 'Chairman-approved blueprints exist in database for testing',
        validation_method: 'Query opportunity_blueprints WHERE chairman_status = "approved"'
      }
    ],

    // Stakeholders
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        involvement_level: 'high'
      },
      {
        name: 'Chairman (End User)',
        role: 'Primary user of opportunity browsing feature',
        involvement_level: 'medium'
      }
    ],

    // Timeline
    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week

    // Metadata
    metadata: {
      estimated_hours: 5.5,
      implementation_files: [
        'src/services/opportunityToVentureAdapter.ts (NEW, 80 LOC)',
        'src/components/ventures/VentureCreationPage.tsx (+50 LOC)',
        'src/pages/OpportunitySourcingDashboard.jsx (+30 LOC)',
        'supabase/migrations/YYYYMMDD_add_source_blueprint_id.sql (15 LOC)',
        'tests/e2e/opportunity-to-venture-bridge.spec.ts (NEW, 200 LOC)'
      ],
      total_loc: 375,
      infrastructure_reuse_percentage: 95,
      sd_related_ids: ['SD-041B', 'SD-VWC-PHASE1-001']
    },

    // Audit
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Validate
  console.log('\n3️⃣  Validating PRD schema...');
  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // Check existing
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
    process.exit(1);
  }

  // Insert
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

  // Success
  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);
  console.log(`   Estimated Hours: ${prdData.metadata.estimated_hours}`);
  console.log(`   Total LOC: ${prdData.metadata.total_loc}`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Generate user stories: (Auto-triggered by PRD creation)');
  console.log('   2. Create PLAN→EXEC handoff when ready');
  console.log('   3. Begin implementation in EHG app (../ehg/)');
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
