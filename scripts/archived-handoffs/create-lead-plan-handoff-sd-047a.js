#!/usr/bin/env node

/**
 * Create LEAD→PLAN Handoff for SD-047A
 * Venture Timeline Tab: Gantt & Milestone Visualization
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('📋 Creating LEAD→PLAN Handoff for SD-047A\\n');

  const handoffData = {
    executive_summary: `SD-047A: Venture Timeline Tab - LEAD Approval ✅

**Strategic Decision**: Build comprehensive timeline/Gantt visualization for venture milestones

**Business Value**:
- Immediate: Executive visibility into venture progress across 40-stage lifecycle
- Measurable: 60% reduction in manual progress reporting overhead
- Competitive: Visual timeline analytics not present in current venture tools

**Technical Foundation**:
- ✅ gantt-task-react library already installed and proven (StrategicInitiativeTracking.tsx)
- ✅ 40-stage venture lifecycle fully implemented (SD-2025-09-07)
- ✅ EnhancedMilestoneView.tsx provides milestone grouping patterns
- ✅ Venture metadata field ready for custom milestone data

**Strategic Intent**: Enable data-driven decisions by visualizing venture bottlenecks and critical paths. Reduce "Where are we?" meetings by providing self-service timeline view.`,

    deliverables_manifest: `## LEAD Decisions

### Decision 1: Approved Full Scope (No Deferrals)
**Scope**: Complete timeline visualization with Gantt chart, milestone tracking, dependencies
**Rationale**: User explicitly requested "I want to get both of them done" (Timeline + Documents)
**Risk Assessment**: Low - leveraging proven gantt-task-react library
**Estimated Hours**: 28 hours (includes database migration, UI, testing)

### Decision 2: Separate SD from Documents (SD-047B)
**Why Split**: Timeline is time-series visualization (complex UI), Documents is file CRUD
**Rationale**: Combining would create 65h monster SD violating Simplicity-First
**Benefit**: Focused, well-thought-out features with proper planning per user request

### Decision 3: Gantt Library Selection
**Selected**: gantt-task-react (already installed)
**Alternatives Rejected**:
  - framer-gantt (not in dependencies)
  - Custom D3 implementation (over-engineering)
**Rationale**: Don't reinvent the wheel, use proven library with examples in codebase

### Decision 4: Database Schema Approach
**Strategy**: New venture_milestones table + ventures.metadata updates
**Columns**: id, venture_id, stage_number, name, start_date, end_date, status, dependencies
**Migration Required**: Yes (PLAN agent to design full schema)

### Decision 5: Integration Point
**Location**: Add Timeline as 4th tab alongside Grid/Kanban/Table in VenturesPage
**Component**: VentureTimelineView.tsx (new component)
**State Management**: URL params for filters (consistent with existing views)

## Deliverables for PLAN Phase

1. **Comprehensive PRD** (Target: 10+ Acceptance Criteria)
   - FR-001: Gantt chart visualization
   - FR-002: Milestone tracking (40 stages)
   - FR-003: Dependency visualization
   - FR-004: Dwell time alerts (>14 days)
   - FR-005: Drag-to-adjust milestone dates
   - FR-006: Critical path analysis
   - FR-007: Filtering (portfolio/stage/status)
   - NFR-001: Performance (<3s load with 50 ventures)
   - NFR-002: Mobile-responsive (collapse to list)

2. **Database Migration Design**
   - venture_milestones table schema
   - RLS policies for portfolio-level access
   - Indexes for performance
   - Migration script with rollback

3. **Design Sub-Agent Review** (MANDATORY)
   - Gantt UI/UX patterns
   - Timeline component hierarchy
   - Mobile responsive strategy
   - Loading states and skeletons
   - Dwell time alert styling

4. **Technical Architecture**
   - Component structure: VentureTimelineView.tsx
   - Data fetching: useVenturesTimeline hook
   - State management: URL params + React Query
   - gantt-task-react integration patterns

5. **Test Scenarios**
   - TEST-001: Gantt renders 50 ventures in <3s
   - TEST-002: Drag-to-adjust persists to database
   - TEST-003: Critical path highlights dependencies correctly
   - TEST-004: Dwell time alerts visible for ventures stuck >14 days
   - TEST-005: Mobile view collapses to list format`,

    key_decisions: `**1. Library Over Custom Build**
   Decision: Use gantt-task-react library
   Trade-off: Less customization, but 15+ hours saved vs D3 custom implementation
   Result: Focus development time on business logic, not chart rendering

**2. Database Schema Design**
   Decision: Dedicated venture_milestones table (normalized)
   Alternative Considered: Store all in ventures.metadata (denormalized JSON)
   Rationale: Querying, indexing, and RLS easier with proper table structure

**3. Milestone Auto-Population Strategy**
   Decision: Generate default milestones from 40-stage lifecycle on first view
   Trigger: If venture has no milestones, auto-create from workflow stages
   User Action: Can customize dates/dependencies after auto-generation

**4. Performance Strategy**
   Decision: React Query with 5-min stale time + pagination (50 ventures/page)
   Alternative Considered: Virtualization for 100+ ventures
   Rationale: Gantt library handles rendering, focus on data fetch optimization

**5. Critical Path Algorithm**
   Decision: Client-side topological sort of dependencies
   Alternative Considered: Database stored procedure
   Rationale: Flexibility for UI updates, acceptable performance for <100 ventures

**6. Mobile Experience**
   Decision: Collapse Gantt to scrollable list view on <768px screens
   Alternative Considered: Horizontal scroll Gantt on mobile
   Rationale: Gantt charts fundamentally not mobile-friendly, list is usable`,

    known_issues: `## Risks & Constraints

### Risk 1: Gantt Library Limitations
**Issue**: gantt-task-react may not support all custom styling needs
**Probability**: Medium
**Mitigation**: Review StrategicInitiativeTracking.tsx usage, identify current limitations
**Fallback**: Fork library or add CSS overrides

### Risk 2: Milestone Data Model Complexity
**Issue**: 40 stages × dependencies could create complex graph structures
**Probability**: Medium (some stages have prerequisites, optionals, parallels)
**Mitigation**: Start with linear dependencies (Stage N requires N-1), iterate to complex
**Escalation**: If graph complexity exceeds 2 hours, simplify to stage ranges only

### Risk 3: Performance with Large Portfolios
**Issue**: Rendering 100+ ventures × 40 milestones = 4000 data points
**Probability**: Low (pagination limits to 50 ventures)
**Mitigation**: Implement virtualization if testing shows >3s load times
**Success Metric**: <3s load with 50 ventures

### Risk 4: Date Editing Validation
**Issue**: Dragging milestone dates could violate stage dependencies
**Probability**: High (user error likely)
**Mitigation**: Implement client-side validation before saving
**UX Pattern**: Show warning modal "Moving Stage 15 before Stage 14 violates dependencies. Continue?"

### Known Limitation: No Baseline Comparison
**Scope**: Version 1 shows current timeline only (no planned vs actual)
**Future**: SD-047A-v2 could add baseline tracking
**Rationale**: Keep initial implementation focused, validate usage first`,

    resource_utilization: `## Estimated Effort Breakdown

### PLAN Phase: 5 hours
- PRD creation: 2 hours (10+ acceptance criteria)
- Database migration design: 1.5 hours (schema + RLS policies)
- Design sub-agent review: 1 hour (Gantt UI/UX)
- PLAN→EXEC handoff: 0.5 hours

### EXEC Phase: 20 hours
- Database migration: 2 hours (venture_milestones table + policies)
- VentureTimelineView component: 6 hours (Gantt integration)
- Milestone data layer: 4 hours (fetch, transform, save)
- Auto-population logic: 2 hours (generate from 40 stages)
- Drag-to-adjust + validation: 3 hours
- Critical path algorithm: 2 hours
- Testing: 1 hour

### PLAN Verification: 2 hours
- Acceptance criteria testing (10 criteria)
- Performance validation (<3s load)
- Mobile responsive check

### LEAD Approval: 1 hour
- Retrospective generation
- Completion + lessons learned

**Total**: 28 hours (matches estimate) ✅`,

    action_items: `## PLAN Agent Tasks

### 1. Create Comprehensive PRD (2 hours)
**Must Include**:
- Functional Requirements (FR-001 to FR-007)
- Acceptance Criteria (AC-001 to AC-015, target 15 total)
- Non-Functional Requirements (performance, mobile, security)
- Technical Constraints (gantt-task-react, URL state)

**Key FRs**:
- FR-001: Gantt chart rendering with gantt-task-react
- FR-002: Milestone tracking for all 40 workflow stages
- FR-003: Dependency visualization (stage prerequisites)
- FR-004: Dwell time alerts (>14 days = red highlight)
- FR-005: Drag-to-adjust milestone dates with validation
- FR-006: Critical path analysis (highlight longest path)
- FR-007: Filtering by portfolio, stage, status (URL params)

### 2. Design Database Migration (1.5 hours)
**Schema**:
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

**RLS Policies**: Portfolio-level access (same as ventures table)

### 3. Trigger Design Sub-Agent (1 hour)
**Review Areas**:
- Gantt chart UI patterns (timeline bars, dependency arrows)
- Timeline component hierarchy (filters, chart, legend)
- Mobile responsive strategy (collapse to list view <768px)
- Loading states (skeleton for Gantt chart)
- Dwell time alert styling (red bars for stuck ventures)

**Design Deliverables**:
- Wireframes for VentureTimelineView
- Component breakdown
- Mobile mockups
- Color scheme for milestone statuses

### 4. Define Test Scenarios (30 min)
**Critical Paths**:
- TEST-001: Gantt renders 50 ventures with milestones in <3s
- TEST-002: Drag milestone date, verify save to database
- TEST-003: Critical path highlights correctly (longest dependency chain)
- TEST-004: Dwell time alert shows red for venture stuck 15+ days
- TEST-005: Mobile view collapses to scrollable list
- TEST-006: Filtering by portfolio updates Gantt data
- TEST-007: Auto-populate creates 40 milestones for new venture
- TEST-008: Dependency validation prevents invalid date changes
- TEST-009: URL params preserve filter state on refresh
- TEST-010: RLS policies enforce portfolio-level access

### 5. Create PLAN→EXEC Handoff (30 min)
**Include**:
- Component file paths (src/components/ventures/VentureTimelineView.tsx)
- Integration points (VenturesPage tabs)
- Database migration file path
- Performance benchmarks (3s load time)
- Design sub-agent outputs (wireframes, component hierarchy)`,

    metadata: {
      sd_key: 'SD-047A',
      sd_id: 'SD-047A',
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      handoff_type: 'strategic_to_technical',
      timestamp: new Date().toISOString(),
      protocol_version: 'v4.2.0_story_gates',

      lead_approval: {
        simplicity_first_applied: true,
        approved_date: new Date().toISOString(),
        risk_level: 'Low',
        complexity_assessment: 'Medium',
        rationale: 'Leverages proven gantt-task-react library, extends 40-stage lifecycle'
      },

      strategic_objectives_count: 5,
      success_criteria_count: 10,
      estimated_hours: 28,

      technical_foundation: {
        library: 'gantt-task-react',
        existing_code: ['StrategicInitiativeTracking.tsx', 'EnhancedMilestoneView.tsx'],
        database_needs: 'venture_milestones table',
        integration_point: 'VenturesPage (4th tab)'
      }
    }
  };

  // Try handoff_tracking table first
  const { data: checkTable, error: tableError } = await supabase
    .from('handoff_tracking')
    .select('id')
    .limit(1);

  const useHandoffTracking = !tableError;

  if (useHandoffTracking) {
    console.log('Using handoff_tracking table...');

    const { data, error } = await supabase
      .from('handoff_tracking')
      .insert({
        sd_id: 'SD-047A',
        from_agent: 'LEAD',
        to_agent: 'PLAN',
        handoff_type: 'strategic_to_technical',
        status: 'completed',
        ...handoffData
      })
      .select();

    if (error) {
      console.error('❌ handoff_tracking Error:', error.message);
      console.log('\\nℹ️  Falling back to SD metadata...');

      const { error: metaError } = await supabase
        .from('strategic_directives_v2')
        .update({
          metadata: {
            lead_plan_handoff: handoffData
          }
        })
        .eq('sd_key', 'SD-047A');

      if (metaError) {
        console.error('❌ SD metadata update failed:', metaError.message);
        throw metaError;
      }

      console.log('✅ Handoff stored in SD metadata (fallback)');
    } else {
      console.log('✅ Handoff created in handoff_tracking table');
    }
  } else {
    console.log('handoff_tracking table not available, using SD metadata...');

    const { error: metaError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          lead_plan_handoff: handoffData
        }
      })
      .eq('sd_key', 'SD-047A');

    if (metaError) {
      console.error('❌ SD metadata update failed:', metaError.message);
      throw metaError;
    }

    console.log('✅ Handoff stored in SD metadata');
  }

  console.log('\\n📊 Handoff Summary:');
  console.log('   Strategic Objectives: 5');
  console.log('   Success Criteria: 10');
  console.log('   Estimated Hours: 28');
  console.log('   Risk Level: Low');
  console.log('   Database Migration: Required');
  console.log('   Design Sub-Agent: Required');
  console.log('\\n✅ LEAD phase complete. Ready for PLAN PRD creation.\\n');
}

createHandoff();
