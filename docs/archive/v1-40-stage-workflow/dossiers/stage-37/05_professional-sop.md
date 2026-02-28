---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 37: Strategic Risk Forecasting - Professional SOP


## Table of Contents

- [Purpose](#purpose)
- [Prerequisites](#prerequisites)
  - [Required Inputs (from Stage 36)](#required-inputs-from-stage-36)
  - [Entry Gate Criteria](#entry-gate-criteria)
  - [Tools and Access](#tools-and-access)
- [Substage 37.1: Risk Modeling](#substage-371-risk-modeling)
  - [Step 1.1: Collect Risk Data](#step-11-collect-risk-data)
  - [Step 1.2: Define Risk Scenarios](#step-12-define-risk-scenarios)
  - [Step 1.3: Calculate Probabilities](#step-13-calculate-probabilities)
  - [Substage 37.1 Completion Criteria](#substage-371-completion-criteria)
- [Substage 37.2: Impact Assessment](#substage-372-impact-assessment)
  - [Step 2.1: Quantify Impacts](#step-21-quantify-impacts)
  - [Step 2.2: Map Dependencies](#step-22-map-dependencies)
  - [Step 2.3: Set Thresholds](#step-23-set-thresholds)
  - [Substage 37.2 Completion Criteria](#substage-372-completion-criteria)
- [Substage 37.3: Contingency Planning](#substage-373-contingency-planning)
  - [Step 3.1: Create Contingency Plans](#step-31-create-contingency-plans)
  - [Step 3.2: Define Activation Triggers](#step-32-define-activation-triggers)
  - [Step 3.3: Reserve Resources](#step-33-reserve-resources)
  - [Substage 37.3 Completion Criteria](#substage-373-completion-criteria)
- [Exit Gate Validation](#exit-gate-validation)
  - [Exit Criteria Checklist](#exit-criteria-checklist)
  - [Quality Validation](#quality-validation)
- [Outputs Handoff](#outputs-handoff)
  - [Deliverables to Stage 38+](#deliverables-to-stage-38)
- [Metrics and Reporting](#metrics-and-reporting)
  - [Key Metrics](#key-metrics)
  - [Reporting Cadence](#reporting-cadence)
- [Rollback Procedures](#rollback-procedures)
- [Automation Opportunities](#automation-opportunities)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
- [Version History](#version-history)

## Purpose

This Standard Operating Procedure (SOP) defines the step-by-step execution of Stage 37: Strategic Risk Forecasting. It provides Chairman-level guidance for forecasting strategic risks, quantifying impacts, and establishing contingency plans.

**Target Audience**: Chairman, Strategic Planning Team, Risk Analysts

**Frequency**: Quarterly (regular cadence) + Ad-hoc (triggered by high-risk signals from Stage 36)

## Prerequisites

### Required Inputs (from Stage 36)
- [ ] Market intelligence reports (comprehensive, not summary)
- [ ] Risk indicators with trend data (≥3 months historical)
- [ ] Scenario models with probability distributions

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1661-1664 "inputs: Market intelligence, Risk indicators"

### Entry Gate Criteria
- [ ] Data sources connected (APIs, databases, external feeds)
- [ ] Models calibrated (validated against historical data)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1674-1676 "entry: Data sources connected"

### Tools and Access
- [ ] Risk modeling software (e.g., @RISK, Crystal Ball, or equivalent)
- [ ] Scenario planning templates
- [ ] Contingency plan repository (database or document management system)
- [ ] Chairman approval authority for resource allocation

## Substage 37.1: Risk Modeling

**Objective**: Build predictive models, define risk scenarios, and calculate probabilities.

### Step 1.1: Collect Risk Data
**Owner**: Risk Analyst
**Duration**: 2-4 hours

**Actions**:
1. Retrieve market intelligence reports from Stage 36 output repository
2. Extract risk indicators (e.g., market volatility, competitive threats, regulatory changes)
3. Validate data completeness:
   - ≥3 months historical data for trending
   - Coverage of all venture-relevant market segments
   - Source credibility assessment (primary sources preferred)

**Output**: Validated risk data catalog

**Quality Check**: Data sources documented, no critical gaps

### Step 1.2: Define Risk Scenarios
**Owner**: Chairman + Strategic Planning Team
**Duration**: 4-6 hours

**Actions**:
1. Identify risk categories:
   - Market risks (competition, demand shifts)
   - Operational risks (resource constraints, technical failures)
   - Regulatory risks (compliance changes, legal challenges)
   - Financial risks (funding gaps, cost overruns)
2. For each category, define 3-5 concrete scenarios:
   - **Best case**: Optimistic but plausible outcome
   - **Base case**: Most likely outcome given current trends
   - **Worst case**: Pessimistic but non-catastrophic outcome
   - **Black swan**: Low-probability, high-impact event
3. Document scenario narratives (1-2 paragraphs each)

**Output**: Risk scenario catalog (12-20 scenarios across categories)

**Quality Check**: Each scenario has clear trigger conditions and outcome descriptions

### Step 1.3: Calculate Probabilities
**Owner**: Risk Analyst
**Duration**: 4-8 hours

**Actions**:
1. Select probability estimation method:
   - **Quantitative**: Historical frequency analysis (if data available)
   - **Qualitative**: Expert judgment (Delphi method, facilitated workshop)
   - **Hybrid**: Bayesian inference combining data and judgment
2. Assign probability to each scenario:
   - Ensure probabilities sum to 100% within each category
   - Document estimation methodology and assumptions
3. Calculate confidence intervals:
   - Low confidence: ±20% (expert judgment only)
   - Medium confidence: ±10% (some historical data)
   - High confidence: ±5% (robust historical data)

**Output**: Probabilistic risk model (scenarios + probabilities + confidence intervals)

**Quality Check**: Probabilities sum correctly, estimation methodology documented

### Substage 37.1 Completion Criteria
- [x] Models built (risk model with 12-20 scenarios)
- [x] Scenarios defined (narratives + trigger conditions)
- [x] Probabilities calculated (with confidence intervals)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1684-1687 "done_when: Models built, Scenarios defined"

## Substage 37.2: Impact Assessment

**Objective**: Quantify potential impacts across dimensions and set response thresholds.

### Step 2.1: Quantify Impacts
**Owner**: Risk Analyst + Finance Team
**Duration**: 6-10 hours

**Actions**:
1. Define impact dimensions:
   - **Financial**: Revenue loss, cost increase, funding gap ($)
   - **Operational**: Timeline delay, resource reallocation (weeks, FTEs)
   - **Reputational**: Customer churn, brand damage (qualitative scale)
   - **Strategic**: Goal misalignment, pivot necessity (qualitative scale)
2. For each scenario, estimate impact on each dimension:
   - Use venture-specific context (e.g., early-stage venture = higher strategic impact)
   - Apply discount rates for future impacts (time value)
3. Calculate expected value:
   - EV = Probability × Impact (for each scenario)
   - Aggregate across scenarios for category-level EV

**Output**: Impact assessment matrix (scenarios × dimensions with EV)

**Quality Check**: All scenarios have quantified impacts, calculations auditable

### Step 2.2: Map Dependencies
**Owner**: Strategic Planning Team
**Duration**: 4-6 hours

**Actions**:
1. Identify cascading risks:
   - Which risks trigger additional risks?
   - Example: Regulatory change → Compliance cost increase → Budget reallocation → Feature delay
2. Build dependency graph:
   - Nodes = risk scenarios
   - Edges = causal relationships (directional)
   - Weight edges by probability of cascade
3. Calculate compound impacts:
   - Trace paths through dependency graph
   - Multiply probabilities along path
   - Sum impacts at terminal nodes

**Output**: Risk dependency graph + compound impact calculations

**Quality Check**: All major cascading relationships identified, compound impacts calculated

### Step 2.3: Set Thresholds
**Owner**: Chairman
**Duration**: 2-3 hours

**Actions**:
1. Define risk severity levels:
   - **Critical**: Threatens venture viability (immediate action)
   - **High**: Significant impact, requires mitigation plan (action within 1 week)
   - **Medium**: Moderate impact, requires monitoring (action within 1 month)
   - **Low**: Minor impact, accept risk (no action unless escalates)
2. Set threshold values for each dimension:
   - Financial: Critical >$100k loss, High >$50k, Medium >$10k
   - Operational: Critical >8 weeks delay, High >4 weeks, Medium >2 weeks
   - Reputational: Critical = brand crisis, High = customer complaints, Medium = negative reviews
3. Classify scenarios by severity based on thresholds

**Output**: Risk severity classification table

**Quality Check**: Thresholds aligned with venture budget/timeline, all scenarios classified

### Substage 37.2 Completion Criteria
- [x] Impacts quantified (matrix with EV calculations)
- [x] Dependencies mapped (dependency graph + compound impacts)
- [x] Thresholds set (severity classification table)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1690-1693 "done_when: Impacts quantified, Dependencies mapped"

## Substage 37.3: Contingency Planning

**Objective**: Create actionable contingency plans with clear triggers and resource reserves.

### Step 3.1: Create Contingency Plans
**Owner**: Strategic Planning Team
**Duration**: 8-12 hours

**Actions**:
1. For each **Critical** and **High** severity risk scenario:
   - Define mitigation actions (proactive risk reduction)
   - Define contingency actions (reactive response if risk materializes)
2. Document plan structure:
   - **Trigger**: Specific condition that activates plan (observable signal)
   - **Actions**: Step-by-step response (who, what, when)
   - **Resources**: Budget, personnel, tools required
   - **Timeline**: How quickly actions must be executed
   - **Success criteria**: How to measure if plan worked
3. Prioritize plans:
   - Priority 1: Critical risks with high probability (>30%)
   - Priority 2: Critical risks with low probability
   - Priority 3: High risks with high probability
   - Priority 4: High risks with low probability

**Output**: Contingency plan library (8-12 plans for critical/high risks)

**Quality Check**: Each plan has all 5 structure elements, priority assigned

### Step 3.2: Define Activation Triggers
**Owner**: Chairman + Risk Analyst
**Duration**: 3-5 hours

**Actions**:
1. For each contingency plan, specify triggers:
   - **Quantitative triggers**: Metric crosses threshold (e.g., forecast accuracy <50%)
   - **Qualitative triggers**: Event occurs (e.g., competitor launches similar product)
   - **Time-based triggers**: Deadline approaches (e.g., 2 weeks before funding gap)
2. Assign monitoring responsibility:
   - Who checks trigger condition?
   - How frequently? (daily for critical, weekly for high)
   - What system/tool used for monitoring?
3. Define escalation path:
   - Trigger detected → Alert sent to [role]
   - Chairman approval required? (Yes for resource allocation >$10k)
   - Automated activation possible? (See RISK-FORECAST-004)

**Output**: Trigger monitoring plan + escalation matrix

**Quality Check**: All triggers observable/measurable, monitoring assigned, escalation clear

### Step 3.3: Reserve Resources
**Owner**: Chairman + Finance Team
**Duration**: 2-4 hours

**Actions**:
1. Calculate resource requirements:
   - Sum resource needs across all Priority 1 + Priority 2 plans
   - Budget: Set aside contingency fund (10-20% of total resources)
   - Personnel: Identify flexible/backup resources (not fully allocated)
2. Obtain approvals:
   - Chairman pre-approves resource allocation for specific scenarios
   - Document approval thresholds (e.g., auto-approved up to $5k, requires Chairman >$5k)
3. Reserve mechanism:
   - Budget: Move funds to contingency reserve account (not allocated to ventures)
   - Personnel: Tag resources as "contingency pool" in resource management system
   - Tools/licenses: Ensure access available if needed

**Output**: Resource reservation record (budget + personnel + tools)

**Quality Check**: Resources sufficient for Priority 1 + Priority 2 plans, approvals documented

### Substage 37.3 Completion Criteria
- [x] Plans created (8-12 contingency plans for critical/high risks)
- [x] Triggers defined (monitoring plan + escalation matrix)
- [x] Resources reserved (budget + personnel allocated)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1696-1699 "done_when: Plans created, Triggers defined"

## Exit Gate Validation

### Exit Criteria Checklist
- [ ] **Risks forecasted**: All identified risks have probability + impact + severity classification
- [ ] **Strategies defined**: Mitigation strategies documented for critical/high risks
- [ ] **Plans activated**: Contingency plans created, triggers set, resources reserved (plans are "activated" = ready to execute, not yet executed)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1678-1680 "exit: Risks forecasted, Strategies defined"

### Quality Validation

**Minimum Quality Standards**:
1. **Completeness**: All risk categories covered, no major gaps
2. **Quantification**: Impacts expressed in measurable terms ($ or qualitative scale)
3. **Actionability**: Contingency plans have specific actions, not vague intentions
4. **Approval**: Chairman sign-off on resource reservations and severity classifications

**Sign-off**: Chairman reviews and approves Stage 37 outputs before proceeding to Stage 38+

## Outputs Handoff

### Deliverables to Stage 38+
1. **Risk Forecast Report**:
   - Executive summary (1-2 pages)
   - Probabilistic risk model (scenarios + probabilities)
   - Impact assessment matrix
   - Risk dependency graph
2. **Mitigation Strategy Catalog**:
   - Proactive actions to reduce risk probability
   - Resource requirements and timelines
3. **Contingency Plan Library**:
   - Reactive plans for critical/high risks
   - Trigger monitoring plan
   - Resource reservation record

**Storage**: Store in venture-specific folder (e.g., `/ventures/VENTURE-001/risk-forecasts/2025-Q4/`)

**Notification**: Alert downstream stage owners (Stage 16 Execution lead) that forecasts are available

## Metrics and Reporting

### Key Metrics
1. **Forecast accuracy**: Measured quarterly
   - Compare predicted risks to actual outcomes
   - Target: ≥75% accuracy
   - Calculation: (Correct predictions) / (Total predictions)
2. **Risk preparedness**: Measured monthly
   - Percentage of critical/high risks with contingency plans
   - Target: 100%
   - Calculation: (Risks with plans) / (Total critical/high risks)
3. **Response time**: Measured per incident
   - Time from trigger detection to action initiation
   - Target: ≤24 hours for critical, ≤1 week for high
   - Calculation: Action timestamp - Trigger timestamp

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1670-1672 "metrics: Forecast accuracy, Risk preparedness"

### Reporting Cadence
- **Weekly**: Trigger monitoring status (any triggers close to activation?)
- **Monthly**: Risk preparedness review (any new critical/high risks?)
- **Quarterly**: Forecast accuracy retrospective (how well did we predict?)

## Rollback Procedures

**Trigger for Rollback**: Forecast accuracy drops below 50% for 2 consecutive quarters

**Rollback Actions**:
1. **Immediate**: Suspend new forecasts, revert to previous quarter's forecast
2. **Investigation** (within 1 week):
   - Analyze forecast errors (which scenarios were wrong?)
   - Identify root cause (model miscalibration, data quality, external shock?)
3. **Remediation** (within 2 weeks):
   - Recalibrate models with updated data
   - Adjust scenario definitions if necessary
   - Test revised forecast on historical data (backtesting)
4. **Redeployment**: Release revised forecast only after validation

**Approval**: Chairman must approve rollback and redeployment

**Reference**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:47-50 "Add Rollback Procedures"

## Automation Opportunities

**Current State**: Manual execution by Chairman (15h/week)
**Target State**: 80% automation (3h/week Chairman oversight)

**Proposed Automation** (see 07_recursion-blueprint.md for details):
- **RISK-FORECAST-001**: Automate risk modeling (Step 1.3)
- **RISK-FORECAST-002**: Build real-time monitoring dashboard (Step 3.2)
- **RISK-FORECAST-003**: Create adaptive mitigation engine (Step 3.1)
- **RISK-FORECAST-004**: Implement contingency plan activation (Step 3.2)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:31-34 "Enhance Automation"

## Troubleshooting

### Common Issues

**Issue 1: Data sources disconnected**
- **Symptom**: Cannot retrieve market intelligence from Stage 36
- **Resolution**: Check API connectivity, verify data pipeline status, contact Stage 36 owner

**Issue 2: Model calibration fails**
- **Symptom**: Probabilities don't align with historical data
- **Resolution**: Increase calibration sample size, adjust model parameters, consult expert judgment

**Issue 3: Resource reservation conflicts**
- **Symptom**: Contingency plans require resources already allocated to ventures
- **Resolution**: Adjust contingency fund size, negotiate flexible resource allocation with venture leads

**Issue 4: Trigger false positives**
- **Symptom**: Contingency plan activated unnecessarily
- **Resolution**: Refine trigger thresholds, add confirmation step before activation

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-06 | Initial SOP based on stages.yaml definition | Claude Code Phase 13 |

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
