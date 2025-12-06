# Stage 32: Customer Success & Retention Engineering — Configurability Matrix

**Generated**: 2025-11-06
**Version**: 1.0

---

## Purpose

This matrix defines tunable parameters for customer success operations, enabling adaptation to different customer segments, industries, and business models without code changes.

---

## Configuration Architecture

**Storage**: `stage_configurations` table (or JSONB in `workflow_stages.notes`)
**Access**: EVA-controlled with Chairman override
**Scope**: Stage 32 operations (health scoring, retention campaigns, alerts)

---

## Category 1: Health Score Parameters

### 1.1 Score Calculation Weights

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `engagement_weight` | 40 | 0-100 | Weight for engagement metrics (login, usage) | Higher = prioritize active users |
| `support_weight` | 30 | 0-100 | Weight for support quality (inverse of ticket count) | Higher = prioritize satisfied users |
| `value_weight` | 30 | 0-100 | Weight for value realization (features adopted) | Higher = prioritize power users |

**Constraint**: Sum of weights must equal 100
**Evidence**: Health score algorithm in `05_professional-sop.md` Step 4

**Use Cases**:
- **Product-Led Growth**: Increase `engagement_weight` (50), reduce `support_weight` (20)
- **Enterprise Sales**: Increase `value_weight` (40), maintain `support_weight` (30)
- **Freemium Model**: Increase `engagement_weight` (60), reduce `value_weight` (10)

---

### 1.2 Engagement Scoring

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `active_login_days` | 1 | 1-7 | Days since last login for "active" status | Lower = stricter engagement definition |
| `active_engagement_points` | 40 | 0-50 | Points awarded for recent login | Higher = rewards recent activity more |
| `moderate_login_days` | 7 | 2-14 | Days since last login for "moderate" status | Mid-range engagement threshold |
| `moderate_engagement_points` | 30 | 0-40 | Points awarded for moderate activity | Scales with active points |
| `low_login_days` | 30 | 8-60 | Days since last login for "low" status | Higher = more forgiving |
| `low_engagement_points` | 20 | 0-30 | Points awarded for low activity | Minimum engagement recognition |

**Evidence**: `05_professional-sop.md` Step 5 SQL query

**Use Cases**:
- **High-Touch B2B**: Increase `active_login_days` to 7 (customers don't need daily usage)
- **Consumer App**: Decrease `active_login_days` to 1 (expect daily usage)
- **Seasonal Product**: Adjust `low_login_days` to 60 (usage varies by season)

---

### 1.3 Support Scoring

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `max_support_points` | 30 | 0-50 | Maximum points for support quality | Higher = support satisfaction matters more |
| `ticket_penalty` | 10 | 5-20 | Points deducted per open ticket | Higher = penalizes support issues more |
| `min_support_points` | 0 | 0-10 | Minimum points (prevents negative scores) | Safety net for high-ticket customers |

**Evidence**: `05_professional-sop.md` Step 5 SQL query (support_score calculation)

**Use Cases**:
- **Tech Product**: Increase `ticket_penalty` to 15 (support issues indicate onboarding gaps)
- **Complex Enterprise**: Reduce `ticket_penalty` to 5 (support tickets expected during implementation)

---

### 1.4 Value Scoring

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `points_per_feature` | 5 | 1-10 | Points per feature adopted | Higher = rewards breadth of usage |
| `core_feature_bonus` | 10 | 0-20 | Bonus for adopting core features | Emphasizes key features |
| `max_value_points` | 30 | 0-50 | Maximum value score cap | Prevents over-weighting power users |

**Evidence**: `05_professional-sop.md` Step 5 SQL query (value_score calculation)

**Use Cases**:
- **Multi-Feature Product**: Increase `points_per_feature` to 10 (encourage exploration)
- **Single-Purpose Tool**: Increase `core_feature_bonus` to 20 (focus on primary use case)

---

### 1.5 Health Score Thresholds

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `healthy_threshold` | 70 | 60-90 | Minimum score for "healthy" status | Higher = stricter health definition |
| `at_risk_threshold` | 40 | 30-60 | Minimum score for "at-risk" status | Defines intervention trigger |
| `critical_threshold` | 0 | 0-30 | Minimum score for "critical" status | All below this are critical |

**⚠️ BLOCKER**: SD-METRICS-FRAMEWORK-001 (P0 CRITICAL, status=queued) - No standardized thresholds
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:36-39 "Missing: Threshold values"

**Use Cases**:
- **Conservative Approach**: Increase `healthy_threshold` to 80 (catch issues earlier)
- **Aggressive Growth**: Decrease `at_risk_threshold` to 30 (focus only on critical customers)

---

## Category 2: Retention Campaign Parameters

### 2.1 Campaign Triggers

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `at_risk_trigger_score` | 40-69 | 30-80 | Health score range for at-risk campaigns | Aligns with health thresholds |
| `critical_trigger_score` | 0-39 | 0-50 | Health score range for critical campaigns | Urgent intervention threshold |
| `win_back_inactive_days` | 30 | 14-90 | Days inactive before win-back campaign | Higher = more patient approach |

**Evidence**: `05_professional-sop.md` Step 7 (retention program design)

**Use Cases**:
- **Freemium**: Increase `win_back_inactive_days` to 90 (low urgency for free users)
- **Paid Subscription**: Decrease to 14 (high urgency to prevent churn)

---

### 2.2 Campaign Timing

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `at_risk_email_delay_days` | 0 | 0-3 | Days to wait before sending at-risk email | Immediate vs. observed decline |
| `at_risk_guide_delay_days` | 3 | 1-7 | Days between email and feature guide | Spacing for engagement |
| `at_risk_call_delay_days` | 7 | 3-14 | Days before scheduling check-in call | Escalation timeline |
| `critical_response_hours` | 24 | 4-48 | Hours to contact critical customers | SLA for urgent intervention |
| `chairman_escalation_hours` | 48 | 24-96 | Hours before Chairman escalation | High-value account protection |

**Evidence**: `05_professional-sop.md` Step 7 (action timelines)

**Use Cases**:
- **High-Touch**: Decrease `critical_response_hours` to 4 (white-glove service)
- **Self-Service**: Increase delays (give customers space to self-recover)

---

### 2.3 Campaign Frequency

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `campaign_cooldown_days` | 7 | 3-30 | Days between campaigns for same customer | Prevents spam |
| `win_back_check_in_days` | 90 | 30-180 | Days between win-back attempts | Persistence vs. respect |
| `nps_survey_interval_days` | 90 | 30-365 | Days between NPS surveys per customer | Survey fatigue management |

**Evidence**: `07_recursion-blueprint.md` RETENTION-001 cooldown (7 days)

**Use Cases**:
- **High Engagement Product**: Decrease `campaign_cooldown_days` to 3 (frequent touchpoints acceptable)
- **Low Engagement Product**: Increase to 30 (avoid over-communication)

---

## Category 3: Alert & Notification Parameters

### 3.1 Alert Routing

| Parameter | Default | Description | Impact |
|-----------|---------|-------------|--------|
| `critical_slack_channel` | `#customer-success-urgent` | Slack channel for critical alerts | Team notification destination |
| `at_risk_digest_recipients` | `success@company.com` | Email for weekly at-risk digest | Batch notification target |
| `chairman_escalation_slack` | `@chairman` | Slack user for escalations | Executive notification |
| `chairman_escalation_email` | `chairman@company.com` | Email for escalations | Executive notification fallback |

**Evidence**: `05_professional-sop.md` Step 6 (alert configuration)

**Use Cases**:
- **Multi-Team**: Configure separate channels for enterprise vs. SMB
- **Distributed Team**: Add timezone-specific routing

---

### 3.2 Alert Thresholds

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `critical_alert_delay_minutes` | 5 | 0-60 | Minutes to wait before sending critical alert | Prevents noise from transient drops |
| `weekly_digest_day` | `Monday` | Mon-Sun | Day of week for at-risk digest | Team workflow alignment |
| `weekly_digest_hour` | 9 | 0-23 | Hour of day for digest (UTC) | Team timezone consideration |

**Evidence**: `05_professional-sop.md` Step 6 (alert timing)

**Use Cases**:
- **Real-Time Response**: Set `critical_alert_delay_minutes` to 0 (immediate alerts)
- **Batch Processing**: Set to 60 (consolidate alerts)

---

## Category 4: NPS Survey Parameters

### 4.1 Survey Deployment

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `nps_deploy_milestone` | `first_value_realization` | Predefined | Trigger event for NPS survey | Survey timing strategy |
| `nps_min_responses` | 100 | 50-500 | Minimum responses for statistical significance | Confidence level |
| `nps_target_response_rate` | 30% | 20-50% | Target survey response rate | Engagement goal |

**Evidence**: `05_professional-sop.md` Exit Gate 3 (≥100 responses)

**Deployment Options**:
- `onboarding_complete` - After 14 days (early feedback)
- `first_value_realization` - After core feature adoption (value-based)
- `30_day_checkpoint` - Fixed timeline (consistent)
- `60_day_checkpoint` - Mid-lifecycle (engagement-based)
- `90_day_checkpoint` - Quarterly (renewal-focused)

**Use Cases**:
- **Freemium**: Deploy at `first_value_realization` (capture upgrade intent)
- **Annual Contract**: Deploy at `90_day_checkpoint` (renewal preparation)

---

### 4.2 NPS Thresholds

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `nps_positive_threshold` | 0 | -100 to 50 | Minimum NPS for exit gate | Gate strictness |
| `nps_target_score` | 30 | 0-70 | Target NPS for sustainable growth | Aspirational goal |
| `nps_excellent_score` | 50 | 30-80 | World-class NPS benchmark | Stretch goal |

**Evidence**: EHG_Engineer@468a959:docs/workflow/stages.yaml:1450 "NPS positive" (≥0)

⚠️ **Threshold Gap**: "Positive" (≥0) is exit gate, but industry standard for "excellent" is ≥50
**Proposed**: Exit gate at 0, target 30, aspirational 50

**Use Cases**:
- **Strict Quality**: Set `nps_positive_threshold` to 30 (higher bar)
- **Growth Phase**: Keep at 0 (focus on learning, not scores)

---

## Category 5: CRM Integration Parameters

### 5.1 Platform Settings

| Parameter | Default | Description | Impact |
|-----------|---------|-------------|--------|
| `crm_platform` | `hubspot` | CRM platform (hubspot, salesforce, intercom) | Integration choice |
| `crm_api_endpoint` | `https://api.hubapi.com` | API base URL | Connection target |
| `crm_sync_frequency_hours` | 24 | Hours between full syncs | Data freshness vs. API limits |
| `crm_retry_attempts` | 3 | Failed API call retry count | Reliability vs. latency |
| `crm_timeout_seconds` | 30 | API call timeout | Performance tuning |

**Evidence**: `05_professional-sop.md` Step 1 (CRM configuration)

**Use Cases**:
- **Real-Time Sync**: Decrease `crm_sync_frequency_hours` to 1 (higher API usage)
- **API Rate Limits**: Increase `crm_sync_frequency_hours` to 24 (avoid throttling)

---

### 5.2 Data Mapping

| Parameter | Default | Description | Impact |
|-----------|---------|-------------|--------|
| `customer_id_field` | `user_id` | Application DB field for customer ID | Primary key mapping |
| `health_score_field` | `health_score_custom` | CRM custom field for health score | Score storage location |
| `last_login_field` | `last_activity_date` | CRM field for last login | Engagement tracking |
| `support_ticket_field` | `open_ticket_count` | CRM field for ticket count | Support quality indicator |

**Evidence**: `05_professional-sop.md` Step 1 (custom field setup)

**Use Cases**:
- **HubSpot**: Use standard fields where possible (reduce custom field count)
- **Salesforce**: Map to custom objects for complex health scoring

---

## Category 6: System Health Parameters

### 6.1 Monitoring Thresholds

| Parameter | Default | Range | Description | Impact |
|-----------|---------|-------|-------------|--------|
| `health_check_interval_minutes` | 60 | 5-1440 | Minutes between system health checks | Monitoring frequency |
| `max_consecutive_failures` | 3 | 1-10 | Failures before EVA escalation | Alerting threshold |
| `target_uptime_percent` | 99.5 | 95-99.9 | System uptime SLA | Reliability goal |
| `crm_sync_error_threshold_percent` | 5 | 1-10 | Max acceptable CRM sync error rate | Data quality tolerance |

**Evidence**: `07_recursion-blueprint.md` RETENTION-004 (system health check)

**Use Cases**:
- **Mission-Critical**: Set `target_uptime_percent` to 99.9 (stricter SLA)
- **Startup**: Set to 95 (focus on learning, not perfection)

---

## Configuration Management

### Storage Schema (Proposed)

```sql
CREATE TABLE IF NOT EXISTS stage_32_configurations (
  id SERIAL PRIMARY KEY,
  parameter_name VARCHAR(100) NOT NULL UNIQUE,
  parameter_value JSONB NOT NULL,  -- Supports strings, numbers, booleans
  parameter_type VARCHAR(50) NOT NULL,  -- 'health_score', 'retention', 'alert', 'nps', 'crm', 'system'
  default_value JSONB NOT NULL,
  valid_range JSONB,  -- {min: X, max: Y} or [option1, option2]
  description TEXT,
  last_updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100),  -- 'EVA' or 'Chairman'
  CONSTRAINT valid_json CHECK (jsonb_typeof(parameter_value) IN ('string', 'number', 'boolean'))
);

-- Example rows
INSERT INTO stage_32_configurations (parameter_name, parameter_value, parameter_type, default_value, valid_range, description) VALUES
  ('engagement_weight', '40', 'health_score', '40', '{"min": 0, "max": 100}', 'Weight for engagement metrics'),
  ('healthy_threshold', '70', 'health_score', '70', '{"min": 60, "max": 90}', 'Minimum score for healthy status'),
  ('at_risk_trigger_score', '40-69', 'retention', '40-69', '{"min": 30, "max": 80}', 'Health score range for at-risk campaigns');
```

---

### Update Procedures

**EVA Self-Adjustment**:
- Analyze effectiveness metrics (recovery rates, retention improvement)
- Propose configuration changes based on data
- Log proposed changes for Chairman review
- Apply non-critical changes automatically (e.g., campaign timing)

**Chairman Override**:
- Review EVA proposals
- Approve or modify changes
- Set strategic parameters (e.g., NPS target, uptime SLA)
- Lock critical parameters (e.g., CRM platform, API credentials)

**Audit Trail**:
- All changes logged in `configuration_audit_log` table
- Before/after values stored
- Rationale documented (EVA analysis or Chairman directive)

---

## Usage Examples

### Example 1: Tuning for Enterprise B2B

```sql
-- Adjust health score weights (value realization matters more than login frequency)
UPDATE stage_32_configurations SET parameter_value = '30' WHERE parameter_name = 'engagement_weight';
UPDATE stage_32_configurations SET parameter_value = '30' WHERE parameter_name = 'support_weight';
UPDATE stage_32_configurations SET parameter_value = '40' WHERE parameter_name = 'value_weight';

-- Increase login tolerance (enterprise users don't need daily logins)
UPDATE stage_32_configurations SET parameter_value = '7' WHERE parameter_name = 'active_login_days';

-- Faster critical response (high-value accounts)
UPDATE stage_32_configurations SET parameter_value = '4' WHERE parameter_name = 'critical_response_hours';
```

---

### Example 2: Tuning for Consumer SaaS

```sql
-- Prioritize engagement (daily usage expected)
UPDATE stage_32_configurations SET parameter_value = '60' WHERE parameter_name = 'engagement_weight';
UPDATE stage_32_configurations SET parameter_value = '20' WHERE parameter_name = 'support_weight';
UPDATE stage_32_configurations SET parameter_value = '20' WHERE parameter_name = 'value_weight';

-- Strict engagement definition (expect daily logins)
UPDATE stage_32_configurations SET parameter_value = '1' WHERE parameter_name = 'active_login_days';

-- More patient with churn (self-service model)
UPDATE stage_32_configurations SET parameter_value = '90' WHERE parameter_name = 'win_back_inactive_days';
```

---

### Example 3: Tuning for High-Growth Startup

```sql
-- Relaxed NPS threshold (focus on learning, not scores)
UPDATE stage_32_configurations SET parameter_value = '0' WHERE parameter_name = 'nps_positive_threshold';

-- Lower uptime SLA (iterate fast, tolerate some instability)
UPDATE stage_32_configurations SET parameter_value = '95' WHERE parameter_name = 'target_uptime_percent';

-- Frequent touchpoints (build relationships)
UPDATE stage_32_configurations SET parameter_value = '3' WHERE parameter_name = 'campaign_cooldown_days';
```

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Health score algorithm | Dossier | 6ef8cf4 | stage-32/05_professional-sop.md | Step 4 | Score calculation logic |
| Retention campaigns | Dossier | 6ef8cf4 | stage-32/05_professional-sop.md | Step 7 | Campaign design |
| Alert configuration | Dossier | 6ef8cf4 | stage-32/05_professional-sop.md | Step 6 | Notification setup |
| NPS requirements | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1450 | Exit gate threshold |
| System health | Dossier | 6ef8cf4 | stage-32/07_recursion-blueprint.md | RETENTION-004 | Monitoring logic |
| Threshold gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 36-39 | Missing thresholds |

---

**Next**: See `09_metrics-monitoring.md` for KPI tracking and dashboards.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
