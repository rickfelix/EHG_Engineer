# SD Review: Claude Code Independent Analysis

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, unit, migration

## Ground-Truth Validation

**Date**: 2026-01-01
**Method**: Direct codebase and database exploration
**Analyst**: Claude Code (Opus 4.5)

---

## SD 1: SD-GENESIS-COMPLETE-001

### Ground-Truth Validation

#### What Exists

| File | Status | Notes |
|------|--------|-------|
| `ehg/scripts/genesis/genesis-pipeline.js` | EXISTS | `GenesisPipeline` class with `create()`, `generatePRD()`, CLI |
| `ehg/scripts/genesis/soul-extractor.js` | EXISTS | `SoulExtractor` class, validates Stage 16, extracts requirements |
| `ehg/scripts/genesis/production-generator.js` | EXISTS | `ProductionGenerator` class, generates from soul extraction |
| `ehg/scripts/genesis/regeneration-gate.js` | EXISTS | Referenced by production-generator |
| `ehg/src/pages/api/genesis/ratify.ts` | EXISTS | POST endpoint to ratify simulation → create venture at Stage 1 |
| `ehg/src/components/stages/CompleteWorkflowOrchestrator.tsx` | EXISTS | 25-stage orchestrator with tier routing |
| `simulation_sessions` table | EXISTS | 5 rows, stores simulations with `epistemic_status` |
| `soul_extractions` table | EXISTS | 0 rows |
| `production_artifacts` table | EXISTS | Empty |

#### Real Completion: **35%**

**Reasoning**:
1. **generatePRD() is STUBBED** (`genesis-pipeline.js:190-211`): Returns hardcoded template, not LLM-generated:
   ```javascript
   return {
     title,
     executive_summary: `Simulation venture based on: ${seedText}`,
     functional_requirements: [
       { id: 'FR-001', requirement: 'Core functionality from seed idea', priority: 'CRITICAL' },
       // ... hardcoded
     ],
   };
   ```

2. **production-generator.js has EMPTY methods** (Lines 443-478):
   - `generateComponents()` returns `[]`
   - `generatePages()` returns `[]`
   - `generateTypes()` returns `[]`
   - `generateServices()` returns `[]`
   - `generateConfig()` returns `[]`
   - Only `generateAPIRoutes()` and `generateSchemaMigrations()` have implementations

3. **CompleteWorkflowOrchestrator uses DIFFERENT Stage 16/17**: Imports `Stage16AICEOAgent` and `Stage17GTMStrategy` - NOT the Genesis soul-extractor/production-generator. These are separate "venture development" stages, not "simulation regeneration" stages.

4. **No UI for simulation creation**: Pipeline is CLI-only (`node genesis-pipeline.js create "idea"`)

#### Incorrect Assumptions

| SD Assumption | Reality |
|---------------|---------|
| "Stage 16/17 scripts aren't wired to orchestrator" | They're completely DIFFERENT systems. Genesis scripts are for simulation→production path. Orchestrator Stage 16/17 are for venture management |
| "Architecture is sound" | There's architectural confusion: Genesis pipeline is Node CLI, Orchestrator is React, they don't share state |
| "PRDs created without parent SDs" | Actually `ratify.ts` creates ventures, not SDs. PRD→SD relationship is separate from simulation→venture |

#### Missing Dependencies
1. **OpenAI integration for PRD generation** - No API call exists
2. **ScaffoldEngine implementation** - Referenced but may be incomplete
3. **vercel-deploy.js** - Referenced for Vercel deployment, not verified
4. **Database tables**: `soul_extractions` has 0 rows despite pipeline existing

#### Complexity Reality Check

| Item | Why It's Harder |
|------|-----------------|
| LLM PRD Generation | Needs prompt engineering, structured output parsing, multi-turn refinement |
| Wiring Genesis to Orchestrator | Architectural mismatch - CLI Node scripts vs React state management |
| Production Code Generation | The `generateComponents()` etc. methods need to understand pattern composition, dependency resolution |

---

## SD 2: SD-VENTURE-SELECTION-001

### Ground-Truth Validation

#### What Exists

| File | Status | Notes |
|------|--------|-------|
| `ChairmanSettingsPage.tsx` | EXISTS | Full 7-tab settings UI (Profile, Dashboard, Navigation, Notifications, Security, KPIs, Alerts) |
| `useChairmanConfig` hook | EXISTS | Config loading/saving |
| `KPISelector` component | EXISTS | KPI selection UI |
| `AlertConfiguration` component | EXISTS | Alert thresholds configuration |
| `chairman_settings` table | EXISTS | Schema exists (empty) |
| `venture_opportunity_scores` table | EXISTS | Schema exists (empty) |
| `scaffold_patterns` table | EXISTS | **45 patterns** |

#### Pattern Library Analysis

| Type | Count | Examples |
|------|-------|----------|
| component | 17 | DataTable, FormField, Modal, Card |
| page | 8 | ListPage, DetailPage, dashboard_page |
| hook | 3 | useDebounce, useLocalStorage, useFetch |
| service | 3 | CRUDService, AuthService, CacheService |
| api_route | 3 | RestApiHandler, AuthMiddleware |
| layout | 3 | DashboardLayout, AuthLayout |
| rls_policy | 3 | PublicReadPolicy, OwnRowsPolicy |
| migration | 3 | AddColumn, CreateJoinTable |
| database_table | 2 | BasicTable, UserOwnedTable |

**Key Patterns Status**:
- StripeService/Payment: **MISSING**
- RBAC/Auth: **EXISTS** (AuthService, AuthMiddleware)
- useCRUD hook: **EXISTS** (CRUDService, useFetch)
- BackgroundJob: **MISSING**

#### Real Completion: **55%**

**Reasoning**:
1. **Chairman Settings UI is comprehensive** - 7 tabs, widget visibility, KPI selection, alerts
2. **But no Scoring Engine logic** - UI displays scores but automated calculation missing
3. **Pattern library exists but incomplete** - Missing 2 of 4 critical patterns (Stripe, BackgroundJob)
4. **No "Risk Tolerance" or "Max Concurrent Ventures" settings** visible in UI

#### Incorrect Assumptions

| SD Assumption | Reality |
|---------------|---------|
| "~45 patterns" | Correct! Exactly 45 patterns in database |
| "Chairman Settings for portfolio logic" | UI exists but focuses on dashboard widgets, not venture selection logic |
| "Scoring rubric with configurable weights" | No evidence of weight configuration in current ChairmanSettingsPage |

#### Missing for SD-VS-CHAIRMAN-SETTINGS-001
- Risk Tolerance slider
- Max Concurrent Ventures setting
- Portfolio Balance (Vending Machine % vs Micro-SaaS %)
- Technical Complexity weighting

---

## SD 3: SD-BLIND-SPOTS-001

### Ground-Truth Validation

#### EVA Infrastructure (SD-BLIND-SPOT-EVA-001)

| File | Status | Notes |
|------|--------|-------|
| `evaEventBus.ts` | EXISTS | **764 lines**, full implementation with DLQ, retry, replay |
| `evaCircuitBreaker.ts` | EXISTS | Circuit breaker pattern |
| `evaTaskOrchestrator.ts` | EXISTS | Task orchestration |
| `EvaOrchestrationDashboard.tsx` | EXISTS | Dashboard UI |
| `eva_events` table | EXISTS | Schema exists |
| `eva_decisions` table | EXISTS | Schema exists |
| `eva_ventures` table | EXISTS | Schema exists |

**EVAEventBus Features** (actual code):
- Subscribe/unsubscribe with priority ordering
- Async event publishing with database persistence
- Exponential backoff retry (configurable)
- Dead Letter Queue with replay capability
- Circuit breaker integration
- Predefined event types: `VENTURE_CREATED`, `STAGE_ENTERED`, `CHAIRMAN_APPROVAL`, etc.

#### Real Completion by Child SD

| Child SD | Completion | Evidence |
|----------|------------|----------|
| SD-EVA-ARCHITECTURE-001 | **70%** | Event bus, circuit breaker, data model exist |
| SD-EVA-DASHBOARD-001 | **40%** | Dashboard exists but not "32-tile health grid" |
| SD-EVA-ALERTING-001 | **50%** | AlertConfiguration UI exists, P0/P1/P2 needs work |
| SD-EVA-AUTOMATION-001 | **30%** | Event handlers exist but auto-fix rules incomplete |
| SD-BLIND-SPOT-LEGAL-001 | **10%** | ComplianceTab exists but no Series LLC logic |
| SD-BLIND-SPOT-PRICING-001 | **30%** | Stage15PricingStrategy exists |
| SD-BLIND-SPOT-FAILURE-001 | **5%** | `failure_patterns` table exists (empty) |
| SD-BLIND-SPOT-SKILLS-001 | **5%** | `skills_inventory` table exists (empty) |
| SD-BLIND-SPOT-DEPRECATION-001 | **0%** | No pattern lifecycle management found |

#### Real Completion: **~35%**

**Reasoning**: EVA core is surprisingly robust, but it's managing ventures that don't fully exist (Genesis isn't complete). The non-EVA blind spots (Legal, Pricing, Failure, Skills, Deprecation) have schema only - no business logic.

---

## User Stories

### SD-GENESIS-PRD-001: LLM-Integrated PRD Generation

**Story 1**: As a Solo Operator, I want to enter a seed idea and receive a structured PRD with functional requirements, user stories, and data model, so that I have a validated specification without manual writing.

Acceptance Criteria:
- [ ] Input accepts freeform text (1-500 words)
- [ ] Output is PRD with: title, executive_summary, functional_requirements[], user_stories[], data_model
- [ ] Uses OpenAI GPT-4 or Claude for generation
- [ ] Includes "confidence score" for each section

**Story 2**: As EVA, I want to regenerate a PRD incorporating lessons from a failed simulation's soul extraction, so that the next attempt avoids previous pitfalls.

Acceptance Criteria:
- [ ] `generatePRD()` accepts optional `previousSoulId` parameter
- [ ] If provided, fetches previous soul's failure reasons
- [ ] Generated PRD explicitly addresses each failure point
- [ ] Tracks generation lineage (which PRDs informed this one)

**Story 3**: As a Developer reviewing generated code, I want PRDs to include explicit pattern recommendations, so that SCAFFOLD uses appropriate building blocks.

Acceptance Criteria:
- [ ] PRD includes `recommended_patterns[]` field
- [ ] Patterns are selected from `scaffold_patterns` table
- [ ] Selection logic considers venture type and complexity

### SD-GENESIS-STAGE16-17-001: Wire Soul-Extractor and Production-Generator

**Story 1**: As a Chairman, I want ratified simulations to automatically trigger soul extraction, so that validated requirements are preserved before code regeneration.

Acceptance Criteria:
- [ ] `ratify.ts` calls `SoulExtractor.extract()` after venture creation
- [ ] Extraction failures are logged but don't block ratification
- [ ] Soul extraction stored in `soul_extractions` table with venture reference

**Story 2**: As EVA, I want to generate production code from extracted souls without simulation markers, so that deployed ventures are clean.

Acceptance Criteria:
- [ ] `ProductionGenerator.generate()` is triggered after soul extraction
- [ ] `validateNoSimulationMarkers()` rejects any code with mock-mode references
- [ ] Generated files use proper EHG patterns from pattern library
- [ ] Output includes all file types: components, pages, types, services, config

### SD-VS-CHAIRMAN-SETTINGS-001: Configurable Portfolio Logic

**Story 1**: As the Chairman, I want to set a Risk Tolerance level (Conservative/Moderate/Aggressive) that influences venture scoring, so that only ventures matching my risk profile are recommended.

Acceptance Criteria:
- [ ] Risk Tolerance dropdown added to ChairmanSettingsPage
- [ ] Stored in `chairman_settings.risk_tolerance` column
- [ ] Scoring engine applies multiplier: Conservative=0.5x, Moderate=1.0x, Aggressive=1.5x on technical_complexity

**Story 2**: As the Chairman, I want to set Maximum Concurrent Ventures, so that EVA doesn't recommend new ventures when I'm at capacity.

Acceptance Criteria:
- [ ] Numeric input (1-32) in ChairmanSettingsPage
- [ ] EVA checks current active venture count before recommendations
- [ ] Warning displayed when at 80% of capacity

**Story 3**: As the Chairman, I want to configure Portfolio Balance targets (% Vending Machine vs % Micro-SaaS vs % Platform), so that EVA recommends ventures that balance my portfolio.

Acceptance Criteria:
- [ ] Three sliders that sum to 100%
- [ ] Current portfolio composition displayed alongside targets
- [ ] EVA recommendations weighted by category deficit

### SD-EVA-DASHBOARD-001: Chairman Health Grid View

**Story 1**: As the Chairman, I want a 32-tile grid showing all ventures with traffic light colors (Green/Yellow/Red), so that I can see portfolio health at a glance.

Acceptance Criteria:
- [ ] Grid displays up to 32 venture tiles
- [ ] Colors: Green (healthy), Yellow (warning), Red (critical)
- [ ] Status determined by metrics: uptime, revenue trend, support tickets
- [ ] Click on tile opens venture detail panel

**Story 2**: As EVA, I want to update venture health status automatically based on metric thresholds, so that the Chairman sees real-time status without manual monitoring.

Acceptance Criteria:
- [ ] Health calculated every 15 minutes
- [ ] Thresholds configurable per venture stage
- [ ] State changes trigger EVA events (`SYSTEM_HEALTH_CHANGE`)
- [ ] History tracked for trend analysis

### SD-BLIND-SPOT-LEGAL-001: Series LLC Foundation

**Story 1**: As the Chairman, I want a "Legal Status" indicator for each venture showing if Series LLC is Pending/Formed/N/A, so that I track legal protection status.

Acceptance Criteria:
- [ ] `legal_status` column added to `ventures` table
- [ ] UI displays status badge in venture list
- [ ] "Form Series" action available for Pending ventures

**Story 2**: As EVA, I want to auto-generate Delaware Series LLC formation documents when a venture reaches Stage 5 (Profitability Forecasting), so that legal protection starts before real revenue.

Acceptance Criteria:
- [ ] Document templates stored in database
- [ ] Variables filled from venture metadata
- [ ] Generated documents stored as venture artifacts
- [ ] Notification sent to Chairman for review/signing

---

## PRD Details

### SD-GENESIS-UI-001: Simulation Creation Wizard

**Technical Requirements**:
1. Multi-step wizard component with progress indicator
2. Steps: Seed Input → Configuration → PRD Preview → Confirm
3. Real-time PRD generation preview (streaming if possible)
4. Mock mode toggle with explanation tooltip

**Data Model Changes**:
```sql
ALTER TABLE simulation_sessions ADD COLUMN wizard_state jsonb;
ALTER TABLE simulation_sessions ADD COLUMN configuration jsonb;
-- configuration: { ttl_days, mock_mode, target_patterns[] }
```

**API Endpoints**:
- `POST /api/genesis/create` - Trigger pipeline from wizard
- `GET /api/genesis/preview-prd` - Stream PRD generation preview
- `POST /api/genesis/validate-seed` - Quick validation of seed text

**UI Components**:
- `SimulationWizard.tsx` - Main wizard container
- `SeedInputStep.tsx` - Textarea with character count, inspiration tags
- `ConfigurationStep.tsx` - TTL, mock mode, pattern selection
- `PRDPreviewStep.tsx` - Generated PRD display with edit capability
- `ConfirmStep.tsx` - Final review and create button

### SD-VS-SCORING-RUBRIC-001: Automated Scoring Engine

**Technical Requirements**:
1. Configurable scoring formula with weights
2. Default: `(market_size * 0.3) + (technical_feasibility * 0.4) + (chairman_fit * 0.3)`
3. Chairman Fit derived from risk tolerance and portfolio balance settings
4. Score history tracking for trend analysis

**Data Model Changes**:
```sql
CREATE TABLE venture_scoring_runs (
  id uuid PRIMARY KEY,
  venture_id uuid REFERENCES ventures(id),
  score_total numeric,
  score_breakdown jsonb, -- { market_size: 85, technical_feasibility: 70, chairman_fit: 90 }
  weights_used jsonb,
  calculated_at timestamptz,
  triggered_by text -- 'manual', 'schedule', 'stage_change'
);

ALTER TABLE chairman_settings ADD COLUMN scoring_weights jsonb DEFAULT '{"market_size": 0.3, "technical_feasibility": 0.4, "chairman_fit": 0.3}';
```

**API Endpoints**:
- `POST /api/ventures/:id/score` - Trigger scoring run
- `GET /api/ventures/:id/score-history` - Get score history
- `PUT /api/chairman/scoring-weights` - Update default weights

---

## Missing Considerations

### 1. Security: RBAC on Genesis Endpoints
- `POST /api/genesis/ratify` has NO authentication check in code
- Anyone with endpoint URL could create ventures
- **Recommendation**: Add Supabase RLS + middleware auth check

### 2. Pattern Dependency Resolution
- Production generator assumes patterns are independent
- In reality: `AuthService` requires `CRUDService`, many components need shared context
- **Recommendation**: Add `pattern_dependencies` table tracking requires/provides

### 3. Simulation Data Migration
- When soul is extracted, user test data (created during simulation validation) is lost
- Some simulations may have valuable beta user feedback
- **Recommendation**: Soul extraction should optionally migrate sanitized user data

### 4. EVA Without Ventures
- EVA event bus is robust but has no consumers
- `eva_events` table has 0 events because ventures aren't being created through full pipeline
- **Recommendation**: Genesis completion must be priority - EVA is ready but idle

### 5. Genesis ↔ Orchestrator Architecture Gap
- Genesis pipeline: Node CLI scripts, filesystem operations, Vercel deploy
- Workflow Orchestrator: React state, Supabase persistence, 25 stages
- These are TWO SEPARATE PATHS - not one pipeline
- **Recommendation**: Decide on unified architecture or document them as distinct flows

### 6. Pattern Library Gaps
- Missing: Stripe/Payment (critical for vending machine model)
- Missing: BackgroundJob (critical for async operations)
- Only 45 patterns total, many are basic
- **Recommendation**: SD-VS-PATTERN-UNLOCK-001 should be priority after Genesis

---

## Priority and Sequencing Feedback

### Critical Blocker Identified

**SD-GENESIS-COMPLETE-001 is BLOCKED by architectural confusion.**

The SD assumes "wiring" Stage 16/17 scripts to the Orchestrator. But they are DIFFERENT systems:
1. Genesis scripts = Create simulations → Deploy previews → Ratify to ventures
2. Orchestrator = Guide existing ventures through 25 development stages

**Resolution needed**: Either:
- A) Genesis creates ventures that THEN go through Orchestrator Stage 1-25
- B) Genesis IS the first part of the Orchestrator (requires major refactoring)

Current code suggests Option A (Genesis → Ratify → Venture at Stage 1 → Orchestrator).

### Recommended Sequence

1. **SD-GENESIS-PRD-001** (LLM Integration) - Unblocks entire Genesis flow
2. **SD-GENESIS-STAGE16-17-001** (Wire soul/production) - Complete regeneration path
3. **SD-GENESIS-UI-001** (Wizard) - Enable non-CLI usage
4. **SD-VS-PATTERN-UNLOCK-001** (Critical patterns) - Stripe, BackgroundJob
5. **SD-EVA-DASHBOARD-001** (Health Grid) - Visible portfolio management
6. **SD-VS-SCORING-RUBRIC-001** (Scoring Engine) - Automated venture selection

### Parallelization Opportunities

Can run in parallel:
- SD-GENESIS-UI-001 + SD-VS-CHAIRMAN-SETTINGS-001 (both UI work)
- SD-VS-PATTERN-UNLOCK-001 + SD-BLIND-SPOT-LEGAL-001 (independent domains)

Must be sequential:
- SD-GENESIS-PRD-001 → SD-GENESIS-STAGE16-17-001 (PRD needed for soul extraction)
- SD-EVA-ARCHITECTURE-001 → SD-EVA-AUTOMATION-001 (core before automation)

---

## Summary Table

| SD | Claimed State | Real Completion | Delta | Blocker |
|----|---------------|-----------------|-------|---------|
| SD-GENESIS-COMPLETE-001 | ~45-50% | **35%** | -15% | Architecture confusion |
| SD-VENTURE-SELECTION-001 | ~60% | **55%** | -5% | Missing patterns |
| SD-BLIND-SPOTS-001 | ~40% | **35%** | -5% | EVA ready but no ventures |

**Key Insight**: The system has an "EVA without Apps" problem. We've built portfolio management infrastructure but the venture factory (Genesis) isn't producing ventures. Fix Genesis first.

---

*Analysis completed: 2026-01-01*
*Method: Direct codebase exploration via Read, Glob, Grep, and database queries*
