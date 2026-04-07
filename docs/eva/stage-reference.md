# EVA 26-Stage Pipeline Reference

> Authoritative reference for the EVA venture lifecycle pipeline.
> Source of truth: `lib/eva/stage-templates/` and `lib/eva/stage-execution-worker.js`

## Overview

The EVA pipeline processes ventures through 26 sequential stages organized into 6 lifecycle phases. Each stage has a defined purpose, input/output schema, analysis step, and optional chairman gate.

**Key concepts:**
- **Stages** are numbered 1-26 and execute sequentially
- **Phases** group stages by business function (6 phases)
- **Operating Modes** control the stage-execution-worker behavior (5 modes)
- **Chairman Gates** are decision points requiring human approval (blocking or advisory)
- **Kill Gates** can terminate a venture based on deterministic scoring
- **Promotion Gates** validate phase completion before advancing

---

## Pipeline Architecture

### Lifecycle Phases

| Phase | Name | Stages | Purpose |
|-------|------|--------|---------|
| 1 | THE TRUTH | 1-5 | Validation and market reality assessment |
| 2 | THE ENGINE | 6-9 | Business model and strategy foundation |
| 3 | THE IDENTITY | 10-12 | Brand, positioning, and go-to-market |
| 4 | THE BLUEPRINT | 13-17 | Technical architecture and specification |
| 5 | THE BUILD LOOP | 18-23 | Implementation and development cycle |
| 6 | LAUNCH & LEARN | 24-26 | Deployment, analytics, and optimization |

### Operating Modes (Stage Execution Worker)

The stage-execution-worker uses 5 operating modes for processing control:

| Mode | Stage Range | Description |
|------|-------------|-------------|
| EVALUATION | 1-5 | Idea validation and kill decisions |
| STRATEGY | 6-12 | Business model and brand strategy |
| PLANNING | 13-17 | Technical planning and architecture |
| BUILD | 18-22 | Implementation and QA |
| LAUNCH | 23-26 | Release, marketing, and go-live |

### Chairman Gates

| Stage | Type | Behavior |
|-------|------|----------|
| 3 | **BLOCKING** | Pipeline halts until chairman approves/kills |
| 5 | ADVISORY | Notification sent, pipeline continues |
| 10 | **BLOCKING** | Pipeline halts until chairman approves/kills |
| 22 | **BLOCKING** | Pipeline halts until chairman approves/kills |
| 23 | ADVISORY | Notification sent, pipeline continues |
| 24 | **BLOCKING** | Pipeline halts until chairman approves/kills |

**Decision outcomes:** `approve` (continue), `kill` (terminate venture), `pivot` (re-route to earlier stage)

### Stage Dependency Graph

```
Stage 1 (Idea Capture)
  └─> Stage 2 (Idea Analysis) [requires: 1]
       └─> Stage 3 (Kill Gate) [requires: 1, 2] ── CHAIRMAN BLOCKING
            └─> Stage 4 (Competitive Landscape) [requires: 3]
                 └─> Stage 5 (Financial Kill Gate) [requires: 1, 3, 4] ── CHAIRMAN ADVISORY
                      └─> Stage 6 (Risk Assessment) [requires: 5]
                           └─> Stage 7 (Revenue Architecture) [requires: 5, 6]
                                └─> Stage 8 (Business Model Canvas) [requires: 7]
                                     └─> Stage 9 (Exit Strategy) [requires: 6, 7, 8]

Stage 10 (Customer & Brand) [Phase 3 entry] ── CHAIRMAN BLOCKING
  └─> Stage 11 (Naming & Visual Identity) [requires: 10]
       └─> Stage 12 (GTM & Sales) [requires: 10, 11]

Stage 13 (Product Roadmap) [Phase 4 entry]
  └─> Stage 14 (Technical Architecture) [requires: 13]
       └─> Stage 15 (Design Studio) [requires: 13, 14]
            └─> Stage 16 (Financial Projections) [requires: 13, 14, 15]

Stage 17 (Pre-Build Checklist) [Phase 5 entry]
  └─> Stage 18 (Sprint Planning) [requires: 17]
       └─> Stage 19 (Build Execution) [requires: 18]
            └─> Stage 20 (Quality Assurance) [requires: 19]
                 └─> Stage 21 (Build Review) [requires: 20]
                      └─> Stage 22 (Release Readiness) [requires: 17-21] ── CHAIRMAN BLOCKING

Stage 23 (Marketing Preparation) [requires: 22] ── CHAIRMAN ADVISORY
  └─> Stage 24 (Launch Readiness) [requires: 22, 23] ── CHAIRMAN BLOCKING
       └─> Stage 25 (Launch Execution) [requires: 24]
```

---

## Stage Reference

### Phase 1: THE TRUTH (Stages 1-5)

#### Stage 1: Idea Capture

| Property | Value |
|----------|-------|
| **Work Type** | Draft idea hydration with 7 core fields |
| **Requires** | None (pipeline start) |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-01-hydration.js` |

**Output Schema:**
- `description` (string, required) - Idea description
- `problemStatement` (string, required) - Problem being solved
- `valueProp` (string, required) - Value proposition
- `targetMarket` (string, required) - Target market
- `archetype` (enum, required) - Venture archetype
- `keyAssumptions` (array) - Key assumptions
- `moatStrategy` (string) - Competitive moat
- `successCriteria` (array) - Success criteria

**Derived:** `sourceProvenance`

**Exports:** `ARCHETYPES`

---

#### Stage 2: Idea Analysis

| Property | Value |
|----------|-------|
| **Work Type** | MoA (Mixture of Agents) multi-persona scoring |
| **Requires** | Stage 1 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-02-multi-persona.js` |

**Output Schema:**
- `analysis` (object, required) - Strategic, technical, tactical perspectives
- `metrics` (object, required) - 7 scores (0-100): marketFit, customerNeed, momentum, revenuePotential, competitiveBarrier, executionFeasibility, designQuality
- `evidence` (object) - Domain-specific evidence packs

**Exports:** `METRIC_NAMES`

---

#### Stage 3: Kill Gate (Validation)

| Property | Value |
|----------|-------|
| **Work Type** | Hybrid scoring (50% deterministic + 50% AI calibration) |
| **Requires** | Stages 1, 2 |
| **Chairman Gate** | **BLOCKING** |
| **Analysis Step** | `stage-03-hybrid-scoring.js` |

**Output Schema:**
- 7 core metrics (0-100 integers)
- `competitorEntities` (array) - name, positioning, threat_level
- `confidenceScores` (object)

**Derived:** `overallScore`, `rollupDimensions`, `decision`, `blockProgression`, `reasons`

**Gate Decision Logic:**

| Outcome | Condition |
|---------|-----------|
| PASS | overallScore >= 70 AND all metrics >= 50 |
| REVISE | overallScore >= 50 AND < 70, no metric < 50 (re-routes to Stage 2) |
| KILL | overallScore < 50 OR any metric < 50 |

**Exports:** `METRICS`, `PASS_THRESHOLD`, `REVISE_THRESHOLD`, `METRIC_THRESHOLD`, `THREAT_LEVELS`

---

#### Stage 4: Competitive Landscape

| Property | Value |
|----------|-------|
| **Work Type** | Competitive analysis with SWOT per competitor |
| **Requires** | Stage 3 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-04-competitive-landscape.js` |

**Output Schema:**
- `competitors` (array) - name, position, threat (H/M/L), pricingModel, strengths, weaknesses, SWOT
- `stage5Handoff` (object) - pricingLandscape, competitivePositioning, marketGaps

**Exports:** `THREAT_LEVELS`, `PRICING_MODELS`

---

#### Stage 5: Kill Gate (Financial)

| Property | Value |
|----------|-------|
| **Work Type** | Financial model with unit economics and scenario analysis |
| **Requires** | Stages 1, 3, 4 |
| **Chairman Gate** | ADVISORY |
| **Analysis Step** | `stage-05-financial-model.js` |

**Output Schema:**
- `initialInvestment` (number)
- `year1`, `year2`, `year3` (objects) - revenue, cogs, opex
- `unitEconomics` (object) - cac, ltv, churnRate, paybackMonths, grossMargin
- `assumptions` (object)

**Gate Decision Logic (Banded ROI):**

| Outcome | Condition |
|---------|-----------|
| PASS | roi3y >= 0.25 AND breakEvenMonth <= 24 AND ltvCacRatio >= 2 AND paybackMonths <= 18 |
| CONDITIONAL_PASS | 0.15 <= roi3y < 0.25 AND ltvCacRatio >= 3 AND paybackMonths <= 12 (Chairman Review) |
| KILL | roi3y < 0.15 OR breakEvenMonth > 24 OR breakEvenMonth === null |

---

### Phase 2: THE ENGINE (Stages 6-9)

#### Stage 6: Risk Assessment

| Property | Value |
|----------|-------|
| **Work Type** | Structured risk register with scoring and mitigation |
| **Requires** | Stage 5 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-06-risk-matrix.js` |

**Output Schema:**
- `risks` (array) - id, category (Market/Product/Technical/Legal/Financial/Operational), severity (1-5), probability (1-5), impact (1-5), mitigation, owner, status, residual scores

**Derived:** `aggregate_risk_score`, `normalized_risk_score`, `highest_risk_factor`, `mitigation_coverage_pct`

**Exports:** `RISK_CATEGORIES`, `RISK_STATUSES`

---

#### Stage 7: Revenue Architecture

| Property | Value |
|----------|-------|
| **Work Type** | Pricing tier structure with unit economics |
| **Requires** | Stages 5, 6 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-07-pricing-strategy.js` |

**Output Schema:**
- `currency` (string)
- `pricing_model` (enum) - subscription/usage_based/tiered/freemium/enterprise/marketplace
- `tiers` (array) - name, price, billing_period (monthly/quarterly/annual), target_segment
- `gross_margin_pct`, `churn_rate_monthly`, `cac`, `arpa` (numbers)

**Derived:** `positioningDecision`, `ltv`, `cac_ltv_ratio`, `payback_months`, `warnings`

**Exports:** `BILLING_PERIODS`, `PRICING_MODELS`

---

#### Stage 8: Business Model Canvas

| Property | Value |
|----------|-------|
| **Work Type** | All 9 BMC blocks population |
| **Requires** | Stage 7 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-08-bmc-generation.js` |

**Output Schema (9 BMC blocks):**

| Block | Min Items |
|-------|-----------|
| customerSegments | 2 |
| valuePropositions | 2 |
| channels | 2 |
| customerRelationships | 2 |
| revenueStreams | 2 |
| keyResources | 2 |
| keyActivities | 2 |
| keyPartnerships | 1 |
| costStructure | 2 |

Each block: `items` array with text, priority (1-3), optional evidence.

**Exports:** `BMC_BLOCKS`, `MIN_ITEMS`, `DEFAULT_MIN_ITEMS`

---

#### Stage 9: Exit Strategy

| Property | Value |
|----------|-------|
| **Work Type** | Exit thesis, valuation estimation, reality gate |
| **Requires** | Stages 6, 7, 8 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-09-exit-strategy.js` |

**Output Schema:**
- `exit_thesis` (string, >= 20 chars)
- `exit_horizon_months` (1-120)
- `exit_paths` (array)
- `target_acquirers` (array, min 3) - name, rationale, fit_score (1-5)
- `milestones` (array) - date, success_criteria

**Reality Gate (validates Phase 2 completeness):**
- Stage 6: >= 10 risks captured
- Stage 7: >= 1 tier with non-null LTV and payback
- Stage 8: All 9 BMC blocks populated

**Exports:** `MIN_RISKS`, `MIN_ACQUIRERS`

---

### Phase 3: THE IDENTITY (Stages 10-12)

#### Stage 10: Customer & Brand Foundation

| Property | Value |
|----------|-------|
| **Work Type** | Persona definition + brand genome grounding |
| **Requires** | None (Phase 3 entry) |
| **Chairman Gate** | **BLOCKING** |
| **Analysis Step** | `stage-10-naming-brand.js` / `stage-10-customer-brand.js` |

**Output Schema:**
- `customerPersonas` (array, min 3) - name, demographics, goals, painPoints, behaviors, motivations
- `brandGenome` (object, required) - archetype, values, tone, audience, differentiators, customerAlignment
- `brandPersonality` (object) - vision, mission, brandVoice
- `candidates` (array, min 5) - name, rationale, scores
- `namingStrategy` (enum) - descriptive/abstract/acronym/founder/metaphorical

**Derived:** `personaCoverageScore`, `ranked_candidates`, `decision`, `chairmanGate`

**Exports:** `MIN_PERSONAS`, `ARCHETYPES`, `NAMING_STRATEGIES`, `BRAND_GENOME_KEYS`

---

#### Stage 11: Naming & Visual Identity

| Property | Value |
|----------|-------|
| **Work Type** | Name candidate evaluation + visual identity guidelines |
| **Requires** | Stage 10 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-11-gtm.js` / `stage-11-visual-identity.js` |

**Output Schema:**
- `namingStrategy` (object) - approach, rationale
- `scoringCriteria` (array) - name, weight (0-100, sum must = 100)
- `candidates` (array, min 5) - name, rationale, scores, personaFit
- `visualIdentity` (object) - colorPalette, typography, imageryGuidance
- `brandExpression` (object) - tagline, elevator_pitch, messaging_pillars

**Exports:** `MIN_CANDIDATES`, `WEIGHT_SUM`, `NAMING_STRATEGIES`

---

#### Stage 12: GTM & Sales Strategy

| Property | Value |
|----------|-------|
| **Work Type** | Combined GTM + sales strategy with dual-gate design |
| **Requires** | Stages 10, 11 |
| **Chairman Gate** | None (dual-gate at phase boundary) |
| **Analysis Step** | `stage-12-sales-logic.js` / `stage-12-gtm-sales.js` |

**Output Schema:**
- `marketTiers` (array, exactly 3) - name, description, persona, TAM, SAM, SOM
- `channels` (array, exactly 8) - name, channelType (paid/organic/earned/owned), budget, cac, kpi
- `salesModel` (enum) - self-serve/inside-sales/enterprise/hybrid/marketplace/channel
- `deal_stages` (array, min 3)
- `funnel_stages` (array, min 4)
- `customer_journey` (array, min 5)

**Dual-Gate Pattern (12 -> 13 boundary):**
1. LOCAL gate: data completeness across Stages 10-12
2. SYSTEM gate (reality-gates.js): artifact existence validation

**Exports:** `SALES_MODELS`, `CHANNEL_TYPES`, `REQUIRED_TIERS`, `REQUIRED_CHANNELS`

---

### Phase 4: THE BLUEPRINT (Stages 13-17)

#### Stage 13: Product Roadmap

| Property | Value |
|----------|-------|
| **Work Type** | Roadmap with deterministic kill gate |
| **Requires** | None (Phase 4 entry) |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-13-product-roadmap.js` |

**Output Schema:**
- `vision_statement` (string, >= 20 chars)
- `milestones` (array, min 3) - name, date, deliverables (min 1 each), dependencies, priority
- `phases` (array, min 1) - name, start_date, end_date

**Kill Gate Logic:**
- Kill if < 3 milestones
- Kill if any milestone missing name, date, or deliverables
- Kill if timeline_months < 3
- Kill if no milestone has priority = 'now'

**Exports:** `MIN_MILESTONES`, `MIN_TIMELINE_MONTHS`, `MIN_DELIVERABLES_PER_MILESTONE`

---

#### Stage 14: Technical Architecture

| Property | Value |
|----------|-------|
| **Work Type** | 5-layer architecture definition with security |
| **Requires** | Stage 13 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-14-technical-architecture.js` |

**Output Schema:**
- `architecture_summary` (string, >= 20 chars)
- `layers` (object, all 5 required):
  - `presentation` - technology, components, rationale
  - `api` - technology, components, rationale
  - `business_logic` - technology, components, rationale
  - `data` - technology, components, rationale
  - `infrastructure` - technology, components, rationale
- `security` (object) - authStrategy, dataClassification, complianceRequirements
- `dataEntities` (array, min 1) - name, description, relationships, estimatedVolume
- `integration_points` (array, min 1) - name, source_layer, target_layer, protocol
- `constraints` (array) - name, description, category (performance/security/compliance/operational)

**Exports:** `REQUIRED_LAYERS`, `MIN_INTEGRATION_POINTS`, `MIN_DATA_ENTITIES`, `CONSTRAINT_CATEGORIES`

---

#### Stage 15: Design Studio

| Property | Value |
|----------|-------|
| **Work Type** | Wireframe generation + UI/UX design exploration |
| **Requires** | Stages 13, 14 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-15.js` (slug: `design-studio`) |

**Output Schema:**
- `wireframes` (array) - component wireframes and UI layout designs
- `design_decisions` - UI/UX rationale and component planning

**Derived:** `wireframe_count`, `component_coverage`

---

#### Stage 16: Financial Projections

| Property | Value |
|----------|-------|
| **Work Type** | 6+ month revenue/cost projections with promotion gate |
| **Requires** | Stages 13, 14, 15 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-16-financial-projections.js` |

**Output Schema:**
- `initial_capital` (number)
- `monthly_burn_rate` (number)
- `revenue_projections` (array, min 6 months) - month, revenue, costs, cost_breakdown (personnel/infrastructure/marketing/other)
- `funding_rounds` (array) - round_name, target_amount, target_date

**Promotion Gate (Phase 4 -> 5):**
- Stage 13: >= 3 milestones with deliverables, kill gate passed
- Stage 14: All 5 architecture layers defined
- Stage 15: Design Studio wireframes generated
- Stage 16: Positive runway and defined projections

**Derived:** `runway_months`, `burn_rate`, `break_even_month`, `total_projected_revenue/costs`, `pnl`, `cash_balance_end`, `viability_warnings`

**Exports:** `MIN_PROJECTION_MONTHS`

---

### Phase 5: THE BUILD LOOP (Stages 18-23)

#### Stage 17: Pre-Build Checklist

| Property | Value |
|----------|-------|
| **Work Type** | Readiness checklist across 5 categories |
| **Requires** | None (Phase 5 entry) |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-17-build-readiness.js` |

**Output Schema:**
- `checklist` (object, 5 categories):
  - `architecture` - items array
  - `team_readiness` - items array
  - `tooling` - items array
  - `environment` - items array
  - `dependencies` - items array
- Each item: name, status (not_started/in_progress/complete/blocked), owner, notes
- `blockers` (array) - description, severity (critical/high/medium/low), mitigation

**Derived:** `total_items`, `completed_items`, `readiness_pct`, `blocker_count`, `buildReadiness`

**Exports:** `CHECKLIST_CATEGORIES`, `ITEM_STATUSES`, `SEVERITY_LEVELS`, `BUILD_READINESS_DECISIONS`

---

#### Stage 18: Sprint Planning

| Property | Value |
|----------|-------|
| **Work Type** | Sprint definition + SD bridge for lifecycle-to-SD mapping |
| **Requires** | Stage 17 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-18-sprint-planning.js` |

**Output Schema:**
- `sprint_name` (string)
- `sprint_duration_days` (1-30)
- `sprint_goal` (string, >= 10 chars)
- `items` (array, min 1) - title, description, priority, type (feature/bugfix/enhancement/refactor/infra), scope, success_criteria, dependencies, risks, target_application, story_points, architectureLayer, milestoneRef

**SD Bridge:** Generates `sd_bridge_payloads` for creating Strategic Directives from sprint items.

**Exports:** `PRIORITY_VALUES`, `SD_TYPES`, `SD_BRIDGE_REQUIRED_FIELDS`

---

#### Stage 19: Build Execution

| Property | Value |
|----------|-------|
| **Work Type** | Sprint task tracking + issue management |
| **Requires** | Stage 18 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-19-build-execution.js` |

**Output Schema:**
- `tasks` (array, min 1) - name, status (pending/in_progress/done/blocked), assignee, sprint_item_ref
- `issues` (array) - description, severity (critical/high/medium/low), status (open/investigating/resolved/deferred)

**Derived:** `total_tasks`, `completed_tasks`, `blocked_tasks`, `completion_pct`, `sprintCompletion`

**Exports:** `TASK_STATUSES`, `ISSUE_SEVERITIES`, `ISSUE_STATUSES`, `SPRINT_COMPLETION_DECISIONS`

---

#### Stage 20: Quality Assurance

| Property | Value |
|----------|-------|
| **Work Type** | Test suite results + defect tracking + quality gate |
| **Requires** | Stage 19 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-20-quality-assurance.js` |

**Output Schema:**
- `test_suites` (array, min 1) - name, type (unit/integration/e2e), total_tests, passing_tests, coverage_pct
- `known_defects` (array) - description, severity, status (open/investigating/resolved/deferred/wont_fix)

**Derived:** `overall_pass_rate`, `coverage_pct`, `critical_failures`, `quality_gate_passed`, `qualityDecision`

**Exports:** `DEFECT_SEVERITIES`, `DEFECT_STATUSES`, `MIN_TEST_SUITES`, `MIN_COVERAGE_PCT`, `TEST_SUITE_TYPES`, `QUALITY_DECISIONS`

---

#### Stage 21: Build Review

| Property | Value |
|----------|-------|
| **Work Type** | Cross-system integration validation |
| **Requires** | Stage 20 |
| **Chairman Gate** | None |
| **Analysis Step** | `stage-21-build-review.js` |

**Output Schema:**
- `integrations` (array, min 1) - name, source, target, status (pass/fail/skip/pending), error_message
- `environment` (string, required)

**Derived:** `total_integrations`, `passing_integrations`, `failing_integrations`, `pass_rate`, `reviewDecision`

**Exports:** `INTEGRATION_STATUSES`, `REVIEW_DECISIONS`, `MIN_INTEGRATIONS`

---

#### Stage 22: Release Readiness

| Property | Value |
|----------|-------|
| **Work Type** | Release approval + promotion gate to LAUNCH phase |
| **Requires** | Stages 17-21 |
| **Chairman Gate** | **BLOCKING** |
| **Analysis Step** | `stage-22-release-readiness.js` |

**Output Schema:**
- `release_items` (array, min 1) - name, category (feature/bugfix/infrastructure/documentation/security/performance/configuration), status (pending/approved/rejected), approver
- `release_notes` (string, >= 10 chars)
- `target_date` (string)
- `sprintRetrospective` (object) - wentWell, wentPoorly, actionItems
- `sprintSummary` (object) - sprintGoal, itemsPlanned, itemsCompleted, qualityAssessment, integrationStatus
- `chairmanGate` (object) - status, rationale, decision_id

**Promotion Gate (Phase 5 -> 6):**
- Stage 17: buildReadiness.decision in {go, conditional_go}
- Stage 18: >= 1 sprint item
- Stage 19: sprintCompletion.decision in {complete, continue} AND no critical blockers
- Stage 20: qualityDecision.decision in {pass, conditional_pass}
- Stage 21: reviewDecision.decision in {approve, conditional}
- Stage 22: releaseDecision.decision = 'release'

**Exports:** `APPROVAL_STATUSES`, `RELEASE_CATEGORIES`, `RELEASE_DECISIONS`, `MIN_RELEASE_ITEMS`

---

### Phase 6: LAUNCH & LEARN (Stages 24-26)

#### Stage 23: Marketing Preparation

| Property | Value |
|----------|-------|
| **Work Type** | Marketing collateral + SD bridge for marketing SDs |
| **Requires** | Stage 22 release confirmed |
| **Chairman Gate** | ADVISORY |
| **Analysis Step** | `stage-23-launch-execution.js` |

**Output Schema:**
- `marketing_items` (array, min 3) - title, description, type (landing_page/social_media_campaign/press_release/email_campaign/content_blog/video_promo/ad_creative/product_demo/case_study/launch_announcement), priority (critical/high/medium/low)
- `sd_bridge_payloads` (array) - title, type, description, scope
- `marketing_strategy_summary` (string)
- `target_audience` (string)

**Derived:** `marketing_readiness_pct`, `total_marketing_items`, `sds_created_count`

**Exports:** `MARKETING_ITEM_TYPES`, `MARKETING_PRIORITIES`, `MIN_MARKETING_ITEMS`

---

#### Stage 24: Launch Readiness

| Property | Value |
|----------|-------|
| **Work Type** | Go/no-go launch decision gate with operational readiness |
| **Requires** | Stages 22, 23 |
| **Chairman Gate** | **BLOCKING** |
| **Analysis Step** | `stage-24-metrics-learning.js` |

**Output Schema:**
- `readiness_checklist` (object, 4 keys):

| Check | Weight |
|-------|--------|
| release_confirmed | 0.35 |
| marketing_complete | 0.25 |
| monitoring_ready | 0.20 |
| rollback_plan_exists | 0.20 |

Each: status (pass/fail/pending/waived), evidence, verified_at

- `go_no_go_decision` (enum) - go/no_go/conditional_go
- `decision_rationale` (string, >= 10 chars)
- `incident_response_plan` (string, >= 10 chars)
- `monitoring_setup` (string, >= 10 chars)
- `rollback_plan` (string, >= 10 chars)
- `launch_risks` (array) - risk, severity, mitigation
- `chairmanGate` (object) - status, rationale, decision_id

**Derived:** `readiness_score`, `all_checks_pass`, `blocking_items`

**Exports:** `GO_NO_GO_DECISIONS`, `READINESS_CHECKLIST_KEYS`, `CHECKLIST_WEIGHTS`

---

#### Stage 25: Launch Execution

| Property | Value |
|----------|-------|
| **Work Type** | Pipeline terminus - go-live + operations handoff |
| **Requires** | Stage 24 chairman approval |
| **Chairman Gate** | None (Stage 24 gates entry) |
| **Analysis Step** | `stage-25-venture-review.js` |

**Output Schema:**
- `distribution_channels` (array, min 1) - name, type, status (inactive/activating/active/failed/paused), activation_date, metrics_endpoint
- `operations_handoff` (object, required):
  - `monitoring` - dashboards, alerts, health_check_url
  - `escalation` - contacts, runbook_url, sla_targets
  - `maintenance` - schedule, backup_strategy, update_policy
- `launch_summary` (string, >= 10 chars)
- `go_live_timestamp` (string)

**Pipeline Terminus:** Sets `ventures.pipeline_mode` to `operations`.

**Exports:** `CHANNEL_STATUSES`, `PIPELINE_MODES`, `ESCALATION_LEVELS`, `MIN_DISTRIBUTION_CHANNELS`

---

## Cross-Stage Contracts

### Data Flow Between Stages

| From | To | Data Contract |
|------|----|---------------|
| 1 | 2 | Idea description, problem statement, value prop, archetype |
| 2 | 3 | 7 pre-scores (metrics object), analysis perspectives |
| 3 | 4 | Validated metrics, competitor entities, gate decision |
| 4 | 5 | Pricing landscape, competitive positioning, market gaps |
| 5 | 6 | Financial model, unit economics, viability assessment |
| 6 | 7 | Risk register, aggregate risk score |
| 7 | 8 | Pricing tiers, unit economics, revenue model |
| 8 | 9 | BMC blocks, business model structure |
| 10 | 11 | Customer personas, brand genome, naming candidates |
| 11 | 12 | Naming decision, visual identity, brand expression |
| 13 | 14 | Roadmap milestones, vision statement |
| 14 | 15 | Architecture layers, integration points, data entities |
| 15 | 16 | Risk register, severity breakdown |
| 17 | 18 | Build readiness checklist, blocker assessment |
| 18 | 19 | Sprint items, SD bridge payloads |
| 19 | 20 | Task completion data, issue list |
| 20 | 21 | Test results, quality gate decision |
| 21 | 22 | Integration test results, review decision |
| 22 | 23 | Release approval, sprint retrospective |
| 23 | 24 | Marketing readiness, marketing SDs |
| 24 | 25 | Go/no-go decision, operational readiness |

---

## Golden Nuggets Integration

Three cross-cutting features integrated across stages:

### 1. Assumptions vs Reality
- **Create:** Stages 2, 3 (Assumption Set V1)
- **Update:** Stage 5 (financial inputs)
- **Reality:** Stages 23, 24, 25 (collect reality data, generate report)

### 2. Token Budget Profiles
Treats compute/tokens as capital with explicit budgets:

| Profile | Token Budget | Use Case |
|---------|-------------|----------|
| Exploratory | 75,000 | Quick validation, kill fast |
| Standard | 375,000 | Normal venture progression |
| Deep Due Diligence | 1,500,000 | High-stakes, complex markets |
| Custom | Chairman override | User-defined |

**Standard allocation:** THE TRUTH 25%, THE ENGINE 15%, THE IDENTITY 10%, THE BLUEPRINT 20%, THE BUILD LOOP 20%, LAUNCH & LEARN 10%

### 3. Four Buckets (Epistemic Classification)

| Bucket | Definition |
|--------|------------|
| Facts | Statements with traceable sources |
| Assumptions | Beliefs about market/users (must reference assumption_set_id) |
| Simulations | Outputs from venture sims (must reference simulation_run_id) |
| Unknowns | Gaps deliberately not filled (must state resolution requirements) |

**Required at decision gates:** Stages 3, 5, 16

---

## API Surface

### Stage Templates (`lib/eva/stage-templates/`)

Each stage template exports:
- **default** - Template object with `id`, `slug`, `title`, `version`, `schema`, `defaultData`, `validate()`, `computeDerived()`, `outputSchema`, `analysisStep`
- **Named exports** - Stage-specific constants (see per-stage documentation above)

### Stage Registry (`lib/eva/stage-registry.js`)

```javascript
import { StageRegistry } from './stage-registry.js';

const registry = new StageRegistry(supabase);
const template = await registry.getTemplate(stageNumber);
// Returns template with 5-minute TTL cache
// Falls back to file-based templates if DB unavailable
```

### Stage Execution Engine (`lib/eva/stage-execution-engine.js`)

```javascript
import { executeStage } from './stage-execution-engine.js';

const result = await executeStage({
  stageNumber,
  ventureId,
  supabase,
  logger,
  signal,       // AbortSignal for cancellation
});
// Returns: { stageNumber, ventureId, persisted, artifactId, latencyMs, validation }
```

Key functions:
- `executeStage(options)` - Execute a single stage
- `loadStageTemplate(stageNumber)` - Load template from registry or file
- `fetchUpstreamArtifacts(supabase, ventureId, requiredStages)` - Get upstream data
- `validateOutput(output, template)` - Schema validation
- `persistArtifact(supabase, ventureId, stageNumber, data)` - Save artifact

### Stage Execution Worker (`lib/eva/stage-execution-worker.js`)

```javascript
import { StageExecutionWorker } from './stage-execution-worker.js';

const worker = new StageExecutionWorker({
  supabase,
  logger,
  pollIntervalMs: 30_000,  // default
  maxRetries: 2,            // default
});

worker.start();  // Begin polling for pending ventures
worker.stop();   // Stop and abort all active ventures
```

Key exports:
- `StageExecutionWorker` - Main worker class
- `CHAIRMAN_GATES` - `{ BLOCKING: [3, 10, 22, 24], ADVISORY: [5, 23] }`
- `OPERATING_MODES` - Stage range to mode mapping
- `getOperatingMode(stageNumber)` - Returns mode for a stage

### Analysis Steps (`lib/eva/stage-templates/analysis-steps/`)

Each analysis step is an async function:

```javascript
import { analyzeStage01 } from './analysis-steps/index.js';

const result = await analyzeStage01({
  ventureId,
  upstreamData,
  supabase,
  logger,
});
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Stages | 26 |
| Lifecycle Phases | 6 |
| Operating Modes | 5 |
| Blocking Chairman Gates | 4 (stages 3, 10, 22, 24) |
| Advisory Chairman Gates | 2 (stages 5, 23) |
| Deterministic Kill Gates | 3 (stages 3, 5, 13) |
| Reality Gates | 1 (stage 9) |
| Promotion Gates | 2 (stages 16, 22) |
| Analysis Step Functions | 26 |
| Stage Template Files | 26 |

---

*Generated for SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-G*
*Source files: `lib/eva/stage-templates/`, `lib/eva/stage-execution-worker.js`, `docs/guides/workflow/stages_v2.yaml`*
