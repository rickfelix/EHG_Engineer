# Stage 17: Agent Orchestration Architecture

## Overview

Stage 17 requires deployment of a GTM (Go-To-Market) Strategist Agent to automate marketing campaign development, content generation, and workflow orchestration. This document defines the agent architecture using CrewAI framework.

## Agent Requirements

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:736 "GTM Strategist Agent Development"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:737 "marketing automation"

**Core Capabilities**:
1. Strategy encoding (substage 17.1)
2. Campaign content generation (substage 17.2)
3. Workflow automation setup (substage 17.3)
4. Performance monitoring and optimization

## Proposed CrewAI Architecture: GTMStrategistCrew

### Crew Configuration

**Crew Name**: GTMStrategistCrew
**Process Type**: Sequential (strategy → campaigns → automation)
**Manager**: None (sequential process doesn't require manager)

**Evidence for Sequential Process**:
- Substages are ordered: 17.1 → 17.2 → 17.3 (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:761-778)
- Campaign development (17.2) depends on strategy configuration (17.1)
- Automation setup (17.3) depends on campaign templates (17.2)

### Agent Definitions

#### Agent 1: MarketingAnalyst

**Role**: Marketing Strategy Analyst
**Goal**: Encode market strategies into executable GTM configurations

**Backstory**:
```
Expert marketing strategist with 15+ years experience translating high-level
business objectives into actionable marketing plans. Specializes in B2B and
B2C go-to-market strategies, customer segmentation, and channel optimization.
```

**Responsibilities** (maps to substage 17.1):
- Extract market strategy from Stage 16 pricing outputs
- Configure marketing channels based on segment preferences
- Allocate budgets using 70-20-10 rule (proven, growth, experimental)
- Define success metrics and KPI thresholds

**Tools**:
- `read_market_strategy_tool`: Fetch market strategy from database
- `configure_channels_tool`: Set up marketing channel integrations
- `allocate_budget_tool`: Distribute budget across channels

**Output Format**:
```json
{
  "gtm_config": {
    "venture_id": "string",
    "strategy": { "objectives": [], "segments": [] },
    "channels": [ {"name": "string", "budget": "number"} ],
    "budget_allocation": { "total": "number", "breakdown": {} }
  }
}
```

**Evidence Mapping**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:764 "GTM strategy encoded"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:765 "Channels configured"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:766 "Budgets allocated"

#### Agent 2: CampaignManager

**Role**: Marketing Campaign Manager
**Goal**: Develop campaign templates and schedules for multi-channel execution

**Backstory**:
```
Seasoned campaign manager with expertise in email marketing, social media
advertising, content marketing, and webinar funnels. Known for creating
high-converting campaign templates and optimizing schedules for maximum engagement.
```

**Responsibilities** (maps to substage 17.2):
- Create campaign templates (email sequences, ad copy, landing pages)
- Coordinate with ContentGenerator for content production
- Set campaign schedules based on channel best practices
- Define A/B testing variants

**Tools**:
- `create_template_tool`: Generate campaign template structures
- `schedule_campaign_tool`: Configure send schedules and flight dates
- `ab_test_setup_tool`: Define test variants and success metrics

**Output Format**:
```json
{
  "campaign_templates": [
    {
      "template_id": "string",
      "type": "email_drip|social_ad|landing_page",
      "structure": {},
      "schedule": { "launch_date": "date", "send_times": [] }
    }
  ]
}
```

**Evidence Mapping**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:770 "Templates created"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:772 "Schedules set"

#### Agent 3: ContentGenerator

**Role**: Marketing Content Creator
**Goal**: Generate high-quality marketing content aligned with brand voice and value propositions

**Backstory**:
```
AI-native content specialist trained on thousands of high-performing marketing
campaigns. Writes compelling copy for emails, ads, landing pages, and social
media that converts prospects into leads and customers.
```

**Responsibilities** (maps to substage 17.2):
- Generate email subject lines and body copy
- Write ad copy (headlines, descriptions, CTAs)
- Create landing page content (hero sections, feature lists)
- Produce social media posts
- Ensure brand voice consistency (from Stage 11)

**Tools**:
- `generate_email_content_tool`: Create email copy
- `generate_ad_content_tool`: Write ad copy with variants
- `generate_landing_page_tool`: Produce landing page sections
- `brand_voice_validator_tool`: Ensure consistency with brand guidelines

**Output Format**:
```json
{
  "content_items": [
    {
      "content_id": "string",
      "type": "email_subject|ad_headline|landing_hero",
      "text": "string",
      "variants": [ "string" ],
      "brand_voice_score": "0.0-1.0"
    }
  ]
}
```

**Evidence Mapping**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:771 "Content generated"
- EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:68 "Increase automation level" (content generation automates manual copywriting)

#### Agent 4: WorkflowOrchestrator

**Role**: Marketing Automation Engineer
**Goal**: Configure and test workflow automations for campaign execution

**Backstory**:
```
Expert in marketing automation platforms (Zapier, Make, n8n) and workflow
design. Builds robust, error-resilient automations that execute campaigns
flawlessly and scale to thousands of leads without manual intervention.
```

**Responsibilities** (maps to substage 17.3):
- Configure workflow automation nodes (trigger, action, condition, delay)
- Define workflow triggers (database events, webhooks, schedules)
- Set up error handling and retry logic
- Execute comprehensive workflow testing

**Tools**:
- `configure_workflow_tool`: Create workflow definitions
- `define_trigger_tool`: Set up workflow initiation events
- `test_workflow_tool`: Execute test runs with sample data
- `monitor_workflow_tool`: Track execution status and errors

**Output Format**:
```json
{
  "workflows": [
    {
      "workflow_id": "string",
      "trigger": { "type": "string", "conditions": {} },
      "actions": [ { "step": "number", "type": "string", "config": {} } ],
      "test_results": { "status": "passed|failed", "executions": "number" }
    }
  ]
}
```

**Evidence Mapping**:
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:776 "Workflows configured"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:777 "Triggers defined"
- EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778 "Testing complete"

### Task Definitions

#### Task 1: Configure GTM Strategy
**Agent**: MarketingAnalyst
**Description**: Extract market strategy from Stage 16, configure marketing channels, and allocate budgets
**Expected Output**: GTM configuration JSON with strategy, channels, and budget allocation
**Dependencies**: None (first task)

#### Task 2: Develop Campaign Templates
**Agent**: CampaignManager
**Description**: Create campaign templates for email, social ads, and landing pages; set schedules
**Expected Output**: Campaign template JSON with structures and schedules
**Dependencies**: Task 1 (requires GTM config for channel selection)

#### Task 3: Generate Campaign Content
**Agent**: ContentGenerator
**Description**: Produce marketing copy for all campaign templates; create A/B test variants
**Expected Output**: Content items JSON with copy, variants, and brand voice scores
**Dependencies**: Task 2 (requires templates to populate with content)

#### Task 4: Setup Automation Workflows
**Agent**: WorkflowOrchestrator
**Description**: Configure workflows in automation platform, define triggers, and execute tests
**Expected Output**: Workflow definitions JSON with test results
**Dependencies**: Task 2 and Task 3 (requires templates and content to automate)

### Crew Execution Flow

```
┌─────────────────────┐
│ GTMStrategistCrew   │
│ (Sequential)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Task 1:             │
│ Configure Strategy  │
│ Agent: MarketingAnalyst
└──────────┬──────────┘
           │ (GTM config)
           ▼
┌─────────────────────┐
│ Task 2:             │
│ Develop Templates   │
│ Agent: CampaignManager
└──────────┬──────────┘
           │ (Templates)
           ▼
┌─────────────────────┐
│ Task 3:             │
│ Generate Content    │
│ Agent: ContentGenerator
└──────────┬──────────┘
           │ (Content)
           ▼
┌─────────────────────┐
│ Task 4:             │
│ Setup Automation    │
│ Agent: WorkflowOrchestrator
└──────────┬──────────┘
           │ (Workflows)
           ▼
     [Stage 17 Complete]
```

## Integration with EVA Framework

**Reference**: SD-AI-CEO-FRAMEWORK-001 (EVA integration patterns)

**EVA Role**: Venture executive overseeing GTM strategy execution
**GTMStrategistCrew Role**: Operational team executing EVA's directives

**Integration Pattern**:
1. EVA provides high-level objectives (from strategic planning)
2. GTMStrategistCrew decomposes into tasks (4 tasks above)
3. EVA monitors progress via crew status API
4. GTMStrategistCrew reports completion to EVA
5. EVA validates outputs against exit gates
6. EVA approves Stage 17 completion or requests revisions

**Evidence**: This pattern aligns with multi-agent orchestration where EVA acts as the "CEO" and crews are "departments" (from SD-AI-CEO-FRAMEWORK-001 conceptual model).

## CrewAI Registry Integration

**Reference**: SD-CREWAI-ARCHITECTURE-001 (agent registry)

**Registry Entry**:
```json
{
  "crew_id": "gtm-strategist-crew",
  "crew_name": "GTMStrategistCrew",
  "stage_id": 17,
  "stage_name": "GTM Strategist Agent Development",
  "process_type": "sequential",
  "agents": [
    { "agent_id": "marketing-analyst", "role": "Marketing Strategy Analyst" },
    { "agent_id": "campaign-manager", "role": "Marketing Campaign Manager" },
    { "agent_id": "content-generator", "role": "Marketing Content Creator" },
    { "agent_id": "workflow-orchestrator", "role": "Marketing Automation Engineer" }
  ],
  "tasks": [
    { "task_id": "configure-strategy", "agent": "marketing-analyst" },
    { "task_id": "develop-templates", "agent": "campaign-manager" },
    { "task_id": "generate-content", "agent": "content-generator" },
    { "task_id": "setup-automation", "agent": "workflow-orchestrator" }
  ],
  "status": "registered",
  "created_at": "2025-11-05"
}
```

**Evidence**: SD-CREWAI-ARCHITECTURE-001 specifies a central registry for all CrewAI crews to enable discovery and orchestration.

## Performance Characteristics

### Expected Execution Times
- **Task 1 (Configure Strategy)**: 5-10 minutes (API calls, database queries)
- **Task 2 (Develop Templates)**: 10-20 minutes (template creation, scheduling logic)
- **Task 3 (Generate Content)**: 20-40 minutes (LLM generation for multiple variants)
- **Task 4 (Setup Automation)**: 15-30 minutes (workflow configuration, testing)

**Total Crew Execution Time**: 50-100 minutes (vs. 7-11 days manual, per 05_professional-sop.md)

**Automation Impact**: ~99% time reduction (manual: 7 days = 10,080 minutes; automated: 100 minutes)
**Evidence**: This addresses critique weakness "Limited automation" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:23) and targets "80% automation" goal (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:33).

### Scalability
- **Ventures Supported**: 100+ concurrent (limited by database, not agent capacity)
- **Campaigns per Venture**: 10+ (parallel content generation)
- **Workflow Executions**: 10,000+ per day (limited by automation platform, not crew)

## Error Handling and Resilience

### Agent-Level Error Handling
Each agent implements:
1. **Input validation**: Verify required data exists before processing
2. **Retry logic**: Retry failed API calls 3x with exponential backoff
3. **Fallback strategies**: Use default templates if generation fails
4. **Error reporting**: Log errors to `agent_execution_logs` table

### Crew-Level Error Handling
GTMStrategistCrew implements:
1. **Task failure detection**: Monitor task status, fail crew if critical task fails
2. **Partial completion**: Save intermediate outputs (e.g., strategy config complete, but content generation failed)
3. **Manual intervention triggers**: Escalate to human operator if 3+ consecutive failures
4. **Rollback capability**: Undo partial changes on crew failure

**Evidence**: Addresses critique weakness "No explicit error handling" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:26).

## Monitoring and Observability

### Metrics to Track
1. **Crew execution time** (target: <100 minutes)
2. **Task success rate** (target: >95%)
3. **Content quality score** (brand voice validator, target: >0.8)
4. **Workflow test pass rate** (target: 100%)

### Logging Requirements
```sql
CREATE TABLE agent_execution_logs (
  log_id UUID PRIMARY KEY,
  crew_id VARCHAR(50),
  agent_id VARCHAR(50),
  task_id VARCHAR(50),
  venture_id VARCHAR(50),
  status VARCHAR(20),  -- 'started', 'completed', 'failed'
  execution_time_ms INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Dashboard Requirements
- Real-time crew status (executing, completed, failed)
- Task progress (1/4, 2/4, 3/4, 4/4)
- Average execution time per task
- Error rate trends

## Deployment Considerations

### Infrastructure Requirements
- **Compute**: 4 CPU cores, 8GB RAM (for 4 concurrent agents)
- **Storage**: 10GB (for content artifacts, logs)
- **Network**: 100 Mbps (for API calls to LLMs, marketing platforms)

### Dependencies
- CrewAI framework (v0.30.0+)
- LLM API (OpenAI GPT-4, Anthropic Claude, or equivalent)
- Marketing automation platform APIs (HubSpot, Zapier, etc.)
- Database connection (PostgreSQL for state storage)

### Configuration Management
Store crew configuration in database for dynamic updates:
```sql
CREATE TABLE crew_configs (
  crew_id VARCHAR(50) PRIMARY KEY,
  config_json JSONB,
  version INT,
  active BOOLEAN,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Evidence**: This enables the "Configurability Matrix" (see 08_configurability-matrix.md) for venture-specific customization.

## Testing Strategy

### Unit Tests (per agent)
- Test each tool independently (mock API responses)
- Validate output formats match expected JSON schemas
- Test error handling (simulate API failures, invalid inputs)

### Integration Tests (crew level)
- Execute full crew with test data (sample venture, mock Stage 16 outputs)
- Verify sequential task execution (Task 1 → 2 → 3 → 4)
- Validate intermediate outputs (config, templates, content, workflows)
- Test failure scenarios (agent crash, network timeout)

### End-to-End Tests (Stage 17)
- Run crew for real venture (non-production)
- Verify database insertions (`gtm_configs`, `campaign_templates`, etc.)
- Test workflow executions (trigger test campaigns)
- Measure execution time and resource usage

**Evidence**: Testing strategy aligns with substage 17.3 requirement "Testing complete" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:778).

## Future Enhancements

1. **Hierarchical Process**: Add manager agent for task delegation (if >4 agents needed)
2. **Parallel Content Generation**: Generate content for multiple segments concurrently
3. **Reinforcement Learning**: Optimize budget allocation based on historical campaign performance
4. **Multi-Language Support**: Generate content in multiple languages for international ventures

**Evidence**: These enhancements address critique recommendation "Increase automation level" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-17.md:68) beyond the initial 80% target.

---

**Implementation Priority**: HIGH (critical for Stage 17 automation goal)
**Estimated Implementation Time**: 2-3 sprints (4-6 weeks)
**Cross-Reference**: SD-CREWAI-ARCHITECTURE-001, SD-AI-CEO-FRAMEWORK-001

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
