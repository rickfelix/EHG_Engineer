# Stage 32: Customer Success & Retention Engineering — Agent Orchestration

**Generated**: 2025-11-06
**Version**: 1.0

---

## Overview

This document proposes a **CustomerSuccessCrew** agent orchestration system to execute Stage 32 operations with EVA oversight and Chairman escalation capability.

**Evidence**:
- EVA Ownership: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:19 "Clear ownership (EVA)"
- Automation: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:11 "Fully automatable"

---

## Crew Structure

### CustomerSuccessCrew

**Purpose**: Automate customer success infrastructure, health monitoring, and retention programs
**Owner**: EVA (with Chairman override)
**Trigger**: Stage 31 exit gates met (Customers onboarded, Data flowing)

**Composition**: 4 specialized agents

---

## Agent 1: SuccessInfrastructureArchitect

### Responsibilities
1. CRM platform selection and configuration
2. Customer data sync setup (application DB → CRM)
3. Custom field mapping for health scoring
4. API credential management

### Capabilities
- **CRM Integration**: HubSpot, Salesforce, Intercom APIs
- **Database Access**: Read customer data from application database
- **Configuration Management**: Store CRM settings securely

### Inputs
- Customer records from application database
- CRM platform selection (from Chairman or defaults)
- Health score field definitions

### Outputs
- CRM configuration complete (Substage 32.1 done_when)
- API credentials stored securely
- Customer data syncing successfully

### Success Criteria
- [ ] Customer data sync error rate <5%
- [ ] All custom fields populated
- [ ] API rate limits not exceeded

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1452-1457 "Substage 32.1: Success Infrastructure"

---

## Agent 2: HealthMonitoringSpecialist

### Responsibilities
1. Health score algorithm implementation
2. Daily health score calculation and updates
3. Threshold monitoring and alert generation
4. Trend analysis and reporting

### Capabilities
- **Database Operations**: Create materialized views, schedule cron jobs
- **Algorithm Execution**: Calculate multi-factor health scores
- **Alert Management**: Slack, email, CRM task creation
- **Dashboard Updates**: Push metrics to monitoring systems

### Inputs
- Usage metrics (last login, feature adoption)
- Support tickets (open count, unresolved issues)
- Customer journey stage (onboarding, activation, engagement)

### Outputs
- Health scores (0-100 scale) for all customers
- Real-time alerts for critical customers (score 0-39)
- Weekly digest for at-risk customers (score 40-69)
- Health score trend dashboard

### Success Criteria
- [ ] Health scores updated daily
- [ ] Critical alerts sent within 5 minutes
- [ ] Dashboard reflects current data (≤24 hour lag)

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1458-1463 "Substage 32.2: Health Monitoring"

**⚠️ BLOCKER**: SD-METRICS-FRAMEWORK-001 (status=queued, P0 CRITICAL)
- Threshold values not standardized
- See `04_current-assessment.md` recommendation #2

---

## Agent 3: RetentionProgramDesigner

### Responsibilities
1. Playbook creation for customer journey stages
2. Retention campaign design (at-risk, critical, win-back)
3. Email template generation
4. CRM workflow configuration

### Capabilities
- **Playbook Generation**: AI-generated email sequences, call scripts
- **Workflow Automation**: CRM workflow API (HubSpot, Salesforce)
- **Content Personalization**: Dynamic variables based on customer data
- **A/B Testing**: Experiment with different messaging

### Inputs
- Customer journey stage definitions (onboarding, activation, engagement, renewal)
- Health score thresholds (from HealthMonitoringSpecialist)
- Historical retention data (what worked previously)

### Outputs
- 4 journey playbooks (onboarding, activation, engagement, renewal)
- 3 retention campaigns (at-risk, critical, win-back)
- Email templates and call scripts
- CRM workflows configured and tested

### Success Criteria
- [ ] Playbooks deployed for all journey stages
- [ ] At-risk campaign response rate ≥20%
- [ ] Critical campaign intervention rate 100% (all contacted)
- [ ] Win-back campaign conversion rate ≥5%

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1464-1469 "Substage 32.3: Retention Programs"

---

## Agent 4: NPSTracker

### Responsibilities
1. NPS survey deployment (in-app or CRM)
2. Response collection and analysis
3. Feedback categorization (product, support, pricing)
4. Insights reporting to Stage 33 (Post-MVP Expansion)

### Capabilities
- **Survey Management**: Deploy NPS surveys at optimal times (after milestones)
- **Sentiment Analysis**: Classify feedback as product/support/pricing issues
- **Reporting**: Generate insights report for product roadmap
- **Trend Tracking**: Monitor NPS over time, by customer segment

### Inputs
- Customer milestones (first value realization, 30/60/90 day checkpoints)
- NPS survey templates
- Historical NPS data (if available from Stage 31)

### Outputs
- NPS score (aggregate and by segment)
- Feedback categorization (top 5 issues)
- Promoter/Detractor breakdown
- Insights report for Stage 33 handoff

### Success Criteria
- [ ] ≥100 NPS responses collected (statistically significant)
- [ ] NPS score ≥0 (exit gate requirement)
- [ ] Feedback categorized with ≥80% accuracy
- [ ] Insights report delivered to Stage 33

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1442 "NPS score"
**Exit Gate**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1450 "NPS positive"

---

## Agent Coordination

### Sequential Flow (for initial setup)

```
Stage 31 Complete
  ↓
SuccessInfrastructureArchitect (Days 1-10)
  ├─ CRM configured
  ├─ Playbooks created
  └─ Team trained
  ↓
HealthMonitoringSpecialist (Days 11-20)
  ├─ Metrics defined
  ├─ Scoring implemented
  └─ Alerts configured
  ↓
RetentionProgramDesigner (Days 21-30)
  ├─ Programs designed
  ├─ Automation built
  └─ Engagement tracked
  ↓
NPSTracker (Ongoing from Day 31+)
  ├─ Surveys deployed
  ├─ Responses collected
  └─ NPS ≥0 (exit gate)
  ↓
Stage 32 Complete → Stage 33
```

### Parallel Operations (after setup)

Once infrastructure is established, agents operate in parallel:

- **HealthMonitoringSpecialist**: Daily health score updates, real-time alerts
- **RetentionProgramDesigner**: Ongoing campaign execution, optimization
- **NPSTracker**: Periodic survey deployment, continuous feedback analysis

---

## Chairman Escalation Protocol

**Escalation Triggers**:
1. Critical customer (health score 0-39) with no response within 48 hours
2. High-value account ($10k+ ARR) at risk of churning
3. NPS score drops >10 points in 30 days
4. Retention rate declines >15% month-over-month

**Escalation Process**:
1. Agent detects escalation trigger
2. Chairman notification sent (Slack + email)
3. Context provided: customer profile, history, attempted interventions
4. Chairman decides: Override retention campaign, authorize special offer, schedule executive call
5. Agent executes Chairman decision and logs outcome

**Evidence**: EVA ownership implies Chairman override capability (precedent: Stages 16, 24)

---

## Monitoring & Feedback Loops

### Agent Performance Metrics

| Agent | Primary Metric | Target | Frequency |
|-------|---------------|--------|-----------|
| SuccessInfrastructureArchitect | CRM sync error rate | <5% | Daily |
| HealthMonitoringSpecialist | Alert accuracy (true positives) | ≥90% | Weekly |
| RetentionProgramDesigner | Campaign response rate | ≥20% | Weekly |
| NPSTracker | Survey response rate | ≥30% | Monthly |

### Crew-Level Metrics

| Metric | Target | Gate |
|--------|--------|------|
| Customer health score (avg) | ≥70 | None (monitoring only) |
| Retention rate | Improving (≥5% increase) | Exit Gate 2 |
| NPS score | ≥0 | Exit Gate 3 |

**Evidence**:
- Metrics: EHG_Engineer@468a959:docs/workflow/stages.yaml:1439-1442
- Exit Gates: EHG_Engineer@468a959:docs/workflow/stages.yaml:1448-1450

---

## Recursion Integration

**Trigger Points** (detailed in `07_recursion-blueprint.md`):
- RETENTION-001: Health score drops → HealthMonitoringSpecialist generates alert
- RETENTION-002: Retention rate below target → RetentionProgramDesigner adjusts campaigns
- RETENTION-003: NPS negative → NPSTracker escalates to Chairman
- RETENTION-004: Success system active → Full crew operational

**Recursion Readiness**: 2/5 (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:15)
**Gap**: Generic recursion support pending (requires recursion infrastructure from Stage 16)

---

## Implementation Status

**Current State**: ❌ Not Implemented
**Blocking SDs**:
1. SD-METRICS-FRAMEWORK-001 (P0 CRITICAL, status=queued) - Threshold standardization
2. SD-CUSTOMER-SUCCESS-AUTOMATION-001 (PROPOSED, P0 CRITICAL) - EVA infrastructure for Stage 32

**Precedent**: SD-MVP-ENGINE-001 (Stage 24, EVA-owned, status=queued) demonstrates agent orchestration pattern

---

## Agent Platform Integration

**Expected Location** (when implemented):
- Crew definition: `ehg/agent-platform/app/crews/customer_success_crew.py`
- Agent 1: `ehg/agent-platform/app/agents/success_infrastructure_architect.py`
- Agent 2: `ehg/agent-platform/app/agents/health_monitoring_specialist.py`
- Agent 3: `ehg/agent-platform/app/agents/retention_program_designer.py`
- Agent 4: `ehg/agent-platform/app/agents/nps_tracker.py`

**Note**: Paths are speculative based on agent-platform structure; actual implementation may differ.

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| EVA ownership | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 19 | Clear ownership (EVA) |
| Automation score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 11 | Fully automatable |
| Substage 32.1 | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1452-1457 | Success Infrastructure |
| Substage 32.2 | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1458-1463 | Health Monitoring |
| Substage 32.3 | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1464-1469 | Retention Programs |
| Metrics | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1439-1442 | KPIs |
| Exit gates | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1448-1450 | Completion criteria |
| Recursion score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 15 | 2/5 Recursion Readiness |

---

**Next**: See `07_recursion-blueprint.md` for RETENTION-001 through RETENTION-004 trigger proposals.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
