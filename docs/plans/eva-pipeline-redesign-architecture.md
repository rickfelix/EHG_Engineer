# Architecture Plan: EVA 25-Stage Pipeline Redesign

**Architecture Key**: `ARCH-EVA-PIPELINE-REDESIGN-001`
**Vision Document**: `VISION-EVA-PIPELINE-REDESIGN-L2-001` → [Vision](./eva-pipeline-redesign-vision.md)
**Source Brainstorm**: [brainstorm/2026-03-04-eva-stage-execution-worker.md](../../brainstorm/2026-03-04-eva-stage-execution-worker.md)
**Brainstorm Session**: `697e02a4-dde8-4170-81e6-0cc641a18813`

## Stack & Repository Decisions

**Repositories:**
- **EHG_Engineer** (backend): Stage templates, analysis steps, execution engine, contracts, workers, lifecycle-sd-bridge
- **ehg** (frontend): Stage renderers, operations dashboard, launch workflow UI, pipeline-to-GUI wiring

**Backend Stack (unchanged):**
- Node.js (ESM) — all pipeline code
- Supabase (PostgreSQL + Realtime + Auth + Storage) — data layer
- LLM Client Factory (`lib/llm/client-factory.js`) — model routing for analysis steps
- Vitest — unit and integration tests

**Frontend Stack (unchanged):**
- Vite + React + TypeScript
- Shadcn UI + Tailwind CSS
- Recharts — data visualization
- @tanstack/react-query — data fetching
- Supabase JS client — real-time subscriptions

**New Dependencies:** None. All work uses existing stack.

## Legacy Deprecation Plan

### Stage Templates Being Replaced

| File | Action | Replacement |
|------|--------|-------------|
| `stage-templates/stage-10.js` | REDESIGN | Customer & Brand Foundation (customer personas + brand genome) |
| `stage-templates/stage-11.js` | REDESIGN | Naming & Visual Identity (was GTM Strategy) |
| `stage-templates/stage-12.js` | REDESIGN | Go-to-Market & Sales (combined GTM + Sales, was Sales Logic) |
| `stage-templates/stage-23.js` | REDESIGN | Marketing Preparation (was Launch Execution) |
| `stage-templates/stage-24.js` | REDESIGN | Launch Readiness (was Metrics & Learning) |
| `stage-templates/stage-25.js` | REDESIGN | Launch Execution (was Venture Review) |
| `analysis-steps/stage-10-*.js` | REDESIGN | New analysis step for customer personas + brand genome |
| `analysis-steps/stage-11-*.js` | REDESIGN | New analysis step for naming + visual identity |
| `analysis-steps/stage-12-*.js` | REDESIGN | New analysis step for GTM + sales model |
| `analysis-steps/stage-19-*.js` | REDESIGN | Read real data from venture_stage_work instead of LLM simulation |
| `analysis-steps/stage-20-*.js` | REDESIGN | Read real QA data instead of fabricated results |
| `analysis-steps/stage-21-*.js` | REDESIGN | Evaluate real build artifacts instead of imagined ones |
| `analysis-steps/stage-23-*.js` | REDESIGN | Marketing SD creation via lifecycle-sd-bridge |
| `analysis-steps/stage-24-*.js` | REDESIGN | Launch readiness checklist with real upstream data |
| `analysis-steps/stage-25-*.js` | REDESIGN | Go-live execution + operations handoff |

### Stage Renderers Being Replaced

| File | Action | Replacement |
|------|--------|-------------|
| `gates/KillGateRenderer.tsx` (stages 3,5) | SPLIT | `Stage3KillGateRenderer.tsx` + `Stage5KillGateRenderer.tsx` |
| `gates/Stage10Renderer.tsx` (naming/brand) | REDESIGN | Customer persona cards + brand genome radar |
| `gates/Stage22Renderer.tsx` (release) | REDESIGN | Real build data display |
| `gates/Stage25Renderer.tsx` (review) | REDESIGN | Launch execution progress |

### Migration Strategy

Each stage template redesign is backward-compatible at the artifact level — `venture_artifacts` schema stays the same (stage_number, artifact_type, data JSONB). New output schemas are additive. Old stage data in existing ventures is unaffected; new schema applies only to future stage executions.

The old Stage 15 (Risk Register) merges into Stage 6 (Risk Matrix). Stage 15's template will be simplified to a "consume Stage 6 + add risks from Stages 7-14" step — no separate risk identification.

## Route & Component Structure

### New Routes (ehg frontend)

```
/chairman/operations                    → VentureOperationsPage.tsx
/chairman/operations/:ventureId         → VentureOperationsDetailPage.tsx
/chairman/ventures/:ventureId/launch    → LaunchProgressPage.tsx
/chairman/capabilities                  → CapabilityRegistryPage.tsx
```

### New Components

```
ehg/src/
├── pages/
│   ├── chairman/
│   │   ├── VentureOperationsPage.tsx          (NEW — live ventures overview)
│   │   ├── VentureOperationsDetailPage.tsx     (NEW — per-venture ops detail)
│   │   └── LaunchProgressPage.tsx             (NEW — stages 23-25 timeline)
│   └── CapabilityRegistryPage.tsx             (NEW — cross-venture capabilities)
├── components/
│   ├── chairman-v3/gates/
│   │   ├── Stage3KillGateRenderer.tsx         (NEW — DFE + capability check)
│   │   ├── Stage5KillGateRenderer.tsx         (NEW — financial viability)
│   │   ├── Stage10Renderer.tsx                (REDESIGN — personas + brand)
│   │   ├── Stage11Renderer.tsx                (NEW — naming + visual identity)
│   │   ├── Stage17PromotionRenderer.tsx       (NEW — promote to BUILD)
│   │   ├── Stage22Renderer.tsx                (REDESIGN — real build data)
│   │   ├── Stage23MarketingRenderer.tsx       (NEW — marketing SD progress)
│   │   ├── Stage24LaunchReadinessRenderer.tsx (NEW — go/no-go checklist)
│   │   ├── Stage25LaunchExecutionRenderer.tsx (NEW — go-live progress)
│   │   └── GateRendererRouter.tsx             (UPDATE — new stage mapping)
│   ├── operations/
│   │   ├── VentureOperationsDetail.tsx        (NEW — tab container)
│   │   ├── RevenueTab.tsx                     (NEW — MRR, CAC/LTV, churn)
│   │   ├── CustomerServiceTab.tsx             (NEW — tickets, SLA)
│   │   ├── FeedbackTab.tsx                    (NEW — wraps existing inbox)
│   │   ├── MetricsTab.tsx                     (NEW — AARRR funnel)
│   │   └── HealthTab.tsx                      (NEW — score breakdown)
│   └── launch/
│       └── LaunchProgressTimeline.tsx         (NEW — 3-stage timeline)
```

### Backend Modules

```
lib/eva/
├── stage-zero/synthesis/
│   └── capability-contribution.js              (NEW — component 13)
├── stage-templates/
│   ├── stage-10.js                            (REDESIGN)
│   ├── stage-11.js                            (REDESIGN)
│   ├── stage-12.js                            (REDESIGN)
│   ├── stage-23.js                            (REDESIGN)
│   ├── stage-24.js                            (REDESIGN)
│   ├── stage-25.js                            (REDESIGN)
│   └── analysis-steps/
│       ├── stage-10-customer-brand.js         (NEW)
│       ├── stage-11-visual-identity.js        (NEW)
│       ├── stage-12-gtm-sales.js             (NEW)
│       ├── stage-19-build-execution.js        (REDESIGN)
│       ├── stage-20-quality-assurance.js      (REDESIGN)
│       ├── stage-21-build-review.js           (REDESIGN)
│       ├── stage-23-marketing-prep.js         (NEW)
│       ├── stage-24-launch-readiness.js       (NEW)
│       └── stage-25-launch-execution.js       (NEW)
├── contracts/
│   └── financial-contract.js                   (NEW)
├── workers/
│   ├── stage-execution-worker.js              (NEW — core auto-advance worker)
│   ├── financial-sync.js                       (NEW — Stripe integration)
│   ├── cs-agent.js                            (NEW — venture-aware CS)
│   ├── feedback-classifier.js                 (NEW — multi-source classifier)
│   ├── metrics-collector.js                   (NEW — AARRR metrics)
│   ├── health-scorer.js                       (NEW — aggregate health)
│   └── enhancement-detector.js                (NEW — pattern→SD creation)
└── stage-zero/synthesis/
    └── weighted-composite.js                   (MODIFY — add capability weight)
```

## Data Layer

### Existing Tables (Modified)

**`venture_artifacts`** — No schema change. Stages 10-12 write new JSONB structures into the existing `data` column. `stage_number` and `artifact_type` fields unchanged.

**`ventures`** — Add column:
```sql
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS
  pipeline_mode TEXT DEFAULT 'evaluation'
  CHECK (pipeline_mode IN ('evaluation', 'build', 'launch', 'operations', 'parked', 'killed'));
```

**`stage_execution_engine` queries** — Add upstream kill-decision check before executing any stage:
```sql
SELECT decision FROM chairman_decisions
WHERE venture_id = $1 AND stage_number IN (3, 5)
AND decision IN ('kill', 'reject')
ORDER BY created_at DESC LIMIT 1;
```

### Existing Tables (Leveraged As-Is)

- **`venture_stage_work`** — Already has `advisory_data` JSONB for real build progress. `sd-completed.js` writes to it. Stages 19-22 will read from it.
- **`chairman_decisions`** — Already stores gate decisions. Kill-decision propagation reads from it.
- **`eva_orchestration_events`** — Already has Realtime. Stage execution worker subscribes to stage completion events.
- **`strategic_directives_v2`** — SD creation target for Stages 18 and 23.
- **`feedback_items`** — Existing Universal Inbox table. Operations feedback classifier writes to it.

### New Tables

**`venture_financial_contract`** — Stores canonical financial data set by Stage 5, consumed by downstream stages:
```sql
CREATE TABLE venture_financial_contract (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  capital_required NUMERIC,
  cac_estimate NUMERIC,
  ltv_estimate NUMERIC,
  unit_economics JSONB,
  pricing_model TEXT,
  price_points JSONB,
  revenue_projection JSONB,
  set_by_stage INTEGER NOT NULL,
  last_refined_by_stage INTEGER,
  refinement_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id)
);
```

**`venture_financial_metrics`** — Populated by financial sync worker (Stripe):
```sql
CREATE TABLE venture_financial_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  mrr NUMERIC,
  arr NUMERIC,
  cac_actual NUMERIC,
  ltv_actual NUMERIC,
  churn_rate NUMERIC,
  revenue_growth_pct NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`venture_operational_metrics`** — Populated by metrics collector worker:
```sql
CREATE TABLE venture_operational_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('acquisition', 'activation', 'retention', 'referral', 'revenue')),
  value NUMERIC NOT NULL,
  period TEXT NOT NULL,
  metadata JSONB,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`venture_health_scores`** — Populated by health scorer worker:
```sql
CREATE TABLE venture_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  revenue_score INTEGER CHECK (revenue_score BETWEEN 0 AND 100),
  cs_score INTEGER CHECK (cs_score BETWEEN 0 AND 100),
  feedback_score INTEGER CHECK (feedback_score BETWEEN 0 AND 100),
  metrics_score INTEGER CHECK (metrics_score BETWEEN 0 AND 100),
  alert_level TEXT CHECK (alert_level IN ('healthy', 'attention', 'critical')),
  score_breakdown JSONB,
  scored_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies

All new tables follow existing EHG patterns:
- Service role has full access (backend workers)
- Authenticated users have read access (chairman GUI)
- No public access
- RLS enabled on all tables

### Key Queries

**Financial contract validation (pre-analysis hook):**
```sql
SELECT * FROM venture_financial_contract WHERE venture_id = $1;
-- Compare new stage output against contract values
-- Flag deviations > ±20%, block deviations > 50%
```

**Upstream kill-decision check (stage execution engine):**
```sql
SELECT stage_number, decision FROM chairman_decisions
WHERE venture_id = $1 AND decision IN ('kill', 'reject')
ORDER BY stage_number DESC LIMIT 1;
-- If any kill/reject exists, halt pipeline
```

**Real build progress (stages 19-22):**
```sql
SELECT sd_key, status, progress, advisory_data
FROM venture_stage_work
WHERE venture_id = $1 AND stage_number = 18
ORDER BY created_at DESC;
-- Returns actual SD completion, test coverage, build artifacts
```

## API Surface

### New RPC Functions

**`promote_to_build(venture_id UUID)`** — Chairman action at Stage 17/18 boundary:
- Sets `ventures.pipeline_mode = 'build'`
- Triggers Stage 18 execution (sprint planning + SD creation)
- Returns the created orchestrator SD key

**`approve_launch(venture_id UUID)`** — Chairman action at Stage 24:
- Sets `ventures.pipeline_mode = 'launch'`
- Triggers Stage 25 execution (go-live)
- Returns launch status

**`get_venture_health(venture_id UUID)`** — Operations dashboard:
- Returns latest health score + breakdown
- Joins financial metrics, CS load, feedback count

**`validate_financial_consistency(venture_id UUID, stage_number INT, proposed_data JSONB)`** — Pre-analysis validation:
- Compares proposed financial data against contract
- Returns `{consistent: bool, deviations: [{field, contract_value, proposed_value, pct_deviation}]}`

### Existing RPCs (Unchanged)

- `approve_chairman_decision` / `reject_chairman_decision` / `park_venture_decision` — Gate actions
- `claim_sd` / `release_sd` — SD claim management
- `stage_zero_submit` — Stage 0 trigger from GUI

### Governance Endpoints

No new governance endpoints. The stage execution worker uses the existing `eva_orchestration_events` table with Realtime subscriptions. Gate decisions use existing `chairman_decisions` table and RPCs.

## Implementation Phases

### Phase 1: Foundation (2-3 weeks)
**Child E + F + Immediate Fixes**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| Capability Contribution Score (Component 13) | `capability-contribution.js`, `weighted-composite.js` | ~200 |
| Stage 3 capability hard-rule | `stage-03.js` | ~30 |
| Financial Data Contract | `financial-contract.js`, migration | ~300 |
| Financial contract integration (Stages 5, 7, 12, 16) | 4 stage templates | ~120 |
| ROI bands inversion fix | `stage-05-financial-model.js` | ~10 |
| Date injection fix | All analysis-steps (template change) | ~50 |
| Kill-decision propagation | `stage-execution-engine.js` | ~40 |
| Gate block enforcement | `eva-orchestrator.js` | ~30 |
| Stage 24 prompt fix (include Stage 23 outcome) | `stage-24-*.js` | ~20 |
| **Total** | | **~800** |

### Phase 2: Identity & Documentation (3-4 weeks)
**Child A + G**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| Stage 10 redesign (Customer & Brand Foundation) | template + analysis step | ~400 |
| Stage 11 redesign (Naming & Visual Identity) | template + analysis step | ~350 |
| Stage 12 redesign (GTM & Sales) | template + analysis step | ~350 |
| Stage contracts update (10-12 consume/produce) | `stage-contracts.yaml` | ~80 |
| Full 25-stage documentation rewrite | 25 doc files | ~2000 (docs) |
| **Total** | | **~3180** |

### Phase 3: Build Loop & Worker (3-4 weeks)
**Child C + D**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| Stage 19-21 redesign (real data from venture_stage_work) | 3 templates + 3 analysis steps | ~600 |
| Stage execution worker | `stage-execution-worker.js` | ~400 |
| Worker gate-pause logic | Worker + chairman_decisions query | ~100 |
| Worker configuration/startup | Config + startup script | ~80 |
| Integration with lifecycle-sd-bridge (wait for SDs) | `eva-orchestrator.js` | ~100 |
| **Total** | | **~1280** |

### Phase 4: Launch Phase (2-3 weeks)
**Child B + J**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| Stage 23 redesign (Marketing Preparation) | template + analysis step | ~300 |
| Stage 24 redesign (Launch Readiness) | template + analysis step | ~250 |
| Stage 25 redesign (Launch Execution) | template + analysis step | ~300 |
| Stage 23/24/25 renderers (3 new components) | 3 .tsx files | ~600 |
| Launch Progress Timeline component | `LaunchProgressTimeline.tsx` | ~200 |
| Launch Progress Page | `LaunchProgressPage.tsx` | ~150 |
| **Total** | | **~1800** |

### Phase 5: GUI Integration (3-4 weeks)
**Child H + K**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| 7 Tier 1 gate renderers (3, 5, 10, 11, 17, 22, 24) | 7 .tsx files | ~1400 |
| GateRendererRouter update | 1 .tsx file | ~40 |
| Customer Intelligence → Stage 10 wiring | 4 component modifications | ~200 |
| Brand Genome Wizard → Stage 11 wiring | 2 component modifications | ~150 |
| GTM Dashboard → Stage 12 wiring | 4 component modifications | ~200 |
| Content Forge → Stage 23 wiring | 1 component modification | ~80 |
| Capability Registry Page | 1 new page | ~300 |
| **Total** | | **~2370** |

### Phase 6: Operations (4-5 weeks)
**Child I**

| Deliverable | Files | Est. LOC |
|-------------|-------|----------|
| 4 new database tables + migrations | SQL migrations | ~100 |
| VentureOperationsPage + Detail | 2 page components | ~400 |
| 5 operation tab components | 5 .tsx files | ~750 |
| Chairman nav update + routes | 2 files | ~40 |
| Financial Sync worker | `financial-sync.js` | ~250 |
| CS Agent worker | `cs-agent.js` | ~300 |
| Feedback Classifier worker | `feedback-classifier.js` | ~200 |
| Metrics Collector worker | `metrics-collector.js` | ~200 |
| Health Scorer worker | `health-scorer.js` | ~200 |
| Enhancement Detector worker | `enhancement-detector.js` | ~250 |
| **Total** | | **~2690** |

### Grand Total: ~12,120 LOC across 6 phases, ~70 files

## Testing Strategy

### Unit Tests (per phase)

Each new module gets Vitest unit tests in `test/unit/`:

- **Financial contract**: Validate consistency checks, deviation detection, refinement history
- **Capability contribution**: Score calculation, hard-rule enforcement, normalization
- **Stage templates (10-12, 23-25)**: Schema validation, output shape, fallback handling
- **Stage execution worker**: Polling logic, gate detection, kill-decision check, advancement logic
- **Operations workers**: Data transformation, alert thresholds, health scoring formula

Target: 80%+ coverage on new code.

### Integration Tests

- **Cross-stage contract validation**: Feed Stage 5 output into Stage 7, 12, 16 — verify financial contract enforced
- **Kill-decision propagation**: Issue kill at Stage 3, verify stages 4-16 do not execute
- **Build loop real data**: Create mock SDs, write completion to venture_stage_work, verify Stages 19-22 read it
- **Lifecycle-sd-bridge**: Verify Stage 18 output creates proper orchestrator + child SDs
- **Pipeline-to-GUI data flow**: Stage 10 output → venture_artifacts → Customer Intelligence query returns expected shape

### E2E Tests

- **Full evaluation pipeline (Stages 0-17)**: Run with mock LLM, verify all stages complete, financial consistency holds, capability scores propagate
- **Stage execution worker**: Start worker, insert a venture at stage 1, verify it auto-advances to Stage 3 (gate pause)
- **Gate workflow**: Worker pauses at Stage 3, simulate chairman approve, verify worker resumes to Stage 5

### Regression Protection

- Existing Stage 0 E2E test (`scripts/test-stage0-e2e.js`) must continue passing
- Existing Stage 1 E2E test (`scripts/test-stage1-e2e.js`) must continue passing
- Existing unit tests (`npx vitest run`) must all pass before each phase ships

## Risk Mitigation

### Risk 1: Stage Template Redesign Breaks Existing Ventures
**Severity:** HIGH | **Likelihood:** Medium

Existing ventures have artifacts stored with old Stage 10-12 schemas. New templates produce different output shapes.

**Mitigation:**
- New schemas are additive — old `venture_artifacts` rows are untouched
- Stage templates check artifact version before consuming upstream data
- Old ventures (pre-redesign) continue using existing artifact data; new stage executions produce new-format artifacts
- No migration of existing artifact data required

### Risk 2: Build Loop Wait Times (Weeks/Months)
**Severity:** MEDIUM | **Likelihood:** High

Stages 18-22 with real SDs means the pipeline pauses for actual development time. Chairman may expect fast turnaround like evaluation stages.

**Mitigation:**
- Clear UI messaging: "Build in progress — 3/12 SDs complete (est. 6 weeks remaining)"
- Stage execution worker checks venture_stage_work periodically (not blocking-wait)
- Chairman can view real-time SD progress in the existing SD queue dashboard
- Build loop stages can be manually advanced by chairman if needed

### Risk 3: Financial Contract Too Strict
**Severity:** LOW | **Likelihood:** Medium

The ±20% refinement tolerance may be too tight for early-stage ventures with high uncertainty.

**Mitigation:**
- Contract stores refinement history with rationale for each change
- Stages can flag "intentional deviation" with explanation (shown to chairman)
- Tolerance is configurable per venture (start at ±20%, relax if needed)
- Contract is advisory warning, not hard block (unlike gate blocks)

### Risk 4: Operations Workers Require External Service Integration
**Severity:** HIGH | **Likelihood:** High

Financial Sync needs Stripe API. CS Agent needs customer communication channels. These are external dependencies.

**Mitigation:**
- Phase 6 (Operations) is last — all pipeline work ships first
- Workers are designed with data source abstraction — mock data sources for testing
- Financial Sync worker starts with manual data entry fallback (chairman inputs revenue)
- CS Agent starts with Universal Inbox only (no real-time chat) — expand later
- Each worker has a health check endpoint and graceful degradation

### Risk 5: Context Window Limits During Stage Analysis
**Severity:** MEDIUM | **Likelihood:** Medium

Stage 10 (customer personas + brand genome) and Stage 12 (GTM + sales) produce large output schemas. Combined with upstream context, this may exceed LLM context limits.

**Mitigation:**
- Analysis steps receive only the upstream data they need (selective context injection)
- Large upstream artifacts are summarized before injection into prompts
- Output schemas have field-level max lengths (already enforced in existing stages)
- If response truncated, fallback logic fills missing fields from upstream data (existing pattern)

### Risk 6: GateRendererRouter Bundle Size
**Severity:** LOW | **Likelihood:** Low

Adding 9 new renderer components could bloat the frontend bundle.

**Mitigation:**
- All renderers are lazy-loaded via `React.lazy()` + `Suspense`
- Only the renderer for the current stage is loaded
- Shared `StageRendererShell` component avoids duplication across renderers
