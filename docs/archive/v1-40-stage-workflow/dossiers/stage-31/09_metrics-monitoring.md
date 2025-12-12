# Stage 31: MVP Launch — Metrics & Monitoring

**Purpose**: Define KPIs, measurement methods, Supabase queries, and dashboards for tracking Stage 31 launch performance.

**Source**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1392-1395` (3 metrics defined)

---

## Primary Metrics (From stages.yaml)

### 1. Launch Success Rate
**Definition**: Percentage of time product is operational during critical launch window (first 72 hours)
**Type**: Availability/uptime metric
**Target**: ≥95% uptime in first 72 hours (proposed, per SD-METRICS-FRAMEWORK-001)
**Measurement Frequency**: Real-time (1-minute intervals)

**Formula**:
```
Launch Success Rate = (Total minutes operational / Total minutes in launch window) × 100%
Example: (4,240 minutes up / 4,320 minutes total in 72 hours) × 100% = 98.1%
```

**Data Sources**:
- Production monitoring (Datadog, New Relic, Prometheus)
- Health check endpoints (`GET /health`, `GET /api/status`)
- Load balancer logs (nginx, Cloudflare)

**Supabase Storage** (proposed):
```sql
CREATE TABLE launch_uptime_log (
  id SERIAL PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  timestamp TIMESTAMP DEFAULT NOW(),
  status TEXT,  -- 'up', 'down', 'degraded'
  response_time_ms INTEGER,
  error_rate_percent DECIMAL(5,2)
);

-- Query: Calculate uptime for last 72 hours
SELECT
  venture_id,
  COUNT(*) FILTER (WHERE status = 'up') * 100.0 / COUNT(*) AS uptime_percent,
  AVG(response_time_ms) AS avg_response_time,
  AVG(error_rate_percent) AS avg_error_rate
FROM launch_uptime_log
WHERE venture_id = '<venture_id>'
  AND timestamp >= NOW() - INTERVAL '72 hours'
GROUP BY venture_id;
```

---

### 2. User Acquisition
**Definition**: Number of new user signups/registrations during launch period
**Type**: Growth metric
**Target**: [Defined in Stage 17 GTM plan] (example: 500 users in first 7 days)
**Measurement Frequency**: Hourly (first 72 hours), daily (days 4-7)

**Formula**:
```
User Acquisition = COUNT(DISTINCT user_id) WHERE created_at BETWEEN launch_start AND launch_end
```

**Data Sources**:
- User registration events (Supabase `users` table, auth logs)
- Analytics platforms (Google Analytics, Mixpanel, Amplitude)
- Marketing attribution (UTM codes, referral sources)

**Supabase Query**:
```sql
-- Assuming ventures table has launch_date column
SELECT
  v.id AS venture_id,
  v.name AS venture_name,
  v.launch_date,
  COUNT(u.id) AS total_users_acquired,
  COUNT(u.id) FILTER (WHERE u.created_at < v.launch_date + INTERVAL '1 day') AS day1_users,
  COUNT(u.id) FILTER (WHERE u.created_at < v.launch_date + INTERVAL '7 days') AS week1_users
FROM ventures v
LEFT JOIN users u ON u.venture_id = v.id  -- Assuming user-venture relationship
WHERE v.id = '<venture_id>'
  AND u.created_at >= v.launch_date
GROUP BY v.id, v.name, v.launch_date;
```

**Segmentation** (recommended):
- By acquisition channel (email, social, paid ads, organic, referral)
- By geography (US, Europe, Asia)
- By user type (free vs. paid, consumer vs. business)

---

### 3. Engagement Metrics
**Definition**: User activity indicators (session duration, feature usage, return rate)
**Type**: Composite behavioral metric
**Target**: ≥50% of users return within 48 hours (proposed benchmark)
**Measurement Frequency**: Daily (first 7 days), weekly (post-launch)

**Sub-Metrics**:
1. **Session Duration**: Average time users spend in product
   - Target: ≥5 minutes (content apps), ≥10 minutes (productivity apps)
2. **Feature Usage**: % of users who use core features
   - Target: ≥70% use primary feature, ≥40% use secondary features
3. **Return Rate**: % of users who return within 48 hours
   - Target: ≥50% (sticky product), ≥30% (utility product)
4. **Daily Active Users (DAU)**: Unique users active each day
   - Target: ≥50% of total acquired users

**Data Sources**:
- Analytics events (Mixpanel, Amplitude, custom event tracking)
- Session logs (backend logs, Redis session store)
- Feature flags (LaunchDarkly, Optimizely - track feature adoption)

**Supabase Storage** (proposed):
```sql
CREATE TABLE user_activity_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  venture_id UUID REFERENCES ventures(id),
  session_id TEXT,
  event_type TEXT,  -- 'session_start', 'feature_used', 'session_end'
  event_data JSONB, -- {feature_name: 'dashboard', duration_seconds: 320}
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Query: Calculate engagement metrics for last 7 days
WITH launch_cohort AS (
  SELECT id, created_at
  FROM users
  WHERE venture_id = '<venture_id>'
    AND created_at >= (SELECT launch_date FROM ventures WHERE id = '<venture_id>')
)
SELECT
  COUNT(DISTINCT lc.id) AS total_launch_users,
  COUNT(DISTINCT ual.user_id) FILTER (WHERE ual.timestamp < lc.created_at + INTERVAL '48 hours') AS returned_within_48h,
  COUNT(DISTINCT ual.user_id) FILTER (WHERE ual.timestamp < lc.created_at + INTERVAL '48 hours') * 100.0 / COUNT(DISTINCT lc.id) AS return_rate_percent,
  AVG((ual.event_data->>'duration_seconds')::INTEGER) AS avg_session_duration_seconds
FROM launch_cohort lc
LEFT JOIN user_activity_log ual ON ual.user_id = lc.id
WHERE ual.event_type IN ('session_start', 'session_end', 'feature_used')
GROUP BY 1;
```

---

## Secondary Metrics (Supporting Launch Analysis)

### 4. Marketing Campaign Performance
**Sub-Metrics**:
- **Email open rate**: % of recipients who open launch email (target: ≥20%)
- **Email click-through rate (CTR)**: % of recipients who click email links (target: ≥5%)
- **Social engagement**: Likes + shares + comments per post (target: ≥100 total)
- **Paid ad CTR**: % of ad impressions clicked (target: ≥2%)
- **Cost per acquisition (CPA)**: Ad spend / new users (target: <$10 for B2C, <$100 for B2B)

**Data Sources**:
- Email service provider (Mailchimp, SendGrid API)
- Social media APIs (Twitter, LinkedIn, Facebook Insights)
- Ad platforms (Google Ads, Facebook Ads Manager)

**Supabase Storage** (proposed):
```sql
CREATE TABLE marketing_campaign_metrics (
  id SERIAL PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  channel TEXT,  -- 'email', 'twitter', 'google_ads', 'facebook_ads'
  metric_name TEXT,  -- 'open_rate', 'ctr', 'cpa', 'impressions'
  metric_value DECIMAL(10,2),
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

### 5. Support Ticket Volume
**Sub-Metrics**:
- **Tickets per hour**: Support request rate (target: <50/hour for small team)
- **Average response time**: Time from ticket creation to first response (target: <2 hours)
- **Ticket categories**: % by type (bug, feature request, usability, question, praise)
- **Resolution rate**: % of tickets resolved within 24 hours (target: ≥80%)

**Data Sources**:
- Ticketing system (Zendesk, Intercom, Freshdesk API)
- In-app feedback widget (custom endpoint: `POST /api/feedback`)

**Supabase Storage** (proposed):
```sql
CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  user_id UUID REFERENCES users(id),
  ticket_id TEXT UNIQUE,  -- External ticketing system ID
  category TEXT,  -- 'bug', 'feature_request', 'usability', 'question', 'praise'
  priority TEXT,  -- 'P0', 'P1', 'P2', 'P3'
  status TEXT,  -- 'open', 'in_progress', 'resolved', 'closed'
  created_at TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  ticket_data JSONB  -- Full ticket content
);

-- Query: Support metrics for last 24 hours
SELECT
  venture_id,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE category = 'bug') AS bug_tickets,
  COUNT(*) FILTER (WHERE status = 'resolved') * 100.0 / COUNT(*) AS resolution_rate_percent,
  AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600) AS avg_response_time_hours
FROM support_tickets
WHERE venture_id = '<venture_id>'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY venture_id;
```

---

### 6. System Health (DevOps Metrics)
**Sub-Metrics**:
- **Error rate**: % of requests resulting in 5xx errors (target: <1%)
- **Response time (p95)**: 95th percentile response time (target: <500ms)
- **Database query time**: Average query duration (target: <100ms)
- **API rate limit hits**: # of 429 responses (target: 0)

**Data Sources**:
- Application performance monitoring (Datadog, New Relic, Prometheus)
- Backend logs (structured JSON logs via Winston, Bunyan)
- Database monitoring (pg_stat_statements for Postgres)

**Dashboard**: Datadog/New Relic pre-built dashboard (no Supabase storage needed for infra metrics)

---

## Dashboards (3 Levels)

### Dashboard 1: Executive Summary (LEAD View)
**Purpose**: High-level launch health for leadership (LEAD phase)
**Update Frequency**: Every 15 minutes (first 72 hours), hourly (days 4-7)
**Audience**: CEO, VP Product, Launch Coordinator

**Metrics Displayed**:
1. Launch success rate (uptime %) - Big number + sparkline
2. User acquisition progress - Current vs. target (gauge chart)
3. Engagement rate - Return within 48 hours %
4. Incident count - P0/P1/P2 incidents with status
5. Marketing ROI - Cost per acquisition vs. budget

**Implementation**: Grafana/Metabase dashboard pulling from Supabase + monitoring APIs

**Mockup**:
```
┌─────────────────────────────────────────────────────────────┐
│  MVP LAUNCH DASHBOARD - Venture: [Name] - Day 2 of 7       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Launch Success Rate          User Acquisition             │
│  ┌─────────────┐              ┌───────────────────┐        │
│  │   98.1%     │              │  320 / 500        │        │
│  │   ▲ 0.5%    │              │  [████████░░░░░░] │        │
│  └─────────────┘              │  64% of target    │        │
│  Target: ≥95%                 └───────────────────┘        │
│                                                             │
│  Engagement Rate              Incidents                    │
│  ┌─────────────┐              ┌───────────────────┐        │
│  │   52%       │              │  P0: 0  P1: 1     │        │
│  │  returned   │              │  P2: 3 (resolved) │        │
│  └─────────────┘              └───────────────────┘        │
│  Target: ≥50%                                               │
│                                                             │
│  Marketing ROI                                              │
│  ┌──────────────────────────────────────┐                  │
│  │  Email: $2.50 CPA   (target: <$5)   │                  │
│  │  Social: $8.20 CPA  (target: <$10)  │                  │
│  │  Paid Ads: $12.50 CPA (over target) │                  │
│  └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Dashboard 2: Operational Details (DevOps/Marketing View)
**Purpose**: Detailed metrics for tactical teams (DevOps, Marketing, Support)
**Update Frequency**: Real-time (auto-refresh every 1-5 minutes)
**Audience**: DevOps engineers, marketing managers, support leads

**Metrics Displayed**:
1. **System Health Panel**:
   - Uptime, error rate, response time (p50/p95/p99)
   - Active sessions, concurrent users
   - Database connections, query time
2. **Marketing Panel**:
   - Email metrics (open rate, CTR, bounces)
   - Social metrics per platform (impressions, engagement, follower growth)
   - Paid ad metrics per campaign (impressions, clicks, conversions, spend)
3. **Support Panel**:
   - Ticket volume (hourly/daily trend)
   - Ticket categories (pie chart)
   - Average response/resolution time

**Implementation**: Datadog/Grafana multi-panel dashboard

---

### Dashboard 3: User Behavior Analytics (Product View)
**Purpose**: Understand how users interact with product post-launch
**Update Frequency**: Daily (first 7 days), weekly (post-launch)
**Audience**: Product managers, UX designers

**Metrics Displayed**:
1. **User Funnel**: Signup → Activation → Feature 1 → Feature 2 → Retention
2. **Feature Adoption**: % of users using each feature (horizontal bar chart)
3. **Session Heatmap**: Hourly active users (timezone-aware)
4. **Retention Cohort**: Day 0, Day 1, Day 2, ..., Day 7 retention rates
5. **User Feedback Themes**: Word cloud from support tickets + in-app feedback

**Implementation**: Mixpanel/Amplitude (dedicated product analytics platform)

---

## Alerting Strategy

### Critical Alerts (Immediate Response)
| Alert | Condition | Recipient | Action |
|-------|-----------|-----------|--------|
| **P0 Outage** | Uptime <90% for 5 minutes | DevOps on-call (PagerDuty) | Trigger LAUNCH-001, evaluate rollback |
| **P0 Error Spike** | Error rate >10% for 2 minutes | DevOps on-call | Investigate logs, hotfix or rollback |
| **Support Overwhelmed** | >100 tickets/hour | Support lead + Product | Trigger LAUNCH-003, surge support |

### Warning Alerts (Attention Needed)
| Alert | Condition | Recipient | Action |
|-------|-----------|-----------|--------|
| **Low User Acquisition** | <25% of target after 24 hours | Marketing lead + Product | Trigger LAUNCH-002, review campaigns |
| **High Response Time** | p95 response time >1 second | DevOps | Investigate performance, scale resources |
| **Low Engagement** | <30% return rate after 48 hours | Product manager | Review onboarding UX, analyze drop-off |

### Info Alerts (FYI)
| Alert | Condition | Recipient | Action |
|-------|-----------|-----------|--------|
| **Launch Success** | All targets met for 72 hours | LEAD + all teams | Trigger LAUNCH-004, celebrate |
| **Daily Summary** | End of each day (first 7 days) | Launch Coordinator | Review metrics, update stakeholders |

**Delivery Channels**:
- PagerDuty (P0 alerts, on-call rotation)
- Slack (all alerts, dedicated #launch-alerts channel)
- Email (daily summaries, weekly reports)

---

## Monitoring Tools & Integration

### Recommended Stack
| Tool | Purpose | Integration |
|------|---------|-------------|
| **Datadog** | Infrastructure monitoring (uptime, error rate, response time) | Agent installed on production servers |
| **Google Analytics** | User acquisition, traffic sources, user flow | JavaScript snippet on website |
| **Mixpanel/Amplitude** | Product analytics (feature usage, cohorts, funnels) | Event tracking API |
| **Mailchimp/SendGrid** | Email campaign metrics | API for open rates, CTR |
| **Zendesk/Intercom** | Support ticket analytics | API for ticket volume, response time |
| **Supabase** | Custom metrics storage, launch-specific data | Direct database queries |

### Integration Example (MetricsTracker Agent)
**Pseudocode**:
```javascript
// MetricsTracker agent (see 06_agent-orchestration.md)
class MetricsTracker {
  async collectMetrics(ventureId) {
    // 1. Collect uptime from Datadog
    const uptime = await datadogAPI.getUptime(ventureId, '72h');

    // 2. Collect user acquisition from Supabase
    const users = await supabase.rpc('get_user_acquisition', { venture_id: ventureId });

    // 3. Collect engagement from Mixpanel
    const engagement = await mixpanelAPI.getReturnRate(ventureId, '48h');

    // 4. Store aggregated metrics in Supabase
    await supabase.from('launch_metrics_summary').insert({
      venture_id: ventureId,
      uptime_percent: uptime.percent,
      users_acquired: users.count,
      engagement_rate: engagement.returnRate,
      timestamp: new Date()
    });

    // 5. Check alert thresholds, trigger recursion if needed
    if (uptime.percent < 90) this.triggerAlert('LAUNCH-001', ventureId);
    if (users.count < users.target * 0.5) this.triggerAlert('LAUNCH-002', ventureId);
  }
}
```

---

## Metrics Validation (Substage 31.3 Exit Gate)

**Criteria**: "Metrics flowing" (stages.yaml:1404)
**Pass Conditions**:
1. ✅ All 3 primary metrics tracked (launch success rate, user acquisition, engagement)
2. ✅ Dashboard accessible and auto-updating
3. ✅ No data gaps (all hourly/daily reports generated)
4. ✅ Alerts tested and firing correctly (at least 1 test alert validated)
5. ✅ 7 days of continuous data collected (baseline established)

**Validation Checklist**:
- [ ] Dashboard loads without errors
- [ ] Uptime data showing for last 7 days (168 data points)
- [ ] User acquisition count matches Supabase `users` table query
- [ ] Engagement metrics calculated and displayed
- [ ] Marketing metrics integrated (email, social, ads)
- [ ] Support metrics integrated (tickets, response time)
- [ ] Alerts configured in PagerDuty/Slack
- [ ] Tested alert: Manually trigger low uptime alert, verify notification received

**Failure Handling**: If metrics not flowing, BLOCK Stage 32 handoff (cannot iterate without data)

---

## Historical Data Retention

**Retention Policy** (proposed):
- **Raw data** (uptime_log, activity_log): 90 days (Supabase storage limits)
- **Aggregated metrics** (launch_metrics_summary): 2 years (trend analysis)
- **Dashboard exports**: Permanent (PDF snapshot at end of each launch)

**Archival Strategy**:
- Daily exports to S3/GCS (JSON format)
- Quarterly rollups (weekly averages, not raw data)
- Launch retrospective includes metrics snapshot (embed in document)

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1392-1395 | "Launch success rate, User acquisition, E..." |
| Exit gate | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1404 | "Metrics flowing" |
| Substage 31.3 | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1420 | "Metrics tracked" |
| Thresholds gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 38 | "Missing: Threshold values, measurement f..." |
| Data flow gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 44 | "Gap: Data transformation and validation ..." |

---

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
