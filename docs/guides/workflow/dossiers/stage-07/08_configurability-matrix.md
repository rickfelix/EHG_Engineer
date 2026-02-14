# Stage 7: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: unit, validation, architecture, postgres

**Purpose**: Define tunable parameters for Stage 7 (Revenue Architecture) to allow Chairman/Admin customization

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:274-319 "Revenue Architecture"

---

## Recursion Thresholds (Inbound)

**Category**: Quality Gate Controls

**Parameters**:

| Parameter | Default Value | Range | Unit | Purpose | Adjustable By |
|-----------|---------------|-------|------|---------|---------------|
| `resource_gap_threshold_medium` | 20 | 10-50 | % | Trigger TIMELINE-001 (MEDIUM) when resource gap exceeds this % | Chairman |
| `resource_gap_threshold_high` | 50 | 30-100 | % | Trigger RESOURCE-001 (HIGH) when resource gap exceeds this % | Chairman |
| `timeline_overage_threshold_medium` | 20 | 10-40 | % | Trigger TIMELINE-001 (MEDIUM) when timeline exceeds commitment by this % | Chairman |
| `timeline_overage_threshold_high` | 50 | 30-100 | % | Upgrade TIMELINE-001 to HIGH severity when overage exceeds this % | Chairman |
| `tech_complexity_threshold` | 30 | 20-50 | % timeline impact | Trigger TECH-001 (HIGH) when technical complexity adds this % to timeline | Chairman |
| `cost_increase_threshold` | 25 | 15-50 | % | Trigger PLAN-001 to Stage 5 when cost increase exceeds this % | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62-63 "RESOURCE-001, TIMELINE-001 triggers"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:121 "Timeline impact > 30%"

**Use Cases**:
- **Conservative ventures**: Lower thresholds (10-15%) to trigger recursion early and often
- **Aggressive ventures**: Higher thresholds (50-100%) to accept more risk and avoid recursion delays
- **Industry-specific**: Hardware ventures have longer timelines, SaaS ventures have shorter (adjust timeline thresholds)

---

## Loop Prevention

**Category**: Safety Controls

**Parameters**:

| Parameter | Default Value | Range | Unit | Purpose | Adjustable By |
|-----------|---------------|-------|------|---------|---------------|
| `max_recursions_resource` | 3 | 1-5 | count | Max times RESOURCE-001 can return to Stage 7 before escalation | Chairman |
| `max_recursions_timeline` | 3 | 1-5 | count | Max times TIMELINE-001 can return to Stage 7 before escalation | Chairman |
| `max_recursions_tech` | 3 | 1-5 | count | Max times TECH-001 can return to Stage 7 before escalation | Chairman |
| `max_recursions_total` | 5 | 3-10 | count | Max total recursions to Stage 7 (all trigger types combined) | Chairman |

**Evidence**: Similar to Stage 5 loop prevention (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:95-101)

**Use Cases**:
- **Early-stage ventures**: Higher max recursions (5-7) to allow exploration and iteration
- **Late-stage ventures**: Lower max recursions (2-3) to enforce commitment and reduce churn
- **High-uncertainty ventures**: Higher total recursions to accommodate unknowns

---

## Planning Automation Level

**Category**: Workflow Controls

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `progression_mode` | Manual | N/A | Manual, Assisted, Auto | Control AI involvement in planning | Chairman |
| `business_planning_automation` | Manual | N/A | Manual, Assisted, Auto | AI generates business model, go-to-market (Substage 7.1) | Chairman |
| `technical_planning_automation` | Manual | N/A | Manual, Assisted, Auto | AI recommends architecture, tech stack (Substage 7.2) | Chairman |
| `resource_planning_automation` | Manual | N/A | Manual, Assisted, Auto | AI estimates team size, budget, timeline (Substage 7.3) | Chairman |
| `chairman_approval_required` | true | N/A | true, false | Require Chairman approval before advancing to Stage 8 | Admin |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:319 "progression_mode: Manual → Assisted → Auto"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:30-33 "Target 80% automation"

**Mode Definitions**:
- **Manual**: Human creates all plans, AI provides no suggestions
- **Assisted**: AI generates draft plans, human reviews and approves/edits
- **Auto**: AI generates plans automatically, only flags high-risk decisions for human approval

**Use Cases**:
- **Manual**: Complex ventures requiring deep human judgment (e.g., regulated industries, novel business models)
- **Assisted**: Standard ventures where AI can accelerate planning but human review needed
- **Auto**: Simple ventures following established patterns (e.g., SaaS MVP with known tech stack)

---

## Metrics Configuration

**Category**: Monitoring & Validation

**Parameters**:

| Parameter | Default Value | Range | Unit | Purpose | Adjustable By |
|-----------|---------------|-------|------|---------|---------------|
| `plan_completeness_threshold` | 90 | 70-100 | % | Min % of required sections complete to pass exit gate | Chairman |
| `timeline_feasibility_min` | 0.8 | 0.5-1.5 | ratio | Min ratio of (estimated timeline / benchmark timeline) to be considered feasible | Chairman |
| `resource_efficiency_max` | 1.2 | 0.8-2.0 | ratio | Max ratio of (estimated cost / benchmark cost) to be considered efficient | Chairman |
| `plan_validation_level` | Standard | N/A | Minimal, Standard, Rigorous | Depth of plan validation (consistency checks, stakeholder reviews) | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:287-290 "metrics: Plan completeness, Timeline feasibility"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:35-38 "Missing threshold values"

**Use Cases**:
- **plan_completeness_threshold**: Lower for MVP ventures (70%), higher for enterprise ventures (100%)
- **timeline_feasibility_min**: Lower for R&D ventures (0.5 = can take 2x longer), higher for time-sensitive ventures (1.0 = no overage)
- **resource_efficiency_max**: Lower for lean startups (1.0 = no cost overage), higher for ventures with funding (2.0 = can double cost)

---

## Comparison & Benchmarking

**Category**: Data-Driven Planning

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `use_historical_data` | true | N/A | true, false | Use historical venture data for estimates (e.g., average team size for SaaS ventures) | Chairman |
| `benchmark_source` | Internal | N/A | Internal, Industry, Custom | Source for benchmark data (internal ventures, industry reports, custom dataset) | Chairman |
| `show_comparison_warning` | true | N/A | true, false | Show yellow/red warnings when estimates deviate from benchmarks | Chairman |
| `comparison_warning_threshold` | 20 | 10-50 | % deviation | Show warning when estimate deviates from benchmark by this % | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md:273-282 "Historical Data (similar ventures)"

**Use Cases**:
- **Historical data ON**: Use for standard ventures following known patterns
- **Historical data OFF**: Use for novel ventures with no comparable history
- **Industry benchmarks**: Use for ventures in established markets (SaaS, e-commerce)
- **Custom benchmarks**: Use for ventures in niche markets (upload your own dataset)

---

## Plan Templates

**Category**: Template Management

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `business_plan_template` | Default | N/A | Default, SaaS, Marketplace, Hardware, Custom | Template for business plan (pre-filled sections based on venture type) | Chairman |
| `tech_stack_recommendations` | Enabled | N/A | Enabled, Disabled | Show recommended tech stacks based on requirements | Chairman |
| `architecture_patterns` | Enabled | N/A | Enabled, Disabled | Suggest architecture patterns (monolith, microservices, serverless) | Chairman |
| `resource_estimate_source` | AI + Historical | N/A | Manual, AI, Historical, AI + Historical | How to estimate resource requirements | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:30-33 "Build automation workflows"

**Use Cases**:
- **SaaS template**: Pre-fills business model (subscription revenue), tech stack (React, Node.js, PostgreSQL), resource estimates (5-7 engineers for MVP)
- **Marketplace template**: Pre-fills business model (transaction fees), tech stack (2-sided platform patterns), resource estimates (10-15 engineers)
- **Hardware template**: Pre-fills business model (hardware + service), tech stack (embedded systems), resource estimates (longer timeline, prototyping costs)

---

## Chairman Override Capabilities

**Category**: Governance Controls

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `allow_chairman_override_thresholds` | true | N/A | true, false | Chairman can override recursion thresholds for specific venture | Admin |
| `allow_skip_recursion` | true | N/A | true, false | Chairman can skip recursion despite threshold violation | Admin |
| `require_override_justification` | true | N/A | true, false | Chairman must provide reason for override (audit trail) | Admin |
| `allow_extend_max_recursions` | true | N/A | true, false | Chairman can allow 4th, 5th recursion beyond max | Admin |

**Evidence**: Similar to Stage 5 Chairman controls (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:111-114)

**Use Cases**:
- **Override thresholds**: Lower threshold for high-risk venture (trigger recursion at 10% gap instead of 20%)
- **Skip recursion**: Strategic bet (accept resource gap, proceed despite warning)
- **Extend max recursions**: Exploratory venture (allow 5th recursion to continue iterating)

---

## Performance Configuration

**Category**: Performance Optimization

**Parameters**:

| Parameter | Default Value | Range | Unit | Purpose | Adjustable By |
|-----------|---------------|-------|------|---------|---------------|
| `plan_generation_timeout` | 60 | 30-300 | seconds | Max time for AI to generate plan before timeout | Admin |
| `validation_timeout` | 10 | 5-60 | seconds | Max time for plan validation checks | Admin |
| `recursion_detection_timeout` | 5 | 1-30 | seconds | Max time to evaluate recursion triggers from Stage 8/10 | Admin |
| `enable_plan_caching` | true | N/A | true, false | Cache intermediate plan results (speeds up revisions) | Admin |

**Evidence**: Similar to Stage 5 performance requirements (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120)

---

## Notification & Communication

**Category**: Stakeholder Communication

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `notify_chairman_on_completion` | true | N/A | true, false | Send notification when Stage 7 complete (ready for approval) | Chairman |
| `notify_on_recursion_trigger` | true | N/A | true, false | Send notification when recursion triggered from Stage 8/10 | Chairman |
| `notify_stakeholders` | false | N/A | true, false | Send plan summary to stakeholders (investors, team) | Chairman |
| `notification_method` | Email + Dashboard | N/A | Email, Dashboard, Slack, Email + Dashboard | How to notify Chairman/stakeholders | Chairman |

**Evidence**: Similar to Stage 5 Chairman notification (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:70)

---

## Integration Settings

**Category**: External Tool Integrations

**Parameters**:

| Parameter | Default Value | Range | Options | Purpose | Adjustable By |
|-----------|---------------|-------|---------|---------|---------------|
| `enable_jira_integration` | false | N/A | true, false | Sync technical roadmap to Jira (create epics, stories) | Admin |
| `enable_excel_export` | true | N/A | true, false | Export budget allocation to Excel/Google Sheets | Chairman |
| `enable_lucidchart_integration` | false | N/A | true, false | Sync architecture diagram to Lucidchart | Admin |
| `enable_notion_integration` | false | N/A | true, false | Sync business plan to Notion | Admin |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:26 "Missing specific tool integrations"

---

## Configuration Profiles

**Pre-defined configuration sets for common venture types**:

### Profile 1: Conservative Planning (Low Risk)

```yaml
resource_gap_threshold_medium: 10  # Trigger early
resource_gap_threshold_high: 30
timeline_overage_threshold_medium: 10
max_recursions_total: 5
plan_completeness_threshold: 95
timeline_feasibility_min: 1.0  # No overage allowed
resource_efficiency_max: 1.1
```

**Use Case**: Enterprise ventures, regulated industries, ventures with fixed budgets/timelines

---

### Profile 2: Balanced Planning (Standard Risk)

```yaml
resource_gap_threshold_medium: 20  # Default
resource_gap_threshold_high: 50
timeline_overage_threshold_medium: 20
max_recursions_total: 5
plan_completeness_threshold: 90
timeline_feasibility_min: 0.8  # 20% buffer allowed
resource_efficiency_max: 1.2
```

**Use Case**: Standard SaaS ventures, marketplace ventures, most ventures

---

### Profile 3: Aggressive Planning (High Risk)

```yaml
resource_gap_threshold_medium: 40  # Trigger late
resource_gap_threshold_high: 80
timeline_overage_threshold_medium: 40
max_recursions_total: 7
plan_completeness_threshold: 70
timeline_feasibility_min: 0.5  # Can take 2x longer
resource_efficiency_max: 2.0
```

**Use Case**: R&D ventures, exploratory ventures, ventures with high uncertainty

---

### Profile 4: AI-First Planning (Automation Focus)

```yaml
progression_mode: Auto
business_planning_automation: Auto
technical_planning_automation: Auto
resource_planning_automation: Auto
use_historical_data: true
tech_stack_recommendations: Enabled
architecture_patterns: Enabled
chairman_approval_required: false  # Auto-advance
```

**Use Case**: Standard ventures following known patterns, ventures with experienced Chairman who trusts AI

---

## Configuration UI (Proposed)

**Location**: Admin → Stage Configuration → Stage 7

**Sections**:
1. **Recursion Thresholds**: Sliders for all 6 thresholds (resource gap, timeline overage, tech complexity, cost increase)
2. **Loop Prevention**: Input fields for max recursions (per trigger type, total)
3. **Automation Level**: Dropdown for progression mode (Manual, Assisted, Auto)
4. **Metrics**: Input fields for plan completeness, timeline feasibility, resource efficiency thresholds
5. **Templates**: Dropdown for plan templates (Default, SaaS, Marketplace, Hardware)
6. **Profiles**: Quick select for pre-defined profiles (Conservative, Balanced, Aggressive, AI-First)
7. **Integrations**: Checkboxes for Jira, Excel, Lucidchart, Notion

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stages definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 274-319 |
| Recursion thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-08.md | 62-63 |
| Tech complexity threshold | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-10.md | 121 |
| Automation level | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 319 |
| Metrics gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 35-38 |
| Tool integrations gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 26 |
| Loop prevention pattern | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 95-101 |

---

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
