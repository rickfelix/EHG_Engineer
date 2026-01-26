<!-- ARCHIVED: 2026-01-26T16:26:46.316Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-06\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 6: Agent Orchestration & Governance Mapping


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

**Purpose**: Document Python CrewAI agent mappings, governance sub-agent invocations, and automation boundaries for Stage 6.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-273 "id: 6, Risk Evaluation"

---

## Current State: No Agents Mapped

**Status**: ⚠️ **NOT IMPLEMENTED**

**Assessment**: Stage 6 has NO Python CrewAI agents currently mapped in the venture application (EHG repository).

**Evidence**: Scan of EHG@0d80dac:agent-platform/ - no risk evaluation agents found

**Automation Level**: Manual (0% automated)

**Target State**: Assisted (80% automation per critique)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:30-33 "Target State: 80% automation"

---

## Proposed Agent Architecture

**Note**: This section proposes future agent architecture. All agents marked as "Proposed" are NOT implemented yet.

### Agent 1: Risk Identification Agent (Proposed)

**Name**: `RiskIdentificationAgent`
**Type**: Python CrewAI Agent
**Owner**: EHG repository (venture application)

**Responsibilities**:
1. Analyze financial model (from Stage 5) to identify cost risks
2. Analyze technical assessment (from Stage 10 or preliminary review) to identify technical risks
3. Analyze market analysis (from Stage 4) to identify competitive/market risks
4. Analyze industry-specific compliance requirements (GDPR, HIPAA, SOC2) to identify operational risks
5. Generate comprehensive risk checklist (technical, market, operational)

**Inputs**:
- `ventures.financial_model` (JSONB from Stage 5)
- `ventures.technical_assessment` (JSONB from Stage 10 or ad-hoc)
- `ventures.market_analysis` (JSONB from Stage 4)
- Industry type (e.g., "healthcare", "fintech", "SaaS")

**Outputs**:
- `risk_identification_checklist` (JSON array of risks with type, description)

**Tools**:
- LLM (GPT-4) for industry-specific risk analysis
- Risk database (historical risks by industry/venture type)
- Compliance frameworks API (GDPR checklist, HIPAA requirements, SOC2 controls)

**Integration**: Invoked at Substage 6.1 start

**Estimated Build Effort**: 5-7 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:254-259 "Risk Identification done_when"

---

### Agent 2: Risk Scoring Agent (Proposed)

**Name**: `RiskScoringAgent`
**Type**: Python CrewAI Agent
**Owner**: EHG repository (venture application)

**Responsibilities**:
1. Assign probability to each identified risk (Low/Medium/High or 0-100%)
2. Assess impact for each risk (Low/Medium/High or $cost estimate)
3. Calculate composite risk score (probability × impact)
4. Generate risk matrix (2D visualization: probability vs impact)
5. Prioritize risks by severity (Critical/High/Medium/Low)

**Inputs**:
- `risk_identification_checklist` (from Risk Identification Agent)
- Historical probability data (e.g., "Database scalability risk occurs in 60% of SaaS ventures")
- Financial model (to estimate cost impact)

**Outputs**:
- `risk_matrix` (JSONB with probability, impact, severity for each risk)
- `prioritized_risks` (JSON array sorted by severity)

**Tools**:
- LLM (GPT-4) for probability estimation
- Historical risk database (calibrate estimates)
- Financial model calculator (estimate cost impact)

**Integration**: Invoked at Substage 6.2 start

**Estimated Build Effort**: 5-7 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:260-265 "Risk Scoring done_when"

---

### Agent 3: Mitigation Planning Agent (Proposed)

**Name**: `MitigationPlanningAgent`
**Type**: Python CrewAI Agent
**Owner**: EHG repository (venture application)

**Responsibilities**:
1. Propose mitigation strategies for each Critical/High risk
2. Estimate mitigation cost and effectiveness (% risk reduction)
3. Propose contingency plans (fallback if mitigation fails)
4. Define triggers for contingency activation
5. **Check for hidden costs**: Sum mitigation costs; if > 10% of OpEx, flag for FIN-001 recursion

**Inputs**:
- `risk_matrix` (from Risk Scoring Agent)
- `ventures.financial_model` (to check mitigation cost impact)
- Mitigation strategy templates (e.g., "Database scalability → Migrate to distributed DB")

**Outputs**:
- `mitigation_plans` (JSONB with strategies, costs, effectiveness)
- `contingency_strategies` (JSONB with fallback plans, triggers)
- `recursion_flag` (boolean: true if hidden costs > threshold)

**Tools**:
- LLM (GPT-4) for mitigation strategy generation
- Cost estimation API (e.g., "GDPR consultant = $20k/year")
- Mitigation template database (historical strategies by risk type)

**Integration**: Invoked at Substage 6.3 start

**Recursion Decision**: If `recursion_flag = true`, invoke `RecursionEngine.triggerRecursion('FIN-001', fromStage: 6, toStage: 5)`

**Estimated Build Effort**: 7-10 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:266-271 "Mitigation Planning done_when"

---

## Recursion Engine Integration (Proposed)

**Service**: `recursionEngine.ts` (proposed, not implemented yet)

**Purpose**: Trigger FIN-001 recursion when Stage 6 discovers hidden costs

**Invocation**:

```typescript
// Mitigation Planning Agent completes
const totalMitigationCost = mitigationPlans.reduce((sum, plan) => sum + plan.cost, 0);
const opex = financialModel.costs.opex;

if (totalMitigationCost > opex * 0.10) {
  // Hidden costs > 10% of OpEx → Trigger recursion
  await recursionEngine.triggerRecursion({
    ventureId,
    fromStage: 6,
    toStage: 5,
    triggerType: 'FIN-001',
    triggerData: {
      mitigation_costs: totalMitigationCost,
      original_opex: opex,
      threshold_pct: 10,
      hidden_cost_breakdown: mitigationPlans.map(p => ({ risk: p.risk_id, cost: p.cost }))
    },
    severity: 'HIGH',
    autoExecuted: false,  // Requires Chairman approval
    resolution_notes: `Risk mitigation uncovers hidden costs of $${totalMitigationCost} (${(totalMitigationCost/opex*100).toFixed(1)}% of OpEx). Financial model needs update.`
  });
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91 "Risk assessment uncovers hidden costs"

**Note**: RecursionEngine is proposed (not implemented). Referenced in Stage 5 recursion blueprint.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:136 "recursionEngine.ts: Central recursion"

---

## Governance Sub-Agent Mapping (Node.js)

**Note**: EHG_Engineer repository (governance) has Node.js sub-agents for quality control. Stage 6 does NOT currently invoke governance sub-agents, but could integrate in future.

### Potential Sub-Agent: Risk Quality Reviewer (Proposed)

**Name**: `RiskQualityReviewer`
**Type**: Node.js Sub-Agent
**Owner**: EHG_Engineer repository (governance)

**Responsibilities**:
1. Validate risk assessment completeness (minimum 10-15 risks across all domains)
2. Validate risk scoring consistency (probability + impact assigned to all risks)
3. Validate mitigation plan quality (all Critical/High risks have mitigation)
4. Generate quality score (0-100) for risk assessment
5. Flag issues (e.g., "Missing operational risks", "Subjective probability estimates")

**Invocation**: Called at Stage 6 exit gates (before Chairman approval)

**Estimated Build Effort**: 3-5 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:9 "Testability | 3 | validation criteria unclear"

---

## Chairman Approval Workflow (Proposed)

**Trigger**: Substage 6.3 complete; mitigation plans require approval

**Workflow**:

1. **Risk Assessment Summary Generated**: All outputs (risk_matrix, mitigation_plans, contingency_strategies) compiled
2. **Chairman Notified**: Email + dashboard notification with risk summary
3. **Chairman Reviews**:
   - Risk matrix (identify Critical/High risks)
   - Mitigation plans (validate strategies, costs, effectiveness)
   - Overall risk score (compare to threshold, e.g., <50)
4. **Chairman Decision**:
   - **Approve**: Proceed to Stage 7
   - **Revise**: Return to Substage 6.1, 6.2, or 6.3 for corrections
   - **Recurse**: Trigger FIN-001 to Stage 5 if hidden costs significant
   - **Kill**: Terminate venture if risks unacceptable

**Implementation**: Chairman approval UI (proposed, not built)

**Estimated Build Effort**: 5-7 days

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:250 "Mitigation plans approved"

---

## Automation Boundaries

**What Agents CAN Automate** (Target State):
- ✅ Risk identification (AI suggests risks from industry benchmarks, historical data)
- ✅ Risk scoring (AI estimates probability + impact from patterns)
- ✅ Mitigation strategy proposals (AI suggests strategies from templates)
- ✅ Recursion detection (AI flags hidden costs > threshold)

**What Agents CANNOT Automate** (Requires Human):
- ❌ Chairman approval (final Go/No-Go decision)
- ❌ Risk tolerance definition (strategic business decision)
- ❌ Subjective risk assessment (e.g., "Is regulatory risk acceptable for our industry?")
- ❌ Mitigation plan approval (validate mitigation viability, cost, effectiveness)

**Automation Level**:
- **Current**: 0% (fully manual)
- **Target**: 80% (AI-assisted risk identification, scoring, mitigation proposals; human reviews and approves)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:30-33 "Target State: 80% automation"

---

## Integration Requirements

### Integration 1: Recursion Engine (Proposed)

**Purpose**: Trigger FIN-001 when hidden costs discovered

**Status**: Not implemented (proposed in Stage 5 recursion blueprint)

**Gap**: GAP-S6-002 (Recursion Engine Integration)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:136 "recursionEngine.ts: Central recursion"

---

### Integration 2: Risk Database (Proposed)

**Purpose**: Store historical risks, mitigation strategies, probabilities for AI training

**Status**: Not implemented

**Schema**:

```sql
CREATE TABLE risk_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_type VARCHAR(50) NOT NULL,  -- 'technical', 'market', 'operational'
  risk_description TEXT NOT NULL,
  industry VARCHAR(50),
  probability_pct NUMERIC,  -- Historical probability 0-100
  impact_usd NUMERIC,       -- Historical cost impact
  mitigation_strategy TEXT,
  mitigation_effectiveness_pct NUMERIC,  -- % risk reduction
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Gap**: GAP-S6-003 (Risk Database)

---

### Integration 3: Compliance Frameworks API (Proposed)

**Purpose**: Auto-populate compliance risks (GDPR, HIPAA, SOC2) based on industry

**Status**: Not implemented

**Examples**:
- Healthcare venture → Auto-add HIPAA compliance risk
- EU market → Auto-add GDPR compliance risk
- SaaS enterprise → Auto-add SOC2 compliance risk

**Gap**: GAP-S6-004 (Compliance Frameworks Integration)

---

## Performance Requirements

**Agent Execution Targets**:

| Agent | Target Latency | Purpose |
|-------|----------------|---------|
| Risk Identification | <30 seconds | Analyze inputs, generate risk checklist |
| Risk Scoring | <20 seconds | Score all risks, create matrix |
| Mitigation Planning | <40 seconds | Propose strategies, check recursion |
| **Total Stage 6** | <2 minutes | All agents + human review |

**Optimization Strategies**:
- Cache industry-specific risks (e.g., "SaaS always has scalability risk")
- Pre-calculate probability/impact from historical data
- Async agent execution (run all 3 agents in parallel if independent)

---

## Testing Strategy

**Unit Tests** (for each agent):
1. Test risk identification accuracy (compare AI-generated risks to manual checklist)
2. Test risk scoring consistency (validate probability + impact estimates)
3. Test mitigation proposals quality (validate effectiveness ≥70%)
4. Test recursion detection (verify hidden costs > 10% triggers FIN-001)

**Integration Tests**:
1. Test full Stage 6 flow: Risk ID → Scoring → Mitigation → Chairman approval
2. Test recursion flow: Stage 6 → FIN-001 → Stage 5 → Stage 6
3. Test Chairman approval workflow (Approve/Revise/Recurse/Kill)

**E2E Tests**:
1. Test UI: Risk matrix visualization, mitigation plans table
2. Test notifications: Chairman email/dashboard alerts
3. Test recursion modal: Clear explanation of why FIN-001 triggered

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stage definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 228-273 |
| Automation target | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-06.md | 30-33 |
| Recursion reference | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 91, 136 |
| Agent scan | EHG | 0d80dac | agent-platform/ | N/A |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
