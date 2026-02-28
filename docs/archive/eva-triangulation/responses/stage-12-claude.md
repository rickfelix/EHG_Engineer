---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 12 "Sales Logic" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Sales Model Selection Logic](#3-sales-model-selection-logic)
  - [4. Deal Stages vs Funnel Stages Decision](#4-deal-stages-vs-funnel-stages-decision)
  - [5. Conversion Rates Decision](#5-conversion-rates-decision)
  - [6. Sales Metrics Decision](#6-sales-metrics-decision)
  - [7. Customer Journey Design](#7-customer-journey-design)
  - [8. Reality Gate Enhancement](#8-reality-gate-enhancement)
  - [9. CLI Superiorities (preserve these)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 12 Schema](#10-recommended-stage-12-schema)
  - [11. Minimum Viable Change (priority-ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts (with Stages 1-11 decisions)](#13-dependency-conflicts-with-stages-1-11-decisions)
  - [14. Contrarian Take](#14-contrarian-take)

> Independent response to the Stage 12 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Sales logic generation | Pipeline with defaults + metrics | None (all user-provided) | **5 Critical** | Without AI generation, users must design a complete sales process from scratch. The analysisStep is essential. | CLOSE | The LLM has pricing model, GTM channels, personas -- it can propose a complete sales process. |
| Conversion rates per stage | Per-stage conversion rates | None | **4 High** | Without conversion rates, the funnel is a list of stages without flow. Can't calculate how many leads → customers. | CLOSE | Challenge: Conversion rates at IDENTITY are estimates. But even estimated rates enable funnel math (leads × conv% = customers). |
| Sales metrics (deal size, LTV, CAC) | Explicit fields (avgDealSize, targetLtv, targetCac, LTV:CAC) | Via funnel target_values only | **3 Medium** | These metrics are already captured in Stages 5/7/11. Duplicating them in Stage 12 risks inconsistency. | ADAPT | Challenge: Don't duplicate Stage 5/7 economics. Instead, cross-reference them. Add deal_size as new (not captured elsewhere), reference LTV/CAC from prior stages. |
| Success metrics | User-defined with frequency/owner | None | **2 Low** | Success metrics are execution tracking (daily/weekly cadence). At IDENTITY, the question is "what does success look like?" not "how often do we measure it?" | DEFER | Challenge: Frequency and owner are execution concerns. The funnel's target_value per stage already defines success thresholds. |
| Customer journey triggers | triggerAction + successCriteria | Touchpoint + funnel_stage mapping | **3 Medium** | CLI's touchpoint-to-funnel mapping is sufficient for IDENTITY. Triggers are execution logic. | ADAPT | Challenge: Add touchpoint_type (automated/manual/hybrid) for distinguishing self-serve from high-touch. Don't add full trigger logic. |
| Reality Gate | None | Explicit Phase 3→4 check | **5 Critical** | CLI's Reality Gate is essential for phase transition. Preserve and enhance. | PRESERVE | CLI is correct. The GUI's lack of a gate here is a design omission. |
| Brand variant management | Adaptive naming with market testing | None (not relevant to sales) | **1 Cosmetic** | Brand variants belong in Stage 10, not Stage 12. The GUI conflates naming and sales. | IGNORE | Correctly out of scope. |
| Resource planning | Team/budget/technical resources | None | **1 Cosmetic** | Resource planning belongs in THE BLUEPRINT (Stage 15). Not a Stage 12 concern. | IGNORE | Out of phase. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 5**: Unit economics (CAC, LTV, churn, payback) -- constrains sales model viability
- **Stage 7**: Pricing model and tiers (self-serve-friendly → low-touch; enterprise tiers → high-touch)
- **Stage 8**: BMC Key Activities, Customer Relationships (sales complexity)
- **Stage 9**: Exit strategy buyer_type (PE → metrics-driven sales; strategic → relationship-driven)
- **Stage 10**: Brand positioning (premium brand → consultative sales; accessible brand → self-serve)
- **Stage 11**: GTM channels, personas, pain_points (channel types → sales model alignment)

**Process (single LLM call)**:
1. **Sales Model Selection**: Choose from 6-value enum based on pricing model (freemium → self-serve, enterprise pricing → enterprise sales), target_cac (low CAC → self-serve/marketplace, high CAC → inside-sales/enterprise), and channel mix (direct sales channels → inside-sales/enterprise).
2. **Deal Stage Pipeline**: Design 3-6 stages appropriate to the sales model. Self-serve has fewer stages (trial → conversion → expansion). Enterprise has more (qualification → discovery → demo → proposal → negotiation → close).
3. **Funnel Metrics**: Define 4+ funnel stages with concrete metrics and targets derived from Stage 11 funnel_assumptions.
4. **Customer Journey**: Map 5+ journey steps from awareness through advocacy, linking each to funnel stages and touchpoints.
5. **Conversion Rate Estimation**: Estimate per-stage conversion based on sales model benchmarks.

**Output**: Complete Stage 12 data (sales_model, sales_cycle_days, deal_stages with conversion_rate, funnel_stages, customer_journey)

### 3. Sales Model Selection Logic

The sales_model should be derived algorithmically from prior stage data:

| If... | Then sales_model = |
|-------|-------------------|
| Stage 7 pricing has free tier + low ARPA (<$50/mo) | `self-serve` |
| Stage 7 ARPA $50-500/mo + Stage 11 has direct sales channel | `inside-sales` |
| Stage 7 ARPA >$500/mo + Stage 11 tier 1 persona is enterprise | `enterprise` |
| Mix of free tier + enterprise tiers | `hybrid` |
| Stage 7 pricing model = transactional/platform | `marketplace` |
| Stage 11 has Partnerships as top-3 budget channel | `channel` |

The analysisStep uses this as a heuristic, with rationale explaining the choice. User can override.

### 4. Deal Stages vs Funnel Stages Decision

**Keep both. They serve different purposes.**

- **Deal stages** = pipeline progression (WHERE is the prospect in the sales process?)
  - Each stage has: name, description, avg_duration_days, conversion_rate (NEW)
  - Example: Lead → Qualified → Demo → Proposal → Negotiation → Closed

- **Funnel stages** = metric tracking (HOW is the overall funnel performing?)
  - Each stage has: name, metric, target_value
  - Example: Awareness (impressions, 100K), Consideration (sign-ups, 5K), Trial (activations, 500), Conversion (paid, 50)

The CLI's separation is correct. Deal stages are about individual prospects. Funnel stages are about aggregate flow. The GUI merges them, which conflates individual tracking with aggregate metrics.

### 5. Conversion Rates Decision

**Add conversion_rate to deal stages.**

| Field | Value | Source |
|-------|-------|--------|
| conversion_rate | number (0-1) | Estimated by analysisStep based on sales model benchmarks |

Conversion rates enable critical funnel math:
- `leads × stage1_rate × stage2_rate × ... = closed_deals`
- This connects to Stage 11's estimated_monthly_acquisitions for cross-validation

At IDENTITY phase, rates are benchmarks:
- Self-serve: higher early rates, lower later (40% → 20% → 10% → 5%)
- Enterprise: lower early rates, higher later (10% → 50% → 60% → 80%)

### 6. Sales Metrics Decision

**Cross-reference, don't duplicate.**

| Metric | Already captured | Stage 12 action |
|--------|-----------------|----------------|
| CAC | Stage 5 (unit economics), Stage 11 (target_cac) | Reference, don't duplicate |
| LTV | Stage 5 (unit economics), Stage 7 (derived) | Reference, don't duplicate |
| Churn | Stage 5 (unit economics) | Reference |
| ARPA | Stage 7 (pricing tiers) | Reference |
| **avg_deal_size** | **NOT captured** | **Add** (new to Stage 12) |
| **sales_cycle_days** | Already in CLI | Preserve |

**Add `avg_deal_size`** as the one new metric. It connects pricing (Stage 7 ARPA) to sales reality (actual deal value considering discounts, multi-seat, annual contracts).

### 7. Customer Journey Design

**Keep CLI structure (step + funnel_stage + touchpoint). Add touchpoint_type.**

The CLI's approach of mapping journey steps to funnel stages with touchpoints is cleaner than the GUI's milestone-based approach. Touchpoints are more useful than triggers at IDENTITY phase -- they describe WHERE the interaction happens, not WHEN it fires.

**Add `touchpoint_type` enum**: `automated | manual | hybrid`

This classification matters for the sales model:
- Self-serve: mostly automated touchpoints (email sequences, in-app prompts)
- Enterprise: mostly manual touchpoints (sales calls, demos, proposals)
- Hybrid: mix of both

### 8. Reality Gate Enhancement

**Preserve existing gate. Add one check for new consensus fields.**

The current Reality Gate checks:
- Stage 10: >= 5 scored candidates ✓
- Stage 11: exactly 3 tiers and 8 channels ✓
- Stage 12: >= 4 funnel stages with metrics, >= 5 journey steps ✓

**Proposed additions** (given new consensus):
- Stage 10: decision.status must be `approved` or `working_title` (not `revise`)
- Stage 11: at least 1 channel with non-zero budget (not all $0 backlog channels)
- Stage 12: conversion_rate present for each deal stage

These are lightweight additions that leverage the new consensus fields without over-constraining. The gate remains a completeness check, not a quality assessment.

### 9. CLI Superiorities (preserve these)

- **6-value sales_model enum**: Forces explicit model choice. The GUI's lack of model classification is a gap.
- **Separate deal stages and funnel stages**: Cleaner than merging pipeline with metrics.
- **Customer journey mapped to funnel stages**: Traceability from journey touchpoint to metric.
- **Reality Gate as pure function**: `evaluateRealityGate()` is exported, testable, deterministic.
- **Cross-stage imports**: Uses Stage 10/11 constants (MIN_CANDIDATES, REQUIRED_TIERS, REQUIRED_CHANNELS) for validation.
- **Phase 3→4 gate enforced**: The GUI lacks this entirely.

### 10. Recommended Stage 12 Schema

```javascript
const TEMPLATE = {
  id: 'stage-12',
  slug: 'sales-logic',
  title: 'Sales Logic',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    sales_model: { type: 'enum', values: ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'], required: true },
    sales_cycle_days: { type: 'number', min: 1, required: true },

    // === Updated: deal_stages with conversion_rate ===
    deal_stages: {
      type: 'array', minItems: 3,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        avg_duration_days: { type: 'number', min: 0 },
        conversion_rate: { type: 'number', min: 0, max: 1 },  // NEW
      },
    },

    // === Existing (unchanged) ===
    funnel_stages: {
      type: 'array', minItems: 4,
      items: {
        name: { type: 'string', required: true },
        metric: { type: 'string', required: true },
        target_value: { type: 'number', min: 0, required: true },
      },
    },

    // === Updated: customer_journey with touchpoint_type ===
    customer_journey: {
      type: 'array', minItems: 5,
      items: {
        step: { type: 'string', required: true },
        funnel_stage: { type: 'string', required: true },
        touchpoint: { type: 'string', required: true },
        touchpoint_type: { type: 'enum', values: ['automated', 'manual', 'hybrid'] },  // NEW
      },
    },

    // === NEW: avg_deal_size ===
    avg_deal_size: { type: 'number', min: 0 },

    // === Existing derived (enhanced) ===
    reality_gate: { type: 'object', derived: true },

    // === NEW: Provenance ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for sales logic generation**. Single LLM call consuming Stages 1-11. Produces sales_model (with rationale), deal stages with conversion rates, funnel metrics, and customer journey.

2. **P0: Wire sales model selection to prior stages**. Pricing model + ARPA + channel mix → sales model derivation.

3. **P1: Add conversion_rate to deal stages**. Enables funnel math (leads → customers).

4. **P1: Add touchpoint_type enum to customer journey**. automated/manual/hybrid classification.

5. **P1: Add avg_deal_size**. New metric not captured in prior stages.

6. **P2: Enhance Reality Gate**. Add checks for Stage 10 decision status, Stage 11 non-zero budget channel, Stage 12 conversion rates.

7. **P3: Do NOT add success metrics with frequency/owner**. Execution tracking, not IDENTITY planning.
8. **P3: Do NOT add LTV/CAC/churn fields**. Already in Stage 5/7/11. Cross-reference, don't duplicate.
9. **P3: Do NOT add brand variant management**. Belongs in Stage 10.
10. **P3: Do NOT add resource planning**. Belongs in Stage 15 (Resource Planning).

### 12. Cross-Stage Impact

| Change | Stage 13 (Product Roadmap) | Stage 15 (Resource Planning) | Broader Pipeline |
|--------|--------------------------|----------------------------|-----------------|
| Sales model selection | Product roadmap can prioritize features for the sales model. Self-serve → onboarding UX. Enterprise → admin/security features. | Resource planning knows headcount needs. Self-serve = few sales reps, strong engineering. Enterprise = large sales team. | Sales model is one of the most impactful decisions for the entire venture. It affects staffing, product, marketing, and financial projections. |
| Conversion rates | Product roadmap can identify conversion bottlenecks (low demo→proposal rate → improve demo experience). | Resource planning for sales enablement. | Conversion rates enable end-to-end funnel modeling from marketing spend to revenue. |
| Customer journey touchpoints | Product features align to journey touchpoints. Automated touchpoints → product features. Manual → sales team training. | Resource allocation between automated systems and human processes. | Touchpoint types define the automation-vs-human balance for the entire venture. |
| Reality Gate | Phase 4 begins only with complete Identity profile. Product Roadmap has brand, GTM, and sales context. | Resource Planning trusts that Identity phase is substantive. | The Reality Gate ensures all IDENTITY stages are complete before BLUEPRINT. Without it, downstream stages lack foundational context. |

### 13. Dependency Conflicts (with Stages 1-11 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 5 → 12 (unit economics for model selection) | **OK** | Stage 5 has CAC, LTV, payback. Available for sales model heuristics. |
| Stage 7 → 12 (pricing for model selection) | **OK** | Stage 7 has pricing model, ARPA, tiers. Key driver for self-serve vs enterprise. |
| Stage 11 → 12 (GTM for sales alignment) | **OK** | Stage 11 has channels with types, personas with pain_points. Direct handoff to sales design. |
| Stage 10 → 12 (brand for Reality Gate) | **OK** | Stage 10 decision.status is available for enhanced gate check. |
| Reality Gate → Stage 11 consensus | **Minor update needed** | Current gate checks `REQUIRED_CHANNELS = 8`. If Stage 11's consensus keeps exactly 8 (which it does), no change needed. Gate imports REQUIRED_CHANNELS from stage-11.js, so it auto-adapts. |

### 14. Contrarian Take

**Arguing AGAINST the 6-value sales_model enum:**

The most distinctive CLI feature is the 6-value sales model enum. Here's why this could be wrong:

1. **Sales models are rarely pure.** Almost every modern SaaS company is "hybrid" -- self-serve for small customers, inside-sales for mid-market, enterprise for large accounts. Forcing a single enum value oversimplifies. If most ventures select "hybrid," the enum provides no analytical value.

2. **The model should emerge from the data, not precede it.** By the time you've defined deal stages, conversion rates, customer journey touchpoints, and sales cycle length, the sales model is IMPLICIT. A 30-day cycle with automated touchpoints = self-serve. A 120-day cycle with manual demos = enterprise. The enum is redundant with the data it describes.

3. **Model lock-in at IDENTITY phase.** Choosing "enterprise" at Stage 12 biases all downstream stages toward enterprise features, enterprise staffing, enterprise timelines. But at IDENTITY phase, you haven't validated whether enterprise customers will actually buy. You might discover in BUILD that your "enterprise" product gets traction with mid-market self-serve buyers.

4. **What could go wrong**: Ventures select a sales model, build their identity around it, then discover it's wrong during BUILD. The enum creates premature commitment.

**Counter-argument**: The enum forces a decision that clarifies everything downstream. Product Roadmap, Resource Planning, and Financial Projections all depend on knowing the sales model. Without it, downstream stages must guess.

**Verdict**: Keep the enum but add `primary` qualifier (e.g., "primarily enterprise with self-serve expansion"). The analysisStep should propose a model with rationale AND flag alternatives. The enum captures the dominant model, not the only model.
