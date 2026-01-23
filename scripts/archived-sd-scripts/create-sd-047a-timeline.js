#!/usr/bin/env node

/**
 * Create SD-047A: Venture Timeline Tab
 * LEAD-approved strategic directive for timeline/Gantt visualization
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// import { randomUUID } from 'crypto'; // Unused - IDs are provided externally

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const newSD = {
  id: 'SD-047A',
  sd_key: 'SD-047A',
  category: 'UI/UX',
  title: 'Venture Timeline Tab: Gantt & Milestone Visualization',
  target_application: 'EHG',
  current_phase: 'IDEATION',
  description: `Add comprehensive timeline visualization to the ventures management interface, providing visual tracking of venture progress through the 40-stage lifecycle.

**Current State**: Ventures tracked via Grid, Kanban, and Table views. No visual timeline or Gantt chart for milestone tracking.

**Business Need**: Executive teams need to visualize venture progress, identify bottlenecks, track dependencies, and understand critical paths across multiple ventures simultaneously.`,

  scope: `**Must-Haves**:
- Gantt chart visualization using gantt-task-react library
- Milestone tracking across all 40 workflow stages
- Timeline view as 4th tab alongside Grid/Kanban/Table
- Filtering by portfolio, stage, status
- Dwell time alerts (ventures stuck >14 days highlighted)
- Drag-to-adjust milestone dates (with validation)
- Critical path analysis (identify stage dependencies)

**Nice-to-Haves**:
- Export timeline to PDF/image
- Multi-venture comparison view
- Milestone templates for common venture types
- Progress percentage overlays

**Out of Scope**:
- Document management (separate SD-047B)
- Venture creation/editing (exists elsewhere)
- Portfolio-level timeline (future enhancement)`,

  strategic_intent: 'Provide executive visibility into venture progress at a glance. Enable data-driven decisions about resource allocation by identifying which ventures are progressing vs. stuck. Reduce manual reporting overhead by 60% through automated milestone tracking.',

  rationale: `**Leverages Existing Infrastructure**:
- gantt-task-react library already installed (used in StrategicInitiativeTracking)
- EnhancedMilestoneView.tsx shows milestone grouping patterns (stages 1-10, 11-20, etc.)
- 40-stage venture lifecycle fully implemented (SD-2025-09-07)
- Metadata field in ventures table ready for custom milestone data

**Why Separate from Documents**: Timeline is time-series visualization (complex UI), Documents is file management (CRUD operations). Combining would create 65h monster SD violating Simplicity-First principle.`,

  strategic_objectives: JSON.stringify([
    'Visualize venture progress through 40-stage lifecycle via Gantt chart',
    'Enable milestone tracking with dependency visualization',
    'Identify bottlenecks and critical paths across portfolio',
    'Reduce manual progress reporting by 60%',
    'Support drag-and-drop milestone adjustment with validation'
  ]),

  success_criteria: JSON.stringify([
    'Timeline tab accessible from ventures page',
    'Gantt chart renders all ventures with milestones',
    'Critical path analysis highlights dependent stages',
    'Dwell time alerts visible for stuck ventures (>14 days)',
    'Drag-to-adjust milestone dates persists to database',
    'Filtering by portfolio/stage/status works correctly',
    'Page loads in <3s with 50 ventures',
    'Mobile-responsive timeline (collapse to list view)',
    'Export to PDF generates clean timeline report',
    'User testing shows 60% reduction in manual reporting'
  ]),

  status: 'draft',
  priority: 'high',

  metadata: {
    estimated_hours: 28,
    related_sds: ['SD-2025-09-11-ventures-list-consolidated (cancelled)', 'SD-047B (Documents Tab)'],
    technical_foundation: {
      library: 'gantt-task-react',
      existing_patterns: 'StrategicInitiativeTracking.tsx, EnhancedMilestoneView.tsx',
      database_needs: 'venture_milestones table, ventures.metadata updates'
    },
    database_migrations_required: true,
    design_subagent_required: true,
    requires_user_research: false
  }
};

async function createSD() {
  console.log('📋 Creating SD-047A: Venture Timeline Tab\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(newSD)
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-047A created successfully\n');
  console.log('📊 Details:');
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Priority:', data[0].priority);
  console.log('   Estimated Hours:', 28);
  console.log('   Strategic Objectives:', 5);
  console.log('   Success Criteria:', 10);
  console.log('\n✅ Ready for LEAD review and approval\n');
}

createSD();
