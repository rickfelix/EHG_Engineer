---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Critical Gaps (Block Automation)](#critical-gaps-block-automation)
  - [GAP-S6-001: Risk Identification Agent Not Implemented](#gap-s6-001-risk-identification-agent-not-implemented)
  - [GAP-S6-002: Recursion Engine Integration Not Implemented](#gap-s6-002-recursion-engine-integration-not-implemented)
  - [GAP-S6-003: Risk Database Not Created](#gap-s6-003-risk-database-not-created)
- [Important Gaps (Reduce Quality)](#important-gaps-reduce-quality)
  - [GAP-S6-004: Compliance Frameworks Integration Missing](#gap-s6-004-compliance-frameworks-integration-missing)
  - [GAP-S6-005: Risk Scoring Agent Not Implemented](#gap-s6-005-risk-scoring-agent-not-implemented)
  - [GAP-S6-006: Mitigation Planning Agent Not Implemented](#gap-s6-006-mitigation-planning-agent-not-implemented)
  - [GAP-S6-007: Rollback Procedures Not Defined](#gap-s6-007-rollback-procedures-not-defined)
  - [GAP-S6-008: Chairman Approval Workflow Not Implemented](#gap-s6-008-chairman-approval-workflow-not-implemented)
- [Minor Gaps (Nice-to-Have)](#minor-gaps-nice-to-have)
  - [GAP-S6-009: Customer Validation Touchpoint Missing](#gap-s6-009-customer-validation-touchpoint-missing)
  - [GAP-S6-010: Risk Management Tool Integration Missing](#gap-s6-010-risk-management-tool-integration-missing)
  - [GAP-S6-011: Metrics Validation Criteria Not Defined](#gap-s6-011-metrics-validation-criteria-not-defined)
  - [GAP-S6-012: Data Transformation Rules Not Documented](#gap-s6-012-data-transformation-rules-not-documented)
  - [GAP-S6-013: Performance Monitoring Not Implemented](#gap-s6-013-performance-monitoring-not-implemented)
  - [GAP-S6-014: Real-Time Hidden Cost Indicator UI Missing](#gap-s6-014-real-time-hidden-cost-indicator-ui-missing)
- [Backlog Summary](#backlog-summary)
- [Recommended Implementation Order](#recommended-implementation-order)
  - [Phase 1: Risk Evaluation Foundation (P0 - 15-22 days)](#phase-1-risk-evaluation-foundation-p0---15-22-days)
  - [Phase 2: AI-Driven Automation (P1 - 24-34 days)](#phase-2-ai-driven-automation-p1---24-34-days)
  - [Phase 3: Enhancement (P2 - 15-22 days)](#phase-3-enhancement-p2---15-22-days)
  - [Phase 4: Documentation (P3 - 2-3 days)](#phase-4-documentation-p3---2-3-days)
- [Sources Table](#sources-table)

<!-- ARCHIVED: 2026-01-26T16:26:54.473Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-06\10_gaps-backlog.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 6: Gaps & Implementation Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, schema, security

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:22-71

---

## Critical Gaps (Block Automation)

### GAP-S6-001: Risk Identification Agent Not Implemented

**Issue**: No AI-driven risk identification; critique notes "Limited automation for manual processes" (Automation Leverage: 3/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:23 "Limited automation for manual"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:30-33 "Enhance Automation"

**Impact**: Manual risk enumeration required; target 80% automation not achievable; risk identification inconsistent across ventures

**Proposed Artifacts**:
1. Build `RiskIdentificationAgent` (Python CrewAI):
   - Analyze financial model for cost risks
   - Analyze technical assessment for technical risks
   - Analyze market analysis for competitive/market risks
   - Query compliance frameworks (GDPR, HIPAA, SOC2) for operational risks
   - Generate comprehensive risk checklist (technical, market, operational)
2. Integrate with LLM (GPT-4) for industry-specific risk analysis
3. Create risk database (historical risks by industry/venture type)

**Priority**: P0 (blocks automation target)

**Estimated Effort**: 5-7 days

---

### GAP-S6-002: Recursion Engine Integration Not Implemented

**Issue**: FIN-001 recursion trigger (hidden costs > threshold) not implemented; Stage 5 critique references this trigger but no implementation exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:91 "Risk assessment uncovers hidden costs"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:136 "recursionEngine.ts: Central recursion"

**Impact**: Cannot trigger recursion to Stage 5 when hidden costs discovered; manual workaround required; financial model may be outdated

**Proposed Artifacts**:
1. Build recursion detection logic in Substage 6.3:
   - Calculate total mitigation costs (sum of all mitigation_plans.cost_per_year)
   - Fetch OpEx from Stage 5 financial_model
   - Calculate hidden_cost_pct = (total mitigation cost / OpEx) × 100
   - If hidden_cost_pct > 10%, trigger FIN-001 to Stage 5
2. Integrate with `recursionEngine.ts` service (if exists; otherwise build it)
3. Implement Chairman approval workflow (HIGH severity recursion)

**Priority**: P0 (blocks recursion feature)

**Estimated Effort**: 7-10 days (includes RecursionEngine if not built yet)

---

### GAP-S6-003: Risk Database Not Created

**Issue**: No historical risk data for AI training; critique notes "Missing specific tool integrations"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:26 "Missing specific tool integrations"

**Impact**: Risk Identification Agent cannot leverage historical data; probability/impact estimates subjective; inconsistent risk identification quality

**Proposed Artifacts**:
1. Create `risk_database` table:
   ```sql
   CREATE TABLE risk_database (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     risk_type VARCHAR(50) NOT NULL,  -- 'technical', 'market', 'operational'
     risk_description TEXT NOT NULL,
     industry VARCHAR(50),             -- 'saas', 'hardware', 'healthcare'
     probability_pct NUMERIC,          -- Historical probability 0-100
     impact_usd NUMERIC,               -- Historical cost impact
     mitigation_strategy TEXT,
     mitigation_effectiveness_pct NUMERIC,  -- % risk reduction
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```
2. Seed database with industry-specific risks (SaaS: scalability, security; Hardware: supply chain, manufacturing)
3. Implement risk matching algorithm (find similar risks from history)

**Priority**: P0 (blocks AI-driven risk identification quality)

**Estimated Effort**: 3-5 days (schema + seed data + matching logic)

---

## Important Gaps (Reduce Quality)

### GAP-S6-004: Compliance Frameworks Integration Missing

**Issue**: No automated compliance risk enumeration (GDPR, HIPAA, SOC2); manual checklist required

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:26 "Missing specific tool integrations"

**Impact**: Compliance risks may be missed; increased risk of regulatory violations; hidden compliance costs not identified until late

**Proposed Artifacts**:
1. Integrate with compliance framework APIs or databases:
   - GDPR checklist (if industry = 'EU market', auto-add GDPR risks)
   - HIPAA requirements (if industry = 'healthcare', auto-add HIPAA risks)
   - SOC2 controls (if venture_type = 'SaaS enterprise', auto-add SOC2 risks)
2. Map compliance requirements to risk_matrix and mitigation_plans
3. Estimate compliance costs (e.g., GDPR consultant = $50k/year, SOC2 audit = $20k/year)

**Priority**: P1 (improves risk identification quality, reduces hidden cost surprises)

**Estimated Effort**: 5-7 days

---

### GAP-S6-005: Risk Scoring Agent Not Implemented

**Issue**: No AI-driven risk scoring; manual probability + impact assignment required

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:23 "Limited automation for manual"

**Impact**: Subjective risk scoring; inconsistent prioritization; risk matrix quality varies by analyst

**Proposed Artifacts**:
1. Build `RiskScoringAgent` (Python CrewAI):
   - Assign probability (0-100%) based on historical data from risk_database
   - Assess impact ($cost) using financial model and industry benchmarks
   - Calculate composite risk score (probability × impact)
   - Generate risk matrix (2D visualization: probability vs impact)
   - Prioritize risks by severity (Critical/High/Medium/Low)
2. Implement calibration system (compare AI estimates to actual outcomes, adjust over time)
3. Integrate with LLM for probability estimation

**Priority**: P1 (improves risk scoring consistency and quality)

**Estimated Effort**: 5-7 days

---

### GAP-S6-006: Mitigation Planning Agent Not Implemented

**Issue**: No AI-driven mitigation strategy proposals; manual mitigation planning required

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:23 "Limited automation for manual"

**Impact**: Inconsistent mitigation quality; may miss effective strategies; hidden costs not flagged until Chairman review

**Proposed Artifacts**:
1. Build `MitigationPlanningAgent` (Python CrewAI):
   - Propose mitigation strategies for each Critical/High risk (from templates or LLM)
   - Estimate mitigation cost and effectiveness (% risk reduction)
   - Propose contingency plans (fallback if mitigation fails)
   - Define triggers for contingency activation
   - **Check for hidden costs**: Sum mitigation costs; if > 10% of OpEx, flag for FIN-001
2. Create mitigation strategy template database (e.g., "Database scalability → Migrate to distributed DB, $50k")
3. Integrate with cost estimation API (e.g., "GDPR consultant = $20k/year")

**Priority**: P1 (improves mitigation quality and automates hidden cost detection)

**Estimated Effort**: 7-10 days

---

### GAP-S6-007: Rollback Procedures Not Defined

**Issue**: Critique notes "Unclear rollback procedures"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:24 "Unclear rollback procedures"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:46-49 "Add Rollback Procedures"

**Impact**: If risk assessment needs to be reverted, unclear how to restore previous state; no versioning of risk_matrix or mitigation_plans

**Proposed Artifacts**:
1. Define rollback decision tree:
   - When to rollback: Risk assessment incomplete, mitigation plans invalid, recursion triggered
   - How to rollback: Restore from `risk_assessment_history`, mark stage as "In Progress"
2. Create `risk_assessment_history` table:
   ```sql
   CREATE TABLE risk_assessment_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venture_id UUID REFERENCES ventures(id),
     stage_id INT NOT NULL,
     risk_matrix JSONB NOT NULL,
     mitigation_plans JSONB,
     contingency_strategies JSONB,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```
3. Implement rollback triggers (auto-rollback on recursion, manual rollback for errors)

**Priority**: P1 (improves reliability and auditability)

**Estimated Effort**: 2-3 days

---

### GAP-S6-008: Chairman Approval Workflow Not Implemented

**Issue**: Exit gate requires "Mitigation plans approved" but no approval workflow exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:250 "Mitigation plans approved"

**Impact**: Cannot enforce approval requirement; manual email-based approval required; no audit trail

**Proposed Artifacts**:
1. Implement approval request workflow:
   - Generate risk assessment summary (risk_matrix, mitigation_plans, contingency_strategies, risk_score)
   - Notify Chairman (email + dashboard notification)
   - Present options: Approve, Revise, Recurse (to Stage 5), Kill
   - Wait for Chairman response before proceeding to Stage 7
2. Build Chairman approval UI:
   - Display risk matrix heatmap
   - Display mitigation plans table
   - Display overall risk score vs threshold
   - Approve/Revise/Recurse/Kill buttons
3. Add audit trail to `chairman_approvals` table

**Priority**: P1 (improves governance and audit trail)

**Estimated Effort**: 5-7 days

---

## Minor Gaps (Nice-to-Have)

### GAP-S6-009: Customer Validation Touchpoint Missing

**Issue**: Critique suggests adding customer feedback loop to validate critical risks; UX/Customer Signal score only 1/5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:14 "UX/Customer Signal | 1"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:51-54 "Customer Integration"

**Impact**: Risk assessment based on assumptions, not real customer feedback; may miss customer-perceived risks

**Proposed Artifacts**:
1. Add customer validation checkpoint in Substage 6.1 (Risk Identification):
   - Survey customers for perceived risks (e.g., "What concerns do you have about this product?")
   - Validate specific risks with target customers (e.g., "Would GDPR compliance concerns deter you?")
   - Capture customer feedback during user interviews (Stage 3)
2. Integrate customer feedback into risk_matrix (mark risks as "customer-validated")
3. Prioritize customer-validated risks higher in mitigation planning

**Priority**: P2 (enhances risk identification quality)

**Estimated Effort**: 3-4 days

---

### GAP-S6-010: Risk Management Tool Integration Missing

**Issue**: Critique notes "Missing specific tool integrations" (no RiskWatch, LogicManager, etc.)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:26 "Missing specific tool integrations"

**Impact**: Manual data entry for risk data; reduced efficiency; cannot leverage existing risk management workflows

**Proposed Artifacts**:
1. Integrate with risk management platforms (RiskWatch, LogicManager, Resolver):
   - Auto-import risks from external system
   - Export risk_matrix to external system for tracking
   - Sync mitigation_plans updates
2. Build adapter layer for platform-specific APIs
3. Implement two-way sync (import/export)

**Priority**: P2 (enhances efficiency for organizations already using risk management tools)

**Estimated Effort**: 7-10 days

---

### GAP-S6-011: Metrics Validation Criteria Not Defined

**Issue**: Critique notes "Metrics defined but validation criteria unclear" (Testability: 3/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:9 "Testability | 3 | validation criteria unclear"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:35-38 "Define Clear Metrics"

**Impact**: Cannot validate exit gates programmatically; manual review required; unclear when to block vs. allow stage progression

**Proposed Artifacts**:
1. Define validation criteria for each metric:
   - Risk coverage: 100% (all risks must have mitigation)
   - Mitigation effectiveness: ≥70% average
   - Risk score: <50
2. Implement exit gate validation logic:
   ```typescript
   const exitGateValidation = {
     riskCoveragePct: riskCoverage >= 100,
     mitigationEffectivenessPct: mitigationEffectiveness >= 70,
     riskScore: riskScore < 50
   };
   const canProceed = Object.values(exitGateValidation).every(v => v === true);
   ```
3. Add threshold values to stages.yaml or stage_configurations table

**Priority**: P2 (improves validation clarity)

**Estimated Effort**: 1-2 days

---

### GAP-S6-012: Data Transformation Rules Not Documented

**Issue**: Critique notes "Data transformation and validation rules" missing; Data Readiness score only 3/5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:12 "Data Readiness | 3 | data flow unclear"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-06.md:40-44 "Improve Data Flow"

**Impact**: Unclear how inputs (Financial model, Technical assessment, Market analysis) transform into outputs (Risk matrix, Mitigation plans, Contingency strategies)

**Proposed Artifacts**:
1. Document data schemas for all inputs/outputs:
   - Input: ventures.financial_model JSONB schema
   - Input: ventures.technical_assessment JSONB schema
   - Input: ventures.market_analysis JSONB schema
   - Output: ventures.risk_matrix JSONB schema
   - Output: ventures.mitigation_plans JSONB schema
   - Output: ventures.contingency_strategies JSONB schema
2. Define transformation rules:
   - Financial model → Cost risks (e.g., "High OpEx → Operational scalability risk")
   - Technical assessment → Technical risks (e.g., "Monolith architecture → Scalability risk")
   - Market analysis → Market risks (e.g., "High competition → Competitive response risk")
3. Implement validation rules (e.g., Risk score 0-100, Probability 0-100%, Impact > 0)

**Priority**: P3 (enhances documentation)

**Estimated Effort**: 2-3 days

---

### GAP-S6-013: Performance Monitoring Not Implemented

**Issue**: No performance tracking for risk identification, scoring, mitigation planning; cannot identify bottlenecks

**Evidence**: Pattern from Stage 5 performance requirements (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120)

**Impact**: Cannot track agent execution time or optimize slow operations

**Proposed Artifacts**:
1. Implement performance tracking:
   - Log risk identification time (target: <30 seconds)
   - Log risk scoring time (target: <20 seconds)
   - Log mitigation planning time (target: <40 seconds)
   - Log total stage latency (target: <2 minutes)
2. Store metrics in `stage_performance` table
3. Build performance dashboard (identify violations, track trends)

**Priority**: P2 (enhances reliability and optimization)

**Estimated Effort**: 2-3 days

---

### GAP-S6-014: Real-Time Hidden Cost Indicator UI Missing

**Issue**: No pre-emptive warning system for hidden costs; users surprised by recursion trigger

**Evidence**: Pattern from Stage 5 pre-emptive warning (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:122-127)

**Impact**: Users unaware of hidden cost accumulation until Substage 6.3 completion; reduced transparency

**Proposed Artifacts**:
1. Build real-time hidden cost calculator (runs as user enters mitigation costs):
   ```typescript
   const totalMitigationCost = mitigationPlans.reduce((sum, p) => sum + p.cost_per_year, 0);
   const hiddenCostPct = (totalMitigationCost / opex) * 100;
   ```
2. Implement color-coded indicator:
   - 🟢 Green: Hidden costs ≤ 10% (No recursion)
   - 🟡 Yellow: Hidden costs 10-25% (Chairman approval required)
   - 🔴 Red: Hidden costs > 25% (Will trigger automatic recursion)
3. Add tooltip explaining threshold and consequences

**Priority**: P2 (improves UX and transparency)

**Estimated Effort**: 2-3 days

---

## Backlog Summary

| Gap ID | Title | Priority | Blocks Automation? | Estimated Effort |
|--------|-------|----------|-------------------|------------------|
| GAP-S6-001 | Risk Identification Agent Not Implemented | P0 | ✅ Yes | 5-7 days |
| GAP-S6-002 | Recursion Engine Integration Not Implemented | P0 | ✅ Yes | 7-10 days |
| GAP-S6-003 | Risk Database Not Created | P0 | ✅ Yes | 3-5 days |
| GAP-S6-004 | Compliance Frameworks Integration Missing | P1 | ❌ No | 5-7 days |
| GAP-S6-005 | Risk Scoring Agent Not Implemented | P1 | ❌ No | 5-7 days |
| GAP-S6-006 | Mitigation Planning Agent Not Implemented | P1 | ❌ No | 7-10 days |
| GAP-S6-007 | Rollback Procedures Not Defined | P1 | ❌ No | 2-3 days |
| GAP-S6-008 | Chairman Approval Workflow Not Implemented | P1 | ❌ No | 5-7 days |
| GAP-S6-009 | Customer Validation Touchpoint Missing | P2 | ❌ No | 3-4 days |
| GAP-S6-010 | Risk Management Tool Integration Missing | P2 | ❌ No | 7-10 days |
| GAP-S6-011 | Metrics Validation Criteria Not Defined | P2 | ❌ No | 1-2 days |
| GAP-S6-012 | Data Transformation Rules Not Documented | P3 | ❌ No | 2-3 days |
| GAP-S6-013 | Performance Monitoring Not Implemented | P2 | ❌ No | 2-3 days |
| GAP-S6-014 | Real-Time Hidden Cost Indicator UI Missing | P2 | ❌ No | 2-3 days |

**Total Estimated Effort**: 55-82 days (11-16 weeks)

**Critical Path** (P0 only): 15-22 days (3-4 weeks)

---

## Recommended Implementation Order

### Phase 1: Risk Evaluation Foundation (P0 - 15-22 days)

1. **GAP-S6-003**: Create risk_database table with seed data (3-5 days)
2. **GAP-S6-001**: Build RiskIdentificationAgent (5-7 days)
3. **GAP-S6-002**: Build recursion detection logic + RecursionEngine integration (7-10 days)

**Milestone**: Basic risk evaluation functional; recursion engine triggers FIN-001

---

### Phase 2: AI-Driven Automation (P1 - 24-34 days)

4. **GAP-S6-005**: Build RiskScoringAgent (5-7 days)
5. **GAP-S6-006**: Build MitigationPlanningAgent (7-10 days)
6. **GAP-S6-004**: Integrate compliance frameworks (5-7 days)
7. **GAP-S6-007**: Define rollback procedures + create risk_assessment_history table (2-3 days)
8. **GAP-S6-008**: Implement Chairman approval workflow (5-7 days)

**Milestone**: Full AI-driven risk evaluation; Chairman governance controls

---

### Phase 3: Enhancement (P2 - 15-22 days)

9. **GAP-S6-011**: Define metrics validation criteria (1-2 days)
10. **GAP-S6-013**: Build performance monitoring (2-3 days)
11. **GAP-S6-014**: Build real-time hidden cost indicator UI (2-3 days)
12. **GAP-S6-009**: Add customer validation touchpoint (3-4 days)
13. **GAP-S6-010**: Integrate risk management tools (7-10 days)

**Milestone**: Complete monitoring, UX enhancements, external integrations

---

### Phase 4: Documentation (P3 - 2-3 days)

14. **GAP-S6-012**: Document data transformation rules (2-3 days)

**Milestone**: Full documentation complete

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-06.md | 22-27 |
| Improvement priorities | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-06.md | 28-71 |
| Recursion reference | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 91, 136 |
| Performance pattern | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 116-120 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
