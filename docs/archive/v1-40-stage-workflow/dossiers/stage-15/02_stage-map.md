# Stage 15: Dependency Graph & Workflow Position

## Visual Dependency Map

```
Stage 5 (Market Analysis) ────┐
                               ├──► Stage 14 (Cost Estimation) ──► Stage 15 (Pricing Strategy) ──► Stage 16 (Business Model)
                               │
                               └──► [Market Research Data]
                                    [Competitor Pricing Data]
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:646-647` "depends_on: [14]"

## Upstream Dependencies

### Stage 14: Cost & Resource Estimation (REQUIRED)
**Relationship**: Direct predecessor
**Data Contract**: Cost structure with detailed breakdown
**Blocking**: Stage 15 cannot start until costs are calculated

**Entry Gate Validation**: "Costs calculated" must be TRUE

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:661-663` "entry: Costs calculated | Market resear"

### Stage 5: Market Analysis & Customer Discovery (INDIRECT)
**Relationship**: Indirect dependency via market research input
**Data Contract**: Market research findings and customer segments
**Blocking**: Required for entry gate "Market research complete"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:649-650` "inputs: Cost structure | Market research"

### External Data Sources (REQUIRED)
**Relationship**: External input dependency
**Data Contract**: Competitor pricing data from market research
**Blocking**: Required for substage 15.1 (Pricing Research)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:651` "Competitor pricing"

## Downstream Impact

### Stage 16: Business Model Canvas (DIRECT)
**Relationship**: Direct successor (inferred from Stage 16 dependencies)
**Data Consumed**: Pricing model, revenue projections, pricing tiers
**Impact**: Pricing strategy feeds into business model revenue streams

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:58-60` "Downstream Impact: Stages 16"

### Stage 17+: Financial Planning (INDIRECT)
**Relationship**: Indirect downstream via revenue projections
**Data Consumed**: Revenue potential metrics and financial targets
**Impact**: Revenue projections inform financial forecasting

## Critical Path Analysis

**Stage 15 Critical Path Status**: **NOT on critical path**

**Justification**: While pricing is essential for business viability, it can be developed in parallel with other non-dependent stages. Delays in Stage 15 will NOT block the entire workflow if other paths are available.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:60` "Critical Path: No"

**Risk Implication**: Medium priority for resource allocation; delays acceptable if critical path stages are progressing.

## Parallel Execution Opportunities

Stage 15 can execute in parallel with:
- **Stage 17**: Marketing Strategy (if market research is complete)
- **Stage 18**: Competitive Analysis (complementary research)
- **Stage 19+**: Any non-financial downstream stages

**Constraint**: Stage 15 MUST complete before Stage 16 (Business Model Canvas) can finalize revenue streams.

## Workflow Position Context

**Phase**: Business Planning (Stages 14-17)
**Sequence**: 15 of 40 stages (37.5% complete)
**Owner**: LEAD agent
**Automation Mode**: Manual → Assisted → Auto (suggested progression)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:688` "progression_mode: Manual → Assisted → A"

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 14: Cost Estimation                                    │
│ OUTPUT: Cost structure (detailed breakdown)                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 15: Pricing Strategy                                   │
│                                                              │
│ INPUTS:                                                      │
│  1. Cost structure (from Stage 14)                          │
│  2. Market research (from Stage 5)                          │
│  3. Competitor pricing (external)                           │
│                                                              │
│ PROCESSING:                                                  │
│  15.1 Pricing Research ──► 15.2 Model Development ──►       │
│       15.3 Revenue Projection                               │
│                                                              │
│ OUTPUTS:                                                     │
│  1. Pricing model (with tiers and logic)                    │
│  2. Revenue projections (scenario-based)                    │
│  3. Pricing tiers (customer-facing)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 16: Business Model Canvas                              │
│ INPUT: Pricing model, Revenue projections, Pricing tiers    │
└─────────────────────────────────────────────────────────────┘
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:648-655` "inputs: Cost structure | outputs: Pricin"

## Blocking Conditions

### Entry Blocking Conditions (2 gates)
1. **Gate: Costs calculated**
   - **Source**: Stage 14 exit criteria
   - **Validation**: Cost structure artifact exists and approved
   - **Blocker**: HARD (cannot proceed without cost data)

2. **Gate: Market research complete**
   - **Source**: Stage 5 completion or external research
   - **Validation**: Market research report exists with pricing insights
   - **Blocker**: HARD (cannot assess market willingness-to-pay)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:661-663` "entry: Costs calculated | Market resear"

### Exit Blocking Conditions (3 gates)
1. **Gate: Pricing approved**
   - **Validator**: LEAD agent sign-off
   - **Criteria**: Pricing model reviewed and approved
   - **Blocker**: HARD (blocks Stage 16)

2. **Gate: Tiers defined**
   - **Validator**: Minimum 3 pricing tiers documented
   - **Criteria**: Each tier has clear features and pricing
   - **Blocker**: HARD (blocks downstream business model)

3. **Gate: Projections validated**
   - **Validator**: Financial review and validation
   - **Criteria**: Revenue projections are realistic and justified
   - **Blocker**: HARD (blocks financial planning stages)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:664-667` "exit: Pricing approved | Tiers defined"

## Dependency Health Metrics

**Upstream Dependency Health**:
- Stage 14 completion: REQUIRED (entry gate blocker)
- Stage 5 completion: REQUIRED (entry gate blocker)
- External data availability: REQUIRED (substage 15.1 blocker)

**Downstream Impact Radius**:
- Direct impact: 1 stage (Stage 16)
- Indirect impact: 5+ stages (all financial planning stages)
- Business criticality: HIGH (revenue model is foundational)

## Revision History

**Stage 15 Position Changes**: None (stable since workflow inception)
**Dependency Changes**: None (depends_on: [14] unchanged)
**Critical Path Status**: Stable (not on critical path)

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
