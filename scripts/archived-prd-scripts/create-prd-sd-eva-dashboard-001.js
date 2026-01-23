#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-EVA-DASHBOARD-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-EVA-DASHBOARD-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'EVA Chairman Dashboard'; // TODO: Replace with your PRD title

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

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'product_feature',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
The EVA Chairman Dashboard provides a unified "cockpit view" for the Chairman to monitor the health
and status of all ventures in the EHG portfolio at a glance. This dashboard implements traffic-light
health indicators (green/yellow/red), real-time metrics display, and decision routing based on the
EVA Core Architecture (eva_ventures, eva_events, eva_decisions tables).

The dashboard reduces cognitive load by surfacing critical information upfront: ventures requiring
attention (red/yellow status), pending Class A/B decisions needing approval, cash flow trends,
and portfolio-wide performance metrics. This enables rapid assessment and informed decision-making
for a Chairman managing 32+ concurrent ventures.
    `.trim(),

    business_context: `
**User Pain Points:**
- Manual tracking of multiple venture health metrics across disparate systems
- Delayed visibility into critical issues requiring immediate attention
- Difficulty prioritizing which ventures need Chairman attention

**Business Objectives:**
- Enable management of 32+ concurrent ventures (vs 1 today)
- Reduce decision latency on critical issues (Class A decisions)
- Provide real-time portfolio health visibility

**Success Metrics:**
- Dashboard load time < 2 seconds
- 100% of red-status ventures surfaced immediately
- All pending Class A/B decisions visible on dashboard
    `.trim(),

    technical_context: `
**Existing Systems:**
- EVA Core Architecture tables (eva_ventures, eva_events, eva_decisions) from SD-EVA-ARCHITECTURE-001
- Existing BriefingDashboard pattern in ehg/src/components/chairman-v2/
- useChairmanDashboardData hook pattern for parallel data fetching

**Architecture Patterns:**
- React Query (useQuery) for data fetching with staleTime and refetchInterval
- Shadcn UI components (Card, Badge, Table, Button)
- QuickStatCard pattern for KPI widgets
- Grid layout: 2-column on desktop, single column on mobile

**Integration Points:**
- Supabase eva_ventures table for health metrics
- Supabase eva_decisions table for pending decisions
- Existing venture_stages for progress calculation
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'EVA Health Grid - Traffic Light Venture Display',
        description: 'Display all ventures in a grid with color-coded health status (green/yellow/red) based on eva_ventures.health_status. Sort by status (red first, then yellow, then green).',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Grid displays all ventures from eva_ventures table',
          'Color-coded badges: green (healthy), yellow (warning), red (critical)',
          'Red ventures appear at top of grid',
          'Click on venture navigates to venture detail page'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Pending Decisions Panel',
        description: 'Display pending Class A and Class B decisions from eva_decisions table. Show decision title, stake level, and due date. Allow inline decision action.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Fetches decisions with status=pending and decision_class in (A, B)',
          'Displays title, stake_level, due_date for each decision',
          'Critical decisions show pulsing indicator',
          'Decide button navigates to decision detail'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Portfolio Metrics Summary',
        description: 'Display aggregate portfolio metrics: total MRR, average growth rate, total burn rate, and average runway. Use QuickStatCard pattern with trend indicators.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Shows total portfolio MRR (sum of eva_ventures.mrr)',
          'Shows weighted average MRR growth rate',
          'Shows total burn rate across portfolio',
          'Shows average runway months',
          'Trend indicators show week-over-week change'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Cash Flow Pulse Widget',
        description: 'Visual representation of portfolio cash flow health using a simple bar or sparkline chart showing burn vs runway.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Displays burn rate trend (last 30 days)',
          'Color-coded based on runway threshold',
          'Clicking opens detailed cash flow view'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Dashboard initial load time',
        target_metric: '<2s page load time, <500ms for data refresh'
      },
      {
        type: 'security',
        requirement: 'RLS Policy enforcement',
        target_metric: 'All eva_* table queries respect RLS policies'
      },
      {
        type: 'usability',
        requirement: 'Responsive design',
        target_metric: 'Usable on tablet (768px+) and desktop'
      },
      {
        type: 'reliability',
        requirement: 'Graceful degradation',
        target_metric: 'Loading states shown during fetch, errors handled gracefully'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'React Query for data fetching',
        description: 'Use useQuery pattern with staleTime: 30000ms, refetchInterval: 60000ms for real-time updates',
        dependencies: ['@tanstack/react-query', '@supabase/supabase-js']
      },
      {
        id: 'TR-2',
        requirement: 'Shadcn UI components',
        description: 'Use Card, Badge, Button, Table from Shadcn for consistent styling',
        dependencies: ['shadcn/ui', 'lucide-react']
      },
      {
        id: 'TR-3',
        requirement: 'TypeScript interfaces',
        description: 'Export EVAVenture, EVADecision, PortfolioMetrics interfaces from component files',
        dependencies: ['typescript']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
EVAChairmanDashboard
├── useEVADashboardData hook (data fetching layer)
│   ├── useQuery: eva_ventures with health metrics
│   ├── useQuery: eva_decisions with status=pending
│   └── useQuery: aggregated portfolio metrics
├── EVAHealthGrid component (venture display)
├── EVADecisionStack component (pending decisions)
├── EVAPortfolioStats component (QuickStatCard grid)
└── EVACashFlowPulse component (burn/runway visual)

## Data Flow
1. useEVADashboardData hook fetches from eva_ventures, eva_decisions
2. React Query caches data with 30s staleTime
3. Auto-refetch every 60s via refetchInterval
4. Components receive data via hook return values
5. User actions (click) navigate to detail pages

## Integration Points
- Supabase: eva_ventures, eva_decisions, eva_events tables
- React Router: Navigation to /ventures/:id, /decisions/:id
- Existing: BriefingDashboard layout patterns
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'eva_ventures',
          columns: ['id', 'venture_id', 'name', 'status', 'health_status', 'mrr', 'mrr_growth_rate', 'churn_rate', 'burn_rate', 'runway_months', 'decision_class', 'pending_decisions'],
          relationships: ['venture_id → ventures.id']
        },
        {
          name: 'eva_decisions',
          columns: ['id', 'eva_venture_id', 'decision_class', 'title', 'description', 'stake_level', 'status', 'due_date'],
          relationships: ['eva_venture_id → eva_ventures.id']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'supabase.from("eva_ventures").select("*")',
        method: 'SELECT',
        description: 'Fetch all ventures with health metrics',
        request: {},
        response: { type: 'EVAVenture[]' }
      },
      {
        endpoint: 'supabase.from("eva_decisions").select("*").eq("status", "pending")',
        method: 'SELECT',
        description: 'Fetch pending decisions for chairman',
        request: {},
        response: { type: 'EVADecision[]' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'EVAHealthGrid',
        description: 'Grid of venture cards with traffic-light health indicators. Red ventures first, sorted by runway (lowest first).',
        wireframe: 'N/A - follows existing PortfolioSummary pattern'
      },
      {
        component: 'EVADecisionStack',
        description: 'Vertical list of pending decisions with priority indicators. Critical items pulsate. Similar to DecisionStack pattern.',
        wireframe: 'N/A - follows existing DecisionStack pattern'
      },
      {
        component: 'EVAPortfolioStats',
        description: 'Row of QuickStatCard components showing portfolio KPIs with trend indicators.',
        wireframe: 'N/A - follows existing QuickStatCard pattern'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Data Hook (useEVADashboardData)
- Create hook in ehg/src/hooks/useEVADashboardData.ts
- Parallel useQuery calls for eva_ventures, eva_decisions
- Aggregate portfolio metrics (sum MRR, avg growth, etc.)
- Add TypeScript interfaces

## Phase 2: UI Components
- EVAHealthGrid: Grid layout with VentureCard subcomponent
- EVADecisionStack: List with DecisionItem subcomponent
- EVAPortfolioStats: Row of QuickStatCards
- Wire to useEVADashboardData hook

## Phase 3: Integration & Testing
- Add route to React Router
- E2E test for dashboard load and navigation
- Unit tests for hook and components
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
        name: 'SD-EVA-ARCHITECTURE-001 (EVA Core Tables)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'BriefingDashboard component patterns',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Dashboard loads with venture data',
        description: 'Navigate to EVA Dashboard and verify ventures appear in health grid',
        expected_result: 'EVAHealthGrid displays ventures sorted by health status',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'Pending decisions display correctly',
        description: 'Verify pending Class A/B decisions appear in decision stack',
        expected_result: 'EVADecisionStack shows pending decisions with priority indicators',
        test_type: 'e2e'
      },
      {
        id: 'TS-3',
        scenario: 'Portfolio metrics calculate correctly',
        description: 'Verify aggregate metrics match sum of individual venture metrics',
        expected_result: 'Total MRR equals sum of all venture MRR values',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'EVAHealthGrid displays ventures with correct color-coded health status',
      'EVADecisionStack shows all pending Class A/B decisions',
      'EVAPortfolioStats displays accurate aggregate metrics',
      'Dashboard loads in under 2 seconds',
      'All E2E tests pass',
      'TypeScript interfaces exported and documented'
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
        risk: 'EVA tables may not have test data',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Dashboard appears empty during development',
        mitigation: 'Add mock mode fallback with sample data'
      },
      {
        category: 'Performance',
        risk: 'Large number of ventures could slow dashboard',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Load time exceeds 2s target',
        mitigation: 'Implement pagination or virtual scrolling if >50 ventures'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing Shadcn UI components',
        impact: 'Custom styling limited to Tailwind classes'
      },
      {
        type: 'dependency',
        constraint: 'Requires eva_ventures table from SD-EVA-ARCHITECTURE-001',
        impact: 'Cannot test until migration is applied'
      }
    ],

    assumptions: [
      {
        assumption: 'EVA Core Architecture migration is applied',
        validation_method: 'Query eva_ventures table existence'
      },
      {
        assumption: 'Chairman has access to view all ventures',
        validation_method: 'RLS policy allows admin access'
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
      exploration_summary: [
        {
          file_path: 'database/migrations/20260102_eva_core_architecture.sql',
          purpose: 'Review EVA Core tables schema',
          key_findings: 'eva_ventures has health_status (green/yellow/red), MRR, churn, burn_rate, runway_months. eva_decisions has decision_class (A/B/C), stake_level, status.'
        },
        {
          file_path: 'ehg/src/hooks/useChairmanDashboardData.ts',
          purpose: 'Understand existing data hook patterns',
          key_findings: 'Uses @tanstack/react-query with parallel useQuery calls, staleTime 30s, refetchInterval 60s. Fetches ventures, decisions, metrics in parallel.'
        },
        {
          file_path: 'ehg/src/components/chairman-v2/BriefingDashboard.tsx',
          purpose: 'Understand dashboard component composition',
          key_findings: 'Uses EVAGreeting, QuickStatCard grid (4 columns), TokenBudgetBar, DecisionStack, PortfolioSummary in 2-column layout.'
        },
        {
          file_path: 'ehg/src/components/chairman-v2/QuickStatCard.tsx',
          purpose: 'Review stat card pattern for portfolio metrics',
          key_findings: 'Props: label, value, trend, trendValue, icon, variant (default/success/warning/danger). Hover scale effect, trend indicators.'
        },
        {
          file_path: 'ehg/src/components/chairman-v2/DecisionStack.tsx',
          purpose: 'Review decision list pattern',
          key_findings: 'Priority-based color coding, left border accent on urgent items, animated pulse on critical. Used for pending decisions.'
        }
      ],
      ui_components: ['EVAHealthGrid', 'EVADecisionStack', 'EVAPortfolioStats', 'EVACashFlowPulse'],
      estimated_hours: 8
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
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
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
