---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 32: Customer Success & Retention Engineering — Professional SOP


## Table of Contents

- [Purpose](#purpose)
- [Scope](#scope)
- [Prerequisites](#prerequisites)
  - [Systems Required](#systems-required)
  - [Data Availability](#data-availability)
- [Substage 32.1: Success Infrastructure](#substage-321-success-infrastructure)
  - [Step 1: CRM Configuration (Days 1-3)](#step-1-crm-configuration-days-1-3)
  - [Step 2: Playbook Creation (Days 4-7)](#step-2-playbook-creation-days-4-7)
  - [Step 3: Team Training (Days 8-10)](#step-3-team-training-days-8-10)
- [Substage 32.2: Health Monitoring](#substage-322-health-monitoring)
  - [Step 4: Define Health Metrics (Days 1-3)](#step-4-define-health-metrics-days-1-3)
  - [Step 5: Implement Scoring System (Days 4-7)](#step-5-implement-scoring-system-days-4-7)
  - [Step 6: Configure Alerts (Days 8-10)](#step-6-configure-alerts-days-8-10)
- [Substage 32.3: Retention Programs](#substage-323-retention-programs)
  - [Step 7: Design Retention Programs (Days 1-4)](#step-7-design-retention-programs-days-1-4)
  - [Step 8: Build Automation (Days 5-8)](#step-8-build-automation-days-5-8)
  - [Step 9: Track Engagement (Days 9-10)](#step-9-track-engagement-days-9-10)
- [Stage Exit: Validation & Handoff](#stage-exit-validation-handoff)
  - [Exit Gate 1: Success System Active](#exit-gate-1-success-system-active)
  - [Exit Gate 2: Retention Improving](#exit-gate-2-retention-improving)
  - [Exit Gate 3: NPS Positive](#exit-gate-3-nps-positive)
  - [Handoff to Stage 33 (Post-MVP Expansion)](#handoff-to-stage-33-post-mvp-expansion)
- [EVA Automation Notes](#eva-automation-notes)
- [Rollback Procedures](#rollback-procedures)
- [Sources Table](#sources-table)

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This Standard Operating Procedure (SOP) defines the step-by-step process for establishing customer success systems and retention mechanisms following MVP launch (Stage 31).

---

## Scope

**Applies To**: EVA-owned customer success automation (Third AI-owned stage after 16, 24)
**Entry Condition**: Stage 31 exit gates met (Customers onboarded, Data flowing)
**Exit Condition**: Success system active, Retention improving, NPS positive

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1443-1450 (entry/exit gates)

---

## Prerequisites

### Systems Required
1. ✅ **CRM Platform** - HubSpot, Salesforce, or Intercom
2. ✅ **Analytics Infrastructure** - Usage tracking operational (from Stage 31)
3. ✅ **Support Ticket System** - Issue tracking integrated
4. ✅ **Email/Notification System** - For retention campaigns

### Data Availability
1. ✅ **Customer records** - Onboarding completion dates
2. ✅ **Usage metrics** - Feature adoption, engagement frequency
3. ✅ **Support history** - Ticket volume, resolution times

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1431-1434 "inputs: Customer data, Usage metrics, Support tickets"

---

## Substage 32.1: Success Infrastructure

**Duration**: 1-2 weeks
**Owner**: EVA (with Chairman oversight for strategic decisions)

### Step 1: CRM Configuration (Days 1-3)

**Actions**:
1. Select CRM platform (if not already chosen in Stage 31)
   - Options: HubSpot (SMB-friendly), Salesforce (enterprise), Intercom (product-led)
2. Configure customer data sync from application database
   - Map user profiles to CRM contacts
   - Sync onboarding dates, subscription tiers
3. Set up custom fields for health scoring
   - Last login date
   - Feature usage counts
   - Support ticket count
4. Enable API access for automated updates

**Validation**:
- [ ] Customer data syncing successfully
- [ ] Custom fields populated
- [ ] API credentials stored securely

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1455 "CRM configured"

---

### Step 2: Playbook Creation (Days 4-7)

**Actions**:
1. Document customer journey stages
   - Onboarding (Days 0-14)
   - Activation (Days 15-30)
   - Engagement (Days 31-90)
   - Renewal (Days 90+)
2. Create playbook for each stage
   - Onboarding: Welcome email series, product tours
   - Activation: Feature adoption campaigns, 1:1 check-ins
   - Engagement: Best practice webinars, community invites
   - Renewal: Success review meetings, upsell opportunities
3. Define trigger conditions for each playbook
   - Onboarding: User created, no activation event within 3 days
   - Activation: First core feature used, no second feature within 7 days
   - Engagement: Active user, declining usage trend
   - Renewal: 30 days before renewal date

**Deliverables**:
- [ ] 4 customer journey playbooks documented
- [ ] Trigger conditions defined
- [ ] Email templates created

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1456 "Playbooks created"
**Output**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1436 "Success playbooks"

---

### Step 3: Team Training (Days 8-10)

**Actions**:
1. Train success team on CRM usage
   - Customer data access
   - Playbook execution
   - Health score interpretation
2. Document escalation procedures
   - When to involve Chairman for strategic accounts
   - When to request product changes
3. Schedule weekly review meetings
   - Review health scores
   - Discuss at-risk customers
   - Share success stories

**Validation**:
- [ ] Team can access CRM
- [ ] Team understands playbooks
- [ ] Escalation process documented

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1457 "Team trained"

---

## Substage 32.2: Health Monitoring

**Duration**: 1-2 weeks
**Owner**: EVA (fully automated)

### Step 4: Define Health Metrics (Days 1-3)

**Actions**:
1. Design health score algorithm (0-100 scale)
   - **Engagement (40 points)**: Days since last login, feature usage frequency
   - **Support (30 points)**: Ticket count (inverse), unresolved issues (inverse)
   - **Value Realization (30 points)**: Core features adopted, goals achieved
2. Set threshold ranges
   - 🟢 Healthy: 70-100 (proactive engagement)
   - 🟡 At-Risk: 40-69 (targeted intervention)
   - 🔴 Critical: 0-39 (urgent attention)
3. Define measurement frequency
   - Real-time for login/usage events
   - Daily batch calculation for aggregate scores
   - Weekly trend analysis

**⚠️ BLOCKER**: SD-METRICS-FRAMEWORK-001 (status=queued, P0 CRITICAL)
- Universal metrics framework required for threshold standardization
- See `10_gaps-backlog.md` for details

**Deliverables**:
- [ ] Health score algorithm documented
- [ ] Thresholds defined ⚠️ BLOCKED
- [ ] Measurement schedule established ⚠️ BLOCKED

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1461 "Metrics defined"
**Metric Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1440 "Customer health score"

---

### Step 5: Implement Scoring System (Days 4-7)

**Actions**:
1. Create database view/materialized view for health scores
   ```sql
   CREATE MATERIALIZED VIEW customer_health_scores AS
   SELECT
     user_id,
     -- Engagement (40 points)
     CASE
       WHEN last_login > NOW() - INTERVAL '1 day' THEN 40
       WHEN last_login > NOW() - INTERVAL '7 days' THEN 30
       WHEN last_login > NOW() - INTERVAL '30 days' THEN 20
       ELSE 0
     END AS engagement_score,
     -- Support (30 points)
     GREATEST(0, 30 - (open_ticket_count * 10)) AS support_score,
     -- Value (30 points)
     (feature_adoption_count * 5) AS value_score,
     -- Total
     engagement_score + support_score + value_score AS total_health_score,
     NOW() AS calculated_at
   FROM users
   LEFT JOIN usage_metrics USING (user_id)
   LEFT JOIN support_tickets USING (user_id);
   ```
2. Schedule daily refresh
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   SELECT cron.schedule('refresh-health-scores', '0 2 * * *',
     $$REFRESH MATERIALIZED VIEW customer_health_scores$$);
   ```
3. Sync scores to CRM via API
   - Update custom field in CRM
   - Trigger CRM workflows based on score changes

**Validation**:
- [ ] Health scores calculating correctly
- [ ] Daily refresh scheduled
- [ ] CRM sync operational

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1462 "Scoring implemented"

---

### Step 6: Configure Alerts (Days 8-10)

**Actions**:
1. Set up real-time alerts for critical health scores (0-39)
   - Slack notification to success team
   - Email to account owner
   - Task created in CRM
2. Configure weekly digest for at-risk customers (40-69)
   - Summary email to success team
   - Dashboard view in CRM
3. Create dashboard for health score trends
   - Overall average health score
   - Distribution (Healthy/At-Risk/Critical)
   - Week-over-week changes

**Deliverables**:
- [ ] Critical alerts operational
- [ ] Weekly digest scheduled
- [ ] Dashboard accessible

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1463 "Alerts configured"

---

## Substage 32.3: Retention Programs

**Duration**: 1-2 weeks
**Owner**: EVA (automated campaigns with human oversight)

### Step 7: Design Retention Programs (Days 1-4)

**Actions**:
1. Create at-risk customer playbook
   - Trigger: Health score drops to 40-69
   - Action 1: Personalized email from success manager (Day 0)
   - Action 2: Feature adoption guide sent (Day 3)
   - Action 3: 1:1 check-in call scheduled (Day 7)
2. Create critical customer playbook
   - Trigger: Health score drops to 0-39
   - Action 1: Immediate Slack alert to success team
   - Action 2: Phone call within 24 hours
   - Action 3: Chairman escalation if no response within 48 hours
3. Design win-back campaigns
   - Trigger: User churned (subscription canceled or inactive >30 days)
   - Action 1: Survey to understand reasons (Day 0)
   - Action 2: Special offer if eligible (Day 7)
   - Action 3: Quarterly check-in (ongoing)

**Deliverables**:
- [ ] At-risk playbook documented
- [ ] Critical playbook documented
- [ ] Win-back campaign designed

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1467 "Programs designed"
**Output**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1437 "Retention programs"

---

### Step 8: Build Automation (Days 5-8)

**Actions**:
1. Configure CRM workflows for at-risk playbook
   - Email automation (Mailchimp, SendGrid integration)
   - Task creation for success team
   - Calendar invite generation for check-in calls
2. Configure CRM workflows for critical playbook
   - Slack webhook integration
   - Phone call task with high priority
   - Chairman notification via email if no update within 48 hours
3. Set up win-back campaign automation
   - Survey tool integration (Typeform, Google Forms)
   - Conditional logic for offer eligibility
   - Quarterly drip campaign

**Validation**:
- [ ] At-risk workflow tested
- [ ] Critical workflow tested
- [ ] Win-back campaign tested

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1468 "Automation built"

---

### Step 9: Track Engagement (Days 9-10)

**Actions**:
1. Define retention program metrics
   - Response rate to at-risk emails
   - Check-in call completion rate
   - Health score improvement rate (within 30 days)
   - Churn prevention rate (critical → healthy)
2. Create tracking dashboard
   - Program effectiveness by customer segment
   - Success team performance (response times, outcomes)
   - Overall retention rate trend
3. Schedule monthly program review
   - Analyze which playbooks are most effective
   - Adjust trigger conditions based on data
   - Share learnings with product team (input to Stage 33)

**Deliverables**:
- [ ] Retention metrics defined
- [ ] Tracking dashboard created
- [ ] Monthly review scheduled

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1469 "Engagement tracked"

---

## Stage Exit: Validation & Handoff

### Exit Gate 1: Success System Active

**Validation**:
- [ ] CRM operational with customer data syncing
- [ ] Playbooks deployed and executing
- [ ] Health scores updating daily
- [ ] Alerts generating correctly

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1448 "Success system active"

---

### Exit Gate 2: Retention Improving

**Validation**:
- [ ] Baseline retention rate established (first 30 days post-launch)
- [ ] Retention programs reducing churn rate by ≥5% (within 60 days)
- [ ] At-risk customer recovery rate ≥30%

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1449 "Retention improving"
**Metric Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1441 "Retention rate"

⚠️ **Threshold Gap**: No specific targets defined in stages.yaml
**Proposed**: ≥5% improvement, ≥30% recovery rate (subject to SD-METRICS-FRAMEWORK-001)

---

### Exit Gate 3: NPS Positive

**Validation**:
- [ ] NPS survey deployed (via CRM or in-app)
- [ ] ≥100 responses collected (statistically significant)
- [ ] NPS score ≥0 (more promoters than detractors)

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1450 "NPS positive"
**Metric Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1442 "NPS score"

⚠️ **Threshold Gap**: "Positive" defined as ≥0 (industry standard: excellent = ≥50)
**Proposed**: ≥0 for exit gate, target ≥30 for sustainable growth

---

### Handoff to Stage 33 (Post-MVP Expansion)

**Deliverables**:
1. Customer insights report
   - Most-used features (inform expansion priorities)
   - Most-requested features (from support tickets)
   - Churn reasons (from exit surveys)
2. Retention playbook documentation
   - What worked, what didn't
   - Recommended adjustments for Stage 33
3. Health score trends
   - Overall trajectory (improving/stable/declining)
   - Segment-specific patterns

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1435-1438 "outputs: Success playbooks, Retention programs, Health scores"

---

## EVA Automation Notes

**Automated Tasks**:
- Daily health score calculation and CRM sync
- Real-time critical customer alerts
- At-risk customer email campaigns
- Weekly digest generation
- Monthly metrics dashboard updates

**Human Oversight Required**:
- CRM platform selection (Substage 32.1)
- Playbook design (Substage 32.1)
- Strategic account escalations (Chairman)
- Monthly program review and adjustments

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:11 "Fully automatable"
**Ownership**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:19 "Clear ownership (EVA)"

---

## Rollback Procedures

⚠️ **Gap Identified**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:25 "Unclear rollback procedures"

**Proposed Rollback Triggers**:
1. **CRM data sync errors >5%** → Pause automation, manual verification
2. **Health score calculation failures** → Revert to manual scoring
3. **Retention campaign negative feedback >10%** → Pause campaigns, review messaging
4. **NPS score drops >10 points in 30 days** → Emergency review, program adjustments

**Rollback Steps**:
1. Pause automated workflows in CRM
2. Notify success team via Slack
3. Schedule emergency review meeting (within 24 hours)
4. Document root cause
5. Implement fix
6. Re-test automation on small cohort
7. Resume full automation

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1426-1471 | Stage 32 definition |
| substages | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1451-1469 | 3 substage definitions |
| inputs/outputs | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1431-1438 | Data flow |
| metrics | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1439-1442 | KPIs |
| gates | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1443-1450 | Entry/exit conditions |
| automation score | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 11 | 5/5 Automation Leverage |
| EVA ownership | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 19 | Clear ownership |
| rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 25 | Unclear rollback procedures |

---

**Next**: See `06_agent-orchestration.md` for CustomerSuccessCrew proposal.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
