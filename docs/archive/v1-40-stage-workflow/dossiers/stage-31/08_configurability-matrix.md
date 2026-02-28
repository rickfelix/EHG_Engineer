---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 31: MVP Launch — Configurability Matrix


## Table of Contents

- [Configuration Dimensions (3 Categories)](#configuration-dimensions-3-categories)
  - [1. Launch Timing & Scheduling](#1-launch-timing-scheduling)
  - [2. Marketing Channels & Intensity](#2-marketing-channels-intensity)
  - [3. Success Thresholds & Monitoring](#3-success-thresholds-monitoring)
- [Configuration Parameter Matrix](#configuration-parameter-matrix)
  - [Category 1: Launch Timing & Scheduling](#category-1-launch-timing-scheduling)
  - [Category 2: Marketing Channels & Intensity](#category-2-marketing-channels-intensity)
  - [Category 3: Success Thresholds & Monitoring](#category-3-success-thresholds-monitoring)
- [Configuration Storage & Management](#configuration-storage-management)
  - [Option 1: Database Table (Proposed)](#option-1-database-table-proposed)
  - [Option 2: YAML Configuration File](#option-2-yaml-configuration-file)
  - [Option 3: Hybrid Approach (Recommended)](#option-3-hybrid-approach-recommended)
- [Configuration Presets (Templates)](#configuration-presets-templates)
  - [Preset 1: B2B SaaS Launch](#preset-1-b2b-saas-launch)
  - [Preset 2: Consumer App Launch](#preset-2-consumer-app-launch)
  - [Preset 3: Developer Tool Launch](#preset-3-developer-tool-launch)
- [Dynamic Configuration (Runtime Adjustments)](#dynamic-configuration-runtime-adjustments)
- [Configuration Validation](#configuration-validation)
- [Configuration Impact on Recursion Triggers](#configuration-impact-on-recursion-triggers)
- [Configuration Optimization (Future Enhancement)](#configuration-optimization-future-enhancement)
- [Sources Table](#sources-table)

**Purpose**: Define tunable parameters for Stage 31 launch orchestration, allowing customization per venture type, risk tolerance, and market conditions.

**Philosophy**: Launch strategies vary by product (B2B vs. B2C, freemium vs. paid, viral vs. enterprise). Configurability enables adaptable launch execution.

---

## Configuration Dimensions (3 Categories)

### 1. Launch Timing & Scheduling
**Why Configurable**: Optimal launch timing varies by target audience, seasonality, and market conditions

### 2. Marketing Channels & Intensity
**Why Configurable**: Channel effectiveness depends on product category, target demographics, and budget

### 3. Success Thresholds & Monitoring
**Why Configurable**: Success criteria differ by venture stage (MVP vs. scale-up), business model, and risk tolerance

---

## Configuration Parameter Matrix

### Category 1: Launch Timing & Scheduling

| Parameter | Description | Default Value | Range | Venture-Specific Guidance |
|-----------|-------------|---------------|-------|---------------------------|
| `launch_day_of_week` | Preferred launch day (Mon-Sun) | Tuesday | Mon-Sun | **B2B**: Tue-Thu (work week focus), **B2C**: Sun-Mon (weekend engagement carry-over) |
| `launch_time_of_day` | Preferred launch hour (24h format) | 10:00 | 00:00-23:59 | **US-focused**: 10:00 ET (coast-to-coast coverage), **Global**: 14:00 UTC (Europe + US overlap) |
| `launch_window_duration` | Acceptable launch delay (if issues) | 4 hours | 1-12 hours | **High-stakes**: 1 hour (fix or abort), **Flexible**: 8 hours (iterate during launch) |
| `pre_launch_freeze` | Code freeze period before launch | 48 hours | 12-168 hours | **Stable product**: 12 hours, **Risky launch**: 168 hours (1 week) |
| `post_launch_monitoring` | Intensive monitoring duration | 7 days | 3-30 days | **MVP**: 3 days, **Enterprise**: 30 days (extended validation) |
| `launch_season_preference` | Avoid launches in certain months | None | Jan-Dec | **B2B**: Avoid Dec (holidays), **Education**: Avoid Jun-Aug (summer) |

**Configuration Example** (B2B SaaS launch):
```yaml
launch_timing:
  launch_day_of_week: Wednesday  # Mid-week for max business engagement
  launch_time_of_day: "11:00"    # 11am ET (8am PT, 4pm GMT)
  launch_window_duration: 2      # 2-hour window (abort if issues)
  pre_launch_freeze: 72          # 3-day code freeze for stability
  post_launch_monitoring: 14     # 2 weeks intensive monitoring
  launch_season_preference: "Avoid Dec"  # No holiday launches
```

---

### Category 2: Marketing Channels & Intensity

| Parameter | Description | Default Value | Range | Venture-Specific Guidance |
|-----------|-------------|---------------|-------|---------------------------|
| `email_campaign_enabled` | Send launch email to list | true | true/false | **No email list**: false, **Established list**: true |
| `email_send_time` | Delay email after go-live | 0 minutes | 0-120 minutes | **Immediate**: 0, **Staggered**: 60 (allow system stabilization) |
| `social_channels` | Active social platforms | [Twitter, LinkedIn] | Twitter, LinkedIn, Facebook, Instagram, TikTok, Reddit | **B2B**: Twitter + LinkedIn, **B2C**: Instagram + TikTok, **Developer**: Twitter + Reddit |
| `social_post_frequency` | Posts per day during launch | 3 | 1-10 | **Conservative**: 1-2, **Aggressive**: 5-10 |
| `paid_ads_enabled` | Run paid ad campaigns | true | true/false | **Bootstrapped**: false, **Funded**: true |
| `paid_ads_budget` | Daily ad spend during launch | $500 | $0-$10,000 | **MVP test**: $100, **Scale launch**: $5,000+ |
| `paid_ads_platforms` | Ad platforms to use | [Google, Facebook] | Google, Facebook, LinkedIn, Twitter, Reddit | **B2B**: Google + LinkedIn, **B2C**: Facebook + Instagram |
| `pr_outreach_enabled` | Distribute press release | true | true/false | **Stealth**: false, **Public launch**: true |
| `pr_newswire_service` | Press distribution service | PR Newswire | PR Newswire, Business Wire, PRWeb, Manual | **Premium**: PR Newswire, **Budget**: PRWeb, **DIY**: Manual |
| `community_launch_enabled` | Post to Product Hunt, HN, Reddit | false | true/false | **Developer/tech product**: true, **Enterprise B2B**: false |
| `influencer_outreach_enabled` | Engage influencers/beta users | false | true/false | **Consumer product**: true, **B2B**: false (unless thought leaders) |

**Configuration Example** (Consumer app launch):
```yaml
marketing_channels:
  email_campaign_enabled: true
  email_send_time: 30           # 30 min after go-live (system stabilized)
  social_channels: [Twitter, Instagram, TikTok]
  social_post_frequency: 5      # Aggressive social presence
  paid_ads_enabled: true
  paid_ads_budget: 1000         # $1k/day for 7 days
  paid_ads_platforms: [Facebook, Instagram]
  pr_outreach_enabled: true
  pr_newswire_service: PRWeb    # Budget-friendly PR
  community_launch_enabled: true  # Product Hunt launch
  influencer_outreach_enabled: true  # Engage micro-influencers
```

---

### Category 3: Success Thresholds & Monitoring

| Parameter | Description | Default Value | Range | Venture-Specific Guidance |
|-----------|-------------|---------------|-------|---------------------------|
| `target_users_day1` | User acquisition goal (first 24 hours) | 100 | 10-10,000 | **MVP**: 10-50, **Scale launch**: 1,000-10,000 |
| `target_users_week1` | User acquisition goal (first 7 days) | 500 | 50-50,000 | **Niche product**: 50-200, **Mass market**: 10,000+ |
| `min_uptime_threshold` | Minimum uptime for success | 95% | 85-99.9% | **MVP**: 90%, **Enterprise SLA**: 99.9% |
| `max_error_rate` | Maximum error rate threshold | 5% | 0.1-10% | **Transactional app**: 0.1%, **Content app**: 5% |
| `target_engagement_rate` | % users returning within 48 hours | 50% | 20-80% | **Viral app**: 60-80%, **Utility app**: 30-50% |
| `target_nps_score` | Net Promoter Score target | 40 | 0-100 | **Delight product**: 60+, **Utility**: 30-40 |
| `support_surge_threshold` | Tickets/hour triggering surge support | 100 | 20-500 | **Small team**: 20, **Large support org**: 500 |
| `max_response_time` | Support response time threshold | 2 hours | 15 min-24 hours | **Premium support**: 15 min, **Freemium**: 24 hours |
| `rollback_trigger_uptime` | Uptime below which to trigger rollback | 90% | 50-99% | **Critical app**: 95%, **Beta launch**: 70% |
| `rollback_trigger_error_rate` | Error rate triggering rollback | 10% | 5-50% | **Strict**: 5%, **Lenient**: 20% |
| `success_validation_window` | Days to validate launch success | 7 | 3-30 | **Fast iteration**: 3 days, **Stable launch**: 14 days |

**Configuration Example** (Enterprise B2B MVP):
```yaml
success_thresholds:
  target_users_day1: 20          # Conservative B2B target
  target_users_week1: 100        # 100 beta customers
  min_uptime_threshold: 99       # High reliability expectation
  max_error_rate: 1              # Strict error tolerance
  target_engagement_rate: 60     # High repeat usage (sticky product)
  target_nps_score: 50           # Aim for delight
  support_surge_threshold: 30    # Small support team
  max_response_time: 1           # 1-hour premium support SLA
  rollback_trigger_uptime: 95    # Trigger rollback below 95%
  rollback_trigger_error_rate: 5 # Trigger rollback above 5% errors
  success_validation_window: 14  # 2-week validation (stability critical)
```

---

## Configuration Storage & Management

### Option 1: Database Table (Proposed)
**Schema**:
```sql
CREATE TABLE stage_31_config (
  id SERIAL PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  config_category TEXT,  -- 'launch_timing', 'marketing_channels', 'success_thresholds'
  config_key TEXT,
  config_value TEXT,     -- JSON-encoded value (supports complex types)
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(venture_id, config_category, config_key)
);
```

**Advantages**:
- Per-venture customization (each venture can override defaults)
- Audit trail (track config changes via `updated_at`, `updated_by`)
- Queryable (easy to analyze which configs correlate with launch success)

---

### Option 2: YAML Configuration File
**File**: `/mnt/c/_EHG/EHG_Engineer/config/stage-31-launch-config.yaml`

**Advantages**:
- Version control (git history for config changes)
- Easy to review/edit (human-readable YAML)
- Template-based (define presets: "b2b_saas_launch", "consumer_app_launch", "enterprise_mvp")

**Disadvantages**:
- Global configuration (not per-venture unless using multiple files)
- No audit trail (unless tracked via git commits)

---

### Option 3: Hybrid Approach (Recommended)
1. **Default configs** in YAML (`config/stage-31-defaults.yaml`)
2. **Per-venture overrides** in database (`stage_31_config` table)
3. **Config resolution**: Database overrides → YAML defaults → hardcoded fallbacks

**Example**:
```javascript
// Pseudocode for config resolution
function getConfig(ventureId, configKey) {
  // 1. Check database for venture-specific override
  const dbConfig = query(`SELECT config_value FROM stage_31_config WHERE venture_id = ? AND config_key = ?`, ventureId, configKey);
  if (dbConfig) return JSON.parse(dbConfig.config_value);

  // 2. Check YAML defaults
  const yamlDefaults = loadYAML('config/stage-31-defaults.yaml');
  if (yamlDefaults[configKey]) return yamlDefaults[configKey];

  // 3. Hardcoded fallback
  return HARDCODED_DEFAULTS[configKey];
}
```

---

## Configuration Presets (Templates)

### Preset 1: B2B SaaS Launch
```yaml
preset_id: b2b_saas_launch
launch_timing:
  launch_day_of_week: Wednesday
  launch_time_of_day: "11:00"
  pre_launch_freeze: 72
marketing_channels:
  social_channels: [Twitter, LinkedIn]
  paid_ads_platforms: [Google, LinkedIn]
  community_launch_enabled: false
success_thresholds:
  target_users_week1: 100
  min_uptime_threshold: 99
  target_nps_score: 50
```

### Preset 2: Consumer App Launch
```yaml
preset_id: consumer_app_launch
launch_timing:
  launch_day_of_week: Monday
  launch_time_of_day: "09:00"
  pre_launch_freeze: 48
marketing_channels:
  social_channels: [Instagram, TikTok, Twitter]
  paid_ads_platforms: [Facebook, Instagram]
  community_launch_enabled: true
  influencer_outreach_enabled: true
success_thresholds:
  target_users_week1: 5000
  min_uptime_threshold: 95
  target_nps_score: 40
```

### Preset 3: Developer Tool Launch
```yaml
preset_id: developer_tool_launch
launch_timing:
  launch_day_of_week: Tuesday
  launch_time_of_day: "10:00"
  pre_launch_freeze: 96  # 4-day freeze (stability critical for devs)
marketing_channels:
  social_channels: [Twitter, Reddit]
  paid_ads_enabled: false  # Organic growth prioritized
  community_launch_enabled: true  # Product Hunt, Hacker News
success_thresholds:
  target_users_week1: 500
  min_uptime_threshold: 99.5  # High reliability expectation
  target_nps_score: 60  # Dev tools must delight
```

---

## Dynamic Configuration (Runtime Adjustments)

**Scenario**: Launch underway, need to adjust parameters based on real-time feedback

**Example 1: LAUNCH-002 Triggered (Low User Acquisition)**
- **Original Config**: `target_users_day1: 100`
- **Actual Performance**: 30 users after 24 hours
- **Runtime Adjustment**: Lower threshold to `target_users_day1: 50` (50% of original), extend `success_validation_window: 14` (from 7 days)

**Example 2: LAUNCH-003 Triggered (Support Overwhelmed)**
- **Original Config**: `support_surge_threshold: 100`
- **Actual Performance**: 120 tickets/hour
- **Runtime Adjustment**: Lower threshold to `support_surge_threshold: 80` (trigger surge support earlier), increase `max_response_time: 4` (from 2 hours, acknowledge capacity limits)

**Implementation**: LaunchCoordinator agent (see 06_agent-orchestration.md) can propose config adjustments to LEAD during active launch

---

## Configuration Validation

**Pre-Launch Checklist** (Substage 31.1):
1. **Timing conflicts**: Verify `launch_day_of_week` not on holidays, `launch_season_preference` respected
2. **Channel readiness**: If `email_campaign_enabled: true`, verify email list exists
3. **Budget alignment**: If `paid_ads_budget: $1000`, verify marketing budget approved
4. **Threshold realism**: If `target_users_week1: 10000`, verify GTM plan supports this target (Stage 17)
5. **Monitoring coverage**: If `post_launch_monitoring: 7`, verify monitoring tools configured (MetricsTracker agent)

**Validation Script** (proposed):
```bash
node scripts/validate-stage-31-config.mjs --venture-id <venture_id>
# Output: ✅ Config valid | ❌ Config issues detected (with details)
```

---

## Configuration Impact on Recursion Triggers

**Connection to 07_recursion-blueprint.md**:
- `rollback_trigger_uptime` → LAUNCH-001 trigger threshold
- `rollback_trigger_error_rate` → LAUNCH-001 trigger threshold
- `target_users_day1` → LAUNCH-002 trigger threshold (if <50% of target)
- `support_surge_threshold` → LAUNCH-003 trigger threshold

**Example**: If `rollback_trigger_uptime: 95%`, LAUNCH-001 triggers when uptime drops below 95%

---

## Configuration Optimization (Future Enhancement)

**Goal**: Use historical launch data to recommend optimal configs per venture type

**Data Collection**:
- Track launch outcomes (success rate, user acquisition, incident frequency) by config preset
- Correlate config parameters with success metrics (e.g., "Wednesday launches have 20% higher success rate than Friday")

**ML Model** (proposed SD-LAUNCH-CONFIG-OPTIMIZATION-001, P3 priority):
- Input: Venture characteristics (B2B/B2C, target market, budget, product category)
- Output: Recommended config preset + confidence score
- Example: "Based on 50 similar B2B SaaS launches, recommend `b2b_saas_launch` preset with 85% confidence"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1392-1395 | "Launch success rate, User acquisition, E..." |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1401-1404 | "Launch executed, Users onboarded, Metric..." |
| Rollback gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 48-50 | "Current: No rollback defined, Required: ..." |
| Thresholds gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 38 | "Missing: Threshold values, measurement f..." |

---

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
