---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 9: Configurability Matrix


## Table of Contents

- [Tunable Parameters](#tunable-parameters)
  - [Substage 9.1: Capability Assessment](#substage-91-capability-assessment)
  - [Substage 9.2: Gap Identification](#substage-92-gap-identification)
  - [Substage 9.3: Opportunity Modeling](#substage-93-opportunity-modeling)
- [Quality Gate Thresholds](#quality-gate-thresholds)
  - [Entry Gates](#entry-gates)
  - [Exit Gates](#exit-gates)
- [Metric Thresholds](#metric-thresholds)
  - [Gap Coverage](#gap-coverage)
  - [Opportunity Size](#opportunity-size)
  - [Capability Score](#capability-score)
- [Automation Levels (Progression Mode)](#automation-levels-progression-mode)
- [Chairman Override Controls](#chairman-override-controls)
  - [High-Level Controls](#high-level-controls)
  - [Granular Controls (Per-Gap Decisions)](#granular-controls-per-gap-decisions)
- [Risk Tolerance Settings](#risk-tolerance-settings)
- [Data Source Configuration](#data-source-configuration)
- [Notification & Escalation Rules](#notification-escalation-rules)
- [Example Configuration File](#example-configuration-file)
- [Sources Table](#sources-table)

**Purpose**: Document tunable parameters, thresholds, and Chairman controls for Stage 9.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:365-409 "Stage 9 metrics, gates, notes"

---

## Tunable Parameters

### Substage 9.1: Capability Assessment

| Parameter | Type | Default | Range | Description | Impact |
|-----------|------|---------|-------|-------------|--------|
| `maturity_scale_max` | Integer | 5 | 3-10 | Maximum maturity rating (1-N scale) | Higher scale = more granular capability assessment |
| `required_maturity_buffer` | Float | 0.5 | 0-1.0 | Buffer above current maturity to set required (e.g., 0.5 = if current is 3, required is 3.5) | Higher buffer = more ambitious capability targets |
| `capability_categories` | Array | `["technical", "process", "people", "tools"]` | Custom | Categories for capability grouping | Affects reporting granularity |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:392-396 "9.1 Capability Assessment substage"

### Substage 9.2: Gap Identification

| Parameter | Type | Default | Range | Description | Impact |
|-----------|------|---------|-------|-------------|--------|
| `critical_gap_threshold` | Float | 0 | 0-5 | Gap size to classify as CRITICAL (e.g., 0 = missing capability) | Lower threshold = more gaps flagged as critical |
| `high_gap_threshold` | Float | 2.0 | 1-4 | Gap size to classify as HIGH | Lower threshold = more gaps escalated |
| `medium_gap_threshold` | Float | 1.0 | 0.5-2 | Gap size to classify as MEDIUM | Lower threshold = more gaps tracked |
| `priority_weights` | Object | `{urgency: 0.4, strategic_fit: 0.3, cost: 0.3}` | Weights sum to 1.0 | Weights for gap prioritization formula | Adjust to emphasize urgency vs strategy vs cost |
| `p0_auto_block` | Boolean | `true` | true/false | Automatically block Stage 10 entry if P0 gaps unresolved | true = enforces gap closure before proceeding |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:397-403 "9.2 Gap Identification substage"

### Substage 9.3: Opportunity Modeling

| Parameter | Type | Default | Range | Description | Impact |
|-----------|------|---------|-------|-------------|--------|
| `min_roi_threshold` | Float | 1.0 | 0-10 | Minimum ROI (100%) for opportunities to be prioritized | Higher threshold = only high-ROI opportunities considered |
| `market_size_weight` | Float | 0.5 | 0-1 | Weight for market size in opportunity scoring | Higher weight = prioritizes larger markets over higher ROI |
| `roadmap_timeline_horizon` | Integer | 12 | 3-36 | Months to project in capability roadmap | Longer horizon = more strategic, shorter = more tactical |
| `som_confidence_level` | Float | 0.7 | 0.5-0.95 | Confidence level for SOM estimates (e.g., 0.7 = 70th percentile) | Lower confidence = more conservative estimates |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:404-407 "9.3 Opportunity Modeling substage"

---

## Quality Gate Thresholds

### Entry Gates

| Gate | Parameter | Default | Range | Description | Impact |
|------|-----------|---------|-------|-------------|--------|
| Decomposition complete | `min_wbs_tasks` | 10 | 5-50 | Minimum tasks in Stage 8 WBS to consider decomposition complete | Lower = allows Stage 9 to start earlier |
| Market analyzed | `min_market_data_points` | 3 | 1-10 | Minimum market data sources (competitors, customer interviews, reports) | Lower = less market validation required |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:383-386 "entry gates: Decomposition complete, Market analyzed"

### Exit Gates

| Gate | Parameter | Default | Range | Description | Impact |
|------|-----------|---------|-------|-------------|--------|
| Gaps identified | `min_gaps_documented` | 1 | 1-20 | Minimum gaps to document before exit | Lower = allows exit with fewer gaps (risky) |
| Opportunities prioritized | `min_opportunities` | 1 | 1-10 | Minimum opportunities in matrix | Lower = allows exit with limited market analysis |
| Roadmap defined | `min_roadmap_milestones` | 3 | 1-10 | Minimum milestones in capability roadmap | Lower = allows less detailed roadmap |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:387-391 "exit gates: Gaps identified, Opportunities prioritized, Roadmap defined"

---

## Metric Thresholds

### Gap Coverage

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `gap_coverage_target` | 80% | 50-100% | % of gaps that must be addressed in roadmap | Higher = forces more comprehensive gap closure plans |
| `gap_coverage_blocker` | 60% | 0-100% | Minimum gap coverage to pass exit gate | Lower = allows proceeding with more unaddressed gaps |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Gap coverage"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:35-38 "Missing: Threshold values, measurement frequency"

### Opportunity Size

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `min_opportunity_size_usd` | 2,000,000 | 100K-100M | Minimum total SOM to justify venture | Higher = only pursues larger markets |
| `opportunity_size_blocker` | 1,000,000 | 0-50M | Minimum SOM to pass exit gate | Lower = allows smaller market ventures |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Opportunity size"

### Capability Score

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `min_capability_score` | 3.0 | 1.0-5.0 | Minimum average capability maturity score | Higher = requires stronger baseline capabilities |
| `capability_score_blocker` | 2.5 | 1.0-5.0 | Minimum capability score to pass exit gate | Lower = allows proceeding with weaker capabilities |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Capability score"

---

## Automation Levels (Progression Mode)

**Current Progression**: Manual → Assisted → Auto (from stages.yaml notes)

| Level | Mode | Description | Chairman Control |
|-------|------|-------------|------------------|
| 1 | Manual | Analyst manually completes capability assessment, gap identification, opportunity modeling | Chairman reviews all outputs |
| 2 | Assisted | AI suggests capabilities/gaps based on WBS analysis, analyst validates | Chairman reviews final prioritization |
| 3 | Auto | AI fully automates gap analysis and opportunity modeling, auto-generates roadmap | Chairman approves/rejects final roadmap only |

**Progression Trigger**: Move to next level after N successful Stage 9 completions
- Manual → Assisted: After 5 successful manual completions
- Assisted → Auto: After 10 successful assisted completions

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:408-409 "progression_mode: Manual → Assisted → Auto (suggested)"

---

## Chairman Override Controls

### High-Level Controls

| Control | Type | Default | Description | Use Case |
|---------|------|---------|-------------|----------|
| `skip_gap_analysis` | Boolean | false | Skip Stage 9 entirely (proceed Stage 8 → Stage 10) | For ventures with well-known capability requirements |
| `gap_coverage_override` | Boolean | false | Proceed despite low gap coverage | Accept risk when time-to-market is critical |
| `opportunity_size_override` | Boolean | false | Proceed despite small market size | Strategic ventures (loss leader, market entry) |
| `force_stage_10_entry` | Boolean | false | Override all exit gate failures | Emergency fast-tracking |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:62-65 "Risk Assessment: Primary Risk process delays"

### Granular Controls (Per-Gap Decisions)

| Control | Type | Description | Use Case |
|---------|------|-------------|----------|
| `accept_gap_risk` | Action | Accept specific gap without closure plan | Gap is low-priority or too expensive to close |
| `defer_gap_closure` | Action | Include gap in roadmap but postpone to post-launch | Close gap in v2.0, not MVP |
| `outsource_capability` | Action | Mark gap as "buy/partner" instead of "build" | Faster to acquire than develop internally |
| `simplify_scope` | Action | Remove features requiring unavailable capabilities | Reduce MVP scope to match current capabilities |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:46-49 "Add Rollback Procedures: No rollback defined"

---

## Risk Tolerance Settings

| Risk Profile | Gap Coverage Target | Opportunity Size Min | Capability Score Min | Description |
|--------------|---------------------|----------------------|----------------------|-------------|
| Conservative | 90% | $5M SOM | 3.5 | High confidence, low risk ventures only |
| Balanced | 80% | $2M SOM | 3.0 | Default profile, moderate risk tolerance |
| Aggressive | 60% | $1M SOM | 2.5 | Fast-moving ventures, accept higher risk |
| Strategic | 50% | $500K SOM | 2.0 | Strategic bets (market entry, loss leader) |

**Chairman Control**: Select risk profile at venture creation or override per-stage.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:62-65 "Risk Assessment: Residual Risk Low to Medium"

---

## Data Source Configuration

| Data Source | Type | Default Provider | Configurable | Description |
|-------------|------|------------------|--------------|-------------|
| Capability Inventory | Internal DB | `capabilities_table` | Yes | Source for current capabilities data |
| Market Research | External API | Manual entry | Yes | Market size/competitor data (e.g., Gartner API) |
| Competitor Analysis | External | Manual entry | Yes | Competitor feature/pricing data |
| ROI Calculator | Internal Logic | Built-in formula | Yes | Customize ROI calculation (e.g., include CAC, LTV) |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:40-44 "Improve Data Flow: Data transformation and validation rules"

---

## Notification & Escalation Rules

| Event | Threshold | Action | Recipient |
|-------|-----------|--------|-----------|
| Critical gap identified | Gap severity = CRITICAL | Email + Dashboard alert | Chairman, Product Lead |
| Low opportunity size | SOM < $1M | Warning banner | Product Lead |
| High gap closure cost | Cost > 25% of Stage 7 budget | Approval request | Chairman |
| Opportunity ROI < threshold | ROI < 100% | Flag for review | Product Lead |
| Exit gate failure | Any exit gate fails | Block Stage 10 entry + notify | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:62-65 "Risk Assessment: Primary Risk process delays"

---

## Example Configuration File

```yaml
# config/stage_09_configuration.yaml
stage_09:
  capability_assessment:
    maturity_scale_max: 5
    required_maturity_buffer: 0.5
    capability_categories:
      - technical
      - process
      - people
      - tools

  gap_identification:
    critical_gap_threshold: 0  # Missing capability
    high_gap_threshold: 2.0
    medium_gap_threshold: 1.0
    priority_weights:
      urgency: 0.4
      strategic_fit: 0.3
      cost: 0.3
    p0_auto_block: true

  opportunity_modeling:
    min_roi_threshold: 1.0  # 100%
    market_size_weight: 0.5
    roadmap_timeline_horizon: 12  # months
    som_confidence_level: 0.7

  quality_gates:
    entry:
      min_wbs_tasks: 10
      min_market_data_points: 3
    exit:
      min_gaps_documented: 1
      min_opportunities: 1
      min_roadmap_milestones: 3

  metrics:
    gap_coverage_target: 80  # %
    gap_coverage_blocker: 60  # %
    min_opportunity_size_usd: 2000000
    opportunity_size_blocker: 1000000
    min_capability_score: 3.0
    capability_score_blocker: 2.5

  automation:
    progression_mode: assisted  # manual | assisted | auto
    manual_to_assisted_threshold: 5  # successful completions
    assisted_to_auto_threshold: 10

  risk_profile: balanced  # conservative | balanced | aggressive | strategic

  chairman_controls:
    skip_gap_analysis: false
    gap_coverage_override: false
    opportunity_size_override: false
    force_stage_10_entry: false

  data_sources:
    capability_inventory: capabilities_table
    market_research: manual_entry
    competitor_analysis: manual_entry
    roi_calculator: built_in
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:365-409 "Stage 9 full definition"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 365-409 | Stage definition, metrics, gates |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 35-38, 40-44, 62-65 | Thresholds, data flow, risk assessment |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
