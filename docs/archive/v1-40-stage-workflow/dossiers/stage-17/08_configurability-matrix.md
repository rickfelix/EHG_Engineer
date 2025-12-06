# Stage 17: Configurability Matrix

## Overview

Stage 17 (GTM Strategist Agent Development) requires extensive configurability to support diverse ventures (B2B vs B2C, different industries, varying budgets, multiple market segments). This document defines all tunable parameters and their valid ranges.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:737 "marketing automation" requires flexible configuration per venture.

## Configuration Levels

### Level 1: Venture-Global Configuration
**Scope**: Applies to entire venture across all campaigns and channels
**Set During**: Substage 17.1 (Strategy Configuration)
**Stored In**: `gtm_configs` table

### Level 2: Campaign-Specific Configuration
**Scope**: Applies to individual campaigns (email drip, social ads, webinar funnel)
**Set During**: Substage 17.2 (Campaign Development)
**Stored In**: `campaign_templates` table

### Level 3: Channel-Specific Configuration
**Scope**: Applies to individual marketing channels (LinkedIn, email, Google Ads)
**Set During**: Substage 17.1 (Strategy Configuration)
**Stored In**: `marketing_channels` table

### Level 4: Workflow-Specific Configuration
**Scope**: Applies to automation workflows (triggers, delays, conditions)
**Set During**: Substage 17.3 (Automation Setup)
**Stored In**: `automation_workflows` table

## Tunable Parameters Catalog

### Category 1: Strategy Parameters (Substage 17.1)

#### Parameter: Target Market Segment
**Configuration Level**: Venture-Global
**Type**: Enumerated list
**Valid Values**: `['B2B_Enterprise', 'B2B_SMB', 'B2C_Mass', 'B2C_Premium', 'Hybrid']`
**Default**: `'B2B_SMB'`
**Impact**: Determines channel selection, messaging tone, campaign cadence
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:742 "Customer segments"

**Customization Example**:
```json
{
  "target_segment": "B2B_Enterprise",
  "segment_characteristics": {
    "company_size": "500+ employees",
    "decision_makers": ["CTO", "VP Engineering"],
    "sales_cycle_days": 90
  }
}
```

#### Parameter: Marketing Objectives
**Configuration Level**: Venture-Global
**Type**: Multi-select enumeration
**Valid Values**: `['awareness', 'consideration', 'lead_generation', 'conversion', 'retention', 'advocacy']`
**Default**: `['lead_generation', 'conversion']`
**Impact**: Determines campaign types, content focus, success metrics
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:749-751 "Metrics: Campaign effectiveness, Lead generation, Conversion rates"

**Customization Example**:
```json
{
  "objectives": ["awareness", "lead_generation"],
  "priority_ranking": {
    "awareness": 0.6,
    "lead_generation": 0.4
  }
}
```

#### Parameter: Total Marketing Budget
**Configuration Level**: Venture-Global
**Type**: Decimal (USD)
**Valid Range**: `$1,000 - $1,000,000 per month`
**Default**: `$10,000 per month`
**Impact**: Determines channel selection, campaign scale, ad spend limits
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:766 "Budgets allocated"

**Customization Example**:
```json
{
  "total_budget_usd": 50000,
  "budget_period": "monthly",
  "allocation_strategy": "70-20-10"  // proven-growth-experimental
}
```

#### Parameter: Budget Allocation Strategy
**Configuration Level**: Venture-Global
**Type**: Ratio (3 values summing to 100%)
**Valid Ranges**:
- Proven channels: `50-80%`
- Growth channels: `10-30%`
- Experimental channels: `5-20%`
**Default**: `[70, 20, 10]`
**Impact**: Risk/reward balance, innovation pace
**Evidence**: Referenced in 05_professional-sop.md (70-20-10 rule)

**Customization Example**:
```json
{
  "allocation": {
    "proven": 0.60,      // More conservative
    "growth": 0.30,      // More aggressive growth
    "experimental": 0.10 // Standard innovation
  }
}
```

#### Parameter: Primary Marketing Channels
**Configuration Level**: Venture-Global
**Type**: Multi-select enumeration
**Valid Values**: `['email', 'linkedin', 'google_ads', 'facebook_ads', 'instagram_ads', 'twitter_ads', 'content_marketing', 'webinars', 'events', 'influencer_partnerships']`
**Default**: `['email', 'linkedin', 'content_marketing']` (B2B) or `['facebook_ads', 'instagram_ads', 'email']` (B2C)
**Impact**: Channel integrations required, content types needed
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:743 "Marketing channels"

**Customization Example**:
```json
{
  "primary_channels": ["linkedin", "webinars"],
  "secondary_channels": ["email", "content_marketing"],
  "channel_priorities": {
    "linkedin": 1,
    "webinars": 2,
    "email": 3,
    "content_marketing": 4
  }
}
```

#### Parameter: Brand Voice
**Configuration Level**: Venture-Global
**Type**: Enumerated string
**Valid Values**: `['professional', 'friendly', 'authoritative', 'playful', 'inspirational', 'technical']`
**Default**: `'professional'`
**Impact**: Content generation tone, messaging style
**Evidence**: Derived from Stage 11 (Naming/Branding), used in ContentGenerator agent

**Customization Example**:
```json
{
  "brand_voice": "technical",
  "voice_characteristics": {
    "formality": 0.8,      // 0.0 = very casual, 1.0 = very formal
    "emotion": 0.3,        // 0.0 = analytical, 1.0 = emotional
    "complexity": 0.9      // 0.0 = simple language, 1.0 = technical jargon
  }
}
```

#### Parameter: Competitive Positioning
**Configuration Level**: Venture-Global
**Type**: String (50-200 characters)
**Default**: (derived from Stage 16 pricing strategy)
**Impact**: Value proposition messaging, differentiators highlighted
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:741 "Market strategy" (includes positioning)

**Customization Example**:
```json
{
  "positioning_statement": "Fastest, most developer-friendly analytics platform for modern SaaS companies",
  "key_differentiators": [
    "10x faster query performance",
    "SQL-native interface",
    "Zero-configuration setup"
  ]
}
```

### Category 2: Campaign Parameters (Substage 17.2)

#### Parameter: Campaign Type
**Configuration Level**: Campaign-Specific
**Type**: Enumerated string
**Valid Values**: `['email_drip', 'email_newsletter', 'social_ads', 'landing_page', 'webinar_funnel', 'content_series', 'event_promotion', 'product_launch']`
**Default**: `'email_drip'`
**Impact**: Template structure, content requirements, scheduling logic
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:746 "Campaign templates"

**Customization Example**:
```json
{
  "campaign_type": "webinar_funnel",
  "funnel_stages": [
    {"stage": "registration", "template": "webinar-reg-form"},
    {"stage": "reminder_7d", "template": "webinar-reminder-1"},
    {"stage": "reminder_1d", "template": "webinar-reminder-2"},
    {"stage": "post_webinar", "template": "webinar-followup"}
  ]
}
```

#### Parameter: Email Sequence Length
**Configuration Level**: Campaign-Specific (email campaigns only)
**Type**: Integer
**Valid Range**: `3-10 emails`
**Default**: `5 emails`
**Impact**: Drip campaign duration, content volume required
**Evidence**: Referenced in 05_professional-sop.md (email drip template)

**Customization Example**:
```json
{
  "sequence_length": 7,
  "email_delays_hours": [0, 48, 96, 168, 336, 504, 672],  // 0h, 2d, 4d, 7d, 14d, 21d, 28d
  "sequence_goal": "lead_qualification"
}
```

#### Parameter: A/B Test Variants
**Configuration Level**: Campaign-Specific
**Type**: Integer
**Valid Range**: `2-5 variants per element`
**Default**: `2 variants`
**Impact**: Content generation workload, testing duration
**Evidence**: Referenced in 06_agent-orchestration.md (ContentGenerator A/B testing)

**Customization Example**:
```json
{
  "ab_test_config": {
    "subject_line_variants": 3,
    "cta_button_variants": 2,
    "hero_image_variants": 2,
    "test_sample_size": 1000,
    "test_duration_hours": 48
  }
}
```

#### Parameter: Content Length
**Configuration Level**: Campaign-Specific
**Type**: Integer (words)
**Valid Range**: `50-2000 words` (depends on content type)
**Default**: `300 words` (email), `50 words` (ad), `800 words` (blog post)
**Impact**: Content generation time, reader engagement
**Evidence**: Referenced in 06_agent-orchestration.md (ContentGenerator tool)

**Customization Example**:
```json
{
  "content_length": {
    "email_body": 400,
    "landing_page_hero": 100,
    "blog_post": 1200
  },
  "readability_target": "8th_grade"  // Flesch-Kincaid grade level
}
```

#### Parameter: Call-to-Action (CTA) Type
**Configuration Level**: Campaign-Specific
**Type**: Enumerated string
**Valid Values**: `['book_demo', 'start_trial', 'download_resource', 'register_webinar', 'contact_sales', 'learn_more', 'buy_now']`
**Default**: `'book_demo'` (B2B) or `'start_trial'` (B2C)
**Impact**: Conversion tracking, landing page design
**Evidence**: Referenced in 05_professional-sop.md (CTA configuration)

**Customization Example**:
```json
{
  "primary_cta": "start_trial",
  "secondary_cta": "learn_more",
  "cta_placement": ["email_body_middle", "email_body_end", "landing_page_hero"],
  "cta_copy": {
    "start_trial": "Start Your Free 14-Day Trial",
    "learn_more": "See How It Works"
  }
}
```

#### Parameter: Campaign Schedule
**Configuration Level**: Campaign-Specific
**Type**: Cron expression or date range
**Valid Formats**: ISO 8601 datetime, cron syntax
**Default**: Immediate start, ongoing (no end date)
**Impact**: Email send times, ad flight dates, content publishing calendar
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:772 "Schedules set"

**Customization Example**:
```json
{
  "schedule_type": "recurring",
  "cron_expression": "0 10 * * 2,4",  // Every Tuesday and Thursday at 10am
  "timezone": "America/New_York",
  "start_date": "2025-11-15",
  "end_date": "2025-12-31"
}
```

### Category 3: Channel Parameters (Substage 17.1)

#### Parameter: Email Platform Configuration
**Configuration Level**: Channel-Specific
**Type**: Object (platform-dependent)
**Valid Values**: Depends on platform (HubSpot, Mailchimp, SendGrid)
**Default**: (none, must be configured)
**Impact**: Email delivery, tracking, automation capabilities
**Evidence**: Referenced in 05_professional-sop.md (channel integration)

**Customization Example (HubSpot)**:
```json
{
  "platform": "hubspot",
  "api_credentials": {
    "api_key": "STORED_IN_VAULT",
    "portal_id": "12345678"
  },
  "sender_config": {
    "from_name": "Venture Team",
    "from_email": "team@venture.com",
    "reply_to": "support@venture.com"
  },
  "tracking": {
    "open_tracking": true,
    "click_tracking": true,
    "unsubscribe_link": true
  }
}
```

#### Parameter: LinkedIn Ads Configuration
**Configuration Level**: Channel-Specific
**Type**: Object
**Valid Values**: LinkedIn Campaign Manager settings
**Default**: (none, must be configured)
**Impact**: Ad targeting, bidding, budget pacing
**Evidence**: LinkedIn listed as primary B2B channel in 05_professional-sop.md

**Customization Example**:
```json
{
  "platform": "linkedin",
  "account_id": "ACCOUNT_ID",
  "targeting": {
    "job_titles": ["CTO", "VP Engineering", "Head of Product"],
    "company_sizes": ["51-200", "201-500", "501-1000"],
    "industries": ["Computer Software", "Information Technology"],
    "locations": ["United States", "Canada", "United Kingdom"]
  },
  "bidding": {
    "strategy": "max_delivery",  // or "target_cost"
    "bid_amount_usd": 12.00
  },
  "budget": {
    "daily_budget_usd": 500,
    "total_budget_usd": 15000
  }
}
```

#### Parameter: Google Ads Configuration
**Configuration Level**: Channel-Specific
**Type**: Object
**Valid Values**: Google Ads API settings
**Default**: (none, must be configured)
**Impact**: Search/display ad targeting, keyword bidding
**Evidence**: Google Ads listed as B2C channel in 05_professional-sop.md

**Customization Example**:
```json
{
  "platform": "google_ads",
  "account_id": "ACCOUNT_ID",
  "campaign_type": "search",  // or "display", "video"
  "targeting": {
    "keywords": [
      {"text": "analytics platform", "match_type": "phrase"},
      {"text": "data visualization", "match_type": "broad"}
    ],
    "negative_keywords": ["free", "open source"],
    "locations": ["United States"],
    "languages": ["en"]
  },
  "bidding": {
    "strategy": "target_cpa",
    "target_cpa_usd": 50.00
  }
}
```

#### Parameter: Content Marketing Configuration
**Configuration Level**: Channel-Specific
**Type**: Object
**Valid Values**: Publishing platform settings (WordPress, Ghost, Medium)
**Default**: (none, must be configured)
**Impact**: Blog post publishing, SEO optimization, content distribution
**Evidence**: Content marketing listed as channel in 05_professional-sop.md

**Customization Example**:
```json
{
  "platform": "wordpress",
  "site_url": "https://blog.venture.com",
  "api_credentials": "STORED_IN_VAULT",
  "publishing": {
    "default_author": "Venture Team",
    "default_categories": ["Product Updates", "Industry Insights"],
    "seo_plugin": "yoast",
    "auto_publish": false  // Require manual approval
  },
  "distribution": {
    "auto_post_linkedin": true,
    "auto_post_twitter": true,
    "email_notification": true
  }
}
```

### Category 4: Workflow Parameters (Substage 17.3)

#### Parameter: Workflow Trigger Type
**Configuration Level**: Workflow-Specific
**Type**: Enumerated string
**Valid Values**: `['database_insert', 'webhook', 'schedule', 'conditional', 'manual']`
**Default**: `'database_insert'`
**Impact**: Workflow initiation logic, event listeners required
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:777 "Triggers defined"

**Customization Example**:
```json
{
  "trigger_type": "database_insert",
  "trigger_config": {
    "table": "leads",
    "conditions": {
      "lead_source": "website",
      "status": "new"
    },
    "rate_limit": "1_per_lead"
  }
}
```

#### Parameter: Email Delay (Drip Campaigns)
**Configuration Level**: Workflow-Specific
**Type**: Integer (hours)
**Valid Range**: `0-720 hours (0-30 days)`
**Default**: `48 hours` (2 days)
**Impact**: Campaign pacing, engagement timing
**Evidence**: Referenced in 05_professional-sop.md (workflow delays)

**Customization Example**:
```json
{
  "delay_strategy": "progressive",
  "delays_hours": [0, 24, 72, 168, 336],  // 0h, 1d, 3d, 7d, 14d
  "delay_adjustment": "business_days_only"  // Skip weekends
}
```

#### Parameter: Conditional Logic Rules
**Configuration Level**: Workflow-Specific
**Type**: Array of condition objects
**Valid Operators**: `['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in_list']`
**Default**: (none, optional)
**Impact**: Workflow branching, personalization
**Evidence**: Referenced in 05_professional-sop.md (conditional logic)

**Customization Example**:
```json
{
  "conditions": [
    {
      "field": "email_1_opened",
      "operator": "equals",
      "value": true,
      "if_true": "send_email_2a",
      "if_false": "send_email_2b"
    },
    {
      "field": "lead_score",
      "operator": "greater_than",
      "value": 80,
      "if_true": "notify_sales_team",
      "if_false": "continue_nurture"
    }
  ]
}
```

#### Parameter: Error Handling Strategy
**Configuration Level**: Workflow-Specific
**Type**: Enumerated string
**Valid Values**: `['retry_3x', 'retry_5x', 'fail_fast', 'fallback', 'manual_intervention']`
**Default**: `'retry_3x'`
**Impact**: Workflow resilience, failure recovery
**Evidence**: Addresses critique weakness "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:26)

**Customization Example**:
```json
{
  "error_handling": {
    "strategy": "retry_3x",
    "retry_delay_seconds": [30, 120, 600],  // 30s, 2min, 10min
    "fallback_action": "log_and_skip",
    "alert_threshold": 5  // Alert after 5 consecutive failures
  }
}
```

#### Parameter: Workflow Execution Priority
**Configuration Level**: Workflow-Specific
**Type**: Enumerated string
**Valid Values**: `['high', 'normal', 'low']`
**Default**: `'normal'`
**Impact**: Queue processing order, latency
**Evidence**: Referenced in 06_agent-orchestration.md (workflow orchestration)

**Customization Example**:
```json
{
  "priority": "high",
  "max_concurrent_executions": 100,
  "execution_timeout_seconds": 300
}
```

### Category 5: Metrics and Thresholds (Cross-Cutting)

#### Parameter: Campaign Effectiveness Threshold
**Configuration Level**: Venture-Global
**Type**: Decimal (0.0-1.0 or percentage)
**Valid Range**: `0.30-0.90` (30%-90%)
**Default**: `0.50` (50%)
**Impact**: Recursion trigger GTM-001, performance evaluation
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:749 "Campaign effectiveness"

**Customization Example**:
```json
{
  "effectiveness_threshold": 0.60,
  "measurement_formula": "0.4 * click_rate + 0.3 * engagement_rate + 0.3 * conversion_rate",
  "evaluation_period_days": 14
}
```

#### Parameter: Lead Generation Target
**Configuration Level**: Venture-Global
**Type**: Integer (leads per week)
**Valid Range**: `5-500 leads/week` (depends on venture scale)
**Default**: `10 leads/week` (B2B), `50 leads/week` (B2C)
**Impact**: Recursion trigger GTM-002, capacity planning
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:750 "Lead generation"

**Customization Example**:
```json
{
  "lead_target_weekly": 25,
  "lead_quality_minimum": 0.70,  // Lead score threshold
  "target_review_frequency": "weekly"
}
```

#### Parameter: Conversion Rate Target
**Configuration Level**: Venture-Global
**Type**: Decimal (percentage)
**Valid Range**: `0.01-0.10` (1%-10%)
**Default**: `0.02` (2% for B2B), `0.01` (1% for B2C)
**Impact**: Recursion trigger GTM-003, sales forecasting
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:751 "Conversion rates"

**Customization Example**:
```json
{
  "conversion_target": 0.03,
  "conversion_definition": "lead_to_paying_customer",
  "measurement_period_days": 30
}
```

#### Parameter: ROAS (Return on Ad Spend) Target
**Configuration Level**: Venture-Global
**Type**: Decimal (ratio)
**Valid Range**: `2.0-10.0`
**Default**: `3.0`
**Impact**: Recursion trigger GTM-004, budget allocation
**Evidence**: Referenced in 07_recursion-blueprint.md (GTM-004 trigger)

**Customization Example**:
```json
{
  "roas_target": 4.0,
  "measurement_period_days": 21,
  "calculation_method": "revenue / spend"
}
```

## Configuration Presets

To simplify setup, provide presets for common venture types:

### Preset 1: B2B SaaS (Enterprise)
```json
{
  "preset_name": "b2b_saas_enterprise",
  "target_segment": "B2B_Enterprise",
  "objectives": ["lead_generation", "conversion"],
  "total_budget_usd": 50000,
  "allocation_strategy": [60, 30, 10],
  "primary_channels": ["linkedin", "webinars", "content_marketing"],
  "brand_voice": "professional",
  "campaign_type": "email_drip",
  "sequence_length": 7,
  "lead_target_weekly": 20,
  "conversion_target": 0.03
}
```

### Preset 2: B2C E-Commerce
```json
{
  "preset_name": "b2c_ecommerce",
  "target_segment": "B2C_Mass",
  "objectives": ["awareness", "conversion", "retention"],
  "total_budget_usd": 100000,
  "allocation_strategy": [70, 20, 10],
  "primary_channels": ["facebook_ads", "instagram_ads", "email"],
  "brand_voice": "friendly",
  "campaign_type": "social_ads",
  "ab_test_variants": 3,
  "lead_target_weekly": 100,
  "conversion_target": 0.02
}
```

### Preset 3: B2B SMB (Freemium)
```json
{
  "preset_name": "b2b_smb_freemium",
  "target_segment": "B2B_SMB",
  "objectives": ["lead_generation", "conversion", "retention"],
  "total_budget_usd": 15000,
  "allocation_strategy": [70, 20, 10],
  "primary_channels": ["email", "content_marketing", "google_ads"],
  "brand_voice": "friendly",
  "campaign_type": "email_drip",
  "sequence_length": 5,
  "lead_target_weekly": 50,
  "conversion_target": 0.05
}
```

## Configuration Validation Rules

### Rule 1: Budget Allocation Sum
```python
def validate_budget_allocation(proven, growth, experimental):
    total = proven + growth + experimental
    assert total == 1.0, f"Budget allocation must sum to 100%, got {total * 100}%"
```

### Rule 2: Channel-Segment Compatibility
```python
def validate_channel_segment_compatibility(channels, segment):
    b2b_channels = {'linkedin', 'webinars', 'content_marketing'}
    b2c_channels = {'facebook_ads', 'instagram_ads', 'twitter_ads'}

    if 'B2B' in segment:
        invalid_channels = set(channels) - b2b_channels - {'email', 'google_ads'}
        assert not invalid_channels, f"Invalid B2B channels: {invalid_channels}"
    elif 'B2C' in segment:
        invalid_channels = set(channels) - b2c_channels - {'email', 'google_ads'}
        assert not invalid_channels, f"Invalid B2C channels: {invalid_channels}"
```

### Rule 3: Campaign Type-Channel Compatibility
```python
def validate_campaign_channel_compatibility(campaign_type, channels):
    campaign_channel_map = {
        'email_drip': ['email'],
        'social_ads': ['facebook_ads', 'instagram_ads', 'linkedin', 'twitter_ads'],
        'webinar_funnel': ['email', 'linkedin', 'content_marketing']
    }

    required_channels = campaign_channel_map.get(campaign_type, [])
    available_channels = set(channels)

    assert any(ch in available_channels for ch in required_channels), \
        f"Campaign type '{campaign_type}' requires at least one of {required_channels}"
```

### Rule 4: Threshold Logical Consistency
```python
def validate_thresholds(effectiveness_threshold, conversion_target, roas_target):
    assert 0.3 <= effectiveness_threshold <= 0.9, "Effectiveness threshold must be 30-90%"
    assert 0.01 <= conversion_target <= 0.10, "Conversion target must be 1-10%"
    assert 2.0 <= roas_target <= 10.0, "ROAS target must be 2.0-10.0"
```

## Configuration Storage Schema

```sql
CREATE TABLE gtm_configs (
  config_id UUID PRIMARY KEY,
  venture_id VARCHAR(50) UNIQUE,
  config_json JSONB NOT NULL,
  preset_used VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INT DEFAULT 1
);

CREATE TABLE gtm_config_versions (
  version_id UUID PRIMARY KEY,
  config_id UUID REFERENCES gtm_configs(config_id),
  config_json JSONB NOT NULL,
  version_number INT,
  created_at TIMESTAMP DEFAULT NOW(),
  change_reason TEXT
);
```

## Configuration UI Requirements

**Dashboard Section**: "GTM Configuration"
**Access Control**: LEAD agent only (edit), PLAN/EXEC (read-only)

**UI Components**:
1. **Preset Selector**: Dropdown with B2B SaaS, B2C E-Commerce, B2B SMB options
2. **Parameter Editor**: Form with validation (client-side and server-side)
3. **Configuration Preview**: JSON viewer showing final config
4. **Validation Status**: Real-time feedback on invalid combinations
5. **Version History**: List of past configurations with rollback capability

**Evidence**: Configuration UI enables non-technical operators to customize Stage 17 per venture.

---

**Implementation Priority**: HIGH (required for multi-venture deployment)
**Estimated Implementation Time**: 2 sprints (4 weeks)
**Cross-Reference**: 05_professional-sop.md (configuration procedures), 06_agent-orchestration.md (agent inputs)

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
