# Wireframe Specifications: 25 Stage View Templates

> SD: SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-E
> PRD: Wireframe Specifications for 25 Stage View Templates
> Target: EHG App — `src/components/stages/`
> Props: `StageRendererProps { stageData: StageDisplayData, venture: VentureDetail, className? }`

## Stage-to-Template Mapping

| Stage | Name | Template | Gate Type |
|-------|------|----------|-----------|
| 1 | Draft Idea | Simple Content | — |
| 2 | AI Review & Idea Analysis | Simple Content | — |
| 3 | Kill Gate: Idea Viability | Gate Decision | kill |
| 4 | Competitive Intelligence | Simple Content | — |
| 5 | Kill Gate: Unit Economics | Gate Decision | kill |
| 6 | Risk Evaluation | Analytics/Scoring | — |
| 7 | Revenue Architecture | Analytics/Scoring | — |
| 8 | Business Model Canvas | Structured Canvas | — |
| 9 | Exit Strategy | Structured Canvas | — |
| 10 | Customer & Brand Genome | Structured Canvas | — |
| 11 | GTM Strategy | Structured Canvas | — |
| 12 | Sales & Success Model | Structured Canvas | — |
| 13 | Kill Gate: Product Roadmap | Gate Decision | kill |
| 14 | Data Architecture | Structured Canvas | — |
| 15 | Epic Breakdown & Planning | Structured Canvas | — |
| 16 | Promotion Gate: Financial Projections | Gate Decision | promotion |
| 17 | Promotion Gate: Build Readiness | Gate Decision | promotion |
| 18 | MVP Development Loop | Progress/Pipeline | — |
| 19 | Integration & API Layer | Progress/Pipeline | — |
| 20 | QA & UAT | Analytics/Scoring | — |
| 21 | Integration Testing | Progress/Pipeline | — |
| 22 | Promotion Gate: Release Readiness | Gate Decision | promotion |
| 23 | Kill Gate: Post-Launch Operations | Gate Decision | kill |
| 24 | Analytics & Feedback | Analytics/Scoring | — |
| 25 | Optimization & Scale | Analytics/Scoring | — |

---

## Template 1: Simple Content Display

**Stages**: 1 (Draft Idea), 2 (AI Review), 4 (Competitive Intelligence)
**Shadcn Components**: Card, CardHeader, CardTitle, CardContent, Badge, Separator
**Icons**: FileText, Lightbulb, BarChart3, Paperclip

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [status badge] |
| Phase: {phaseName}                                              |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | Advisory Analysis                                          | |
| |------------------------------------------------------------| |
| | {advisoryData rendered as structured sections}             | |
| |                                                            | |
| | Each top-level key in advisoryData becomes a sub-section:  | |
| |                                                            | |
| | [key_name as title]                                        | |
| | value rendered by type:                                    | |
| |   string  -> paragraph text                               | |
| |   number  -> tabular-nums span                            | |
| |   boolean -> Badge (default/secondary)                     | |
| |   array   -> bulleted list                                 | |
| |   object  -> 2-col grid of key:value pairs                | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts ({artifacts.length})                             | |
| |------------------------------------------------------------| |
| | [type badge] {artifact.title}              v{version}      | |
| |   {artifact.content preview — first 200 chars}            | |
| | [type badge] {artifact.title}              v{version}      | |
| |   {artifact.content preview — first 200 chars}            | |
| +------------------------------------------------------------+ |
|                                                                 |
+================================================================+
```

### Data Mapping

| Section | StageDisplayData Field | Shadcn Component |
|---------|----------------------|------------------|
| Stage header | `stageData.stageName`, `stageData.stageNumber` | CardHeader + CardTitle |
| Status badge | `stageData.stageStatus` | Badge (variant by status) |
| Phase label | `stageData.phaseName` | text-muted-foreground span |
| Advisory sections | `stageData.advisoryData.*` | Card + nested grid/list |
| Artifacts list | `stageData.artifacts[]` | Card with list items |
| Artifact type | `artifact.artifactType` | Badge (outline) |
| Artifact version | `artifact.version` | text-sm span |

### Status Badge Variants

| stageStatus | Badge variant | Label |
|-------------|--------------|-------|
| pending | secondary | Pending |
| in_progress | default | In Progress |
| completed | default (green bg) | Completed |
| skipped | outline | Skipped |

### Empty State

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [Pending]      |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | No advisory data available yet.                            | |
| |                                                            | |
| | [muted icon] This stage hasn't been processed.             | |
| |              Data will appear once the AI advisory runs.   | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts (0)                                              | |
| |------------------------------------------------------------| |
| | No artifacts generated for this stage.                     | |
| +------------------------------------------------------------+ |
+================================================================+
```

### Per-Stage Advisory Data Keys

**Stage 1 (Draft Idea)**:
- `problem_statement` (string) -> paragraph
- `solution_approach` (string) -> paragraph
- `moat_strategy` (string) -> paragraph
- `portfolio_synergy_score` (number) -> score display
- `time_horizon_classification` (string) -> Badge
- `constraint_scores` (object) -> 2-col grid of check/x icons

**Stage 2 (AI Review & Idea Analysis)**:
- `scores` (object) -> ScoresPanel (score cards grid)
- `perspectives` (array) -> bulleted list with labels
- `analysis_summary` (string) -> paragraph
- `strengths` (array) -> green-tinted list
- `weaknesses` (array) -> red-tinted list
- `recommendations` (array) -> bulleted list

**Stage 4 (Competitive Intelligence)**:
- `competitors` (array) -> table with name, threat level, overlap
- `market_position` (string) -> paragraph
- `differentiation_factors` (array) -> bulleted list
- `competitive_advantages` (array) -> green-tinted list
- `competitive_risks` (array) -> amber-tinted list

---

## Template 2: Gate Decision View

**Stages**: 3, 5, 13, 23 (kill gates), 16, 17, 22 (promotion gates)
**Shadcn Components**: Card, Badge, Progress, Button, Alert, Separator
**Icons**: Shield, CheckCircle2, XCircle, AlertTriangle, Target, TrendingUp

```
+================================================================+
| [shield icon] {Gate Type}: Stage {N}             [status badge] |
| {stageName}                                                     |
+================================================================+
|                                                                 |
| +---------------------------+  +-----------------------------+  |
| | HEALTH SCORE              |  | RECOMMENDATION              |  |
| |                           |  |                             |  |
| |     [circular gauge]      |  |  [GO / NO-GO / CONDITIONAL]|  |
| |        {score}/100        |  |                             |  |
| |                           |  |  {recommendation text}      |  |
| | Threshold: {threshold}    |  |                             |  |
| | [Pass/Fail badge]         |  |                             |  |
| +---------------------------+  +-----------------------------+  |
|                                                                 |
| +------------------------------------------------------------+ |
| | Decision                                                   | |
| |------------------------------------------------------------| |
| | Status: [Approved / Rejected / Pending] badge              | |
| | Rationale:                                                 | |
| | {decision.rationale — paragraph text}                      | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Evidence Brief                                     [expand]| |
| |------------------------------------------------------------| |
| | {briefData rendered as structured key-value sections}      | |
| |                                                            | |
| | Each top-level key in briefData:                           | |
| |   [key as section header]                                  | |
| |   value rendered by type (same rules as Template 1)        | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Stage-Specific Data                                        | |
| |------------------------------------------------------------| |
| | {advisoryData rendered per stage — see per-stage keys}     | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts ({count})                                        | |
| |------------------------------------------------------------| |
| | [type badge] {title}                          v{version}   | |
| +------------------------------------------------------------+ |
+================================================================+
```

### Kill Gate vs Promotion Gate Styling

| Aspect | Kill Gate (3, 5, 13, 23) | Promotion Gate (16, 17, 22) |
|--------|--------------------------|----------------------------|
| Icon | Shield (red tint) | TrendingUp (blue tint) |
| Header bg | destructive/10 | primary/10 |
| GO badge | Badge default (green) | Badge default (blue) |
| NO-GO badge | Badge destructive | Badge destructive |
| CONDITIONAL | Badge secondary (amber) | Badge secondary (amber) |
| Label prefix | "Kill Gate:" | "Promotion Gate:" |

### Data Mapping

| Section | Field | Component |
|---------|-------|-----------|
| Health gauge | `gateDecision.healthScore` | Custom circular or Progress bar |
| Threshold | config from `venture-workflow.ts` | text-sm |
| Pass/Fail | computed: score >= threshold | Badge (default / destructive) |
| Recommendation | `gateDecision.recommendation` | Badge with variant |
| Decision status | `gateDecision.decision` | Badge |
| Rationale | `gateDecision.rationale` | paragraph text |
| Evidence brief | `gateDecision.briefData.*` | Collapsible Card sections |
| Stage data | `stageData.advisoryData.*` | Card with per-stage layout |

### Per-Stage Advisory Data Keys

**Stage 3 (Kill Gate: Idea Viability)**:
- `viability_score` (number) -> score card
- `market_fit_assessment` (string) -> paragraph
- `risk_factors` (array) -> risk list with severity badges
- `go_conditions` (array) -> checklist items

**Stage 5 (Kill Gate: Unit Economics)**:
- `unitEconomics` (object) -> 2-col grid: CAC, LTV, margins, payback
- `roi_bands` (array) -> table: label, min, max, probability
- `risks_acknowledged` (array) -> bulleted list

**Stage 13 (Kill Gate: Product Roadmap)**:
- `vision_statement` (string) -> blockquote
- `milestones` (array) -> timeline list: name, target_date, status badge
- `roadmap_items` (array) -> table: title, status, priority, phase

**Stage 16 (Promotion Gate: Financial Projections)**:
- `projections` (object) -> FinancialPanel: P&L, runway, burn rate
- `funding_requirements` (object) -> key-value grid
- `break_even_timeline` (string) -> highlighted card

**Stage 17 (Promotion Gate: Build Readiness)**:
- `checklist_items` (array) -> ChecklistPanel: item, status, owner
- `readiness_score` (number) -> score card
- `blockers` (array) -> alert list with severity

**Stage 22 (Promotion Gate: Release Readiness)**:
- `release_checklist` (array) -> ChecklistPanel
- `deployment_plan` (string) -> paragraph
- `rollback_strategy` (string) -> paragraph
- `sign_offs` (array) -> list with approved/pending badges

**Stage 23 (Kill Gate: Post-Launch Operations)**:
- `incident_response_plan` (string/object) -> structured card
- `rollback_triggers` (array) -> bulleted list with warning icons
- `operational_metrics` (object) -> 2-col grid

### Empty State (No Gate Decision)

```
+================================================================+
| [shield icon] {Gate Type}: Stage {N}             [Pending]      |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | [AlertTriangle icon]                                       | |
| | Gate decision has not been rendered yet.                    | |
| |                                                            | |
| | The Chairman AI will evaluate this gate when the venture   | |
| | reaches this stage. Health score, recommendation, and      | |
| | evidence brief will appear here.                           | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Stage Data                                                 | |
| |------------------------------------------------------------| |
| | {advisoryData if available, otherwise "No data yet"}       | |
| +------------------------------------------------------------+ |
+================================================================+
```

---

## Template 3: Analytics/Scoring View

**Stages**: 6 (Risk Evaluation), 7 (Revenue Architecture), 20 (QA & UAT), 24 (Analytics & Feedback), 25 (Optimization & Scale)
**Shadcn Components**: Card, Badge, Progress, Separator, Table
**Icons**: BarChart3, TrendingUp, Shield, Activity, Target

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [status badge] |
| Phase: {phaseName}                                              |
+================================================================+
|                                                                 |
| +-------------+ +-------------+ +-------------+ +-------------+ |
| | Metric 1    | | Metric 2    | | Metric 3    | | Metric 4    | |
| | {value}     | | {value}     | | {value}     | | {value}     | |
| | {label}     | | {label}     | | {label}     | | {label}     | |
| +-------------+ +-------------+ +-------------+ +-------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Detailed Breakdown                                         | |
| |------------------------------------------------------------| |
| | | Category    | Score | Status   | Details         |       | |
| | |-------------|-------|----------|-----------------|       | |
| | | {row.name}  | {val} | [badge] | {row.detail}    |       | |
| | | {row.name}  | {val} | [badge] | {row.detail}    |       | |
| | | {row.name}  | {val} | [badge] | {row.detail}    |       | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | [chart placeholder]                                        | |
| |                                                            | |
| | Chart area — rendered with Recharts when data available.   | |
| | Shows bar/line/radar chart depending on stage data shape.  | |
| |                                                            | |
| | Fallback: "Chart visualization requires numerical data."   | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | AI Analysis                                                | |
| |------------------------------------------------------------| |
| | {advisoryData analysis/summary text sections}              | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts ({count})                                        | |
| |------------------------------------------------------------| |
| | [type badge] {title}                          v{version}   | |
| +------------------------------------------------------------+ |
+================================================================+
```

### Data Mapping

| Section | Field | Component |
|---------|-------|-----------|
| Metric cards | `advisoryData.{metric_keys}` (numbers) | 4-col grid of Card |
| Data table | `advisoryData.{table_keys}` (arrays) | HTML table or Shadcn Table |
| Chart area | `advisoryData.{numeric_data}` | Recharts BarChart/LineChart |
| AI analysis | `advisoryData.{text_keys}` (strings) | Card with paragraphs |

### Per-Stage Advisory Data Keys

**Stage 6 (Risk Evaluation)**:
- Metric cards: `overall_risk_score`, `risk_count`, `mitigated_count`, `critical_count`
- Table: `risks` (array) -> name, severity (badge), likelihood, impact, mitigation
- Chart: risk severity distribution (bar chart)
- Analysis: `risk_summary`, `recommendations`

**Stage 7 (Revenue Architecture)**:
- Metric cards: `projected_arr`, `pricing_tiers_count`, `ltv_cac_ratio`, `margin_target`
- Table: `pricing_tiers` (array) -> tier_name, price, features, target_segment
- Chart: revenue projection (line chart)
- Analysis: `revenue_model_summary`, `pricing_rationale`

**Stage 20 (QA & UAT)**:
- Metric cards: `test_coverage`, `pass_rate`, `critical_bugs`, `uat_completion`
- Table: `test_suites` (array) -> suite_name, tests_count, passed, failed, status badge
- Chart: coverage over sprints (line chart)
- Analysis: `qa_summary`, `uat_findings`

**Stage 24 (Analytics & Feedback)**:
- Metric cards: `growth_score`, `dau_mau_ratio`, `nps_score`, `retention_rate`
- Table: `growth_metrics` (array) -> metric_name, current, target, trend badge
- Chart: growth trends (line chart)
- Analysis: `optimization_recommendations`, `launch_readiness`

**Stage 25 (Optimization & Scale)**:
- Metric cards: `performance_score`, `scale_readiness`, `cost_efficiency`, `uptime_sla`
- Table: `optimizations` (array) -> area, current, target, priority, status
- Chart: performance benchmarks (radar chart)
- Analysis: `scaling_plan`, `infrastructure_notes`

### Empty State

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [Pending]      |
+================================================================+
|                                                                 |
| +-------------+ +-------------+ +-------------+ +-------------+ |
| |    —        | |    —        | |    —        | |    —        | |
| | {label}     | | {label}     | | {label}     | | {label}     | |
| +-------------+ +-------------+ +-------------+ +-------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | No analytical data available yet.                          | |
| | Scores and metrics will appear once this stage processes.  | |
| +------------------------------------------------------------+ |
+================================================================+
```

---

## Template 4: Structured Canvas/Form View

**Stages**: 8 (BMC), 9 (Exit Strategy), 10 (Customer & Brand), 11 (GTM Strategy), 12 (Sales & Success), 14 (Data Architecture), 15 (Epic Breakdown)
**Shadcn Components**: Card, Badge, Collapsible, Separator, Tabs
**Icons**: Grid3x3, Target, Palette, Map, Users, Database, ListTree

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [status badge] |
| Phase: {phaseName}                                              |
+================================================================+
|                                                                 |
| +-------- Summary Metrics (when applicable) -----------------+ |
| | +----------+ +----------+ +----------+                     | |
| | | {metric} | | {metric} | | {metric} |                     | |
| | +----------+ +----------+ +----------+                     | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Section: {advisoryData.key_1 title}              [collapse]| |
| |------------------------------------------------------------| |
| | {value rendered by type}                                   | |
| |   string  -> paragraph                                     | |
| |   array   -> list or table                                 | |
| |   object  -> nested grid                                   | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Section: {advisoryData.key_2 title}              [collapse]| |
| |------------------------------------------------------------| |
| | {value rendered by type}                                   | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Section: {advisoryData.key_3 title}              [collapse]| |
| |------------------------------------------------------------| |
| | {value rendered by type}                                   | |
| +------------------------------------------------------------+ |
|                                                                 |
| ... (one collapsible section per top-level advisoryData key)    |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts ({count})                                        | |
| |------------------------------------------------------------| |
| | [type badge] {title}                          v{version}   | |
| +------------------------------------------------------------+ |
+================================================================+
```

### Grid Variant (for Stage 8: Business Model Canvas)

```
+================================================================+
| [Grid3x3] Stage 8: Business Model Canvas        [status badge] |
+================================================================+
|                                                                 |
| +-------------------+-------------------+-------------------+   |
| | Key Partners      | Key Activities    | Value Propositions|   |
| |                   |                   |                   |   |
| | {partners list}   | {activities list} | {propositions}    |   |
| +-------------------+-------------------+-------------------+   |
| | Key Resources     | Customer          | Channels          |   |
| |                   | Relationships     |                   |   |
| | {resources list}  | {relationships}   | {channels list}   |   |
| +-------------------+-------------------+-------------------+   |
| | Cost Structure                        | Revenue Streams   |   |
| |                                       |                   |   |
| | {costs breakdown}                     | {revenue model}   |   |
| +---------------------------------------+-------------------+   |
|                                                                 |
+================================================================+
```

### Data Mapping

| Section | Field | Component |
|---------|-------|-----------|
| Summary metrics | `advisoryData.{score_keys}` | metric card grid |
| Canvas sections | `advisoryData.*` (each top-level key) | Collapsible Card |
| Section title | key name, humanized | CardTitle |
| Section content | value (type-dependent rendering) | CardContent |
| Artifacts | `stageData.artifacts[]` | Card list |

### Per-Stage Advisory Data Keys

**Stage 8 (Business Model Canvas)** — grid layout:
- `key_partners` (array) -> bulleted list
- `key_activities` (array) -> bulleted list
- `value_propositions` (array) -> bulleted list
- `key_resources` (array) -> bulleted list
- `customer_relationships` (array) -> bulleted list
- `channels` (array) -> bulleted list
- `customer_segments` (array) -> bulleted list
- `cost_structure` (object) -> key-value grid
- `revenue_streams` (object) -> key-value grid

**Stage 9 (Exit Strategy)** — sections layout:
- `exit_thesis` (string) -> blockquote
- `target_acquirers` (array) -> table: name, rationale, likelihood
- `valuation_methodology` (object) -> key-value grid
- `timeline` (string) -> paragraph
- `milestones_to_exit` (array) -> checklist

**Stage 10 (Customer & Brand Genome)** — sections layout:
- `personas` (array) -> cards: name, description, pain points, goals
- `brand_genome` (object) -> key-value grid: voice, tone, values, positioning
- `naming_candidates` (array) -> table: name, scores, total
- `naming_strategy` (string) -> paragraph
- `narrative_extension` (object) -> sections

**Stage 11 (GTM Strategy)** — sections layout:
- `go_to_market_approach` (string) -> paragraph
- `channels` (array) -> table: channel, reach, cost, conversion
- `launch_timeline` (array) -> timeline list
- `marketing_budget` (object) -> key-value grid
- `success_metrics` (object) -> metric cards

**Stage 12 (Sales & Success Model)** — sections layout:
- `sales_model` (string) -> paragraph
- `pricing_strategy` (object) -> key-value grid
- `customer_success_plan` (string) -> paragraph
- `support_tiers` (array) -> table: tier, response_time, features
- `churn_prevention` (array) -> bulleted list

**Stage 14 (Data Architecture)** — sections layout:
- `data_layers` (array) -> 5 collapsible sections (ingestion, storage, processing, serving, security)
- `schema_overview` (object) -> table-like grid
- `security_model` (object) -> key-value grid with badges
- `compliance_requirements` (array) -> checklist
- `integration_points` (array) -> list with type badges

**Stage 15 (Epic Breakdown & Planning)** — sections layout:
- `epics` (array) -> table: title, story_points, priority, sprint, status badge
- `resource_allocation` (object) -> key-value grid
- `risk_register` (array) -> RiskRegisterPanel: risk, probability, impact, mitigation
- `sprint_plan` (array) -> timeline: sprint_number, goals, deliverables
- `dependencies` (array) -> dependency graph list

### Empty State

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [Pending]      |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | No structured data available yet.                          | |
| |                                                            | |
| | This stage's canvas/form sections will populate once the   | |
| | AI advisory processes this stage.                          | |
| +------------------------------------------------------------+ |
+================================================================+
```

---

## Template 5: Progress/Pipeline View

**Stages**: 18 (MVP Development), 19 (Integration & API), 21 (Integration Testing)
**Shadcn Components**: Card, Badge, Progress, Separator, Table
**Icons**: Rocket, Plug, TestTube2, CheckSquare, Clock

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [status badge] |
| Phase: {phaseName}                                              |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | Overall Progress                                           | |
| |------------------------------------------------------------| |
| | [===================>              ] 65%                    | |
| | {completed_items}/{total_items} items complete             | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Items / Tasks                                              | |
| |------------------------------------------------------------| |
| | [status badge] {item.title}                                | |
| |   {item.description — truncated}                           | |
| |   Assigned: {item.owner}  |  Due: {item.due_date}         | |
| |------------------------------------------------------------| |
| | [status badge] {item.title}                                | |
| |   {item.description — truncated}                           | |
| |   Assigned: {item.owner}  |  Due: {item.due_date}         | |
| |------------------------------------------------------------| |
| | [status badge] {item.title}                                | |
| |   {item.description — truncated}                           | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Milestones / Timeline                                      | |
| |------------------------------------------------------------| |
| | [x] Milestone 1: {name}                     {date}         | |
| | [x] Milestone 2: {name}                     {date}         | |
| | [ ] Milestone 3: {name}                     {date}         | |
| | [ ] Milestone 4: {name}                     {target_date}  | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | Artifacts ({count})                                        | |
| |------------------------------------------------------------| |
| | [type badge] {title}                          v{version}   | |
| +------------------------------------------------------------+ |
+================================================================+
```

### Data Mapping

| Section | Field | Component |
|---------|-------|-----------|
| Progress bar | computed from items | Progress |
| Item count | `advisoryData.{items_key}.length` | text-sm |
| Task list | `advisoryData.{items_key}[]` | Card list with status badges |
| Task status | `item.status` | Badge (variant by status) |
| Milestones | `advisoryData.{milestones_key}[]` | Checklist display |

### Task Status Badge Variants

| Status | Badge variant | Icon |
|--------|--------------|------|
| done / completed | default (green) | CheckCircle2 |
| in_progress | default (blue) | Clock |
| blocked | destructive | XCircle |
| pending / todo | secondary | Circle |

### Per-Stage Advisory Data Keys

**Stage 18 (MVP Development Loop)**:
- Progress: computed from `sprints` completion
- Items: `sprints` (array) -> sprint_number, goals, deliverables, status
- Milestones: `milestones` (array) -> name, target_date, status
- Additional: `sd_bridge` (object) -> link to LEO SDs if applicable

**Stage 19 (Integration & API Layer)**:
- Progress: computed from `integrations` completion
- Items: `integrations` (array) -> endpoint, method, status, test_status
- Milestones: `api_milestones` (array) -> name, target_date, status
- Additional: `boundary_tests` (object) -> test results summary

**Stage 21 (Integration Testing)**:
- Progress: computed from `test_suites` pass rate
- Items: `test_suites` (array) -> suite_name, tests_count, passed, failed, status
- Milestones: `testing_milestones` (array) -> name, target_date, status
- Additional: `coverage_report` (object) -> coverage stats

### Empty State

```
+================================================================+
| [icon] Stage {N}: {stageName}                    [Pending]      |
+================================================================+
|                                                                 |
| +------------------------------------------------------------+ |
| | Overall Progress                                           | |
| |------------------------------------------------------------| |
| | [                                  ] 0%                    | |
| | 0/0 items — No tasks tracked yet                           | |
| +------------------------------------------------------------+ |
|                                                                 |
| +------------------------------------------------------------+ |
| | No tasks or milestones available yet.                      | |
| | Development tracking will appear once this stage begins.   | |
| +------------------------------------------------------------+ |
+================================================================+
```

---

## Shared Panels Reference

These reusable panels are specified in the architecture and used across templates:

### ScoresPanel
Used by: Stages 2, 3, 5 (any stage with score objects)
```
+-------------------+-------------------+
| {score_name}: {v} | {score_name}: {v} |
| [======>    ] 72% | [=========> ] 91% |
+-------------------+-------------------+
```
Component: grid of Cards with Progress bars

### RiskRegisterPanel
Used by: Stages 6, 15 (any stage with risk arrays)
```
| Risk            | Probability | Impact   | Mitigation          |
|-----------------|-------------|----------|---------------------|
| {risk.name}     | [badge]     | [badge]  | {risk.mitigation}   |
```
Component: Table with Badge cells for severity

### ChecklistPanel
Used by: Stages 17, 20, 22, 24 (any stage with checklist arrays)
```
[x] {item.name}                              {item.owner}
[ ] {item.name}                              {item.owner}
```
Component: List with CheckSquare/Square icons

### FinancialPanel
Used by: Stages 5, 7, 16 (any stage with financial data)
```
+-------------------+-------------------+
| Revenue: $XX.XM   | Margin: XX%       |
| CAC: $X,XXX       | LTV: $XX,XXX     |
| Burn: $XX,XXX/mo  | Runway: XX mo     |
+-------------------+-------------------+
```
Component: 2-col or 3-col grid of metric Cards

---

## Implementation Notes

1. **Component file naming**: `Stage{N}{PascalCaseName}.tsx` in `src/components/stages/`
2. **All renderers**: Accept `StageRendererProps` — use `stageData.advisoryData` for all data
3. **Null safety**: Every field access must handle null/undefined gracefully
4. **Type guards**: Create helper `hasAdvisoryField(data, key)` for safe field extraction
5. **Recharts**: Only import for Analytics/Scoring template stages — lazy load
6. **Collapsible sections**: Use Shadcn `Collapsible` component, default all open
7. **advisoryData keys**: Keys are advisory_data JSONB from Supabase — shapes are AI-generated and may vary. Always render unknown keys with the generic key-value renderer as a fallback.
