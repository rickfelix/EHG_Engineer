#!/usr/bin/env node

/**
 * Fix PRD Quality Score for SD-BLUEPRINT-ENGINE-001
 *
 * Missing fields:
 * - system_architecture (text)
 * - implementation_approach (text)
 * - risks (JSONB array)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const systemArchitecture = `
## System Architecture: Stage 1 Blueprint Engine

### Overview
The Blueprint Engine is a UI-driven module within the EHG venture workflow that replaces the deprecated "Browse AI Opportunities" option. It provides intelligent blueprint selection with capability and portfolio awareness.

### Component Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     Stage 1 UI Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ BlueprintGrid│  │BlueprintCard │  │ BlueprintFilters    │  │
│  │ (browse all) │──│ (single item)│──│ (category/tag/search)│  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│           │                │                   │                │
│  ┌────────┴────────────────┴───────────────────┴──────────┐    │
│  │                  BlueprintContext (Zustand)            │    │
│  │  - selectedBlueprint, filters, scores, loadingStates   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Layer (Next.js)                         │
│  /api/blueprints/list        - GET blueprints with filters      │
│  /api/blueprints/assess      - POST capability + portfolio score│
│  /api/blueprints/select      - POST create venture from blueprint│
│  /api/blueprints/signals     - POST selection/rejection signals │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CrewAI Integration                          │
│  ┌────────────────────────┐  ┌─────────────────────────────┐   │
│  │ Blueprint Assessment   │  │ Portfolio Synergy Analyzer  │   │
│  │ Crew (NEW)             │  │ (EXISTING - reuse)          │   │
│  │ - CapabilityAlignment  │  └─────────────────────────────┘   │
│  │ - RiskAssessment       │                                    │
│  └────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database Layer (Supabase)                   │
│  opportunity_blueprints     - Blueprint definitions + scaffolds │
│  ehg_capabilities           - Capability registry for alignment │
│  ventures                   - Venture creation on selection     │
│  blueprint_selection_signals - Learning data for optimization   │
│  sd_phase_handoffs          - Stage transitions (Stage1→Stage2) │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

### Data Flow

1. **Blueprint Loading**: On Stage 1 mount, fetch blueprints from opportunity_blueprints
2. **Score Computation**: On hover/expand, call Assessment Crew for capability + portfolio scores
3. **Selection Flow**: User selects → create venture → insert handoff → redirect to Stage 2
4. **Signal Capture**: All selections/rejections logged to blueprint_selection_signals

### Integration Points

| System | Integration Type | Purpose |
|--------|-----------------|---------|
| CrewAI Agent Platform | REST API | Capability/portfolio scoring |
| Supabase | Direct client | Data access, realtime |
| Stage 2 (AI Review) | sd_phase_handoffs | Venture context transfer |
| Analytics | Event capture | Learning signals |

### Performance Requirements

- Blueprint list load: <500ms
- Score computation: <2s (cached 24h)
- Selection transition: <1s
`.trim();

const implementationApproach = `
## Implementation Approach

### Phase 1: Foundation (CP-1, ~3 days)
**Goal**: Core blueprint display and browse functionality

1. **Database Setup**
   - Verify opportunity_blueprints table exists with required columns
   - Add blueprint_selection_signals table for learning
   - Seed 5-10 test blueprints with varied categories

2. **UI Components**
   - Create BlueprintGrid component (responsive grid layout)
   - Create BlueprintCard component (title, category, preview)
   - Create BlueprintFilters component (category dropdown, search)

3. **State Management**
   - Create useBlueprintStore (Zustand) for filter/selection state
   - Create useBlueprints hook (React Query) for data fetching
   - Implement URL state sync for shareable filtered views

### Phase 2: Scoring Engine (CP-2, ~4 days)
**Goal**: Capability and portfolio alignment scoring visible in UI

1. **CrewAI Integration**
   - Create API endpoint: /api/blueprints/portfolio-alignment
   - Wrap existing portfolio_synergy_analyzer agent
   - Implement response caching (24h TTL)

2. **Capability Scoring**
   - Create capability_alignment_agent.py (new)
   - Fetch EHG capability registry from ehg_capabilities
   - Compute alignment score based on blueprint requirements vs capabilities

3. **UI Integration**
   - Add CapabilityScoreDisplay component to BlueprintCard
   - Add PortfolioSynergyDisplay component with breakdown
   - Implement score tooltips with dimension details

### Phase 3: User Interaction (CP-3, ~3 days)
**Goal**: Preview, selection, and transition to Stage 2

1. **Preview Modal**
   - Create BlueprintScaffoldPreview modal component
   - Render stage-by-stage breakdown (expandable sections)
   - Show key decision points and milestones

2. **Selection Flow**
   - Create BlueprintSelectButton with confirmation dialog
   - Implement venture creation with blueprint_id FK
   - Insert sd_phase_handoffs record (STAGE1→STAGE2)

3. **Signal Capture**
   - Create SignalCapturePreview component
   - Display signals that will be captured at Stage 2

### Phase 4: Learning Loop (CP-4, ~4 days)
**Goal**: Full CrewAI integration with learning signals

1. **Selection Signals**
   - Create SelectionSignalCapture service
   - Log selection events with scores, context
   - Log rejection events with optional reason

2. **Blueprint Assessment Crew**
   - Create blueprint_assessment_crew.py (new crew)
   - Compose: CapabilityAlignment + PortfolioSynergy + Risk agents
   - Implement batch assessment for blueprint catalog

3. **Optimization Prep**
   - Weekly aggregation job for pattern learning
   - Dashboard metrics for blueprint performance

### Testing Strategy (Throughout)

- **Unit Tests**: Each component with jest/vitest
- **Integration Tests**: API endpoints with test fixtures
- **E2E Tests**: Full selection flow with Playwright
- **Visual Tests**: Screenshot comparison for UI

### Risk Mitigation

- CrewAI unavailable: Fallback to static scores
- Slow assessments: Queue with async notification
- Blueprint schema changes: Version scaffolds

### Definition of Done

✅ All 10 user stories completed
✅ 100% E2E test coverage for user stories
✅ Performance benchmarks met (<500ms load, <2s scores)
✅ UAT passed by Chairman
✅ Documentation updated
`.trim();

const risks = [
  {
    id: 'RISK-001',
    category: 'Technical',
    risk: 'CrewAI Agent Platform unavailable or slow response',
    severity: 'MEDIUM',
    probability: 'LOW',
    impact: 'Scoring features degraded, users cannot see alignment scores',
    mitigation: 'Implement fallback to cached/static scores; async queue for slow responses; health check monitoring'
  },
  {
    id: 'RISK-002',
    category: 'Technical',
    risk: 'opportunity_blueprints table schema mismatch',
    severity: 'HIGH',
    probability: 'LOW',
    impact: 'Blueprint data not accessible, Stage 1 broken',
    mitigation: 'Schema validation in CP-1; database agent review completed; migration script ready'
  },
  {
    id: 'RISK-003',
    category: 'Integration',
    risk: 'Stage 2 handoff format incompatible',
    severity: 'MEDIUM',
    probability: 'MEDIUM',
    impact: 'Venture context lost in transition, Stage 2 requires manual data entry',
    mitigation: 'Use existing sd_phase_handoffs patterns; validate handoff format with Stage 2 component'
  },
  {
    id: 'RISK-004',
    category: 'Performance',
    risk: 'Large blueprint catalog causes slow load times',
    severity: 'LOW',
    probability: 'LOW',
    impact: 'Poor UX for blueprint browsing, user abandonment',
    mitigation: 'Implement virtual scrolling; pagination; server-side filtering; 50-item page size'
  },
  {
    id: 'RISK-005',
    category: 'Data',
    risk: 'Insufficient test blueprints for validation',
    severity: 'LOW',
    probability: 'MEDIUM',
    impact: 'Unable to validate scoring algorithms, edge cases missed',
    mitigation: 'Seed 10+ diverse blueprints in CP-1; include edge cases (empty fields, max values)'
  },
  {
    id: 'RISK-006',
    category: 'Security',
    risk: 'Unauthorized access to blueprint assessment API',
    severity: 'MEDIUM',
    probability: 'LOW',
    impact: 'Competitor intelligence gathering, rate limit abuse',
    mitigation: 'Supabase auth required; rate limiting; RLS on blueprint_selection_signals'
  }
];

async function fixPRDQuality() {
  console.log('\n🔧 Fixing PRD Quality for SD-BLUEPRINT-ENGINE-001');
  console.log('='.repeat(70));

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
      system_architecture: systemArchitecture,
      implementation_approach: implementationApproach,
      risks: risks,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001');

  if (error) {
    console.error('❌ Failed to update PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD updated successfully');
  console.log(`   system_architecture: ${systemArchitecture.length} chars`);
  console.log(`   implementation_approach: ${implementationApproach.length} chars`);
  console.log(`   risks: ${risks.length} items`);

  // Verify
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('system_architecture, implementation_approach, risks')
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001')
    .single();

  console.log('\n📊 Verification:');
  console.log(`   system_architecture: ${prd.system_architecture ? '✅ Present' : '❌ Missing'}`);
  console.log(`   implementation_approach: ${prd.implementation_approach ? '✅ Present' : '❌ Missing'}`);
  console.log(`   risks: ${prd.risks?.length > 0 ? '✅ ' + prd.risks.length + ' items' : '❌ Empty'}`);

  console.log('\n🎉 PRD quality issues fixed! Retry handoff now.');
}

fixPRDQuality().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
