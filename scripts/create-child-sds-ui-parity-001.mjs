#!/usr/bin/env node

/**
 * Create Child SDs for SD-UI-PARITY-001
 *
 * Per LEO Protocol PLAN phase guidance:
 * - Large SDs (150+ hours) should be broken into child SDs for phased delivery
 * - Each phase gets its own SD for independent tracking
 * - Parent SD references all children
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Child SD definitions based on IDEATION_UI_UX_ASSESSMENT_REPORT.md
const childSDs = [
  {
    id: 'SD-UI-PARITY-001A',
    title: 'UI Parity Phase 1: Foundation Components',
    description: `Implement 6 foundation components shared across all IDEATION stages.

**Components**:
- ScoreBar: Horizontal bar with threshold markers
- DecisionBadge: GO/NO_GO/REVISE with color coding
- ConfidenceRing: Circular confidence indicator
- AlertList: Red flags and warnings display
- FindingsList: Key findings in structured format
- StageOutputCard: Consistent stage output container

**Estimated Effort**: ~31 hours
**User Stories**: US-001 through US-006`,
    priority: 'critical',
    story_points: 19,
    user_stories: ['US-001', 'US-002', 'US-003', 'US-004', 'US-005', 'US-006']
  },
  {
    id: 'SD-UI-PARITY-001B',
    title: 'UI Parity Phase 2: Critical Stage Components',
    description: `Implement 6 critical components for stage output visibility.

**Components**:
- GateDecisionBanner: Prominent gate decision display
- FinalRecommendation: Recommendation text with context
- BlockerChecklist: Blockers with status indicators
- PerspectivePanel: Multi-perspective analysis results
- RiskRankingList: Risks ordered by severity
- StageOutputViewer: Master router component

**Estimated Effort**: ~38 hours
**User Stories**: US-007 through US-012
**Dependencies**: SD-UI-PARITY-001A (Foundation)`,
    priority: 'critical',
    story_points: 25,
    user_stories: ['US-007', 'US-008', 'US-009', 'US-010', 'US-011', 'US-012'],
    dependencies: ['SD-UI-PARITY-001A']
  },
  {
    id: 'SD-UI-PARITY-001C',
    title: 'UI Parity Phase 3: Stage-Specific Viewers',
    description: `Implement 8 stage-specific viewer enhancements for Stages 1-6.

**Components**:
- Stage 1: Venture Concept Viewer
- Stage 2: Opportunity Analysis Viewer
- Stage 3: Technical Feasibility Viewer
- Stage 4: Business Model Viewer
- Stage 5: Risk Assessment Viewer
- Stage 6: Decision Gate Viewer
- Cross-Stage Score Comparison
- Stage Navigation Sidebar

**Estimated Effort**: ~49 hours
**User Stories**: US-013 through US-020
**Dependencies**: SD-UI-PARITY-001A, SD-UI-PARITY-001B`,
    priority: 'high',
    story_points: 38,
    user_stories: ['US-013', 'US-014', 'US-015', 'US-016', 'US-017', 'US-018', 'US-019', 'US-020'],
    dependencies: ['SD-UI-PARITY-001A', 'SD-UI-PARITY-001B']
  },
  {
    id: 'SD-UI-PARITY-001D',
    title: 'UI Parity Phase 4: Polish and Integration',
    description: `Complete remaining P2 components and ensure cross-stage consistency.

**Components**:
- Evidence Reference Links
- Export Stage Output to PDF
- Responsive Layout
- Accessibility Audit and Fixes
- E2E Tests for All Stage Viewers

**Estimated Effort**: ~32 hours
**User Stories**: US-021 through US-025
**Dependencies**: SD-UI-PARITY-001A, SD-UI-PARITY-001B, SD-UI-PARITY-001C`,
    priority: 'medium',
    story_points: 26,
    user_stories: ['US-021', 'US-022', 'US-023', 'US-024', 'US-025'],
    dependencies: ['SD-UI-PARITY-001A', 'SD-UI-PARITY-001B', 'SD-UI-PARITY-001C']
  }
];

async function createChildSDs() {
  console.log('=== Creating Child SDs for SD-UI-PARITY-001 ===\n');

  // Get parent SD UUID
  const { data: parentSD, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, key_principles, strategic_objectives')
    .eq('id', 'SD-UI-PARITY-001')
    .single();

  if (parentError || !parentSD) {
    console.error('❌ Parent SD not found:', parentError?.message);
    process.exit(1);
  }

  console.log('Parent SD UUID:', parentSD.uuid_id);
  console.log('');

  for (const child of childSDs) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', child.id)
      .single();

    if (existing) {
      console.log(`⚠️  ${child.id} already exists, skipping`);
      continue;
    }

    const childData = {
      id: child.id,
      legacy_id: child.id,
      sd_key: child.id,
      title: child.title,
      description: child.description,
      status: 'draft',  // Will be activated when parent work begins
      category: 'technical',
      priority: child.priority,
      sd_type: 'feature',
      current_phase: 'PLAN',
      target_application: 'EHG',
      rationale: `Part of UI Parity backfill initiative. See parent SD-UI-PARITY-001.`,
      scope: child.description,
      key_principles: parentSD.key_principles,
      strategic_objectives: parentSD.strategic_objectives,
      success_criteria: JSON.stringify([
        `All ${child.user_stories.length} user stories completed`,
        'All components pass unit tests',
        'E2E tests verify component rendering',
        'Code review approved'
      ]),
      dependencies: JSON.stringify(child.dependencies || []),
      created_by: 'PLAN',
      is_active: true,
      progress: 0,
      metadata: JSON.stringify({
        parent_sd: 'SD-UI-PARITY-001',
        relationship_type: 'child_phase',
        phase_number: child.id.slice(-1),  // A, B, C, D
        story_points: child.story_points,
        user_stories: child.user_stories
      })
    };

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(childData)
      .select('id, title, priority')
      .single();

    if (error) {
      console.error(`❌ Error creating ${child.id}:`, error.message);
    } else {
      console.log(`✅ Created ${data.id}: ${data.title}`);
      console.log(`   Priority: ${data.priority}, Story Points: ${child.story_points}`);
    }
  }

  // Update parent SD to reference children
  console.log('\nUpdating parent SD with child references...');

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: JSON.stringify({
        created_from: 'SD-LEO-v4.3.3-UI-PARITY governance analysis',
        reference_document: '/mnt/c/_EHG/ehg/docs/IDEATION_UI_UX_ASSESSMENT_REPORT.md',
        governance_trigger: 'Stage 7 Hard Block',
        ui_coverage_target: '80%',
        component_count: 25,
        phase_count: 4,
        estimated_effort_hours: 150,
        child_sds: childSDs.map(c => c.id),
        phased_delivery: true
      })
    })
    .eq('id', 'SD-UI-PARITY-001');

  if (updateError) {
    console.error('⚠️  Warning: Could not update parent metadata:', updateError.message);
  } else {
    console.log('✅ Parent SD updated with child references');
  }

  console.log('\n=== Summary ===');
  console.log('Created', childSDs.length, 'child SDs for phased delivery:');
  childSDs.forEach(c => {
    console.log(`  ${c.id}: ${c.story_points} story points, ${c.user_stories.length} stories`);
  });
  console.log('\nTotal story points:', childSDs.reduce((sum, c) => sum + c.story_points, 0));
}

createChildSDs().catch(console.error);
