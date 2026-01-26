# Stage 15: Canonical YAML Definition


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: schema, feature, protocol, handoff

**Source File**: `/mnt/c/_EHG/EHG_Engineer/docs/workflow/stages.yaml`
**Line Range**: 643-688 (46 lines)
**Commit**: EHG_Engineer@6ef8cf4
**Authority**: This YAML block is the SINGLE SOURCE OF TRUTH for Stage 15 specifications.

---

## Full YAML Block

```yaml
  - id: 15
    title: Pricing Strategy & Revenue Architecture
    description: Develop comprehensive pricing strategy and revenue model.
    depends_on:
      - 14
    inputs:
      - Cost structure
      - Market research
      - Competitor pricing
    outputs:
      - Pricing model
      - Revenue projections
      - Pricing tiers
    metrics:
      - Price optimization
      - Revenue potential
      - Market acceptance
    gates:
      entry:
        - Costs calculated
        - Market research complete
      exit:
        - Pricing approved
        - Tiers defined
        - Projections validated
    substages:
      - id: '15.1'
        title: Pricing Research
        done_when:
          - Competitor prices analyzed
          - Customer willingness assessed
          - Value metrics defined
      - id: '15.2'
        title: Model Development
        done_when:
          - Pricing model created
          - Tiers structured
          - Discounts planned
      - id: '15.3'
        title: Revenue Projection
        done_when:
          - Projections calculated
          - Scenarios modeled
          - Targets set
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643-688` "id: 15 | title: Pricing Strategy & Re"

---

## Field-by-Field Analysis

### Core Identification

**Field**: `id`
**Value**: `15`
**Type**: Integer
**Purpose**: Unique stage identifier in 40-stage workflow
**Usage**: Referenced by Stage 16+ for dependency resolution

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643` "id: 15"

---

**Field**: `title`
**Value**: `Pricing Strategy & Revenue Architecture`
**Type**: String
**Purpose**: Human-readable stage name for UI and documentation
**Usage**: Display in dashboards, reports, and agent handoffs

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:644` "title: Pricing Strategy & Revenue Arch"

---

**Field**: `description`
**Value**: `Develop comprehensive pricing strategy and revenue model.`
**Type**: String
**Purpose**: Brief summary of stage objective
**Usage**: Contextual guidance for agents and operators

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:645` "description: Develop comprehensive pric"

---

### Dependency Configuration

**Field**: `depends_on`
**Value**: `[14]`
**Type**: Array of integers
**Purpose**: Declares upstream stage dependencies (Stage 14: Cost Estimation)
**Blocking Behavior**: Stage 15 cannot start until Stage 14 exits successfully

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:646-647` "depends_on: [14]"

**Dependency Logic**:
- Stage 14 must reach exit gate "Costs calculated"
- Cost structure artifact must be available in Stage 15 inputs
- If Stage 14 fails or recurses, Stage 15 is blocked

---

### Data Contracts

**Field**: `inputs`
**Value**: `[Cost structure, Market research, Competitor pricing]`
**Type**: Array of strings (3 items)
**Purpose**: Required data artifacts for stage execution

**Input #1**: `Cost structure`
- **Source**: Stage 14 output
- **Format**: Detailed cost breakdown with line items
- **Validation**: Entry gate "Costs calculated"

**Input #2**: `Market research`
- **Source**: Stage 5 output (indirect dependency)
- **Format**: Market analysis report with pricing insights
- **Validation**: Entry gate "Market research complete"

**Input #3**: `Competitor pricing`
- **Source**: External data collection
- **Format**: Competitor pricing data with comparable products
- **Validation**: Required for substage 15.1 completion

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:648-651` "inputs: Cost structure | Market researc"

---

**Field**: `outputs`
**Value**: `[Pricing model, Revenue projections, Pricing tiers]`
**Type**: Array of strings (3 items)
**Purpose**: Generated artifacts delivered to downstream stages

**Output #1**: `Pricing model`
- **Format**: Structured document with pricing logic and rationale
- **Consumer**: Stage 16 (Business Model Canvas)
- **Validation**: Exit gate "Pricing approved"

**Output #2**: `Revenue projections`
- **Format**: Financial projections with multiple scenarios (best/worst/likely)
- **Consumer**: Financial planning stages (Stage 17+)
- **Validation**: Exit gate "Projections validated"

**Output #3**: `Pricing tiers`
- **Format**: Customer-facing tier structure (minimum 3 tiers)
- **Consumer**: Stage 16, marketing stages, sales enablement
- **Validation**: Exit gate "Tiers defined"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:652-655` "outputs: Pricing model | Revenue projec"

---

### Measurement Framework

**Field**: `metrics`
**Value**: `[Price optimization, Revenue potential, Market acceptance]`
**Type**: Array of strings (3 items)
**Purpose**: Key performance indicators for stage success

**Metric #1**: `Price optimization`
- **Definition**: Maximize revenue without triggering market rejection
- **Measurement**: Revenue per customer vs. churn rate correlation
- **Target**: TBD (missing threshold - see critique gap)

**Metric #2**: `Revenue potential`
- **Definition**: Projected Annual Recurring Revenue (ARR) or Monthly Recurring Revenue (MRR)
- **Measurement**: Calculated in substage 15.3 (Revenue Projection)
- **Target**: TBD (missing threshold - see critique gap)

**Metric #3**: `Market acceptance`
- **Definition**: Customer willingness-to-pay validation
- **Measurement**: Survey data, competitive benchmarking, focus groups
- **Target**: TBD (missing threshold - see critique gap)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:656-659` "metrics: Price optimization | Revenue p"

**Critique Gap**: No threshold values or measurement frequency defined (critique issue #2).
**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:37-39` "Missing: Threshold values, measurement"

---

### Quality Gates

**Field**: `gates.entry`
**Value**: `[Costs calculated, Market research complete]`
**Type**: Array of strings (2 items)
**Purpose**: Preconditions that MUST be TRUE before stage execution begins

**Entry Gate #1**: `Costs calculated`
- **Validation**: Stage 14 exit gate passed + cost structure artifact exists
- **Blocker Type**: HARD (cannot proceed without)
- **Owner**: Stage 14 (Cost Estimation)

**Entry Gate #2**: `Market research complete`
- **Validation**: Stage 5 completed OR external market research available
- **Blocker Type**: HARD (cannot assess pricing without market data)
- **Owner**: Stage 5 (Market Analysis) or external research team

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:660-663` "gates: entry: Costs calculated | Market"

---

**Field**: `gates.exit`
**Value**: `[Pricing approved, Tiers defined, Projections validated]`
**Type**: Array of strings (3 items)
**Purpose**: Success criteria that MUST be TRUE before stage completion

**Exit Gate #1**: `Pricing approved`
- **Validation**: LEAD agent reviews and approves pricing model
- **Blocker Type**: HARD (blocks Stage 16)
- **Reviewer**: LEAD agent (stage owner)

**Exit Gate #2**: `Tiers defined`
- **Validation**: Minimum 3 pricing tiers documented with features and pricing
- **Blocker Type**: HARD (blocks downstream business model)
- **Artifact**: Pricing tiers document or spreadsheet

**Exit Gate #3**: `Projections validated`
- **Validation**: Financial review confirms revenue projections are realistic
- **Blocker Type**: HARD (blocks financial planning stages)
- **Reviewer**: Financial planning team or LEAD agent

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:664-667` "exit: Pricing approved | Tiers defined"

---

### Substage Breakdown

**Field**: `substages`
**Value**: Array of 3 substage objects
**Type**: Array of objects
**Purpose**: Sequential sub-workflows within Stage 15

---

#### Substage 15.1: Pricing Research

**Field**: `substages[0].id`
**Value**: `'15.1'`
**Type**: String (quoted for YAML compatibility)

**Field**: `substages[0].title`
**Value**: `Pricing Research`

**Field**: `substages[0].done_when`
**Value**: `[Competitor prices analyzed, Customer willingness assessed, Value metrics defined]`
**Type**: Array of strings (3 completion criteria)

**Completion Criterion #1**: `Competitor prices analyzed`
- **Deliverable**: Competitor pricing matrix or report
- **Validation**: Minimum 5 competitors analyzed (suggested)

**Completion Criterion #2**: `Customer willingness assessed`
- **Deliverable**: Customer willingness-to-pay survey or focus group results
- **Validation**: Statistically significant sample size

**Completion Criterion #3**: `Value metrics defined`
- **Deliverable**: Value-based pricing framework
- **Validation**: Metrics mapped to customer segments

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:669-674` "id: '15.1' | title: Pricing Research"

---

#### Substage 15.2: Model Development

**Field**: `substages[1].id`
**Value**: `'15.2'`

**Field**: `substages[1].title`
**Value**: `Model Development`

**Field**: `substages[1].done_when`
**Value**: `[Pricing model created, Tiers structured, Discounts planned]`
**Type**: Array of strings (3 completion criteria)

**Completion Criterion #1**: `Pricing model created`
- **Deliverable**: Pricing model document with logic and rationale
- **Validation**: Model includes cost-plus, value-based, or competitive pricing approach

**Completion Criterion #2**: `Tiers structured`
- **Deliverable**: Minimum 3 pricing tiers (Basic, Pro, Enterprise suggested)
- **Validation**: Each tier has clear feature differentiation

**Completion Criterion #3**: `Discounts planned`
- **Deliverable**: Discount policy for annual subscriptions, volume, etc.
- **Validation**: Discount structure documented and approved

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:675-680` "id: '15.2' | title: Model Development"

---

#### Substage 15.3: Revenue Projection

**Field**: `substages[2].id`
**Value**: `'15.3'`

**Field**: `substages[2].title`
**Value**: `Revenue Projection`

**Field**: `substages[2].done_when`
**Value**: `[Projections calculated, Scenarios modeled, Targets set]`
**Type**: Array of strings (3 completion criteria)

**Completion Criterion #1**: `Projections calculated`
- **Deliverable**: Revenue projections (ARR/MRR) with assumptions
- **Validation**: Projections based on pricing model and market size

**Completion Criterion #2**: `Scenarios modeled`
- **Deliverable**: Best-case, worst-case, and likely-case scenarios
- **Validation**: Minimum 3 scenarios with probability weightings

**Completion Criterion #3**: `Targets set`
- **Deliverable**: Revenue targets for Year 1, Year 2, Year 3
- **Validation**: Targets aligned with business goals and realistic growth rates

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:681-686` "id: '15.3' | title: Revenue Projection"

---

### Metadata & Notes

**Field**: `notes.progression_mode`
**Value**: `Manual → Assisted → Auto (suggested)`
**Type**: String
**Purpose**: Recommended automation progression path

**Interpretation**:
- **Manual**: Initial pricing strategy requires human expertise (current state)
- **Assisted**: AI tools assist with competitor analysis and scenario modeling (target state)
- **Auto**: Automated pricing optimization with AI-driven adjustments (future state)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:687-688` "notes: progression_mode: Manual → Assis"

---

## YAML Validation Status

**Schema Compliance**: PASS
**Required Fields Present**: PASS (id, title, description, depends_on, inputs, outputs, metrics, gates, substages)
**Type Validation**: PASS (all fields match expected types)
**Dependency Integrity**: PASS (Stage 14 exists in workflow)
**Substage Completeness**: PASS (all substages have id, title, done_when)

**Warnings**: None
**Errors**: None

---

## Canonical Authority Statement

This YAML block (lines 643-688) is the **SINGLE SOURCE OF TRUTH** for Stage 15. Any conflict between this canonical definition and other documentation MUST be resolved in favor of this YAML.

**Modification Protocol**:
1. Edit `docs/workflow/stages.yaml` lines 643-688
2. Run validation: `npm run validate:stages` (if available)
3. Regenerate all Stage 15 dossier files
4. Update `DELTA_LOG_PHASE7.md` with change record
5. Commit with message: `docs(stage-15): Update canonical YAML definition`

**Evidence Authority**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643-688` "Full YAML block (46 lines)"

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
