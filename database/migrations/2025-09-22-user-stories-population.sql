-- User Stories Population for Critical Strategic Directives
-- Phase 1: SD-2025-09-17-production-pilot-user-story-system (Meta - Story System Itself)
-- Phase 2: 5 Vision/WSJF SDs
-- Phase 3: RabbitMQ Message Bus SD

-- Helper function to generate story keys
DO $$
BEGIN
  -- Clean up any test/orphan stories for our SDs first
  DELETE FROM sd_backlog_map
  WHERE sd_id IN (
    'SD-2025-09-17-production-pilot-user-story-system',
    'SD-GOVERNANCE-001',
    'SD-VISION-001',
    'SD-WSJF-001',
    'SD-PIPELINE-001',
    'SD-MONITORING-001',
    'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando'
  ) AND item_type = 'story';
END $$;

-- ============================================================================
-- PHASE 1: User Story System SD (META - HIGHEST PRIORITY)
-- ============================================================================

INSERT INTO sd_backlog_map (
  sd_id, backlog_id, backlog_title, item_description,
  priority, item_type, sequence_no, story_key, story_title,
  story_description, acceptance_criteria, verification_status
) VALUES
-- Story 1: Generate stories from PRD acceptance criteria
(
  'SD-2025-09-17-production-pilot-user-story-system',
  gen_random_uuid()::text,
  'Story Generation Engine',
  'Implement automated story generation from PRD acceptance criteria',
  'high', 'story', 1,
  'SD-PILOT-001:US-001',
  'Generate User Stories from PRD Acceptance Criteria',
  'As a system, I need to automatically generate user stories from PRD acceptance criteria so that work can be tracked granularly',
  '["Parse PRD acceptance_criteria JSON arrays", "Generate one story per acceptance criterion", "Assign unique story_key with SD prefix", "Set appropriate priority based on PRD priority"]'::jsonb,
  'not_run'
),
-- Story 2: Track story verification via CI webhooks
(
  'SD-2025-09-17-production-pilot-user-story-system',
  gen_random_uuid()::text,
  'CI/CD Verification Integration',
  'Integrate with CI/CD webhooks to track story verification status',
  'high', 'story', 2,
  'SD-PILOT-001:US-002',
  'Track Story Verification via CI Webhooks',
  'As a developer, I need stories to update their verification status from CI/CD runs so that progress is automatically tracked',
  '["Receive webhook payloads from GitHub Actions", "Parse test results and map to story_key", "Update verification_status and last_verified_at", "Calculate coverage_pct from test results"]'::jsonb,
  'not_run'
),
-- Story 3: Calculate release readiness
(
  'SD-2025-09-17-production-pilot-user-story-system',
  gen_random_uuid()::text,
  'Release Readiness Calculator',
  'Calculate and display release readiness percentage',
  'high', 'story', 3,
  'SD-PILOT-001:US-003',
  'Calculate Release Readiness Percentage',
  'As a release manager, I need to see overall readiness percentage so that I know when features are ready to deploy',
  '["Count stories with passing verification_status", "Calculate percentage of total stories", "Display in ReleaseGateWidget", "Block releases below 80% threshold"]'::jsonb,
  'not_run'
),
-- Story 4: Display metrics on dashboard
(
  'SD-2025-09-17-production-pilot-user-story-system',
  gen_random_uuid()::text,
  'Story Metrics Dashboard',
  'Display story verification metrics on LEO dashboard',
  'medium', 'story', 4,
  'SD-PILOT-001:US-004',
  'Display Story Metrics on Dashboard',
  'As a user, I need to see story progress metrics on the dashboard so that I can track feature completion',
  '["Show total stories per SD", "Display passing/failing/not_run counts", "Show coverage percentage", "Enable drill-down to story details"]'::jsonb,
  'not_run'
),

-- ============================================================================
-- PHASE 2: Vision/WSJF Strategic Directives
-- ============================================================================

-- SD-GOVERNANCE-001: Governance Data Model (2 PRDs)
-- PRD 1: Strategic Directive Schema
(
  'SD-GOVERNANCE-001',
  gen_random_uuid()::text,
  'SD Table Schema Implementation',
  'Create strategic_directives_v2 table with all required fields',
  'high', 'story', 1,
  'SD-GOV-001:US-001',
  'Implement SD Table Schema',
  'As a system architect, I need a properly structured SD table so that all directive data is stored consistently',
  '["Create table with UUID primary key", "Add all metadata columns", "Implement check constraints", "Add indexes for performance"]'::jsonb,
  'not_run'
),
(
  'SD-GOVERNANCE-001',
  gen_random_uuid()::text,
  'PRD-SD Linkage',
  'Implement foreign key linkage between PRDs and SDs',
  'high', 'story', 2,
  'SD-GOV-001:US-002',
  'Link PRDs to Strategic Directives',
  'As a developer, I need PRDs linked to their parent SDs so that hierarchy is maintained',
  '["Add sd_id foreign key to PRD table", "Implement referential integrity", "Create junction views", "Add cascade rules"]'::jsonb,
  'not_run'
),
(
  'SD-GOVERNANCE-001',
  gen_random_uuid()::text,
  'Story-PRD Linkage',
  'Link user stories to their parent PRDs',
  'high', 'story', 3,
  'SD-GOV-001:US-003',
  'Link Stories to PRDs',
  'As a developer, I need stories linked to PRDs so that requirements are traceable',
  '["Add prd_id to story table", "Implement bi-directional navigation", "Create aggregation views", "Validate linkage integrity"]'::jsonb,
  'not_run'
),
-- PRD 2: Proposals Management System
(
  'SD-GOVERNANCE-001',
  gen_random_uuid()::text,
  'Proposal State Machine',
  'Implement proposal workflow states',
  'medium', 'story', 4,
  'SD-GOV-001:US-004',
  'Build Proposal State Machine',
  'As a manager, I need proposals to flow through defined states so that changes are properly reviewed',
  '["Define state transitions", "Implement state validation", "Add transition hooks", "Create audit trail"]'::jsonb,
  'not_run'
),
(
  'SD-GOVERNANCE-001',
  gen_random_uuid()::text,
  'Stale Proposal Detection',
  'Detect and flag stale proposals',
  'low', 'story', 5,
  'SD-GOV-001:US-005',
  'Detect Stale Proposals',
  'As a maintainer, I need stale proposals flagged so that they can be cleaned up',
  '["Check proposal age", "Compare with baseline", "Flag proposals over 30 days", "Send notifications"]'::jsonb,
  'not_run'
),

-- SD-VISION-001: Vision Alignment Pipeline (1 PRD)
(
  'SD-VISION-001',
  gen_random_uuid()::text,
  'SD Gap Detection',
  'Detect SDs without PRDs',
  'high', 'story', 1,
  'SD-VIS-001:US-001',
  'Detect SDs Without PRDs',
  'As an analyst, I need to identify SDs lacking PRDs so that gaps can be addressed',
  '["Query SDs without linked PRDs", "Calculate gap percentage", "Generate gap report", "Export to CSV"]'::jsonb,
  'not_run'
),
(
  'SD-VISION-001',
  gen_random_uuid()::text,
  'PRD Gap Detection',
  'Detect PRDs without stories',
  'high', 'story', 2,
  'SD-VIS-001:US-002',
  'Detect PRDs Without Stories',
  'As an analyst, I need to identify PRDs lacking stories so that work can be defined',
  '["Query PRDs without stories", "Check acceptance criteria coverage", "Flag incomplete PRDs", "Generate recommendations"]'::jsonb,
  'not_run'
),
(
  'SD-VISION-001',
  gen_random_uuid()::text,
  'Recommendation Engine',
  'Generate automated recommendations',
  'medium', 'story', 3,
  'SD-VIS-001:US-003',
  'Generate Gap Recommendations',
  'As a product owner, I need recommendations for closing gaps so that coverage improves',
  '["Analyze gap patterns", "Generate priority-based recommendations", "Create actionable tasks", "Track recommendation adoption"]'::jsonb,
  'not_run'
),

-- SD-WSJF-001: WSJF Sequencing Optimization (2 PRDs)
-- PRD 1: WSJF Scoring Algorithm
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Business Value Calculator',
  'Calculate business value from dependencies',
  'high', 'story', 1,
  'SD-WSJF-001:US-001',
  'Calculate Business Value Score',
  'As a prioritizer, I need business value calculated so that high-value items are prioritized',
  '["Count dependent systems", "Weight by criticality", "Factor in user impact", "Generate value score 0-100"]'::jsonb,
  'not_run'
),
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Time Criticality Calculator',
  'Calculate time criticality from gates',
  'high', 'story', 2,
  'SD-WSJF-001:US-002',
  'Calculate Time Criticality',
  'As a planner, I need time criticality scores so that urgent work is prioritized',
  '["Check gate deadlines", "Calculate days remaining", "Apply urgency multiplier", "Generate criticality score"]'::jsonb,
  'not_run'
),
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Risk Reduction Scorer',
  'Calculate risk reduction from coverage',
  'medium', 'story', 3,
  'SD-WSJF-001:US-003',
  'Score Risk Reduction Opportunity',
  'As a risk manager, I need risk reduction scored so that risk-reducing work is prioritized',
  '["Assess current risk level", "Calculate reduction potential", "Factor in mitigation cost", "Generate risk score"]'::jsonb,
  'not_run'
),
-- PRD 2: WSJF Apply Workflow
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Snapshot Before State',
  'Capture state before applying WSJF',
  'high', 'story', 4,
  'SD-WSJF-001:US-004',
  'Snapshot Current Execution Order',
  'As an auditor, I need before-state captured so that changes can be reviewed',
  '["Capture current execution_order", "Store in snapshot table", "Include timestamp", "Link to proposal"]'::jsonb,
  'not_run'
),
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Apply WSJF Proposals',
  'Apply accepted WSJF proposals',
  'high', 'story', 5,
  'SD-WSJF-001:US-005',
  'Apply Accepted Proposals',
  'As a coordinator, I need proposals applied so that execution order is optimized',
  '["Validate proposal state", "Update execution_order", "Log changes", "Trigger notifications"]'::jsonb,
  'not_run'
),
(
  'SD-WSJF-001',
  gen_random_uuid()::text,
  'Rollback Script Generator',
  'Generate rollback scripts',
  'medium', 'story', 6,
  'SD-WSJF-001:US-006',
  'Generate Rollback Scripts',
  'As an operator, I need rollback scripts so that changes can be reverted if needed',
  '["Read snapshot data", "Generate SQL rollback", "Include in audit PR", "Test rollback in staging"]'::jsonb,
  'not_run'
),

-- SD-PIPELINE-001: CI/CD Pipeline Hardening (2 PRDs)
-- PRD 1: GitHub Actions Security
(
  'SD-PIPELINE-001',
  gen_random_uuid()::text,
  'Secrets Rotation Process',
  'Implement automated secrets rotation',
  'high', 'story', 1,
  'SD-PIPE-001:US-001',
  'Rotate GitHub Secrets',
  'As a security engineer, I need secrets rotated regularly so that exposure risk is minimized',
  '["Schedule monthly rotation", "Update all workflows", "Validate new secrets", "Audit rotation history"]'::jsonb,
  'not_run'
),
(
  'SD-PIPELINE-001',
  gen_random_uuid()::text,
  'Concurrency Controls',
  'Implement workflow concurrency limits',
  'high', 'story', 2,
  'SD-PIPE-001:US-002',
  'Control Workflow Concurrency',
  'As a DevOps engineer, I need concurrency controlled so that resources aren''t exhausted',
  '["Set max parallel runs", "Queue excess runs", "Implement priority queue", "Monitor queue depth"]'::jsonb,
  'not_run'
),
(
  'SD-PIPELINE-001',
  gen_random_uuid()::text,
  'Dry-Run Defaults',
  'Default all workflows to dry-run mode',
  'high', 'story', 3,
  'SD-PIPE-001:US-003',
  'Default to Dry-Run Mode',
  'As a safety officer, I need dry-run as default so that accidental production changes are prevented',
  '["Set DRY_RUN=1 default", "Require explicit override", "Log all overrides", "Alert on production runs"]'::jsonb,
  'not_run'
),
-- PRD 2: Production Apply Gates
(
  'SD-PIPELINE-001',
  gen_random_uuid()::text,
  'Variable-Based Gates',
  'Implement variable-based enablement',
  'high', 'story', 4,
  'SD-PIPE-001:US-004',
  'Variable-Based Production Gates',
  'As an operator, I need variable gates so that production access is controlled',
  '["Check PROD_WRITE_OK variable", "Validate permissions", "Log access attempts", "Enforce double-confirmation"]'::jsonb,
  'not_run'
),
(
  'SD-PIPELINE-001',
  gen_random_uuid()::text,
  'Rollback Capability',
  'Implement automated rollback',
  'high', 'story', 5,
  'SD-PIPE-001:US-005',
  'Automated Rollback System',
  'As an operator, I need automated rollback so that bad changes can be quickly reverted',
  '["Detect failure conditions", "Trigger rollback automatically", "Preserve failure logs", "Notify stakeholders"]'::jsonb,
  'not_run'
),

-- SD-MONITORING-001: Observability Framework (1 PRD)
(
  'SD-MONITORING-001',
  gen_random_uuid()::text,
  'Metrics Collection',
  'Collect workflow metrics',
  'medium', 'story', 1,
  'SD-MON-001:US-001',
  'Collect Workflow Metrics',
  'As an analyst, I need workflow metrics collected so that performance can be tracked',
  '["Capture run duration", "Track success/failure rates", "Log resource usage", "Store in time-series DB"]'::jsonb,
  'not_run'
),
(
  'SD-MONITORING-001',
  gen_random_uuid()::text,
  'Success Rate Tracking',
  'Track apply success rates',
  'medium', 'story', 2,
  'SD-MON-001:US-002',
  'Track Apply Success Rates',
  'As a manager, I need success rates tracked so that reliability can be measured',
  '["Count successful applies", "Calculate rolling average", "Track by workflow type", "Alert on degradation"]'::jsonb,
  'not_run'
),
(
  'SD-MONITORING-001',
  gen_random_uuid()::text,
  'Dashboard Generation',
  'Generate monitoring dashboards',
  'low', 'story', 3,
  'SD-MON-001:US-003',
  'Generate Monitoring Dashboards',
  'As a user, I need dashboards so that system health is visible',
  '["Create Grafana dashboards", "Add key metrics widgets", "Setup auto-refresh", "Configure alerts"]'::jsonb,
  'not_run'
),

-- ============================================================================
-- PHASE 3: RabbitMQ Message Bus SD
-- ============================================================================

(
  'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando',
  gen_random_uuid()::text,
  'RabbitMQ Setup',
  'Setup RabbitMQ infrastructure',
  'high', 'story', 1,
  'SD-RABBIT-001:US-001',
  'Setup RabbitMQ Infrastructure',
  'As a platform engineer, I need RabbitMQ infrastructure so that agents can communicate',
  '["Deploy RabbitMQ cluster", "Configure exchanges and queues", "Setup monitoring", "Implement HA failover"]'::jsonb,
  'not_run'
),
(
  'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando',
  gen_random_uuid()::text,
  'Agent Message Protocol',
  'Define agent message protocol',
  'high', 'story', 2,
  'SD-RABBIT-001:US-002',
  'Define Agent Message Protocol',
  'As an agent developer, I need a message protocol so that agents can interoperate',
  '["Define message schema", "Implement serialization", "Add message versioning", "Create protocol documentation"]'::jsonb,
  'not_run'
),
(
  'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando',
  gen_random_uuid()::text,
  'Handoff Queue Management',
  'Implement handoff queue management',
  'high', 'story', 3,
  'SD-RABBIT-001:US-003',
  'Manage Agent Handoff Queues',
  'As a system, I need handoff queues managed so that work flows between agents',
  '["Create per-agent queues", "Implement routing logic", "Add dead letter handling", "Monitor queue depth"]'::jsonb,
  'not_run'
),
(
  'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando',
  gen_random_uuid()::text,
  'Message Durability',
  'Ensure message durability',
  'medium', 'story', 4,
  'SD-RABBIT-001:US-004',
  'Ensure Message Durability',
  'As an operator, I need messages to be durable so that work isn''t lost on failure',
  '["Enable message persistence", "Implement acknowledgments", "Add retry logic", "Configure TTL policies"]'::jsonb,
  'not_run'
);

-- Update story counts in strategic_directives_v2 (optional but helpful)
UPDATE strategic_directives_v2 sd
SET updated_at = NOW()
WHERE sd.id IN (
  SELECT DISTINCT sd_id
  FROM sd_backlog_map
  WHERE item_type = 'story'
  AND sd_id IN (
    'SD-2025-09-17-production-pilot-user-story-system',
    'SD-GOVERNANCE-001',
    'SD-VISION-001',
    'SD-WSJF-001',
    'SD-PIPELINE-001',
    'SD-MONITORING-001',
    'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando'
  )
);

-- Verification query
SELECT
  sd_id,
  COUNT(*) as story_count,
  STRING_AGG(DISTINCT priority, ', ' ORDER BY priority) as priorities,
  MIN(sequence_no) as min_seq,
  MAX(sequence_no) as max_seq
FROM sd_backlog_map
WHERE item_type = 'story'
  AND sd_id IN (
    'SD-2025-09-17-production-pilot-user-story-system',
    'SD-GOVERNANCE-001',
    'SD-VISION-001',
    'SD-WSJF-001',
    'SD-PIPELINE-001',
    'SD-MONITORING-001',
    'SD-2025-09-17-ehg-message-bus-rabbitmq-for-agent-hando'
  )
GROUP BY sd_id
ORDER BY
  CASE sd_id
    WHEN 'SD-2025-09-17-production-pilot-user-story-system' THEN 0
    ELSE 1
  END,
  sd_id;