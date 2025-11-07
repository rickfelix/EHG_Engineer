# Stage 6: Canonical Definition (from stages.yaml)

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-273

**Purpose**: This file contains the complete, authoritative YAML definition for Stage 6 as extracted from the governance repository.

---

## Full YAML Definition

```yaml
  - id: 6
    title: Risk Evaluation
    description: Comprehensive risk assessment and mitigation strategy development.
    depends_on:
      - 5
    inputs:
      - Financial model
      - Technical assessment
      - Market analysis
    outputs:
      - Risk matrix
      - Mitigation plans
      - Contingency strategies
    metrics:
      - Risk coverage
      - Mitigation effectiveness
      - Risk score
    gates:
      entry:
        - Financial model complete
        - Technical review done
      exit:
        - All risks identified
        - Mitigation plans approved
        - Risk tolerance defined
    substages:
      - id: '6.1'
        title: Risk Identification
        done_when:
          - Technical risks listed
          - Market risks assessed
          - Operational risks mapped
      - id: '6.2'
        title: Risk Scoring
        done_when:
          - Probability assigned
          - Impact assessed
          - Risk matrix created
      - id: '6.3'
        title: Mitigation Planning
        done_when:
          - Mitigation strategies defined
          - Contingencies planned
          - Triggers identified
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-273 "id: 6, title: Risk Evaluation"

---

## Field Breakdown

### Core Identification

| Field | Value |
|-------|-------|
| **id** | 6 |
| **title** | Risk Evaluation |
| **description** | Comprehensive risk assessment and mitigation strategy development. |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-230 "id: 6, title: Risk Evaluation"

---

### Dependencies

**depends_on**: `[5]`

**Meaning**: Stage 6 requires Stage 5 (Profitability Forecasting) to be complete before execution can begin.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:231-232 "depends_on: - 5"

---

### Inputs (3 Total)

1. **Financial model**: P&L projections, ROI calculations, cost/revenue assumptions from Stage 5
2. **Technical assessment**: Technical risks, architecture decisions, technology choices (from Stage 10 or preliminary review)
3. **Market analysis**: Competitive landscape, market dynamics, customer segments from Stage 4

**Purpose**: These inputs inform the risk identification process (Substage 6.1) and provide context for impact assessment (Substage 6.2).

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:233-236 "inputs: Financial model"

---

### Outputs (3 Total)

1. **Risk matrix**: 2D matrix showing probability vs. impact for all identified risks
2. **Mitigation plans**: Specific strategies to reduce probability or impact of each risk
3. **Contingency strategies**: Fallback plans if mitigation fails or risks materialize

**Purpose**: Risk matrix informs Go/No-Go decision; mitigation plans guide execution; contingencies provide safety net.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:237-240 "outputs: Risk matrix"

---

### Metrics (3 Total)

1. **Risk coverage**: % of identified risks with defined mitigation plans (target: 100%)
2. **Mitigation effectiveness**: Estimated risk reduction from mitigation strategies (target: >70%)
3. **Risk score**: Overall risk rating (composite of probability × impact for all risks) (target: <threshold)

**Purpose**: Measure completeness (coverage), quality (effectiveness), and severity (risk score) of risk assessment.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241-244 "metrics: Risk coverage"

**Note**: Thresholds not specified in stages.yaml; critique notes "Metrics defined but validation criteria unclear" (Testability: 3/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:9 "Testability | 3 | validation criteria unclear"

---

### Entry Gates (2 Total)

1. **Financial model complete**: Stage 5 must have finalized P&L projections, ROI calculations, break-even analysis
2. **Technical review done**: Preliminary or full technical assessment must be available (from Stage 10 or ad-hoc review)

**Purpose**: Ensure sufficient input data exists before risk identification begins.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:245-248 "entry: Financial model complete"

---

### Exit Gates (3 Total)

1. **All risks identified**: Complete enumeration of technical, market, operational risks (Substage 6.1 complete)
2. **Mitigation plans approved**: Chairman/EXEC has reviewed and approved mitigation strategies (Substage 6.3 complete)
3. **Risk tolerance defined**: Maximum acceptable risk score or specific risks flagged as dealbreakers

**Purpose**: Ensure risk assessment is comprehensive, mitigation is viable, and risk appetite is clear before proceeding.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:249-252 "exit: All risks identified"

---

### Substages (3 Total)

#### Substage 6.1: Risk Identification

**ID**: 6.1
**Title**: Risk Identification

**Done When**:
- Technical risks listed (e.g., technology scalability, dependency vulnerabilities, architecture complexity)
- Market risks assessed (e.g., competitive response, market timing, customer adoption)
- Operational risks mapped (e.g., regulatory compliance, supply chain, talent availability)

**Purpose**: Comprehensive enumeration of all potential risks across all domains.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:254-259 "id: '6.1', title: Risk Identification"

---

#### Substage 6.2: Risk Scoring

**ID**: 6.2
**Title**: Risk Scoring

**Done When**:
- Probability assigned (e.g., Low 0-33%, Medium 34-66%, High 67-100%)
- Impact assessed (e.g., Low <$10k, Medium $10k-$100k, High >$100k)
- Risk matrix created (2D grid: probability × impact)

**Purpose**: Prioritize risks by severity; identify high-impact, high-probability risks requiring immediate mitigation.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:260-265 "id: '6.2', title: Risk Scoring"

---

#### Substage 6.3: Mitigation Planning

**ID**: 6.3
**Title**: Mitigation Planning

**Done When**:
- Mitigation strategies defined (specific actions to reduce probability or impact)
- Contingencies planned (fallback plans if mitigation fails)
- Triggers identified (conditions that activate contingency plans)

**Purpose**: Develop actionable mitigation plans; define clear triggers for fallback strategies.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:266-271 "id: '6.3', title: Mitigation Planning"

---

### Notes

**progression_mode**: Manual → Assisted → Auto (suggested)

**Interpretation**:
- **Manual**: Risk identification and scoring done manually by human analyst
- **Assisted**: AI suggests risks based on industry benchmarks, historical data; human reviews and approves
- **Auto**: AI automatically identifies, scores, and proposes mitigation; human reviews exceptions only

**Current State**: Manual (no AI assistance implemented yet)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:273 "progression_mode: Manual → Assisted"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:11 "Automation Leverage | 3 | Partial automation possible"

---

## Schema Compliance

**Required Fields Present**:
- ✅ `id` (6)
- ✅ `title` (Risk Evaluation)
- ✅ `description` (Comprehensive risk assessment...)
- ✅ `depends_on` ([5])
- ✅ `inputs` (3 items)
- ✅ `outputs` (3 items)
- ✅ `metrics` (3 items)
- ✅ `gates.entry` (2 items)
- ✅ `gates.exit` (3 items)
- ✅ `substages` (3 items with done_when)
- ✅ `notes` (progression_mode)

**Validation**: All required fields per stages.yaml schema present and populated.

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Full YAML | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 228-273 |
| Critique assessment | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-06.md | 1-71 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
