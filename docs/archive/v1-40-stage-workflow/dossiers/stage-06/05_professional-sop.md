# Stage 6: Professional Standard Operating Procedure

**Purpose**: Step-by-step execution guide for completing Stage 6 (Risk Evaluation) according to governance standards.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:228-273 "id: 6, Risk Evaluation"

---

## Pre-Execution Checklist

**Before starting Stage 6, verify**:

- ✅ **Entry Gate 1**: Financial model complete (Stage 5 exit gate met)
  - P&L projections finalized
  - ROI calculated and approved
  - Break-even analysis documented
- ✅ **Entry Gate 2**: Technical review done
  - Preliminary or full technical assessment available
  - Architecture decisions documented
  - Technology stack identified
- ✅ **Input 1**: Financial model accessible (from ventures.financial_model JSONB)
- ✅ **Input 2**: Technical assessment accessible (from ventures.technical_assessment or Stage 10)
- ✅ **Input 3**: Market analysis accessible (from Stage 4 outputs)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:245-248 "entry: Financial model complete"

---

## Execution Procedure (3 Substages)

### Substage 6.1: Risk Identification

**Objective**: Comprehensive enumeration of all potential risks across all domains.

**Steps**:

1. **Identify Technical Risks** (done_when: Technical risks listed)
   - Review technical assessment for technology risks
   - List scalability concerns (e.g., database performance at 10x scale)
   - List dependency risks (e.g., third-party API reliability, open-source library vulnerabilities)
   - List architecture risks (e.g., monolith vs microservices complexity)
   - List security risks (e.g., data encryption, authentication, authorization)

2. **Identify Market Risks** (done_when: Market risks assessed)
   - Review market analysis (Stage 4) for competitive threats
   - List customer adoption risks (e.g., switching costs, onboarding friction)
   - List market timing risks (e.g., too early, too late, competitive response)
   - List pricing risks (e.g., willingness-to-pay assumptions incorrect)

3. **Identify Operational Risks** (done_when: Operational risks mapped)
   - List regulatory/compliance risks (e.g., GDPR, HIPAA, SOC2)
   - List supply chain risks (e.g., hardware availability, vendor reliability)
   - List talent risks (e.g., skills gap, hiring challenges, retention)
   - List process risks (e.g., deployment automation, incident response)

**Template**: Risk Identification Checklist

```markdown
## Technical Risks
- [ ] TR-001: [Risk description] (e.g., "Database cannot scale beyond 100k users")
- [ ] TR-002: ...

## Market Risks
- [ ] MR-001: [Risk description] (e.g., "Competitor launches similar feature first")
- [ ] MR-002: ...

## Operational Risks
- [ ] OR-001: [Risk description] (e.g., "GDPR compliance costs $50k/year")
- [ ] OR-002: ...
```

**Done When**:
- ✅ All technical risks listed (minimum 3-5 risks)
- ✅ All market risks assessed (minimum 3-5 risks)
- ✅ All operational risks mapped (minimum 3-5 risks)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:254-259 "Risk Identification done_when"

---

### Substage 6.2: Risk Scoring

**Objective**: Prioritize risks by severity; identify high-impact, high-probability risks requiring immediate mitigation.

**Steps**:

1. **Assign Probability** (done_when: Probability assigned)
   - For each risk, estimate probability of occurrence:
     - **Low**: 0-33% (unlikely to occur)
     - **Medium**: 34-66% (moderate chance)
     - **High**: 67-100% (likely to occur)
   - Use historical data, industry benchmarks, expert judgment

2. **Assess Impact** (done_when: Impact assessed)
   - For each risk, estimate financial/timeline impact if risk materializes:
     - **Low**: <$10k cost or <1 month delay
     - **Medium**: $10k-$100k cost or 1-3 month delay
     - **High**: >$100k cost or >3 month delay or project failure
   - Use financial model (Stage 5) for cost impact estimation

3. **Create Risk Matrix** (done_when: Risk matrix created)
   - Plot all risks on 2D grid: Probability (Y-axis) × Impact (X-axis)
   - Color code by severity:
     - **Red (Critical)**: High probability + High impact
     - **Orange (High)**: High probability + Medium impact OR Medium probability + High impact
     - **Yellow (Medium)**: Medium probability + Medium impact
     - **Green (Low)**: Low probability or Low impact
   - Prioritize mitigation for Red and Orange risks

**Template**: Risk Scoring Table

| Risk ID | Description | Probability | Impact | Severity | Priority |
|---------|-------------|-------------|--------|----------|----------|
| TR-001 | Database scalability | High (80%) | High ($200k) | Critical | P0 |
| MR-001 | Competitor response | Medium (50%) | High ($150k) | High | P1 |
| OR-001 | GDPR compliance | High (90%) | Medium ($50k/yr) | High | P1 |

**Done When**:
- ✅ Probability assigned to all risks (0-100% or Low/Medium/High)
- ✅ Impact assessed for all risks ($cost or Low/Medium/High)
- ✅ Risk matrix created (2D visualization with color coding)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:260-265 "Risk Scoring done_when"

---

### Substage 6.3: Mitigation Planning

**Objective**: Develop actionable mitigation plans; define clear triggers for fallback strategies.

**Steps**:

1. **Define Mitigation Strategies** (done_when: Mitigation strategies defined)
   - For each Critical/High risk, define specific mitigation actions:
     - **Reduce Probability**: Actions to prevent risk from occurring
     - **Reduce Impact**: Actions to minimize damage if risk occurs
     - **Transfer**: Shift risk to third party (e.g., insurance, vendor SLA)
     - **Accept**: Acknowledge risk with no mitigation (for Low risks)
   - Estimate mitigation cost and effectiveness (% risk reduction)

2. **Plan Contingencies** (done_when: Contingencies planned)
   - For each Critical/High risk, define fallback plan if mitigation fails:
     - What is Plan B if risk materializes despite mitigation?
     - Who is responsible for executing contingency?
     - What resources are required?
   - Example: If GDPR compliance risk materializes, fallback is "delay EU launch by 6 months to implement compliance"

3. **Identify Triggers** (done_when: Triggers identified)
   - For each contingency, define clear trigger conditions:
     - When should contingency plan activate?
     - What metric/event signals trigger?
   - Example: Trigger = "GDPR audit fails" → Activate contingency = "Delay EU launch"

**Template**: Mitigation Planning Table

| Risk ID | Mitigation Strategy | Mitigation Cost | Effectiveness | Contingency Plan | Trigger |
|---------|---------------------|-----------------|---------------|------------------|---------|
| TR-001 | Migrate to distributed DB | $50k | 90% | Limit users to 50k | Latency > 2s |
| MR-001 | Launch 3 months earlier | $30k | 70% | Pivot to different market | Competitor launches |
| OR-001 | Hire GDPR consultant | $20k | 100% | Delay EU launch | GDPR audit fails |

**Recursion Decision Point**: If mitigation reveals hidden costs (e.g., GDPR consultant $20k/yr, insurance $30k/yr), check if total hidden costs > 10% of OpEx. If yes, trigger FIN-001 recursion to Stage 5 to update financial model.

**Done When**:
- ✅ Mitigation strategies defined for all Critical/High risks
- ✅ Contingencies planned for all Critical/High risks
- ✅ Triggers identified for all contingency plans
- ✅ **Recursion check complete**: Hidden costs evaluated; FIN-001 triggered if threshold exceeded

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:266-271 "Mitigation Planning done_when"

---

## Exit Gates Verification

**Before marking Stage 6 complete, verify**:

- ✅ **Exit Gate 1**: All risks identified (Substage 6.1 complete)
  - Minimum 10-15 total risks across technical, market, operational domains
  - Risk identification checklist 100% complete
- ✅ **Exit Gate 2**: Mitigation plans approved (Substage 6.3 complete)
  - Chairman/EXEC reviewed and approved mitigation strategies
  - Mitigation cost included in financial model (or recursion triggered)
  - Critical risks have viable mitigation plans
- ✅ **Exit Gate 3**: Risk tolerance defined
  - Maximum acceptable risk score defined (e.g., <50)
  - Dealbreaker risks identified (e.g., "Cannot proceed if GDPR compliance >$100k/yr")
  - Chairman approved overall risk profile

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:249-252 "exit: All risks identified"

---

## Outputs Checklist

**Deliverables**:

- ✅ **Output 1**: Risk matrix (2D visualization: probability × impact)
  - Stored in ventures.risk_matrix JSONB (proposed schema)
  - All risks plotted and color-coded by severity
- ✅ **Output 2**: Mitigation plans (table of risks, strategies, costs, effectiveness)
  - Stored in ventures.mitigation_plans JSONB (proposed schema)
  - All Critical/High risks have mitigation strategies
- ✅ **Output 3**: Contingency strategies (fallback plans with triggers)
  - Stored in ventures.contingency_strategies JSONB (proposed schema)
  - All Critical/High risks have contingency plans with clear triggers

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:237-240 "outputs: Risk matrix"

---

## Rollback Procedures

**When to Rollback**:
1. **Risk assessment incomplete**: Critical risks missed, insufficient detail
2. **Mitigation plan invalid**: Mitigation strategies not viable or too costly
3. **Recursion triggered**: Hidden costs require financial model update (return to Stage 5)

**How to Rollback**:
1. Mark Stage 6 status as "In Progress" (reset from "Complete")
2. Preserve current risk_matrix, mitigation_plans, contingency_strategies in risk_assessment_history table
3. Return to Substage 6.1, 6.2, or 6.3 as appropriate
4. Re-execute substage with corrected data or assumptions
5. Re-verify exit gates before marking complete

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:46-49 "Add Rollback Procedures"

---

## Common Pitfalls & Mitigations

**Pitfall 1**: Incomplete risk identification (missing operational or compliance risks)

**Mitigation**: Use risk identification checklist template; review industry-specific risks (e.g., healthcare = HIPAA, fintech = PCI-DSS)

---

**Pitfall 2**: Subjective risk scoring (inconsistent probability/impact estimates)

**Mitigation**: Use historical data or industry benchmarks; calibrate estimates with past ventures; get second opinion from domain expert

---

**Pitfall 3**: Unviable mitigation plans (too costly, too complex, or ineffective)

**Mitigation**: Validate mitigation cost against financial model; ensure effectiveness ≥70% risk reduction; get Chairman approval before proceeding

---

**Pitfall 4**: Missing recursion trigger (hidden costs not flagged)

**Mitigation**: Sum all mitigation costs (GDPR consultant, insurance, legal fees); if total > 10% of Stage 5 OpEx, trigger FIN-001 to Stage 5

---

## Performance Targets

**Timeline**:
- Substage 6.1 (Risk Identification): 2-3 days
- Substage 6.2 (Risk Scoring): 1-2 days
- Substage 6.3 (Mitigation Planning): 2-3 days
- **Total Stage 6**: 5-8 days (target)

**Quality Targets**:
- Risk coverage: 100% (all identified risks have mitigation plans)
- Mitigation effectiveness: ≥70% average risk reduction
- Risk score: <50 (composite probability × impact across all risks)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:241-244 "metrics: Risk coverage"

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stage definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 228-273 |
| Entry/exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 245-252 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 253-271 |
| Rollback guidance | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-06.md | 46-49 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
