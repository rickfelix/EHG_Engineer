#!/usr/bin/env node

/**
 * Create PRD for SD-047A: Venture Timeline Tab
 * PLAN phase - Comprehensive Product Requirements Document
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-047A: Venture Timeline Tab\n');

  
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
    id: randomUUID(),
    ...await createPRDLink('SD-047A'),
    title: 'PRD: Venture Timeline Tab - Gantt & Milestone Visualization',
    status: 'active',

    target_url: 'http://localhost:5173/ventures',
    component_name: 'VentureTimelineView',
    app_path: '/mnt/c/_EHG/EHG',
    port: 5173,

    content: `# Product Requirements Document: Venture Timeline Tab

## Overview
Add comprehensive timeline/Gantt visualization to the ventures management interface. Enable executive teams to visualize venture progress through the 40-stage lifecycle, identify bottlenecks, track dependencies, and understand critical paths across multiple ventures.

**Target Users**: Executive teams, portfolio managers, venture analysts
**Primary Use Case**: Visualize venture progress and identify bottlenecks at a glance
**Success Metric**: 60% reduction in manual progress reporting time

## Functional Requirements

### FR-001: Gantt Chart Visualization
**Priority**: MUST_HAVE
**Description**: Render interactive Gantt chart using gantt-task-react library showing all ventures with their milestone timelines

**Acceptance Criteria**:
- Gantt chart displays all ventures in current view (filtered list)
- Each venture shows as a row with milestone bars spanning timeline
- Timeline scale adjustable (day/week/month view)
- Horizontal scroll for long timelines

### FR-002: Milestone Tracking (40 Stages)
**Priority**: MUST_HAVE
**Description**: Display all 40 workflow stages as individual milestones on the timeline

**Acceptance Criteria**:
- Each of 40 stages represented as milestone bar
- Milestone shows stage number and name on hover
- Completed milestones display in green
- Current milestone highlighted in blue
- Future milestones shown in gray

### FR-003: Dependency Visualization
**Priority**: MUST_HAVE
**Description**: Show visual connections between dependent milestones (prerequisite stages)

**Acceptance Criteria**:
- Dependency arrows connect prerequisite stages
- Critical path highlighted in red/orange
- Hover over dependency shows which stage is blocked
- Parallel stages (can run concurrently) indicated visually

### FR-004: Dwell Time Alerts
**Priority**: MUST_HAVE
**Description**: Highlight ventures stuck in a stage for >14 days with visual alerts

**Acceptance Criteria**:
- Ventures with dwell_days > 14 shown in red/orange
- Alert icon displayed on stuck milestone bars
- Tooltip shows exact dwell time (e.g., "Stuck 18 days")
- Alert count badge on Timeline tab (e.g., "Timeline (3)")

### FR-005: Drag-to-Adjust Milestone Dates
**Priority**: MUST_HAVE
**Description**: Allow users to drag milestone bars to adjust start/end dates with validation

**Acceptance Criteria**:
- Milestone bars are draggable by authorized users
- Dragging updates start/end dates in real-time preview
- Validation prevents dates that violate dependencies
- Warning modal if drag creates dependency conflict
- Date changes persist to database on drop
- Optimistic UI update + rollback on save failure

### FR-006: Critical Path Analysis
**Priority**: MUST_HAVE
**Description**: Identify and highlight the longest dependency chain (critical path) across venture stages

**Acceptance Criteria**:
- Critical path calculated using topological sort
- Critical path stages highlighted with distinct color (orange/red)
- Tooltip shows "Critical Path - X days total"
- Toggle to show/hide critical path overlay

### FR-007: Filtering & URL Params
**Priority**: MUST_HAVE
**Description**: Filter timeline by portfolio, stage, status with URL parameter persistence

**Acceptance Criteria**:
- Filter panel matches existing ventures filters
- Filters update URL params (?portfolio=abc&stage=10-20)
- URL params restore filter state on page load/refresh
- Filter changes update Gantt chart data reactively

### FR-008: Auto-Population of Milestones
**Priority**: MUST_HAVE
**Description**: Automatically generate milestone data from 40-stage lifecycle if venture has none

**Acceptance Criteria**:
- On first timeline view, check if venture has milestones
- If no milestones exist, auto-create 40 from workflow stages
- Default dates: start = current stage start, others estimated
- Auto-populated milestones marked as "draft" status
- User can customize dates/dependencies after auto-gen

### FR-009: Mobile Responsive Design
**Priority**: MUST_HAVE
**Description**: Collapse Gantt to scrollable list view on mobile (<768px screens)

**Acceptance Criteria**:
- Desktop (≥768px): Full Gantt chart display
- Mobile (<768px): Collapse to vertical milestone list
- List shows venture name, current stage, dwell time
- Tap milestone to see details modal
- Horizontal scroll for timeline on tablet (768-1024px)

### FR-010: Export Timeline to PDF
**Priority**: NICE_TO_HAVE
**Description**: Generate PDF report of current timeline view for sharing

**Acceptance Criteria**:
- Export button generates PDF of visible Gantt chart
- PDF includes filter selections in header
- PDF shows critical path and dwell time alerts
- Filename format: "Ventures_Timeline_YYYY-MM-DD.pdf"

## Non-Functional Requirements

### NFR-001: Performance - Load Time
**Description**: Timeline page must load and render in <3 seconds with 50 ventures

**Acceptance Criteria**:
- Initial page load <3s with 50 ventures (measured via Lighthouse)
- Gantt chart render <1s after data fetch
- React Query caching reduces subsequent loads to <500ms
- Loading skeleton shown during fetch

### NFR-002: Performance - Interaction
**Description**: Drag, filter, and zoom interactions must feel responsive (<100ms)

**Acceptance Criteria**:
- Drag milestone: <100ms visual feedback
- Filter change: <500ms Gantt update
- Zoom timeline: <200ms scale transition

### NFR-003: Security - RLS Policies
**Description**: Enforce portfolio-level access control via Supabase RLS

**Acceptance Criteria**:
- venture_milestones table has RLS enabled
- Users only see milestones for ventures in their portfolios
- Unauthorized edit attempts return 403 error
- RLS policies tested with multiple user roles

### NFR-004: Accessibility - WCAG 2.1 AA
**Description**: Timeline must be keyboard navigable and screen reader compatible

**Acceptance Criteria**:
- Gantt chart focusable via keyboard (Tab navigation)
- Arrow keys navigate between milestones
- Screen reader announces milestone details on focus
- Color contrast ratio ≥4.5:1 for text

## Acceptance Criteria Summary

### P0 (Critical) - 11 criteria
1. **AC-001**: Timeline tab accessible from Ventures page as 4th tab
2. **AC-002**: Gantt chart renders all ventures with milestones in <3 seconds (50 ventures)
3. **AC-003**: Critical path highlights correctly (longest dependency chain in orange)
4. **AC-004**: Dwell time alerts visible for ventures stuck >14 days (red bars + count badge)
5. **AC-005**: Drag-to-adjust milestone dates persists to database
6. **AC-006**: Dependency validation prevents invalid date changes (shows warning modal)
7. **AC-007**: Filtering by portfolio/stage/status updates Gantt chart data
8. **AC-008**: URL params preserve filter state on page refresh
9. **AC-009**: Auto-populate creates 40 milestones for ventures with no milestone data
10. **AC-010**: Mobile view (<768px) collapses to scrollable list (no broken Gantt)
11. **AC-011**: RLS policies enforce portfolio-level access (users cannot edit unauthorized ventures)

### P1 (Important) - 2 criteria
12. **AC-012**: Gantt chart keyboard navigable (Tab to milestones, Arrow keys to move)
13. **AC-014**: React Query caches milestone data (5min stale time, instant on navigation back)

### P2 (Nice to Have) - 2 criteria
14. **AC-013**: Export to PDF generates clean timeline report with filters in header
15. **AC-015**: User testing confirms 60% reduction in manual reporting time

## User Stories

### US-001: Portfolio Manager - Gantt Visualization
**As a** Portfolio Manager
**I want** to see a Gantt chart of all ventures in my portfolio
**So that** I can visualize progress across multiple ventures at a glance
**Story Points**: 5

### US-002: Executive - Stuck Ventures
**As an** Executive
**I want** to see which ventures are stuck (>14 days dwell time)
**So that** I can prioritize interventions and unblock teams
**Story Points**: 3

### US-003: Venture Analyst - Critical Path
**As a** Venture Analyst
**I want** to identify the critical path across venture stages
**So that** I understand which dependencies are blocking fastest completion
**Story Points**: 5

### US-004: Portfolio Manager - Drag Editing
**As a** Portfolio Manager
**I want** to drag milestone bars to adjust dates
**So that** I can update timelines without manual form entry
**Story Points**: 8

### US-005: Executive - Filtering
**As an** Executive
**I want** to filter the timeline by portfolio/stage/status
**So that** I can focus on specific subsets of ventures
**Story Points**: 3

### US-006: Mobile User - Responsive
**As a** Mobile User
**I want** the timeline to work on my phone
**So that** I can check venture status while traveling
**Story Points**: 5

## Technical Specifications

### Architecture
- **Component Path**: /mnt/c/_EHG/EHG/src/components/ventures/VentureTimelineView.tsx
- **Parent Component**: /mnt/c/_EHG/EHG/src/pages/VenturesPage.tsx
- **Integration Point**: Tabs component (4th tab after Grid/Kanban/Table)

### Database Schema
**New Table**: venture_milestones

\`\`\`sql
CREATE TABLE venture_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 40),
  milestone_name TEXT NOT NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  dependencies INTEGER[], -- Array of prerequisite stage_numbers
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, stage_number)
);

CREATE INDEX idx_venture_milestones_venture_id ON venture_milestones(venture_id);
CREATE INDEX idx_venture_milestones_status ON venture_milestones(status);
\`\`\`

**RLS Policies**:
- SELECT: Users can view milestones for ventures in their portfolios only
- INSERT/UPDATE: Users can modify milestones for ventures they manage
- DELETE: Admins only

### Libraries
- **Gantt**: gantt-task-react (already installed)
- **State Management**: React Query (5min stale time for milestone data)
- **URL Params**: react-router-dom useSearchParams hook

### API Endpoints
- GET /api/ventures/:id/milestones - Fetch milestones for venture
- POST /api/ventures/:id/milestones - Create milestone
- PATCH /api/ventures/:id/milestones/:milestone_id - Update milestone dates
- POST /api/ventures/:id/milestones/auto-populate - Auto-generate 40 milestones

### Critical Path Algorithm
Topological sort (Kahn's algorithm) on dependency graph, client-side calculation

## Design Specifications

### Wireframes Needed
1. Desktop Timeline view (Gantt chart)
2. Mobile Timeline view (List format)
3. Filter panel layout
4. Milestone drag interaction
5. Dependency validation modal
6. Loading skeleton for Gantt

### Color Scheme
- Completed milestone: #22c55e (green-500)
- Current milestone: #3b82f6 (blue-500)
- Future milestone: #9ca3af (gray-400)
- Stuck venture alert: #ef4444 (red-500)
- Critical path: #f97316 (orange-500)
- Dependency arrow: #6b7280 (gray-500)

### Responsive Breakpoints
- Mobile: <768px - Collapse to list
- Tablet: 768-1024px - Horizontal scroll Gantt
- Desktop: ≥1024px - Full Gantt display

## Testing Strategy

### Unit Tests
- Critical path algorithm (topological sort)
- Auto-populate milestone logic
- Dependency validation rules
- Date range calculations

### Integration Tests
- RLS policy enforcement
- Milestone CRUD operations
- React Query cache behavior

### E2E Tests
- Full timeline workflow (load → filter → drag → save)
- Mobile responsive behavior
- URL param persistence

### Performance Tests
- Lighthouse score ≥90 on /ventures/timeline
- Load time <3s with 50 ventures (average of 5 runs)

### Accessibility Tests
- Keyboard navigation (axe-core)
- Screen reader compatibility (NVDA/JAWS)
- Color contrast validation (WCAG 2.1 AA)

## Risks and Mitigations

### Risk 1: Gantt Library Limitations
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**: Review StrategicInitiativeTracking.tsx usage first, identify limitations early, budget 2h for CSS overrides if needed

### Risk 2: Complex Dependency Graphs
- **Probability**: Medium
- **Impact**: High
- **Mitigation**: Start with linear dependencies (Stage N requires N-1), iterate to complex parallel/optional stages in v1.1

### Risk 3: Performance with Large Portfolios
- **Probability**: Low
- **Impact**: High
- **Mitigation**: Pagination limits to 50 ventures/page, implement virtualization if >3s load detected in testing

### Risk 4: Date Validation Edge Cases
- **Probability**: High
- **Impact**: Medium
- **Mitigation**: Comprehensive unit tests for validation logic, user-friendly error modals instead of silent failures

## Success Metrics

### Primary Metric
- **Metric**: Manual reporting time reduction
- **Target**: 60% reduction
- **Measurement**: Before/after study with 3 executive users over 2 weeks

### Secondary Metrics
1. **Timeline adoption rate**: 80% of active users view timeline at least once/week
2. **Milestone date adjustments**: 30+ milestone edits per week
3. **Dwell time alert response**: Average 2 days from alert to intervention

## Implementation Plan

### Phase 1: Database & Core (8 hours)
- Database migration (venture_milestones table + RLS)
- Basic Gantt chart rendering
- Milestone data fetching

### Phase 2: Interactions (8 hours)
- Drag-to-adjust functionality
- Dependency validation
- Auto-populate logic

### Phase 3: Advanced Features (6 hours)
- Critical path analysis
- Dwell time alerts
- Mobile responsive design

### Phase 4: Polish & Testing (6 hours)
- Performance optimization
- Accessibility improvements
- E2E testing

**Total Estimated Hours**: 28`,

    metadata: {
      sd_key: 'SD-047A',
      functional_requirements_count: 10,
      acceptance_criteria_count: 15,
      user_stories_count: 6,
      estimated_hours: 28,
      design_subagent_required: true,
      database_migration_required: true,
      implementation_phases: 4
    }
  };

  // Insert PRD into database
  const { data: _data, error } = await supabase
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
  console.log('   Target URL: http://localhost:5173/ventures');
  console.log('   Component: VentureTimelineView');
  console.log('\n✅ Ready to trigger Design Sub-Agent review\n');
}

createPRD();
