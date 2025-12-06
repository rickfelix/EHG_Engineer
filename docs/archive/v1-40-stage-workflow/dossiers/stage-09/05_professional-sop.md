# Stage 9: Professional Standard Operating Procedure (SOP)

**Purpose**: Step-by-step execution procedure for Stage 9 (Gap Analysis & Market Opportunity Modeling).

**Target Audience**: LEAD agent, Product Managers, Business Analysts

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:365-409 "Stage 9 definition and substages"

---

## Pre-Execution Checklist

**Entry Gates** (must pass before starting):
- [ ] **Decomposition complete**: Stage 8 WBS finalized with all tasks identified
- [ ] **Market analyzed**: Sufficient market research data available from earlier stages

**Prerequisites**:
- [ ] Access to Stage 8 Problem Decomposition output (WBS)
- [ ] Market requirements documentation
- [ ] Competitor analysis reports
- [ ] Internal capability inventory (skills, tools, processes)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:383-386 "entry gates: Decomposition complete, Market analyzed"

---

## Substage 9.1: Capability Assessment

**Objective**: Document current organizational capabilities and required capabilities for venture execution.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:392-396 "9.1 Capability Assessment"

### Step 1.1: Inventory Current Capabilities
**Action**: Document organization's existing capabilities

**Inputs**:
- Internal skill matrix (engineer competencies, certifications)
- Tooling inventory (software licenses, infrastructure access)
- Process documentation (deployment procedures, QA workflows)

**Deliverable**: Current Capabilities Matrix
| Capability Category | Current State | Evidence | Maturity Level (1-5) |
|---------------------|---------------|----------|----------------------|
| Frontend Development | React, TypeScript | Team roster | 4 |
| Backend Development | Node.js, PostgreSQL | Codebase | 4 |
| DevOps | Docker, GitHub Actions | CI/CD pipeline | 3 |
| Security | Basic OWASP practices | Security audit | 2 |

**Done When**: Current state documented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:394-395 "done_when: Current state documented"

### Step 1.2: Define Required Capabilities
**Action**: Map Stage 8 WBS tasks to required capabilities

**Inputs**:
- Stage 8 WBS output (task breakdown)
- Technical specifications from earlier stages
- Industry best practices research

**Process**:
1. Review each WBS task
2. List technical capabilities needed (e.g., "React Native for mobile development")
3. List non-technical capabilities (e.g., "App Store submission process knowledge")
4. Rate required maturity level (1-5) for each capability

**Deliverable**: Required Capabilities Matrix
| Capability | Source Task (WBS) | Required Maturity | Justification |
|------------|-------------------|-------------------|---------------|
| React Native | Task 3.2 (Mobile UI) | 4 | Complex mobile interactions |
| App Store Process | Task 8.1 (Deployment) | 3 | Initial launch only |

**Done When**: Required capabilities listed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:395-396 "done_when: Required capabilities listed"

---

## Substage 9.2: Gap Identification

**Objective**: Identify and prioritize capability gaps between current and required states.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:397-403 "9.2 Gap Identification"

### Step 2.1: Calculate Capability Gaps
**Action**: Compare current vs required capabilities to identify gaps

**Process**:
1. For each required capability:
   - Compare current maturity vs required maturity
   - If gap exists (required > current), document it
   - Calculate gap size (required - current)

**Deliverable**: Capability Gaps Table
| Capability | Current | Required | Gap | Gap Type |
|------------|---------|----------|-----|----------|
| React Native | 0 | 4 | 4 | CRITICAL (missing) |
| Security Practices | 2 | 4 | 2 | MEDIUM (upgrade) |
| App Store Process | 0 | 3 | 3 | HIGH (missing) |

**Done When**: Gaps catalogued

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:399-400 "done_when: Gaps catalogued"

### Step 2.2: Assess Gap Severity
**Action**: Rate each gap by impact on venture success

**Severity Levels**:
- **CRITICAL**: Venture cannot proceed without this capability
- **HIGH**: Major feature/timeline risk if not addressed
- **MEDIUM**: Workarounds exist but suboptimal
- **LOW**: Nice-to-have, minimal impact

**Inputs**:
- Stage 8 WBS critical path analysis
- Technical complexity assessment
- Customer requirements priority

**Deliverable**: Gap Severity Assessment
| Gap | Severity | Impact if Not Addressed | Workaround Available? |
|-----|----------|-------------------------|-----------------------|
| React Native | CRITICAL | Cannot build mobile app | No (core requirement) |
| Security | HIGH | Compliance issues, customer trust | Partial (third-party tools) |

**Done When**: Severity assessed

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:400-401 "done_when: Severity assessed"

### Step 2.3: Prioritize Gaps
**Action**: Rank gaps by urgency and strategic importance

**Prioritization Criteria**:
1. **Urgency**: When is this capability needed? (blocking vs later-stage)
2. **Strategic Fit**: Does this align with long-term company goals?
3. **Cost to Close**: Build, buy, partner, or hire?
4. **Time to Close**: How long to acquire this capability?

**Deliverable**: Prioritized Gap List
| Priority | Gap | Severity | Urgency | Approach | ETA |
|----------|-----|----------|---------|----------|-----|
| P0 | React Native | CRITICAL | Immediate | Hire | 4 weeks |
| P1 | Security | HIGH | Before launch | Training + Tools | 6 weeks |
| P2 | App Store | HIGH | Pre-launch | Partner (consultant) | 2 weeks |

**Done When**: Priority assigned

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:401-403 "done_when: Priority assigned"

---

## Substage 9.3: Opportunity Modeling

**Objective**: Model market opportunities and create capability roadmap.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:404-407 "9.3 Opportunity Modeling"

### Step 3.1: Map Market Opportunities
**Action**: Identify market opportunities enabled by closing capability gaps

**Inputs**:
- Market requirements (from Stage 9 inputs)
- Competitor analysis (features competitors offer)
- Customer interviews/surveys

**Process**:
1. List market opportunities (e.g., "Mobile app enables on-the-go access")
2. Link each opportunity to required capabilities
3. Estimate addressable market for each opportunity

**Deliverable**: Opportunity Matrix
| Opportunity | Enabled By (Capabilities) | TAM | Competitive Advantage |
|-------------|---------------------------|-----|----------------------|
| Mobile on-the-go access | React Native, Push notifications | $5M | First to market in niche |
| Enterprise security compliance | Advanced security practices | $10M | Differentiator vs competitors |

**Done When**: Opportunities mapped

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:405 "done_when: Opportunities mapped"

### Step 3.2: Estimate Market Size
**Action**: Calculate TAM/SAM/SOM for each opportunity

**Market Size Framework**:
- **TAM** (Total Addressable Market): Total market revenue if 100% market share
- **SAM** (Serviceable Addressable Market): Segment you can reach with current business model
- **SOM** (Serviceable Obtainable Market): Realistic market share in 1-3 years

**Inputs**:
- Industry reports (Gartner, Forrester)
- Competitor revenue estimates
- Customer segment sizing

**Deliverable**: Market Size Estimates
| Opportunity | TAM | SAM | SOM (Year 1) | Growth Rate |
|-------------|-----|-----|--------------|-------------|
| Mobile on-the-go | $50M | $5M | $500K | 30% YoY |
| Enterprise security | $100M | $10M | $1M | 20% YoY |

**Done When**: Market size estimated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:406 "done_when: Market size estimated"

### Step 3.3: Project ROI
**Action**: Calculate ROI for investing in capability gaps

**ROI Formula**:
```
ROI = (Opportunity Revenue - Cost to Close Gap) / Cost to Close Gap
```

**Inputs**:
- Market size estimates (SOM)
- Gap closure costs (from Step 2.3: hire/train/buy)
- Timeline to market (from Stage 7 or 8)

**Deliverable**: ROI Projections
| Gap | Cost to Close | Opportunity Revenue (3yr) | Net Benefit | ROI | Payback Period |
|-----|---------------|---------------------------|-------------|-----|----------------|
| React Native | $80K (hire) | $1.5M (mobile opportunity) | $1.42M | 1775% | 6 months |
| Security | $30K (tools+training) | $3M (enterprise opp) | $2.97M | 9900% | 3 months |

**Done When**: ROI projected

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:407 "done_when: ROI projected"

---

## Capability Roadmap Creation

**Objective**: Create timeline for closing gaps and capturing opportunities.

**Deliverable**: Capability Roadmap (Gantt chart format)

```
Quarter 1:
  - Hire React Native developer (P0)
  - Begin security training (P1)

Quarter 2:
  - Onboard React Native dev
  - Implement security tooling
  - Engage App Store consultant (P2)

Quarter 3:
  - Launch mobile MVP (capture mobile opportunity)
  - Pass security audit (capture enterprise opportunity)

Quarter 4:
  - Scale mobile features based on user feedback
  - Expand enterprise sales with security certification
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:375-378 "outputs: Capability roadmap"

---

## Post-Execution Checklist

**Exit Gates** (must pass before progressing to Stage 10):
- [ ] **Gaps identified**: All capability gaps documented with severity/priority
- [ ] **Opportunities prioritized**: Opportunity matrix complete with ROI
- [ ] **Roadmap defined**: Capability roadmap with timeline and approach (build/buy/partner/hire)

**Deliverables Checklist**:
- [ ] Current Capabilities Matrix
- [ ] Required Capabilities Matrix
- [ ] Capability Gaps Table with severity
- [ ] Prioritized Gap List
- [ ] Opportunity Matrix
- [ ] Market Size Estimates
- [ ] ROI Projections
- [ ] Capability Roadmap

**Quality Checks**:
- [ ] All P0/P1 gaps have defined closure approach
- [ ] Market size estimates have cited sources
- [ ] ROI calculations reviewed by finance stakeholder
- [ ] Roadmap timeline aligns with Stage 7 Comprehensive Planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:387-391 "exit gates: Gaps identified, Opportunities prioritized"

---

## Metrics Tracking

**Gap Coverage**: % of identified gaps addressed in capability roadmap
- **Formula**: (Gaps in Roadmap / Total Gaps) × 100%
- **Target**: ≥80% (proposed, not in stages.yaml)

**Opportunity Size**: Total TAM/SAM/SOM for prioritized opportunities
- **Tracking**: Sum of SOM across all P0/P1 opportunities
- **Target**: ≥$2M SOM (proposed, not in stages.yaml)

**Capability Score**: Composite organizational readiness score
- **Formula**: Average current maturity across all required capabilities
- **Target**: ≥3.0/5.0 after gap closure (proposed, not in stages.yaml)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:379-382 "metrics: Gap coverage, Opportunity size, Capability score"

---

## Common Pitfalls

1. **Over-optimistic capability assessment**: Teams overestimate current maturity
   - **Mitigation**: Use external benchmarks, include junior engineer perspectives

2. **Analysis paralysis**: Spending too long on market sizing
   - **Mitigation**: Time-box each substage, use proxy data when perfect data unavailable

3. **Ignoring non-technical gaps**: Focus only on technology, miss process/people gaps
   - **Mitigation**: Include operations, sales, support capabilities in assessment

4. **Missing strategic fit**: Prioritizing gaps that don't align with company strategy
   - **Mitigation**: Review prioritization with executive stakeholders

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:22-27 "Weaknesses: Limited automation, Unclear rollback"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 365-409 | Stage definition, substages |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 1-71 | Weaknesses, improvements |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
