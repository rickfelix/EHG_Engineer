# Stage 31: MVP Launch — Professional SOP

**Purpose**: Define step-by-step standard operating procedure for executing MVP launch with coordinated marketing, PR, and support.

**Scope**: Covers substages 31.1 (Preparation), 31.2 (Execution), 31.3 (Initial Monitoring)

**Owner**: LEAD phase (strategic oversight), execution by cross-functional launch team

---

## Prerequisites (Entry Gates Checklist)

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1397-1400`

Before beginning Stage 31, verify ALL entry gates pass:

| # | Entry Gate | Verification Method | Owner | Evidence Required |
|---|------------|---------------------|-------|-------------------|
| 1 | Production stable | Stage 30 exit checklist passed | DevOps | ✅ Uptime ≥99.5% for 7 days, load test passed, monitoring active |
| 2 | Marketing ready | Stage 17 GTM assets complete | Marketing | ✅ Website live, email sequences scheduled, social content approved |
| 3 | Support trained | Customer success team briefed | Support Lead | ✅ Knowledge base populated, ticketing system configured, escalation paths defined |

**If ANY gate fails**: STOP. Do not proceed to Substage 31.1.

---

## Substage 31.1: Launch Preparation (2-5 days)

**Done When** (stages.yaml:1408-1411): Communications ready, Teams briefed, Contingencies planned

### Step 1.1: Finalize Launch Timeline
**Duration**: 2 hours
**Owner**: Launch Coordinator (LEAD)

**Actions**:
1. Confirm launch date/time with all stakeholders (dev, marketing, support, executives)
2. Schedule marketing activation events:
   - Email send times (coordinated across time zones)
   - Social media posts (Twitter, LinkedIn, Facebook, etc.)
   - Press release distribution (via PR newswire)
   - Paid ad campaigns (Google, Facebook, LinkedIn start times)
3. Create launch day timeline (minute-by-minute schedule)
4. Identify launch window: Define acceptable launch time window (e.g., Tuesday 10am-2pm ET to maximize support availability)

**Deliverable**: Launch timeline document (shared with all teams)

---

### Step 1.2: Brief All Teams
**Duration**: 3 hours (1 hour per team)
**Owner**: Launch Coordinator

**Actions**:
1. **DevOps Team**:
   - Review deployment plan (Stage 30 outputs)
   - Confirm rollback procedures (time to revert, data backup strategy)
   - Test incident escalation paths (Slack channels, PagerDuty, phone tree)
   - Assign on-call rotation for launch week (24/7 coverage)

2. **Marketing Team**:
   - Verify all assets uploaded to platforms (ESP, social schedulers, ad platforms)
   - Test email deliverability (send test emails, check spam scores)
   - Confirm UTM tracking codes (ensure analytics attribution)
   - Prepare social listening tools (monitor brand mentions)

3. **Support Team**:
   - Review knowledge base articles (FAQs, troubleshooting guides)
   - Test ticketing system (create/assign/resolve test tickets)
   - Schedule support coverage (extended hours for first 72 hours post-launch)
   - Prepare canned responses (common questions, known issues)

**Deliverable**: Team readiness checklist (signed off by each team lead)

---

### Step 1.3: Plan Contingencies
**Duration**: 4 hours
**Owner**: Launch Coordinator + DevOps Lead

**Actions**:
1. **Rollback Decision Tree**:
   - P0 triggers (data loss, security breach, complete outage): Rollback immediately
   - P1 triggers (major feature broken, >50% users affected): Rollback within 1 hour
   - P2 triggers (minor bug, <10% users affected): Hotfix, no rollback
   - Document rollback steps (DNS revert, DB rollback, cache purge)

2. **Communication Plan**:
   - Draft pre-written incident notifications (for users, press, investors)
   - Prepare status page updates (e.g., status.yourproduct.com)
   - Define communication thresholds (when to notify users vs. silent fix)

3. **Support Surge Plan**:
   - Identify support escalation triggers (>50 tickets/hour)
   - Prepare temporary support staff (contractors or on-call team members)
   - Set up emergency Slack channels (cross-functional incident response)

4. **Marketing Pause Plan**:
   - Define conditions to pause marketing (e.g., if product is down)
   - Document how to pause campaigns (email, ads, social)
   - Prepare holding messages ("We're experiencing high traffic, please try again")

**Deliverable**: Contingency playbook (1-page decision tree + detailed procedures)

---

### Step 1.4: Pre-Launch Validation
**Duration**: 2 hours
**Owner**: QA Lead (invokes QA Director sub-agent)

**Actions**:
1. Run final smoke tests in production (test all critical user flows)
2. Verify monitoring/alerting (test alerts fire correctly)
3. Check analytics integration (ensure events tracked)
4. Validate public-facing URLs (website, app links, social profiles)
5. Test support channels (submit test ticket, test live chat)

**Pass Criteria**: All smoke tests green, alerts functional, analytics confirmed

**Deliverable**: Pre-launch validation report (pass/fail checklist)

---

### Substage 31.1 Exit Gate
**Criteria**: Communications ready ✅, Teams briefed ✅, Contingencies planned ✅

**Sign-Off Required**: Launch Coordinator + DevOps Lead + Marketing Lead + Support Lead

---

## Substage 31.2: Launch Execution (1-2 days)

**Done When** (stages.yaml:1414-1417): Product live, Marketing activated, PR released

### Step 2.1: Deploy to Production
**Duration**: 1-2 hours (or per deployment plan)
**Owner**: DevOps Lead

**Actions**:
1. Execute deployment (per Stage 30 procedures)
   - Option A: Blue-green deployment (switch traffic to new version)
   - Option B: Rolling update (gradual rollout)
   - Option C: Canary release (5% traffic, then 50%, then 100%)
2. Verify deployment success:
   - Health checks pass (all services responding)
   - Database migrations applied (if any)
   - Static assets cached (CDN invalidation complete)
3. Test critical user flows (login, signup, core feature)
4. Declare "Product Live" when all checks pass

**Deliverable**: Deployment completion notification (Slack, email to launch team)

---

### Step 2.2: Activate Marketing
**Duration**: 30 minutes (coordinated across channels)
**Owner**: Marketing Lead

**Actions**:
1. **T-0 minutes (Product Live)**:
   - Send launch email to email list (via ESP: Mailchimp, SendGrid, etc.)
   - Publish social media posts (Twitter, LinkedIn, Facebook)
   - Activate paid ad campaigns (Google Ads, Facebook Ads, LinkedIn Ads)
   - Update website homepage (hero banner: "Now Live!")

2. **T+15 minutes**:
   - Monitor email deliverability (open rates, bounce rates)
   - Monitor social engagement (likes, shares, comments)
   - Monitor ad impressions/clicks

3. **T+30 minutes**:
   - Publish blog post (detailed launch announcement)
   - Notify online communities (Product Hunt, Hacker News, Reddit - if applicable)
   - Send direct messages to beta users/early adopters

**Deliverable**: Marketing activation report (channels activated, initial metrics)

---

### Step 2.3: Distribute Press Release
**Duration**: 1 hour
**Owner**: PR/Communications Lead

**Actions**:
1. Distribute press release via newswire (PR Newswire, Business Wire, etc.)
2. Send direct pitches to journalists (personalized emails to tech press)
3. Update press kit (website pressroom: logos, screenshots, fact sheet)
4. Monitor press mentions (Google Alerts, Mention.com, etc.)
5. Respond to press inquiries (coordinate with CEO/spokesperson)

**Deliverable**: Press distribution report (outlets contacted, coverage secured)

---

### Step 2.4: Go-Live Announcement
**Duration**: 15 minutes
**Owner**: Launch Coordinator

**Actions**:
1. Internal announcement (all-hands Slack message, company-wide email)
2. Investor notification (email update to investors/board)
3. Partner notification (email to integration partners, affiliates)
4. Customer notification (in-app banner for existing users, if applicable)

**Deliverable**: Go-live announcement sent to all stakeholders

---

### Substage 31.2 Exit Gate
**Criteria**: Product live ✅, Marketing activated ✅, PR released ✅

**Verification**: Launch Coordinator confirms all channels active + product accessible

---

## Substage 31.3: Initial Monitoring (5-7 days)

**Done When** (stages.yaml:1420-1423): Metrics tracked, Issues addressed, Feedback collected

### Step 3.1: Track Launch Metrics
**Duration**: Ongoing (hourly for first 72 hours, daily for next 4 days)
**Owner**: Data Analyst + Launch Coordinator

**Actions**:
1. **Real-Time Dashboard**: Monitor key metrics (refresh every 15-60 minutes)
   - User acquisition: New signups/registrations
   - Engagement: Session duration, feature usage, return rate
   - System health: Uptime, response time, error rate
   - Marketing: Email open rate, social engagement, ad CTR

2. **Metric Thresholds** (proposed, pending SD-METRICS-FRAMEWORK-001):
   - Launch success rate: ≥95% uptime in first 72 hours
   - User acquisition: [Target from Stage 17 GTM plan] in first 7 days
   - Engagement: ≥50% of users return within 48 hours (example)

3. **Hourly Reports** (first 72 hours):
   - Generate automated report (new users, active sessions, incidents)
   - Slack channel updates (launch-metrics channel)

4. **Daily Summaries** (days 4-7):
   - Email summary to leadership (cumulative metrics, trends)
   - Identify anomalies (unexpected spikes, drops, patterns)

**Deliverable**: Launch metrics dashboard (live) + daily summary reports

---

### Step 3.2: Address Issues
**Duration**: Ongoing (incident response as needed)
**Owner**: DevOps + Support teams

**Actions**:
1. **Incident Triage**:
   - P0 (outage, data loss): Immediate response, rollback if needed
   - P1 (major bug, >50% users affected): Fix within 4 hours or rollback
   - P2 (minor bug, <10% users affected): Hotfix within 24 hours
   - P3 (cosmetic issue, feature request): Add to backlog, no immediate action

2. **Incident Response**:
   - Assign incident owner (on-call engineer)
   - Investigate root cause (logs, metrics, user reports)
   - Implement fix (hotfix deployment or configuration change)
   - Verify resolution (smoke tests, user confirmation)
   - Document incident (post-mortem for P0/P1)

3. **Known Issues Log**:
   - Maintain public-facing known issues page (status.yourproduct.com)
   - Update as issues discovered/resolved
   - Proactive communication (notify users of known issues before they report)

**Deliverable**: Incident log (all P0/P1/P2 incidents documented) + resolution status

---

### Step 3.3: Collect User Feedback
**Duration**: Ongoing (7 days)
**Owner**: Support Lead + Product Manager

**Actions**:
1. **Support Tickets**:
   - Monitor ticket volume (track surge patterns)
   - Categorize tickets (bug, feature request, usability issue, question, praise)
   - Identify patterns (most common issues)
   - Escalate critical issues to product/engineering

2. **In-App Feedback**:
   - Deploy feedback widget (NPS survey, feature requests, bug reports)
   - Prompt users after first session ("How was your experience?")
   - Track NPS score (Net Promoter Score) for launch cohort

3. **Customer Interviews**:
   - Schedule calls with first 20 users (if feasible)
   - Ask open-ended questions (what worked, what didn't, what's missing)
   - Record themes (product-market fit signals, usability friction)

4. **Social Listening**:
   - Monitor brand mentions (Twitter, Reddit, Hacker News, LinkedIn)
   - Track sentiment (positive, neutral, negative)
   - Engage with users (respond to questions, thank supporters)

5. **Feedback Aggregation**:
   - Compile feedback report (categorized by theme: bugs, features, UX, praise)
   - Quantify patterns (e.g., "40% of users requested feature X")
   - Prioritize for Stage 34 (Feature Iteration)

**Deliverable**: User feedback report (summary + raw data) for Stage 32 handoff

---

### Substage 31.3 Exit Gate
**Criteria**: Metrics tracked ✅, Issues addressed ✅, Feedback collected ✅

**Pass Criteria**:
- Dashboard active with ≥7 days of data
- All P0/P1 incidents resolved (P2 documented in backlog)
- Feedback report compiled with ≥50 data points (tickets, surveys, interviews)

**Sign-Off Required**: Launch Coordinator + Product Manager + Support Lead

---

## Exit Gates (Final Stage 31 Completion)

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1401-1404`

| # | Exit Gate | Verification Method | Pass Criteria | Output to Next Stage |
|---|-----------|---------------------|---------------|----------------------|
| 1 | Launch executed | Product accessible at public URL | ✅ 100+ users onboarded, uptime ≥95% | Stage 32 (Customer Success) |
| 2 | Users onboarded | User registration count | ✅ ≥[GTM target] new users in 7 days | Stage 33 (Analytics) |
| 3 | Metrics flowing | Dashboard showing live data | ✅ All metrics tracked, no gaps | Stage 34 (Feature Iteration) |

**Final Deliverable**: Launch retrospective document (what went well, what didn't, recommendations for next launch)

---

## Automation Opportunities (Proposed SD-LAUNCH-AUTOMATION-001)

**Current State**: Manual orchestration (80-100% human effort)
**Target State**: 80% automation (per critique recommendation)

**Automatable Tasks**:
1. **Entry gate validation**: Automated checklist verification (API checks for Stage 30 completion, asset validation)
2. **Coordinated deployment + marketing**: Single trigger for synchronized deployment + email/social activation
3. **Real-time monitoring**: Auto-generated dashboards with anomaly alerts (email/Slack notifications)
4. **Incident response**: Auto-rollback on P0 triggers, auto-scaling on traffic spikes
5. **Feedback aggregation**: Auto-categorization of support tickets (NLP sentiment analysis)

**Estimated Effort**: 2-3 sprints (SD-LAUNCH-AUTOMATION-001, P1 priority, status=queued)

---

## Roles & Responsibilities

| Role | Substage 31.1 | Substage 31.2 | Substage 31.3 | Key Responsibilities |
|------|---------------|---------------|---------------|----------------------|
| Launch Coordinator (LEAD) | Owner | Owner | Owner | Overall orchestration, decision-making, stakeholder communication |
| DevOps Lead | Participant | Owner (deployment) | Participant | Deployment execution, rollback readiness, incident response |
| Marketing Lead | Owner (comms) | Owner (activation) | Reporter | Marketing activation, channel coordination, metrics reporting |
| Support Lead | Participant | Participant | Owner (feedback) | Support readiness, ticket triage, feedback collection |
| QA Lead | Owner (validation) | Participant | N/A | Pre-launch testing, smoke tests, monitoring validation |
| Product Manager | Participant | Participant | Owner (feedback) | Feature prioritization, customer interview coordination |

---

## Handoff to Stage 32 (Customer Success)

**Deliverables**:
1. Launch retrospective document (lessons learned)
2. User feedback report (categorized, prioritized)
3. Launch metrics dashboard (with 7 days of baseline data)
4. Known issues log (outstanding bugs, feature requests)
5. Customer success onboarding plan (informed by launch feedback)

**Handoff Meeting**: Schedule 1-hour launch debrief with Stage 32 owner

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1397-1400 | "Production stable, Marketing ready, Supp..." |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1401-1404 | "Launch executed, Users onboarded, Metric..." |
| Substage 31.1 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1406-1411 | "Launch Preparation: Communications ready..." |
| Substage 31.2 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1412-1417 | "Launch Execution: Product live, Marketin..." |
| Substage 31.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1418-1423 | "Initial Monitoring: Metrics tracked, Iss..." |
| Automation target | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 33 | "Target State: 80% automation" |
| Rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 48-50 | "Current: No rollback defined, Required..." |

---

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
