#!/usr/bin/env node

/**
 * Enhance Foundation V3 Strategic Directives
 *
 * Adds detailed context and vision document references to each SD.
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const VISION_DOCS = {
  constitution: 'docs/vision/00_VISION_V2_CHAIRMAN_OS.md',
  dbSchema: 'docs/vision/specs/01-database-schema.md',
  apiContracts: 'docs/vision/specs/02-api-contracts.md',
  uiComponents: 'docs/vision/specs/03-ui-components.md',
  evaOrchestration: 'docs/vision/specs/04-eva-orchestration.md',
  userStories: 'docs/vision/specs/05-user-stories.md',
  agentArchitecture: 'docs/vision/specs/06-hierarchical-agent-architecture.md',
  operationalHandoff: 'docs/vision/specs/07-operational-handoff.md',
  governancePolicy: 'docs/vision/specs/08-governance-policy-engine.md',
  agentRuntime: 'docs/vision/specs/09-agent-runtime-service.md',
  knowledgeArch: 'docs/vision/specs/10-knowledge-architecture.md',
  evaScaling: 'docs/vision/specs/11-eva-scaling.md',
  opsDebugging: 'docs/vision/specs/12-ops-debugging.md',
  goldenNuggets: 'docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md',
  designReview: 'docs/vision/SD-VISION-V2-006-DESIGN-REVIEW.md'
};

const SD_ENHANCEMENTS = {
  'SD-FOUNDATION-V3-000': {
    description: `Foundation V3: Vision V2 Stabilization & Completion

This parent SD orchestrates the post-Vision V2 stabilization work required before the Chairman's Operating System can reach full operational capability.

## Background

The Vision V2 initiative (SD-VISION-V2-000 through SD-VISION-V2-008) established the foundational architecture for the Chairman's Operating System, including:
- 25-stage venture lifecycle (replacing the legacy 52-stage model)
- Glass Cockpit UI design with EVA-first interaction
- Hierarchical agent architecture (Chairman → EVA → CEOs → VPs → Crews)
- Token ledger and budget enforcement system
- Decision gating with Four Buckets epistemic classification

## The "Split Brain" Problem

Three independent analyses (Claude Opus 4.5, OpenAI Codex, Google Anti-Gravity) identified critical issues:

1. **Schema/App Contract Drift**: Application code queries columns that don't match the canonical database schema (e.g., 'current_stage' vs 'current_lifecycle_stage')

2. **Legacy "Haunted House"**: Stage26-52 component files still exist in the codebase despite the 25-stage protocol being canonical

3. **Broken QA Infrastructure**: Integration tests fail with type errors ('docFindings.map is not a function')

4. **Incomplete EVA Execution**: The directive endpoint creates records but doesn't execute through the agent hierarchy

## Strategic Approach

This SD follows a 4-phase stabilization approach:
- Phase 1: Stop the bleeding (data integrity, legacy cleanup)
- Phase 2: Reactivate quality gates (QA resurrection, contract reconciliation)
- Phase 3: Enable core capability (EVA directives, crew mapping)
- Phase 4: Establish quality baseline (E2E tests, Four Buckets evidence)`,

    rationale: `Three independent AI analyses reached consensus that stabilization must precede any new feature development:

**Claude Opus 4.5 Analysis** identified:
- UUID/VARCHAR ID mismatch in strategic_directives_v2 causing join failures
- EVA directive execution as the highest-priority feature gap
- 30+ legacy chairman components needing consolidation

**OpenAI Codex Analysis** identified:
- STAGE_CREW_MAP only covers stages 1-6 (critical gap for 25-stage system)
- Permissive RLS policies ('USING(true)') creating security risk
- Four Buckets not wired to decision evidence (broken provenance chain)
- Specific column drift: 'current_lifecycle_stage' vs 'current_stage'

**Google Anti-Gravity Analysis** identified:
- Stage26-52 files still exist ("Haunted House")
- Integration test failure: 'docFindings.map is not a function'
- Governance UI correctly wired but data sources questionable

The "Split Brain" metaphor captures the core issue: Vision V2 built a powerful engine (specs) but it's disconnected from the drivetrain (app code). Adding features on top of mismatched contracts will make refactoring exponentially harder.`,

    scope: `## IN SCOPE

### Phase 1: Stabilization (Critical)
- Fix UUID/VARCHAR ID mismatch in strategic_directives_v2
- Delete Stage26-52 component files from src/components/stages/
- Remove legacy routes for non-existent stages
- Create contract matrix document

### Phase 2: Reactivation (High)
- Fix integration test runner type errors
- Document canonical column names
- Align API endpoints to database schema
- Fix evaStateMachines.ts field usage

### Phase 3: Capability (High)
- Implement EVA directive execution pipeline
- Extend STAGE_CREW_MAP for stages 7-25
- Wire task contract dispatch

### Phase 4: Quality (Medium)
- Create Playwright E2E tests for Chairman Dashboard
- Wire Four Buckets data to decision evidence
- Remove placeholder data from production

## OUT OF SCOPE
- New features beyond stabilization
- Blueprint generation pipeline (future SD)
- Multi-venture scaling (future SD)
- Agent runtime implementation (beyond directive routing)
- Database schema changes (prefer code alignment to schema)`,

    metadata: {
      is_parent: true,
      analysis_date: '2025-12-17',
      total_child_sds: 8,
      analysis_sources: ['Claude Opus 4.5', 'OpenAI Codex', 'Google Anti-Gravity'],
      estimated_duration: '4 weeks (4 phases)',
      vision_document_references: [
        VISION_DOCS.constitution,
        VISION_DOCS.dbSchema,
        VISION_DOCS.apiContracts,
        VISION_DOCS.evaOrchestration,
        VISION_DOCS.agentArchitecture,
        VISION_DOCS.goldenNuggets
      ],
      prerequisite_sds: [
        'SD-VISION-V2-000',
        'SD-VISION-V2-001',
        'SD-VISION-V2-002',
        'SD-VISION-V2-003',
        'SD-VISION-V2-004',
        'SD-VISION-V2-005',
        'SD-VISION-V2-006',
        'SD-VISION-V2-007',
        'SD-VISION-V2-008'
      ],
      codex_findings: {
        stage_crew_map_gap: 'Only stages 1-6 mapped in evaTaskContracts.ts',
        column_drift: 'current_lifecycle_stage (DB) vs current_stage (App)',
        rls_risk: 'Permissive USING(true) policies on Vision V2 tables',
        four_buckets_gap: 'venture_artifacts.epistemic_* not wired to decisions'
      },
      antigravity_findings: {
        legacy_files: 'Stage26-52 components in src/components/stages/',
        test_failure: 'docFindings.map is not a function',
        ui_status: 'Governance UI correctly wired to /api/governance/*'
      }
    }
  },

  'SD-FOUNDATION-V3-001': {
    description: `Data Integrity & Schema Remediation

This SD addresses critical data integrity issues in the Vision V2 database schema that could cause silent data corruption or join failures.

## Problem Statement

The strategic_directives_v2 table has a dual-ID architecture:
- \`id\` (VARCHAR): Human-readable identifier like 'SD-VISION-V2-001'
- \`uuid_id\` (UUID): System-generated unique identifier

This causes problems when:
1. PostgreSQL functions receive UUID but tables use VARCHAR for joins
2. Foreign key references are inconsistent across tables
3. PRD and user_stories tables reference VARCHAR id but functions pass UUID

## Technical Context

Per the Vision V2 Database Schema (01-database-schema.md):
- The schema defines ventures with 'current_lifecycle_stage' column
- App code (APIs, hooks) often queries 'current_stage' instead
- chairman_decisions table has different shape than API expects

## Implementation Approach

1. Audit all strategic_directives_v2 references
2. Create contract matrix documenting canonical column names
3. Verify referential integrity across related tables
4. Add smoke tests for critical data access patterns`,

    rationale: `Both Claude Opus 4.5 and OpenAI Codex identified ID format mismatch as a critical issue:

- Claude: "UUID/VARCHAR dual-ID issue could cause data corruption if not fixed before more records are created"
- Codex: "Functions receive UUID but must convert to VARCHAR for table lookups"

The Vision V2 Database Schema spec (01-database-schema.md) established canonical column names, but the application code drifted from these standards during implementation. This SD creates the authoritative contract matrix and verifies data integrity.`,

    metadata: {
      phase: 1,
      phase_name: 'Stabilization',
      source: 'Claude Opus 4.5 + OpenAI Codex',
      estimated_effort: '1-2 days',
      vision_document_references: [
        VISION_DOCS.dbSchema,
        VISION_DOCS.apiContracts
      ],
      affected_tables: [
        'strategic_directives_v2',
        'product_requirements_v2',
        'user_stories',
        'sd_phase_handoffs',
        'retrospectives'
      ],
      key_files_to_audit: [
        'scripts/lib/supabase-connection.js',
        'database/migrations/20251217_fix_prd_query_sd_id*.sql'
      ]
    }
  },

  'SD-FOUNDATION-V3-002': {
    description: `Legacy Protocol Cleanup ("The Exorcism")

This SD removes all vestiges of the legacy 52-stage venture lifecycle model, enforcing the canonical 25-stage protocol established by Vision V2.

## Problem Statement

The Vision V2 Constitution (00_VISION_V2_CHAIRMAN_OS.md) defines a 25-stage lifecycle organized into 6 phases:
1. INCEPTION (Stage 0 - safety valve)
2. THE_TRUTH (Stages 1-4)
3. THE_ENGINE (Stages 5-9)
4. THE_IDENTITY (Stages 10-13)
5. THE_BLUEPRINT (Stages 14-18)
6. THE_BUILD_LOOP (Stages 19-23)
7. LAUNCH_LEARN (Stages 24-25)

However, the codebase still contains Stage26 through Stage52 component files from the pre-Vision V2 architecture. These "zombie" files create confusion and risk:
- AI agents might accidentally import legacy components
- Developers may not know which model is canonical
- Routes may exist for non-existent stages

## Files to Delete

Location: ../ehg/src/components/stages/
- Stage26OperationalExcellence.tsx
- Stage40VentureActive.tsx
- Stage52DataManagementKB.tsx
- (and all other Stage26-52 files)

## Verification

After deletion:
1. Grep check: No imports of Stage26-52 components
2. Build check: Application compiles successfully
3. Route check: No /stage/26-52 routes exist`,

    rationale: `Google Anti-Gravity's analysis identified this as a "Haunted House" problem:

"The existence of Stage26+ components poses a significant risk of 'zombie' logic resurfacing. Agents or developers may accidentally import legacy logic, polluting the verified 25-stage workflow."

The Vision V2 Constitution explicitly states:
- 25 stages organized in 6 phases
- Stage 0 (Inception) as pre-lifecycle safety valve
- No reference to stages beyond 25

This SD enforces the constitutional model by physically removing legacy artifacts.`,

    metadata: {
      phase: 1,
      phase_name: 'Stabilization',
      source: 'Google Anti-Gravity',
      codename: 'The Exorcism',
      estimated_effort: 'Quick win (1-2 hours)',
      vision_document_references: [
        VISION_DOCS.constitution,
        VISION_DOCS.userStories
      ],
      files_to_delete_pattern: 'src/components/stages/Stage{26..52}*.tsx',
      verification_steps: [
        'grep -r "Stage26" src/',
        'grep -r "Stage52" src/',
        'npm run build'
      ]
    }
  },

  'SD-FOUNDATION-V3-003': {
    description: `QA System Resurrection

This SD fixes the broken integration test infrastructure, restoring the automated quality verification capability ("Russian Judge").

## Problem Statement

The integration test runner is failing with type errors:
- \`docFindings.map is not a function\`
- \`testFindings.map is not a function\`
- \`apiFindings.map is not a function\`
- \`hub.getAllFindings is not a function\`

These errors are documented in: docs/integration-test-results.json

Without working integration tests, we cannot:
1. Verify schema/app alignment
2. Catch regressions before deployment
3. Enable CI/CD quality gates
4. Trust that changes don't break existing functionality

## Root Cause Analysis

The test runner expects arrays but receives non-array values:
- Findings objects may be null or undefined
- Hub API may have changed signature
- Type normalization is missing

## Implementation Approach

1. Add defensive type checking for findings
2. Normalize findings to arrays before .map()
3. Fix hub.getAllFindings API signature
4. Add regression tests for schema/app alignment
5. Document test coverage baseline`,

    rationale: `Google Anti-Gravity verified the test failure in the codebase:

"Your repo already records the exact failure: ./docs/integration-test-results.json shows:
- docFindings.map is not a function
- hub.getAllFindings is not a function"

The Vision V2 initiative established comprehensive specs, but without working tests, we cannot verify that implementations match specifications. This SD restores the quality verification capability before any further development.`,

    metadata: {
      phase: 2,
      phase_name: 'Reactivation',
      source: 'Google Anti-Gravity',
      codename: 'Russian Judge Resurrection',
      estimated_effort: '1 day',
      vision_document_references: [
        VISION_DOCS.opsDebugging
      ],
      error_documentation: 'docs/integration-test-results.json',
      test_command: 'npm run test:integration',
      key_files: [
        'scripts/run-integration-tests.js',
        'tests/integration/**/*.test.ts'
      ]
    }
  },

  'SD-FOUNDATION-V3-004': {
    description: `Contract Reconciliation (DB ↔ App)

This SD aligns all application code with the canonical database schema defined in the Vision V2 specifications.

## Problem Statement

The Vision V2 Database Schema (01-database-schema.md) defines canonical column names, but application code has drifted:

| Canonical (DB) | Actual (App) | Location |
|----------------|--------------|----------|
| current_lifecycle_stage | current_stage | API endpoints, hooks |
| lifecycle_stage | stage_id | venture_stage_work queries |
| chairman_decisions shape | Different structure | EVA state machines |

## Technical Context

Per Vision V2 API Contracts (02-api-contracts.md):
- Endpoints should use consistent field names
- Request/response shapes should match Zod schemas
- State machines should use canonical DB columns

## Key Files to Reconcile

1. \`ehg/src/pages/api/v2/chairman/*.ts\` - API endpoints
2. \`ehg/src/services/evaStateMachines.ts\` - State transitions
3. \`ehg/src/hooks/useChairmanDashboardData.ts\` - Data fetching
4. \`ehg/src/types/vision-v2.ts\` - Type definitions

## Deliverables

1. Contract matrix document (canonical source of truth)
2. Updated API endpoints using correct column names
3. Fixed state machine field references
4. Smoke tests verifying correct data flow`,

    rationale: `OpenAI Codex provided detailed analysis of the contract drift:

"The Application Code (src/pages/api/v2/*) is querying column names and tables that do not match the Canonical Database Schema (migrations/*). The UI works via 'happy accidents' or unchecked queries, but writing data risks corruption or silent failures."

Key mismatches identified:
- current_stage (App) vs current_lifecycle_stage (DB)
- chairman_decisions shape differences
- venture_stage_work.lifecycle_stage vs stage_id

The Vision V2 Database Schema is authoritative. This SD aligns code to spec, not spec to code.`,

    metadata: {
      phase: 2,
      phase_name: 'Reactivation',
      source: 'OpenAI Codex',
      estimated_effort: 'Multi-day',
      vision_document_references: [
        VISION_DOCS.dbSchema,
        VISION_DOCS.apiContracts,
        VISION_DOCS.evaOrchestration
      ],
      column_mappings: {
        'current_lifecycle_stage': 'Canonical - use this',
        'current_stage': 'DEPRECATED - do not use',
        'lifecycle_stage': 'Canonical for venture_stage_work',
        'stage_id': 'DEPRECATED - do not use'
      },
      key_files: [
        'ehg/src/pages/api/v2/chairman/briefing.ts',
        'ehg/src/pages/api/v2/chairman/decisions.ts',
        'ehg/src/services/evaStateMachines.ts',
        'ehg/src/hooks/useChairmanDashboardData.ts'
      ]
    }
  },

  'SD-FOUNDATION-V3-005': {
    description: `EVA Directive Execution Engine

This SD implements the backend execution pipeline for chairman directives, transforming EVA from a "read-only dashboard" into an "operating system" that can execute commands.

## Problem Statement

The current POST /api/v2/chairman/directive endpoint:
- Creates a directive record in the database
- Returns an acknowledgment to the chairman
- Does NOT execute the directive through the agent hierarchy

This means the Chairman's Operating System is currently "read-only" - the chairman can view briefings and make decisions, but cannot command EVA to take action.

## Technical Context

Per Vision V2 EVA Orchestration spec (04-eva-orchestration.md):
- EVA is the "Chief of Staff" orchestration engine
- Directives should flow: Chairman → EVA → Venture CEOs → VPs → Crews
- EVA interprets natural language commands and routes appropriately

Per Vision V2 Agent Architecture spec (06-hierarchical-agent-architecture.md):
- Agent registry with LTREE hierarchy paths
- Message protocol for cross-agent communication
- Task contract dispatch system

## Execution Pipeline

1. **Interpret**: Parse directive intent and target
2. **Route**: Identify target agent(s) in hierarchy
3. **Delegate**: Create task contracts for execution
4. **Track**: Monitor execution progress
5. **Report**: Aggregate results for chairman briefing

## Implementation Approach

Leverage existing infrastructure:
- agent_registry table for routing
- agent_messages table for communication
- evaTaskContracts.ts for task dispatch`,

    rationale: `Claude Opus 4.5 identified EVA directive execution as the highest-priority feature gap:

"The Chairman's Operating System promises EVA as 'Chief of Staff' who can receive and execute commands. Without directive execution, the entire architecture's value proposition is incomplete."

Key reasoning:
1. **Dependency Chain**: Budget enforcement and blueprint generation depend on EVA's ability to dispatch work
2. **User Experience**: Currently a "read-only dashboard" not an "operating system"
3. **Architectural Integrity**: The LTREE-based agent hierarchy sits unused without directive execution

The Vision V2 EVA Orchestration spec (04-eva-orchestration.md) defines EVA's responsibilities:
- Interpret Chairman's natural language commands
- Route directives through Venture CEO hierarchy
- Enforce token budgets and workflow integrity`,

    metadata: {
      phase: 3,
      phase_name: 'Capability',
      source: 'Claude Opus 4.5',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-004',
      vision_document_references: [
        VISION_DOCS.constitution,
        VISION_DOCS.evaOrchestration,
        VISION_DOCS.agentArchitecture,
        VISION_DOCS.agentRuntime
      ],
      execution_pipeline: [
        'Directive interpretation',
        'Agent routing (LTREE hierarchy)',
        'Task contract creation',
        'Execution tracking',
        'Result aggregation'
      ],
      key_tables: [
        'agent_registry',
        'agent_messages',
        'agent_relationships'
      ],
      key_files: [
        'ehg/src/pages/api/v2/chairman/directive.ts',
        'ehg/src/services/evaTaskContracts.ts',
        'ehg/src/services/evaStateMachines.ts'
      ]
    }
  },

  'SD-FOUNDATION-V3-006': {
    description: `25-Stage Crew Mapping Completion

This SD extends the STAGE_CREW_MAP in evaTaskContracts.ts to support all 25 venture lifecycle stages, enabling full end-to-end venture execution.

## Problem Statement

The current STAGE_CREW_MAP only defines crew assignments for stages 1-6:
\`\`\`typescript
const STAGE_CREW_MAP = {
  1: ['research_crew', 'analysis_crew'],
  2: ['validation_crew'],
  // ... stages 3-6
  // MISSING: stages 7-25
};
\`\`\`

This means ventures cannot progress beyond stage 6 because the system doesn't know which crews to dispatch for stages 7-25.

## Technical Context

Per Vision V2 Constitution (00_VISION_V2_CHAIRMAN_OS.md):
- 25 stages organized in 6 phases
- Each stage has specific activities requiring specific crew types
- Stages progress through gates (auto-advance, advisory, hard)

Per Vision V2 Database Schema (01-database-schema.md):
- lifecycle_stage_config table defines all 25 stages
- Includes phase, gate_type, required_artifacts for each stage

## Implementation Approach

1. Query lifecycle_stage_config for stage metadata
2. Map each stage to appropriate crew types based on activities
3. Drive mappings from database (no hardcoding)
4. Add dispatch tests for stages 7-25

## Stage-Crew Mapping Guidelines

| Phase | Stages | Typical Crews |
|-------|--------|---------------|
| THE_TRUTH | 1-4 | research, validation, analysis |
| THE_ENGINE | 5-9 | business_model, financial, technical |
| THE_IDENTITY | 10-13 | brand, market, positioning |
| THE_BLUEPRINT | 14-18 | product, engineering, design |
| THE_BUILD_LOOP | 19-23 | development, qa, deployment |
| LAUNCH_LEARN | 24-25 | launch, monitoring, iteration |`,

    rationale: `OpenAI Codex identified this as a critical gap:

"STAGE_CREW_MAP only covers stages 1-6 in ehg/src/services/evaTaskContracts.ts. This is a critical gap for the 25-stage system - ventures will stall after stage 6."

The Vision V2 Constitution defines a complete 25-stage lifecycle. Without crew mappings for all stages, the system cannot execute the full venture lifecycle as designed.`,

    metadata: {
      phase: 3,
      phase_name: 'Capability',
      source: 'OpenAI Codex',
      estimated_effort: '1-2 days',
      dependency: 'SD-FOUNDATION-V3-004',
      vision_document_references: [
        VISION_DOCS.constitution,
        VISION_DOCS.dbSchema,
        VISION_DOCS.agentArchitecture
      ],
      key_files: [
        'ehg/src/services/evaTaskContracts.ts'
      ],
      config_source: 'lifecycle_stage_config table',
      stage_phases: {
        'THE_TRUTH': [1, 2, 3, 4],
        'THE_ENGINE': [5, 6, 7, 8, 9],
        'THE_IDENTITY': [10, 11, 12, 13],
        'THE_BLUEPRINT': [14, 15, 16, 17, 18],
        'THE_BUILD_LOOP': [19, 20, 21, 22, 23],
        'LAUNCH_LEARN': [24, 25]
      }
    }
  },

  'SD-FOUNDATION-V3-007': {
    description: `Chairman Dashboard E2E Test Suite

This SD creates comprehensive Playwright E2E tests for the Chairman's Glass Cockpit dashboard, establishing automated regression protection for the primary user interface.

## Problem Statement

The Chairman's Dashboard is the primary interaction surface for the system, but it currently lacks automated E2E test coverage. This means:
- UI regressions may go undetected
- User journey breakages aren't caught before deployment
- Confidence in changes is low

## Technical Context

Per Vision V2 UI Components spec (03-ui-components.md):
- Glass Cockpit design with EVA-first interaction
- Key components: BriefingDashboard, EVAGreeting, DecisionStack, PortfolioSummary
- Navigation tabs: Briefing, Decisions, Portfolio

Per Vision V2 User Stories spec (05-user-stories.md):
- Chairman views daily briefing
- Chairman makes gate decisions (GO/NO_GO/PAUSE/PIVOT)
- Chairman issues directives to EVA

## Test Coverage Plan

1. **Briefing View Tests**
   - Dashboard loads with correct components
   - EVA greeting displays with time context
   - Quick stats render with real data
   - Decision stack shows pending decisions

2. **Decision Workflow Tests**
   - Navigate to decision detail
   - View evidence and recommendations
   - Make decision (GO/NO_GO/PAUSE/PIVOT)
   - Verify decision recorded

3. **Portfolio View Tests**
   - Venture list displays correctly
   - Stage distribution visible
   - Filter by phase/status works

4. **Auth Flow Tests**
   - Chairman auth middleware enforces access
   - Non-chairman users redirected`,

    rationale: `All three analyses (Claude, Codex, Anti-Gravity) identified the need for E2E test coverage:

- Claude: "High regression risk without automated tests"
- Codex: "Need end-to-end 'Chairman approves gate → stage advances' coverage"
- Anti-Gravity: "We are flying blind on regressions"

The Vision V2 UI Components spec defines the Glass Cockpit design, but without E2E tests, we cannot verify the UI matches the spec or catch regressions during iteration.`,

    metadata: {
      phase: 4,
      phase_name: 'Quality',
      source: 'All Three Analyses',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-003',
      vision_document_references: [
        VISION_DOCS.uiComponents,
        VISION_DOCS.userStories,
        VISION_DOCS.designReview
      ],
      test_framework: 'Playwright',
      test_location: 'tests/e2e/chairman/',
      coverage_targets: [
        'Briefing view',
        'Decision workflow',
        'Portfolio view',
        'Auth flow'
      ],
      key_components: [
        'BriefingDashboard',
        'EVAGreeting',
        'DecisionStack',
        'PortfolioSummary',
        'StageTimeline'
      ]
    }
  },

  'SD-FOUNDATION-V3-008': {
    description: `Four Buckets Decision Evidence End-to-End

This SD wires chairman decision evidence to real data sources (Four Buckets epistemic classification), removing all placeholder data from production.

## Problem Statement

The Vision V2 Golden Nuggets spec defines the Four Buckets epistemic model:
- **Facts**: Verified, validated information
- **Assumptions**: Beliefs requiring validation
- **Simulations**: Model-based projections
- **Unknowns**: Acknowledged gaps in knowledge

However, the current decision evidence API returns placeholder data:
\`\`\`typescript
// Current (placeholder)
evidence: {
  facts: [],
  assumptions: [],
  simulations: [],
  unknowns: []
}
\`\`\`

The actual Four Buckets data exists in the database but isn't wired to the decision endpoints.

## Technical Context

Per Vision V2 Database Schema (01-database-schema.md):
- venture_artifacts table has epistemic_* columns
- assumption_sets table tracks assumption validation
- venture_token_ledger provides cost context

Per Vision V2 Golden Nuggets Plan:
- Every artifact must be classified into one of the Four Buckets
- Chairman decisions should be informed by epistemic status
- Provenance chain should be traceable

## Data Sources to Wire

1. \`venture_artifacts.epistemic_category\` - Bucket classification
2. \`venture_artifacts.epistemic_confidence\` - Confidence score
3. \`assumption_sets\` - Assumption tracking with reality_status
4. \`venture_token_ledger\` - Cost/investment context

## Deliverables

1. Decision evidence API returns real Four Buckets data
2. Evidence traceable to source artifacts
3. No placeholder data in production
4. UI displays Facts/Assumptions/Simulations/Unknowns`,

    rationale: `OpenAI Codex identified this gap:

"Code references things like venture_decisions, venture_stages, chairman_pending_decisions, venture_budget_transactions—either they exist outside this repo's migrations, or the code is ahead of the DB. Four Buckets plumbing into decisions: DB adds Four Buckets fields on artifacts, but API 'evidence' is empty/placeholder."

The Vision V2 Golden Nuggets Plan establishes Four Buckets as a core epistemic model for the Chairman's Operating System. Decisions without proper evidence classification undermine the governance framework.`,

    metadata: {
      phase: 4,
      phase_name: 'Quality',
      source: 'OpenAI Codex',
      estimated_effort: 'Multi-day',
      dependency: 'SD-FOUNDATION-V3-004',
      vision_document_references: [
        VISION_DOCS.goldenNuggets,
        VISION_DOCS.dbSchema,
        VISION_DOCS.apiContracts
      ],
      four_buckets: {
        facts: 'Verified, validated information',
        assumptions: 'Beliefs requiring validation',
        simulations: 'Model-based projections',
        unknowns: 'Acknowledged gaps in knowledge'
      },
      data_sources: [
        'venture_artifacts.epistemic_category',
        'venture_artifacts.epistemic_confidence',
        'assumption_sets.reality_status',
        'venture_token_ledger'
      ],
      key_files: [
        'ehg/src/pages/api/v2/chairman/decisions.ts'
      ]
    }
  }
};

async function enhanceFoundationV3SDs() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Enhancing Foundation V3 SDs with Vision Document References');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  let updated = 0;
  let errors = 0;

  for (const [sdId, enhancements] of Object.entries(SD_ENHANCEMENTS)) {
    try {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          description: enhancements.description,
          rationale: enhancements.rationale,
          scope: enhancements.scope || undefined,
          metadata: enhancements.metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      if (error) throw error;

      const descLen = enhancements.description?.length || 0;
      const rationaleLen = enhancements.rationale?.length || 0;
      const docRefs = enhancements.metadata?.vision_document_references?.length || 0;

      console.log(`✅ ${sdId}`);
      console.log(`   Description: ${descLen} chars | Rationale: ${rationaleLen} chars | Doc refs: ${docRefs}`);
      updated++;
    } catch (error) {
      console.error(`❌ ${sdId}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Summary: ${updated} enhanced, ${errors} errors`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (errors === 0) {
    console.log('🎉 All SDs enhanced with detailed context and vision document references!');
  }
}

enhanceFoundationV3SDs().catch(console.error);
