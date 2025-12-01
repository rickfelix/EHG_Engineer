#!/usr/bin/env node

/**
 * Fix BMAD Validation for SD-BLUEPRINT-ENGINE-001
 *
 * Issues:
 * 1. User story context engineering: 60% have context >50 chars (need ≥80%)
 * 2. Checkpoint plan: Must be on strategic_directives_v2.checkpoint_plan, not PRD metadata
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Detailed implementation contexts (all >50 chars)
const storyContexts = {
  'BLUEPRINT-ENGINE-001:US-001': `
## Implementation Context (US-001: Browse AI Opportunity Blueprints)

### Existing Code to Reuse
- Grid layout patterns from VenturesDashboard.tsx
- Card component structure from existing Stage components
- Pagination patterns from data tables

### CrewAI Integration Points
- Blueprint data populated by Board Directors Crew batch job
- Real-time updates via Supabase realtime subscriptions

### Technical Approach
1. Create BlueprintGrid component with responsive layout
2. Use React Query for data fetching with stale-while-revalidate
3. Implement virtual scrolling for large blueprint sets
4. Add loading skeletons for progressive enhancement

### Files to Create/Modify
- src/components/Stage1/BlueprintGrid.tsx (new)
- src/hooks/useBlueprints.ts (new)
- src/types/blueprints.ts (new)

### Testing Strategy
- Unit: Blueprint card rendering with various data states
- E2E: Browse flow from empty state to selection
`.trim(),

  'BLUEPRINT-ENGINE-001:US-002': `
## Implementation Context (US-002: Filter Blueprints by Category/Tags)

### Existing Code to Reuse
- Filter patterns from VenturesFilter.tsx component
- Tag chip components from Shadcn UI
- URL state sync patterns from existing search implementations

### Technical Approach
1. Create BlueprintFilters component with category dropdown
2. Implement multi-select tag filter with chip display
3. Add debounced search input for text filtering
4. Sync filter state with URL for shareable links

### CrewAI Integration
- Category taxonomy from stage_definitions table
- Tag autocomplete from blueprint metadata

### Files to Create/Modify
- src/components/Stage1/BlueprintFilters.tsx (new)
- src/hooks/useBlueprintFilters.ts (new)

### Testing Strategy
- Unit: Filter logic with various combinations
- E2E: Filter, verify results, share filtered URL
`.trim(),

  'BLUEPRINT-ENGINE-001:US-003': `
## Implementation Context (US-003: Capability Alignment Score Display)

### Existing Code to Reuse
- Score display patterns from venture health indicators
- Tooltip components from Shadcn UI
- Progress bar components for visual scoring

### CrewAI Integration Points
- Capability registry from ehg_capabilities table
- Alignment scoring via capability_alignment_agent
- Score breakdown from agent response metadata

### Technical Approach
1. Create CapabilityScoreDisplay component
2. Fetch capability registry on mount
3. Display score 0-100 with color-coded indicator
4. Show breakdown on hover/click tooltip
5. Cache scores per blueprint/venture pair (24h TTL)

### Files to Create/Modify
- src/components/Stage1/CapabilityScoreDisplay.tsx (new)
- src/services/capabilityAlignment.ts (new)

### Testing Strategy
- Unit: Score display at various values (0, 50, 100)
- E2E: View blueprint, verify score renders
`.trim(),

  'BLUEPRINT-ENGINE-001:US-004': `
## Implementation Context (US-004: Portfolio Synergy Score Display)

### Existing Code to Reuse
- Portfolio synergy analyzer from CrewAI (existing agent)
- Score visualization from capability display component
- Synergy indicators from venture dashboard

### CrewAI Integration Points
- portfolio_synergy_analyzer agent (reuse existing)
- Portfolio data from ventures table (active ventures)
- Synergy dimensions: market overlap, resource sharing, strategic fit

### Technical Approach
1. Create PortfolioSynergyDisplay component
2. Call portfolio_synergy_analyzer via API endpoint
3. Display overall synergy score with dimension breakdown
4. Show synergistic ventures list on expansion
5. Highlight potential conflicts

### Files to Create/Modify
- src/components/Stage1/PortfolioSynergyDisplay.tsx (new)
- src/services/portfolioSynergy.ts (new)
- pages/api/portfolio/synergy.ts (new API endpoint)

### Testing Strategy
- Unit: Synergy display with various portfolio sizes
- E2E: View blueprint synergy for existing portfolio
`.trim(),

  'BLUEPRINT-ENGINE-001:US-005': `
## Implementation Context (US-005: Preview Blueprint Scaffold)

### Existing Code to Reuse
- Modal/drawer patterns from Shadcn Dialog
- Collapsible sections from existing PRD viewer
- JSON tree viewer for structured data

### Technical Approach
1. Create BlueprintScaffoldPreview modal component
2. Render scaffold sections as collapsible tree
3. Show stage-by-stage breakdown (Stages 2-40 preview)
4. Highlight key decision points and milestones
5. Include estimated effort indicators

### Data Structure Preview
- scaffold.ideation_stages (2-10)
- scaffold.development_stages (11-20)
- scaffold.launch_stages (21-30)
- scaffold.scale_stages (31-40)

### Files to Create/Modify
- src/components/Stage1/BlueprintScaffoldPreview.tsx (new)
- src/components/Stage1/ScaffoldSectionTree.tsx (new)

### Testing Strategy
- Unit: Scaffold sections render correctly
- E2E: Open preview, navigate sections, close
`.trim(),

  'BLUEPRINT-ENGINE-001:US-006': `
## Implementation Context (US-006: Select Blueprint and Transition)

### Existing Code to Reuse
- Stage transition patterns from existing workflows
- Venture creation flow from current Stage 1
- sd_phase_handoffs insertion patterns

### Technical Approach
1. Add "Select Blueprint" button to blueprint card
2. Confirm selection with brief modal
3. Create venture record with blueprint_id reference
4. Insert sd_phase_handoffs record (Stage1→Stage2)
5. Redirect to Stage 2 with pre-populated context

### Database Operations
- INSERT into ventures (with opportunity_blueprint_id FK)
- INSERT into sd_phase_handoffs (STAGE1→STAGE2 type)
- UPDATE opportunity_blueprints.selection_count++

### Files to Create/Modify
- src/components/Stage1/BlueprintSelectButton.tsx (new)
- src/services/blueprintSelection.ts (new)
- pages/api/ventures/create-from-blueprint.ts (new)

### Testing Strategy
- Unit: Selection flow state management
- E2E: Select blueprint → verify venture created → land on Stage 2
`.trim(),

  'BLUEPRINT-ENGINE-001:US-007': `
## Implementation Context (US-007: View Signal Capture Preview)

### Existing Code to Reuse
- Signal visualization from signal_capture_patterns table
- Tooltip/popover from Shadcn components
- Icon set from existing stage components

### Technical Approach
1. Create SignalCapturePreview component
2. Fetch signals from signal_capture_patterns for blueprint
3. Display as condensed list with icons
4. Show full signal details on hover
5. Indicate which signals are required vs optional

### Data Sources
- signal_capture_patterns table (stage_id = 1)
- Blueprint-specific signals from blueprint.metadata.signals

### Files to Create/Modify
- src/components/Stage1/SignalCapturePreview.tsx (new)
- src/hooks/useSignalPatterns.ts (new)

### Testing Strategy
- Unit: Signal list renders with various counts
- E2E: View signals, verify tooltip displays
`.trim(),

  'BLUEPRINT-ENGINE-001:US-008': `
## Implementation Context (US-008: Selection/Rejection Learning Signals)

### Existing Code to Reuse
- Analytics event patterns from existing tracking
- Supabase real-time for signal streaming
- Signal capture API from stage transitions

### Technical Approach
1. Create SelectionSignalCapture service
2. On selection: log blueprint_id, venture_id, scores, timestamp
3. On rejection: log blueprint_id, reason (optional), alternative
4. Batch signals to analytics table
5. Weekly aggregation job for pattern learning

### Database Schema (new table)
- blueprint_selection_signals table
  - id, blueprint_id, venture_id, event_type
  - capability_score, synergy_score
  - rejection_reason (nullable)
  - created_at

### Files to Create/Modify
- src/services/selectionSignals.ts (new)
- database/migrations/XXXX_blueprint_selection_signals.sql (new)
- pages/api/analytics/blueprint-signals.ts (new)

### Testing Strategy
- Unit: Signal capture and batching logic
- E2E: Select and reject blueprints, verify signals logged
`.trim(),

  'BLUEPRINT-ENGINE-001:US-009': `
## Implementation Context (US-009: Integrate portfolio_synergy_analyzer)

### Existing CrewAI Infrastructure
- portfolio_synergy_analyzer agent exists at:
  /mnt/c/_EHG/ehg/agent-platform/app/tools/portfolio_database_tool.py
- Board Directors Crew orchestrates portfolio analysis
- Existing API patterns in crews.py

### Technical Approach
1. Create wrapper service for portfolio_synergy_analyzer
2. Add API endpoint: /api/blueprints/portfolio-alignment
3. Cache results in Redis (24h TTL)
4. Return structured synergy assessment

### Integration Points
- Input: blueprint_id, current_portfolio (venture IDs)
- Output: synergy_score, dimension_breakdown, recommendations
- Trigger: On blueprint card hover OR on-demand button

### Files to Create/Modify
- src/services/portfolioAnalyzer.ts (new wrapper)
- pages/api/blueprints/portfolio-alignment.ts (new)
- Integration tests with CrewAI mock

### Testing Strategy
- Unit: Service wrapper with mocked CrewAI response
- Integration: Full flow with test portfolio data
`.trim(),

  'BLUEPRINT-ENGINE-001:US-010': `
## Implementation Context (US-010: Create Blueprint Assessment Crew)

### Existing CrewAI Infrastructure
- Base crew patterns: /mnt/c/_EHG/ehg/agent-platform/app/crews/
- Portfolio synergy analyzer agent (reuse for alignment)
- Research agents for capability context
- 44+ existing agents available for composition

### New Crew Architecture
Location: /mnt/c/_EHG/ehg/agent-platform/app/crews/blueprint_assessment_crew.py

Agents:
1. CapabilityAlignmentAgent - Score vs EHG capability registry
2. PortfolioSynergyAgent - Score vs existing portfolio (reuse existing)
3. MarketTrendAgent - Optional external signal enrichment
4. RiskAssessmentAgent - Identify key risks for blueprint

Crew Flow:
1. Receive blueprint_id + venture_context
2. Run agents in parallel (where possible)
3. Aggregate scores with configurable weights
4. Return BlueprintAssessmentResult

### Files to Create
- agent-platform/app/crews/blueprint_assessment_crew.py (new)
- agent-platform/app/agents/capability_alignment_agent.py (new)
- agent-platform/app/agents/risk_assessment_agent.py (new)
- agent-platform/tests/crews/test_blueprint_assessment.py (new)

### Integration Points
- API endpoint: /api/blueprints/assess
- Caching: 24h TTL per blueprint/venture pair
- Async: Queue-based for batch assessment

### Testing Strategy
- Unit: Each agent with test fixtures
- Integration: Full crew execution with real database
- E2E: UI triggers assessment, displays results
`.trim()
};

// Checkpoint plan for SD
const checkpointPlan = {
  total_checkpoints: 4,
  total_user_stories: 10,
  total_story_points: 63,
  checkpoints: [
    {
      id: 'CP-1',
      name: 'Foundation Complete',
      description: 'Core blueprint display and browse functionality',
      target_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-001', 'BLUEPRINT-ENGINE-001:US-002'],
      story_points: 8,
      acceptance_criteria: [
        'Blueprint grid renders with real data from opportunity_blueprints table',
        'Category/tag filtering works with URL state sync',
        'Mobile responsive layout confirmed'
      ]
    },
    {
      id: 'CP-2',
      name: 'Scoring Engine Live',
      description: 'Capability and portfolio alignment scoring visible in UI',
      target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-003', 'BLUEPRINT-ENGINE-001:US-004'],
      story_points: 16
    },
    {
      id: 'CP-3',
      name: 'User Interaction Complete',
      description: 'Preview, selection, and transition to Stage 2 working',
      target_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-005', 'BLUEPRINT-ENGINE-001:US-006', 'BLUEPRINT-ENGINE-001:US-007'],
      story_points: 13
    },
    {
      id: 'CP-4',
      name: 'Learning Signals & Crew Integration',
      description: 'Full CrewAI integration with learning loop',
      target_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-008', 'BLUEPRINT-ENGINE-001:US-009', 'BLUEPRINT-ENGINE-001:US-010'],
      story_points: 26
    }
  ]
};

async function fixBMADValidation() {
  console.log('\n🔧 Fixing BMAD Validation Issues for SD-BLUEPRINT-ENGINE-001');
  console.log('='.repeat(70));

  // =========================================================
  // 1. FIX USER STORY CONTEXT ENGINEERING
  // =========================================================
  console.log('\n📝 Step 1: Updating User Story Implementation Contexts');
  console.log('-'.repeat(50));

  let updatedStories = 0;
  for (const [storyKey, context] of Object.entries(storyContexts)) {
    const { error } = await supabase
      .from('user_stories')
      .update({
        implementation_context: context,
        updated_at: new Date().toISOString()
      })
      .eq('story_key', storyKey)
      .eq('sd_id', 'SD-BLUEPRINT-ENGINE-001');

    if (error) {
      console.error(`   ❌ Failed to update ${storyKey}:`, error.message);
    } else {
      console.log(`   ✅ ${storyKey}: ${context.length} chars`);
      updatedStories++;
    }
  }

  console.log(`\n   Updated ${updatedStories}/10 stories`);

  // Verify
  const { data: stories } = await supabase
    .from('user_stories')
    .select('story_key, implementation_context')
    .eq('sd_id', 'SD-BLUEPRINT-ENGINE-001');

  const withContext = stories.filter(s => s.implementation_context && s.implementation_context.length > 50).length;
  const coverage = Math.round(withContext / stories.length * 100);
  console.log(`   📊 New coverage: ${withContext}/${stories.length} = ${coverage}%`);

  // =========================================================
  // 2. FIX CHECKPOINT PLAN ON SD TABLE
  // =========================================================
  console.log('\n📍 Step 2: Adding Checkpoint Plan to SD');
  console.log('-'.repeat(50));

  const { error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update({
      checkpoint_plan: checkpointPlan,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-BLUEPRINT-ENGINE-001');

  if (sdError) {
    console.error('   ❌ Failed to update SD:', sdError.message);
  } else {
    console.log('   ✅ Checkpoint plan added to strategic_directives_v2');
    console.log(`   📊 Checkpoints: ${checkpointPlan.total_checkpoints}`);
    console.log(`   📊 Total stories: ${checkpointPlan.total_user_stories}`);
    console.log(`   📊 Total points: ${checkpointPlan.total_story_points}`);
  }

  // =========================================================
  // 3. VERIFY FIXES
  // =========================================================
  console.log('\n✅ BMAD Validation Fix Summary');
  console.log('='.repeat(70));
  console.log(`   User Story Context: ${coverage}% (need ≥80%)`);
  console.log(`   Checkpoint Plan: ${sdError ? '❌ Failed' : '✅ Added'}`);

  if (coverage >= 80 && !sdError) {
    console.log('\n🎉 All BMAD validation issues fixed!');
    console.log('   Run handoff: node scripts/unified-handoff-system.js execute PLAN-TO-EXEC SD-BLUEPRINT-ENGINE-001 PRD-SD-BLUEPRINT-ENGINE-001');
  } else {
    console.log('\n⚠️  Some issues remain. Manual intervention may be required.');
  }
}

fixBMADValidation().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
