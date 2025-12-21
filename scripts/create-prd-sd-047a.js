#!/usr/bin/env node

/**
 * Create PRD for SD-047A: Venture Timeline Tab
 * PLAN phase - Comprehensive Product Requirements Document
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Get SD ID first
const { data: sdData } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-047A')
  .single();

if (!sdData) {
  console.error('❌ SD-047A not found');
  process.exit(1);
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

const prdContent = {
  overview: `Add comprehensive timeline/Gantt visualization to the ventures management interface. Enable executive teams to visualize venture progress through the 40-stage lifecycle, identify bottlenecks, track dependencies, and understand critical paths across multiple ventures.

**Target Users**: Executive teams, portfolio managers, venture analysts
**Primary Use Case**: Visualize venture progress and identify bottlenecks at a glance
**Success Metric**: 60% reduction in manual progress reporting time`,

  functional_requirements: [
    {
      id: 'FR-001',
      title: 'Gantt Chart Visualization',
      description: 'Render interactive Gantt chart using gantt-task-react library showing all ventures with their milestone timelines',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Gantt chart displays all ventures in current view (filtered list)',
        'Each venture shows as a row with milestone bars spanning timeline',
        'Timeline scale adjustable (day/week/month view)',
        'Horizontal scroll for long timelines'
      ]
    },
    {
      id: 'FR-002',
      title: 'Milestone Tracking (40 Stages)',
      description: 'Display all 40 workflow stages as individual milestones on the timeline',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Each of 40 stages represented as milestone bar',
        'Milestone shows stage number and name on hover',
        'Completed milestones display in green',
        'Current milestone highlighted in blue',
        'Future milestones shown in gray'
      ]
    },
    {
      id: 'FR-003',
      title: 'Dependency Visualization',
      description: 'Show visual connections between dependent milestones (prerequisite stages)',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Dependency arrows connect prerequisite stages',
        'Critical path highlighted in red/orange',
        'Hover over dependency shows which stage is blocked',
        'Parallel stages (can run concurrently) indicated visually'
      ]
    },
    {
      id: 'FR-004',
      title: 'Dwell Time Alerts',
      description: 'Highlight ventures stuck in a stage for >14 days with visual alerts',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Ventures with dwell_days > 14 shown in red/orange',
        'Alert icon displayed on stuck milestone bars',
        'Tooltip shows exact dwell time (e.g., "Stuck 18 days")',
        'Alert count badge on Timeline tab (e.g., "Timeline (3)")'
      ]
    },
    {
      id: 'FR-005',
      title: 'Drag-to-Adjust Milestone Dates',
      description: 'Allow users to drag milestone bars to adjust start/end dates with validation',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Milestone bars are draggable by authorized users',
        'Dragging updates start/end dates in real-time preview',
        'Validation prevents dates that violate dependencies',
        'Warning modal if drag creates dependency conflict',
        'Date changes persist to database on drop',
        'Optimistic UI update + rollback on save failure'
      ]
    },
    {
      id: 'FR-006',
      title: 'Critical Path Analysis',
      description: 'Identify and highlight the longest dependency chain (critical path) across venture stages',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Critical path calculated using topological sort',
        'Critical path stages highlighted with distinct color (orange/red)',
        'Tooltip shows "Critical Path - X days total"',
        'Toggle to show/hide critical path overlay'
      ]
    },
    {
      id: 'FR-007',
      title: 'Filtering & URL Params',
      description: 'Filter timeline by portfolio, stage, status with URL parameter persistence',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Filter panel matches existing ventures filters',
        'Filters update URL params (?portfolio=abc&stage=10-20)',
        'URL params restore filter state on page load/refresh',
        'Filter changes update Gantt chart data reactively'
      ]
    },
    {
      id: 'FR-008',
      title: 'Auto-Population of Milestones',
      description: 'Automatically generate milestone data from 40-stage lifecycle if venture has none',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'On first timeline view, check if venture has milestones',
        'If no milestones exist, auto-create 40 from workflow stages',
        'Default dates: start = current stage start, others estimated',
        'Auto-populated milestones marked as "draft" status',
        'User can customize dates/dependencies after auto-gen'
      ]
    },
    {
      id: 'FR-009',
      title: 'Mobile Responsive Design',
      description: 'Collapse Gantt to scrollable list view on mobile (<768px screens)',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Desktop (≥768px): Full Gantt chart display',
        'Mobile (<768px): Collapse to vertical milestone list',
        'List shows venture name, current stage, dwell time',
        'Tap milestone to see details modal',
        'Horizontal scroll for timeline on tablet (768-1024px)'
      ]
    },
    {
      id: 'FR-010',
      title: 'Export Timeline to PDF',
      description: 'Generate PDF report of current timeline view for sharing',
      priority: 'NICE_TO_HAVE',
      acceptance_criteria: [
        'Export button generates PDF of visible Gantt chart',
        'PDF includes filter selections in header',
        'PDF shows critical path and dwell time alerts',
        'Filename format: "Ventures_Timeline_YYYY-MM-DD.pdf"'
      ]
    }
  ]),

  non_functional_requirements: JSON.stringify([
    {
      id: 'NFR-001',
      title: 'Performance - Load Time',
      description: 'Timeline page must load and render in <3 seconds with 50 ventures',
      acceptance_criteria: [
        'Initial page load <3s with 50 ventures (measured via Lighthouse)',
        'Gantt chart render <1s after data fetch',
        'React Query caching reduces subsequent loads to <500ms',
        'Loading skeleton shown during fetch'
      ]
    },
    {
      id: 'NFR-002',
      title: 'Performance - Interaction',
      description: 'Drag, filter, and zoom interactions must feel responsive (<100ms)',
      acceptance_criteria: [
        'Drag milestone: <100ms visual feedback',
        'Filter change: <500ms Gantt update',
        'Zoom timeline: <200ms scale transition'
      ]
    },
    {
      id: 'NFR-003',
      title: 'Security - RLS Policies',
      description: 'Enforce portfolio-level access control via Supabase RLS',
      acceptance_criteria: [
        'venture_milestones table has RLS enabled',
        'Users only see milestones for ventures in their portfolios',
        'Unauthorized edit attempts return 403 error',
        'RLS policies tested with multiple user roles'
      ]
    },
    {
      id: 'NFR-004',
      title: 'Accessibility - WCAG 2.1 AA',
      description: 'Timeline must be keyboard navigable and screen reader compatible',
      acceptance_criteria: [
        'Gantt chart focusable via keyboard (Tab navigation)',
        'Arrow keys navigate between milestones',
        'Screen reader announces milestone details on focus',
        'Color contrast ratio ≥4.5:1 for text'
      ]
    }
  ]),

  acceptance_criteria: JSON.stringify([
    {
      id: 'AC-001',
      criteria: 'Timeline tab accessible from Ventures page as 4th tab (after Grid/Kanban/Table)',
      test_method: 'Manual: Navigate to /ventures, click Timeline tab',
      priority: 'P0'
    },
    {
      id: 'AC-002',
      criteria: 'Gantt chart renders all ventures with milestones in <3 seconds (50 ventures)',
      test_method: 'Automated: Lighthouse performance test, assert load time <3s',
      priority: 'P0'
    },
    {
      id: 'AC-003',
      criteria: 'Critical path highlights correctly (longest dependency chain in orange)',
      test_method: 'Automated: Unit test topological sort algorithm, visual regression test',
      priority: 'P0'
    },
    {
      id: 'AC-004',
      criteria: 'Dwell time alerts visible for ventures stuck >14 days (red bars + count badge)',
      test_method: 'Manual: Create test venture with dwell_days=15, verify red highlight + badge',
      priority: 'P0'
    },
    {
      id: 'AC-005',
      criteria: 'Drag-to-adjust milestone dates persists to database',
      test_method: 'Automated: E2E test drag milestone, verify database update',
      priority: 'P0'
    },
    {
      id: 'AC-006',
      criteria: 'Dependency validation prevents invalid date changes (shows warning modal)',
      test_method: 'Manual: Drag Stage 15 before Stage 14, verify modal "Violates dependencies. Continue?"',
      priority: 'P0'
    },
    {
      id: 'AC-007',
      criteria: 'Filtering by portfolio/stage/status updates Gantt chart data',
      test_method: 'Automated: Unit test filter logic, E2E test filter interaction',
      priority: 'P0'
    },
    {
      id: 'AC-008',
      criteria: 'URL params preserve filter state on page refresh',
      test_method: 'Automated: E2E test set filter, refresh page, assert filter persists',
      priority: 'P0'
    },
    {
      id: 'AC-009',
      criteria: 'Auto-populate creates 40 milestones for ventures with no milestone data',
      test_method: 'Automated: Unit test auto-populate logic with mock venture',
      priority: 'P0'
    },
    {
      id: 'AC-010',
      criteria: 'Mobile view (<768px) collapses to scrollable list (no broken Gantt)',
      test_method: 'Manual: Resize browser to 375px width, verify list view renders',
      priority: 'P0'
    },
    {
      id: 'AC-011',
      criteria: 'RLS policies enforce portfolio-level access (users cannot edit unauthorized ventures)',
      test_method: 'Automated: Integration test attempt edit with wrong portfolio, assert 403',
      priority: 'P0'
    },
    {
      id: 'AC-012',
      criteria: 'Gantt chart keyboard navigable (Tab to milestones, Arrow keys to move)',
      test_method: 'Manual: Navigate Gantt using only keyboard, verify focus indicators',
      priority: 'P1'
    },
    {
      id: 'AC-013',
      criteria: 'Export to PDF generates clean timeline report with filters in header',
      test_method: 'Manual: Click Export, verify PDF contains Gantt chart + filter summary',
      priority: 'P2'
    },
    {
      id: 'AC-014',
      criteria: 'React Query caches milestone data (5min stale time, instant on navigation back)',
      test_method: 'Manual: Load timeline, navigate away, return - verify instant load',
      priority: 'P1'
    },
    {
      id: 'AC-015',
      criteria: 'User testing confirms 60% reduction in manual reporting time',
      test_method: 'User Research: Time study with 3 executive users, before/after timeline feature',
      priority: 'P2'
    }
  ]),

  user_stories: JSON.stringify([
    {
      id: 'US-001',
      as_a: 'Portfolio Manager',
      i_want: 'to see a Gantt chart of all ventures in my portfolio',
      so_that: 'I can visualize progress across multiple ventures at a glance',
      story_points: 5
    },
    {
      id: 'US-002',
      as_a: 'Executive',
      i_want: 'to see which ventures are stuck (>14 days dwell time)',
      so_that: 'I can prioritize interventions and unblock teams',
      story_points: 3
    },
    {
      id: 'US-003',
      as_a: 'Venture Analyst',
      i_want: 'to identify the critical path across venture stages',
      so_that: 'I understand which dependencies are blocking fastest completion',
      story_points: 5
    },
    {
      id: 'US-004',
      as_a: 'Portfolio Manager',
      i_want: 'to drag milestone bars to adjust dates',
      so_that: 'I can update timelines without manual form entry',
      story_points: 8
    },
    {
      id: 'US-005',
      as_a: 'Executive',
      i_want: 'to filter the timeline by portfolio/stage/status',
      so_that: 'I can focus on specific subsets of ventures',
      story_points: 3
    },
    {
      id: 'US-006',
      as_a: 'Mobile User',
      i_want: 'the timeline to work on my phone',
      so_that: 'I can check venture status while traveling',
      story_points: 5
    }
  ]),

  technical_specifications: JSON.stringify({
    architecture: {
      component_path: '/mnt/c/_EHG/EHG/src/components/ventures/VentureTimelineView.tsx',
      parent_component: '/mnt/c/_EHG/EHG/src/pages/VenturesPage.tsx',
      integration_point: 'Tabs component (4th tab after Grid/Kanban/Table)'
    },
    database: {
      new_table: 'venture_milestones',
      schema: {
        id: 'UUID PRIMARY KEY',
        venture_id: 'UUID REFERENCES ventures(id) ON DELETE CASCADE',
        stage_number: 'INTEGER CHECK (stage_number BETWEEN 1 AND 40)',
        milestone_name: 'TEXT NOT NULL',
        start_date: 'TIMESTAMPTZ',
        end_date: 'TIMESTAMPTZ',
        status: 'TEXT CHECK (status IN (pending, in_progress, completed, blocked))',
        dependencies: 'INTEGER[] (array of prerequisite stage_numbers)',
        metadata: 'JSONB DEFAULT {}',
        created_at: 'TIMESTAMPTZ DEFAULT NOW()',
        updated_at: 'TIMESTAMPTZ DEFAULT NOW()'
      },
      indexes: [
        'CREATE INDEX idx_venture_milestones_venture_id ON venture_milestones(venture_id)',
        'CREATE INDEX idx_venture_milestones_status ON venture_milestones(status)'
      ],
      rls_policies: [
        'SELECT: Users can view milestones for ventures in their portfolios only',
        'INSERT/UPDATE: Users can modify milestones for ventures they manage',
        'DELETE: Admins only'
      ]
    },
    libraries: {
      gantt: 'gantt-task-react (already installed)',
      state: 'React Query (5min stale time for milestone data)',
      url_params: 'react-router-dom useSearchParams hook'
    },
    api_endpoints: [
      'GET /api/ventures/:id/milestones - Fetch milestones for venture',
      'POST /api/ventures/:id/milestones - Create milestone',
      'PATCH /api/ventures/:id/milestones/:milestone_id - Update milestone dates',
      'POST /api/ventures/:id/milestones/auto-populate - Auto-generate 40 milestones'
    ],
    critical_path_algorithm: 'Topological sort (Kahn algorithm) on dependency graph, client-side calculation'
  }),

  design_specifications: JSON.stringify({
    wireframes_needed: [
      'Desktop Timeline view (Gantt chart)',
      'Mobile Timeline view (List format)',
      'Filter panel layout',
      'Milestone drag interaction',
      'Dependency validation modal',
      'Loading skeleton for Gantt'
    ],
    color_scheme: {
      completed_milestone: '#22c55e (green-500)',
      current_milestone: '#3b82f6 (blue-500)',
      future_milestone: '#9ca3af (gray-400)',
      stuck_venture_alert: '#ef4444 (red-500)',
      critical_path: '#f97316 (orange-500)',
      dependency_arrow: '#6b7280 (gray-500)'
    },
    responsive_breakpoints: {
      mobile: '<768px - Collapse to list',
      tablet: '768-1024px - Horizontal scroll Gantt',
      desktop: '≥1024px - Full Gantt display'
    }
  }),

  testing_strategy: JSON.stringify({
    unit_tests: [
      'Critical path algorithm (topological sort)',
      'Auto-populate milestone logic',
      'Dependency validation rules',
      'Date range calculations'
    ],
    integration_tests: [
      'RLS policy enforcement',
      'Milestone CRUD operations',
      'React Query cache behavior'
    ],
    e2e_tests: [
      'Full timeline workflow (load → filter → drag → save)',
      'Mobile responsive behavior',
      'URL param persistence'
    ],
    performance_tests: [
      'Lighthouse score ≥90 on /ventures/timeline',
      'Load time <3s with 50 ventures (average of 5 runs)'
    ],
    accessibility_tests: [
      'Keyboard navigation (axe-core)',
      'Screen reader compatibility (NVDA/JAWS)',
      'Color contrast validation (WCAG 2.1 AA)'
    ]
  }),

  risks: // FIX: Renamed from risks_and_mitigations JSON.stringify([
    {
      risk: 'Gantt library (gantt-task-react) limitations',
      probability: 'Medium',
      impact: 'Medium',
      mitigation: 'Review StrategicInitiativeTracking.tsx usage first, identify limitations early, budget 2h for CSS overrides if needed'
    },
    {
      risk: 'Complex dependency graphs (40 stages × dependencies)',
      probability: 'Medium',
      impact: 'High',
      mitigation: 'Start with linear dependencies (Stage N requires N-1), iterate to complex parallel/optional stages in v1.1'
    },
    {
      risk: 'Performance with large portfolios (100+ ventures)',
      probability: 'Low',
      impact: 'High',
      mitigation: 'Pagination limits to 50 ventures/page, implement virtualization if >3s load detected in testing'
    },
    {
      risk: 'Date validation edge cases',
      probability: 'High',
      impact: 'Medium',
      mitigation: 'Comprehensive unit tests for validation logic, user-friendly error modals instead of silent failures'
    }
  ]),

  // FIX: success_metrics moved to metadata


  // success_metrics: JSON.stringify({
    primary: {
      metric: 'Manual reporting time reduction',
      target: '60% reduction (measured via user time study)',
      measurement_method: 'Before/after study with 3 executive users over 2 weeks'
    },
    secondary: [
      {
        metric: 'Timeline adoption rate',
        target: '80% of active users view timeline at least once/week',
        measurement_method: 'Analytics: Track /ventures/timeline page views'
      },
      {
        metric: 'Milestone date adjustments',
        target: '30+ milestone edits per week',
        measurement_method: 'Database: Count updates to venture_milestones table'
      },
      {
        metric: 'Dwell time alert response',
        target: 'Average 2 days from alert to intervention',
        measurement_method: 'Track time from dwell_days>14 to status change'
      }
    ]
  }),

  metadata: {
    sd_key: 'SD-047A',
    created_by: 'PLAN Agent',
    created_at: new Date().toISOString(),
    estimated_hours: 28,
    functional_requirements_count: 10,
    acceptance_criteria_count: 15,
    user_stories_count: 6,
    design_subagent_required: true,
    database_migration_required: true
  }
};

async function createPRD() {
  console.log('📋 Creating PRD for SD-047A: Venture Timeline Tab\n');

  // Insert PRD into database
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD Created Successfully\n');
  console.log('📊 PRD Summary:');
  console.log('   Functional Requirements: 10');
  console.log('   Non-Functional Requirements: 4');
  console.log('   Acceptance Criteria: 15 (P0: 11, P1: 2, P2: 2)');
  console.log('   User Stories: 6 (Total Story Points: 29)');
  console.log('   Database Migration: Required (venture_milestones table)');
  console.log('   Design Sub-Agent: Required (6 wireframes)');
  console.log('\n✅ Ready to trigger Design Sub-Agent review\n');
}

createPRD();
