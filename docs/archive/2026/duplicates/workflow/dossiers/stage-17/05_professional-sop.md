<!-- ARCHIVED: 2026-01-26T16:26:43.235Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-17\05_professional-sop.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 17: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, schema

## Purpose

This SOP provides step-by-step execution guidance for Stage 17 (GTM Strategist Agent Development), ensuring consistent implementation across all ventures and operators.

## Entry Conditions (Gates)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:753-755 "entry gates"

Before beginning Stage 17, verify the following conditions are met:

### Gate 1: Market Strategy Defined
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:754 "Market strategy defined"

**Validation Checklist**:
- [ ] Market strategy document exists (from Stage 16 or earlier)
- [ ] Target market segments identified with demographic/firmographic data
- [ ] Competitive positioning documented
- [ ] Value proposition articulated for each segment
- [ ] Pricing strategy aligned (from Stage 16)

**Validation Query**:
```sql
SELECT venture_id, strategy_status, last_updated
FROM market_strategies
WHERE venture_id = $VENTURE_ID
  AND strategy_status = 'approved'
  AND value_proposition IS NOT NULL;
```

**Failure Action**: If gate not met, escalate to LEAD agent for Stage 16 review.

### Gate 2: Segments Identified
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:755 "Segments identified"

**Validation Checklist**:
- [ ] Customer segments defined (minimum 1, recommended 2-4)
- [ ] Segment characteristics documented (size, growth, accessibility)
- [ ] Segment priorities ranked
- [ ] Channel preferences identified per segment

**Validation Query**:
```sql
SELECT segment_id, segment_name, priority_rank
FROM customer_segments
WHERE venture_id = $VENTURE_ID
  AND status = 'validated'
ORDER BY priority_rank;
```

**Failure Action**: If gate not met, recurse to Stage 11 (Naming/Branding) for segment refinement.

## Substage Execution Procedures

### Substage 17.1: Strategy Configuration

**Duration**: 2-3 days
**Owner**: LEAD agent
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:761-766 "Strategy Configuration substage"

#### Step 1.1: Encode GTM Strategy
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:764 "GTM strategy encoded"

**Procedure**:
1. Extract market strategy from Stage 16 outputs
2. Translate strategy into GTM agent configuration format (JSON)
3. Define campaign objectives (awareness, consideration, conversion)
4. Set success criteria for each objective
5. Document strategy in `gtm_configs` database table

**Configuration Template**:
```json
{
  "venture_id": "VENTURE-XXX",
  "gtm_strategy": {
    "objectives": ["awareness", "lead_generation", "conversion"],
    "target_segments": ["segment-1", "segment-2"],
    "value_propositions": {
      "segment-1": "Value prop text",
      "segment-2": "Value prop text"
    },
    "competitive_positioning": "Differentiation statement"
  }
}
```

**Validation**:
- [ ] Strategy JSON validates against schema
- [ ] All target segments have value propositions
- [ ] Objectives align with venture goals

#### Step 1.2: Configure Marketing Channels
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:765 "Channels configured"

**Procedure**:
1. Select marketing channels based on segment preferences
   - B2B: LinkedIn, email, webinars, content marketing
   - B2C: Facebook, Instagram, Google Ads, influencer partnerships
2. Configure channel integration APIs (if available)
3. Define channel-specific campaign parameters
4. Set up tracking pixels and attribution mechanisms

**Channel Configuration Checklist**:
- [ ] Primary channel selected (highest segment overlap)
- [ ] Secondary channels selected (2-3 recommended)
- [ ] API credentials stored securely (if applicable)
- [ ] UTM parameter schema defined
- [ ] Attribution model selected (first-touch, last-touch, multi-touch)

**Tool Integration**:
- Marketing automation platform: HubSpot, Marketo, or equivalent
- Analytics: Google Analytics 4 or Segment
- Ad platforms: Google Ads, Meta Ads Manager, LinkedIn Campaign Manager

#### Step 1.3: Allocate Budgets
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:766 "Budgets allocated"

**Procedure**:
1. Define total marketing budget (from financial model, Stage 15)
2. Allocate budget across channels using 70-20-10 rule:
   - 70% to proven channels
   - 20% to growth channels
   - 10% to experimental channels
3. Set budget pacing (daily, weekly, monthly)
4. Define reallocation triggers (performance-based)

**Budget Allocation Template**:
```yaml
total_budget: $50000
allocation:
  primary_channel: $35000  # 70%
  secondary_channels: $10000  # 20%
  experimental: $5000  # 10%
pacing: monthly
reallocation_triggers:
  - condition: "CAC > $100"
    action: "reduce spend by 20%"
  - condition: "ROAS < 2.0"
    action: "pause and review"
```

**Validation**:
- [ ] Budget totals match financial model
- [ ] Allocation percentages sum to 100%
- [ ] Reallocation triggers defined

**Substage 17.1 Exit Criteria**:
- [ ] All 3 done_when conditions met (strategy encoded, channels configured, budgets allocated)
- [ ] GTM configuration stored in database
- [ ] LEAD agent approval obtained

---

### Substage 17.2: Campaign Development

**Duration**: 3-5 days
**Owner**: PLAN agent (with CrewAI ContentGenerator support)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:767-772 "Campaign Development substage"

#### Step 2.1: Create Campaign Templates
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:770 "Templates created"

**Procedure**:
1. Define campaign types (email drip, social ads, content series, webinar funnel)
2. Create template structure for each type
3. Define variable placeholders (segment name, value prop, CTA)
4. Store templates in `campaign_templates` table

**Template Structure Example**:
```json
{
  "template_id": "email-drip-v1",
  "type": "email_sequence",
  "steps": [
    {
      "step": 1,
      "subject": "{{value_prop_headline}}",
      "body": "Hi {{first_name}}, {{intro_paragraph}}",
      "delay_hours": 0
    },
    {
      "step": 2,
      "subject": "{{use_case_headline}}",
      "body": "{{use_case_content}}",
      "delay_hours": 48
    }
  ]
}
```

**Deliverables**:
- [ ] Email sequence template (3-5 emails)
- [ ] Social ad template (image + copy variants)
- [ ] Landing page template (hero, features, CTA)
- [ ] Webinar funnel template (registration, reminder, follow-up)

#### Step 2.2: Generate Campaign Content
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:771 "Content generated"

**Procedure**:
1. Invoke CrewAI ContentGenerator agent for each template
2. Provide context: segment profile, value proposition, brand voice
3. Generate content variants (A/B testing)
4. Review and approve content (LEAD agent approval required)
5. Store approved content in `campaign_content` table

**Content Generation Prompt Template**:
```
Context:
- Venture: {{venture_name}}
- Segment: {{segment_name}}
- Value Prop: {{value_proposition}}
- Brand Voice: {{brand_voice}}
- Campaign Type: {{campaign_type}}

Generate:
- {{content_type}} (e.g., email subject line)
- Tone: {{tone}} (e.g., professional, friendly, urgent)
- Length: {{length}} (e.g., 50 characters, 200 words)
- CTA: {{cta_type}} (e.g., "Book a Demo", "Learn More")
```

**Quality Checklist**:
- [ ] Content aligns with brand voice (from Stage 11)
- [ ] Value proposition clearly communicated
- [ ] CTA specific and measurable
- [ ] Grammar and spelling validated
- [ ] A/B variants created (minimum 2 per element)

#### Step 2.3: Set Campaign Schedules
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:772 "Schedules set"

**Procedure**:
1. Define campaign launch dates (align with venture milestones)
2. Set email send schedules (avoid weekends for B2B, optimize for B2C)
3. Configure ad flight dates and dayparting
4. Plan content calendar (blog posts, social media, webinars)
5. Store schedules in `campaign_schedules` table

**Scheduling Best Practices**:
- **Email (B2B)**: Tuesday-Thursday, 10am-2pm recipient timezone
- **Email (B2C)**: Saturday-Sunday, 8am-10am or 7pm-9pm
- **Social Ads**: Run continuously with bid adjustments by time of day
- **Content Publishing**: Monday/Wednesday for blog posts, daily for social

**Deliverables**:
- [ ] Campaign launch calendar (4-week minimum)
- [ ] Email send schedule (time-optimized)
- [ ] Ad flight schedule (budget paced)
- [ ] Content publishing calendar

**Substage 17.2 Exit Criteria**:
- [ ] All 3 done_when conditions met (templates created, content generated, schedules set)
- [ ] Minimum 1 complete campaign ready to launch
- [ ] PLAN agent approval obtained

---

### Substage 17.3: Automation Setup

**Duration**: 2-3 days
**Owner**: EXEC agent (with CrewAI WorkflowOrchestrator support)
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:773-778 "Automation Setup substage"

#### Step 3.1: Configure Workflows
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:776 "Workflows configured"

**Procedure**:
1. Map campaign steps to workflow automation platform (Zapier, Make, n8n)
2. Configure workflow nodes (trigger, action, condition, delay)
3. Connect to marketing tools (email platform, CRM, analytics)
4. Set up error handling and retry logic
5. Document workflow in `automation_workflows` table

**Workflow Example** (Email Drip Campaign):
```yaml
workflow_id: email-drip-onboarding
trigger:
  type: database_insert
  table: leads
  condition: lead_source = 'website_signup'
actions:
  - step: 1
    type: send_email
    template: email-drip-v1-step1
    delay: 0h
  - step: 2
    type: wait
    duration: 48h
  - step: 3
    type: conditional
    condition: email_1_opened = true
    if_true: send_email_2a
    if_false: send_email_2b
```

**Workflow Checklist**:
- [ ] Trigger conditions validated (no false positives)
- [ ] All action steps have success/failure paths
- [ ] Delays and pacing configured
- [ ] API credentials tested
- [ ] Workflow documented with diagram

#### Step 3.2: Define Triggers
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:777 "Triggers defined"

**Procedure**:
1. Identify workflow initiation events (lead signup, demo request, purchase)
2. Define trigger conditions (database insert, webhook, schedule)
3. Set up event listeners (database triggers, API webhooks)
4. Configure trigger filtering (avoid duplicate executions)
5. Document triggers in `workflow_triggers` table

**Common Trigger Types**:
- **Database Trigger**: New row in `leads` table → start nurture campaign
- **Webhook Trigger**: Form submission → send welcome email
- **Scheduled Trigger**: Every Monday 9am → send weekly newsletter
- **Conditional Trigger**: Lead score > 80 → notify sales team

**Trigger Configuration Template**:
```json
{
  "trigger_id": "lead-signup-trigger",
  "type": "database_insert",
  "source_table": "leads",
  "conditions": {
    "lead_source": "website",
    "status": "new"
  },
  "workflow_id": "email-drip-onboarding",
  "rate_limit": "1 per lead"
}
```

**Validation**:
- [ ] Each workflow has at least one trigger
- [ ] Triggers have rate limiting (prevent spam)
- [ ] Conditions exclude test/duplicate data

#### Step 3.3: Complete Testing
**Done When**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778 "Testing complete"

**Procedure**:
1. Execute workflow tests with sample data (minimum 5 test leads)
2. Verify trigger activation (create test database records)
3. Validate email delivery (check spam folders, rendering)
4. Test error handling (intentionally trigger failures)
5. Measure workflow execution time (ensure <30s latency)
6. Document test results in `automation_test_results` table

**Testing Checklist**:
| Test Case | Expected Result | Status | Evidence |
|-----------|----------------|--------|----------|
| Trigger fires on lead signup | Workflow starts within 60s | [ ] | Log entry in `workflow_executions` |
| Email 1 sends correctly | Delivered to inbox, not spam | [ ] | Test email received |
| 48h delay works | Email 2 sent exactly 48h later | [ ] | Timestamp comparison |
| Conditional logic (opened) | Email 2a sent if opened | [ ] | Workflow path trace |
| Conditional logic (not opened) | Email 2b sent if not opened | [ ] | Workflow path trace |
| Error handling | Failed API call retries 3x | [ ] | Error log entry |

**Test Data Cleanup**:
- [ ] Remove test leads from production database
- [ ] Clear test emails from platform
- [ ] Reset workflow execution counts

**Substage 17.3 Exit Criteria**:
- [ ] All 3 done_when conditions met (workflows configured, triggers defined, testing complete)
- [ ] Minimum 1 workflow passing all tests
- [ ] EXEC agent approval obtained

---

## Exit Conditions (Gates)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:756-759 "exit gates"

Before completing Stage 17, verify the following conditions are met:

### Gate 1: GTM Agent Deployed
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:757 "GTM agent deployed"

**Validation**:
- [ ] CrewAI GTMStrategistCrew operational (see 06_agent-orchestration.md)
- [ ] Agent responds to test commands within 5s
- [ ] Agent configuration stored in database
- [ ] Agent logging functional

**Validation Test**:
```bash
# Test GTM agent responsiveness
curl -X POST https://api.venture.com/agents/gtm-strategist \
  -H "Content-Type: application/json" \
  -d '{"command": "status", "venture_id": "VENTURE-XXX"}'

# Expected response (within 5s):
# {"status": "operational", "last_updated": "2025-11-05T10:30:00Z"}
```

### Gate 2: Campaigns Configured
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:758 "Campaigns configured"

**Validation**:
- [ ] Minimum 1 campaign in database with status = 'configured'
- [ ] Campaign has content, schedule, and budget allocated
- [ ] Campaign linked to at least 1 marketing channel

**Validation Query**:
```sql
SELECT campaign_id, campaign_name, status, channel_count
FROM campaigns c
JOIN campaign_channels cc ON c.campaign_id = cc.campaign_id
WHERE c.venture_id = $VENTURE_ID
  AND c.status = 'configured'
  AND cc.channel_count >= 1;
```

### Gate 3: Workflows Active
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:759 "Workflows active"

**Validation**:
- [ ] Minimum 1 workflow with status = 'active'
- [ ] Workflow has executed successfully at least once (test execution)
- [ ] Triggers are enabled and monitoring

**Validation Query**:
```sql
SELECT workflow_id, status, test_execution_count
FROM automation_workflows
WHERE venture_id = $VENTURE_ID
  AND status = 'active'
  AND test_execution_count >= 1;
```

**Final Approval**:
- [ ] All 3 exit gates validated
- [ ] LEAD agent final approval obtained
- [ ] Stage 17 marked as 'completed' in workflow tracking

---

## Handoff to Stage 18

**Deliverables Package**:
1. GTM agent configuration file (JSON)
2. Campaign templates (database export or JSON)
3. Automation workflows documentation
4. Test results report
5. Marketing channel access credentials (secure vault)

**Handoff Checklist**:
- [ ] Stage 18 team briefed on GTM outputs
- [ ] Sales team has access to lead scoring workflows
- [ ] Campaign performance dashboard URL shared
- [ ] GTM agent API documentation provided

**Evidence**: Document handoff in unified handoff system (reference: docs/reference/unified-handoff-system.md)

---

## Rollback Procedures

**Trigger Conditions** (from critique recommendation):
1. Campaign effectiveness <50% of target
2. Lead generation <10 leads/week for 2 consecutive weeks
3. Conversion rate <1% for 30 days
4. Critical workflow failure (>5 consecutive errors)

**Rollback Steps**:
1. Pause all active workflows (set status = 'paused')
2. Stop campaign spend (ad platforms, email sends)
3. Document failure reason in `stage_rollbacks` table
4. Escalate to LEAD agent for root cause analysis
5. Decide: fix and retry, or recurse to earlier stage (5, 11, 15)

**Rollback Query**:
```sql
UPDATE automation_workflows
SET status = 'paused', paused_at = NOW(), paused_reason = $REASON
WHERE venture_id = $VENTURE_ID AND status = 'active';
```

---

## Common Issues and Resolutions

| Issue | Cause | Resolution | Evidence Source |
|-------|-------|------------|-----------------|
| Workflow not triggering | Database trigger misconfigured | Verify trigger SQL syntax, check permissions | Critique Weakness #4 |
| Email delivery failure | SPF/DKIM not set up | Configure DNS records for sender domain | Industry best practice |
| Low campaign effectiveness | Wrong target segment | Re-run Stage 11 segmentation | Critique Recommendation #4 |
| Budget overspend | No pacing limits | Implement daily budget caps in ad platforms | Critique Weakness #2 |

---

## Tools and Resources

**Required Tools**:
- Marketing automation: HubSpot, Marketo, ActiveCampaign
- Workflow automation: Zapier, Make (formerly Integromat), n8n
- Analytics: Google Analytics 4, Segment, Mixpanel
- CrewAI: GTMStrategistCrew (see 06_agent-orchestration.md)

**Optional Tools**:
- A/B testing: Optimizely, VWO
- Heatmaps: Hotjar, Crazy Egg
- Attribution: Bizible, Dreamdata

**Documentation References**:
- SD-CREWAI-ARCHITECTURE-001: Agent registry and crew patterns
- SD-RECURSION-ENGINE-001: Recursive trigger automation
- SD-DATA-SCHEMAS-001: Campaign data schemas
- docs/reference/unified-handoff-system.md: Stage handoff protocols

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
