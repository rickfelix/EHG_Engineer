-- Migration: Agent Team Capabilities
-- SD: SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
-- Phase 1: Schema evolution - make leo_sub_agents the single source of truth
-- Adds model_tier, allowed_tools, team_role, instructions, category_mappings columns
-- Creates team_templates table for reusable team patterns

BEGIN;

-- ─── 1. Add columns to leo_sub_agents ──────────────────────────────────────

ALTER TABLE leo_sub_agents
  ADD COLUMN IF NOT EXISTS model_tier VARCHAR(20) DEFAULT 'opus'
    CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
  ADD COLUMN IF NOT EXISTS allowed_tools JSONB DEFAULT '["Bash", "Read", "Write"]'::jsonb,
  ADD COLUMN IF NOT EXISTS team_role VARCHAR(20) DEFAULT 'teammate'
    CHECK (team_role IN ('leader', 'teammate')),
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS category_mappings JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN leo_sub_agents.model_tier IS 'Default model tier for this agent (haiku/sonnet/opus). Used by compiler for frontmatter generation.';
COMMENT ON COLUMN leo_sub_agents.allowed_tools IS 'JSON array of tool names this agent can access. Compiler generates frontmatter tools: line from this.';
COMMENT ON COLUMN leo_sub_agents.team_role IS 'Role when participating in teams: leader (can create teams/tasks) or teammate (executes assigned tasks).';
COMMENT ON COLUMN leo_sub_agents.instructions IS 'Full agent identity text. If populated AND no .partial file exists, compiler generates .md entirely from DB.';
COMMENT ON COLUMN leo_sub_agents.category_mappings IS 'JSON array of issue_patterns categories relevant to this agent. Used for knowledge block composition.';

-- ─── 2. Create team_templates table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_templates (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  roles JSONB NOT NULL,
  task_structure JSONB NOT NULL,
  leader_agent_code VARCHAR(20) DEFAULT 'RCA',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE team_templates IS 'Pre-built team templates for one-command team creation. Each template defines roles, task structure, and a leader agent.';
COMMENT ON COLUMN team_templates.roles IS 'Array of role definitions: [{agent_code, role_name, task_template, team_role}]';
COMMENT ON COLUMN team_templates.task_structure IS 'Array of task definitions: [{subject, description, assignee_role, blocked_by}]';

-- RLS for team_templates (same pattern as leo_sub_agents)
ALTER TABLE team_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_read_team_templates ON team_templates
  FOR SELECT TO anon USING (true);

CREATE POLICY authenticated_read_team_templates ON team_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY service_role_all_team_templates ON team_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. Seed agent metadata ────────────────────────────────────────────────
-- Leaders: RCA, ORCHESTRATOR_CHILD, SECURITY, RISK, TESTING
-- Leader tools: Bash, Read, Write, Task, TeamCreate, TaskCreate, TaskUpdate, TaskList, TaskGet, SendMessage
-- Teammate tools: Bash, Read, Write, SendMessage, TaskUpdate, TaskList, TaskGet

-- RCA - Leader
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'leader',
  allowed_tools = '["Bash", "Read", "Write", "Task", "TeamCreate", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "SendMessage"]'::jsonb,
  category_mappings = '["debugging", "infrastructure", "process", "cross_cutting"]'::jsonb
WHERE code = 'RCA';

-- ORCHESTRATOR_CHILD - Leader
UPDATE leo_sub_agents SET
  model_tier = 'sonnet',
  team_role = 'leader',
  allowed_tools = '["Bash", "Read", "Write", "Task", "TeamCreate", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "SendMessage"]'::jsonb,
  category_mappings = '["protocol", "process", "code_structure"]'::jsonb
WHERE code = 'ORCHESTRATOR_CHILD';

-- SECURITY - Leader
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'leader',
  allowed_tools = '["Bash", "Read", "Write", "Task", "TeamCreate", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "SendMessage"]'::jsonb,
  category_mappings = '["security", "database"]'::jsonb
WHERE code = 'SECURITY';

-- RISK - Leader
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'leader',
  allowed_tools = '["Bash", "Read", "Write", "Task", "TeamCreate", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "SendMessage"]'::jsonb,
  category_mappings = '["security", "protocol"]'::jsonb
WHERE code = 'RISK';

-- TESTING - Leader
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'leader',
  allowed_tools = '["Bash", "Read", "Write", "Task", "TeamCreate", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "SendMessage"]'::jsonb,
  category_mappings = '["testing", "deployment", "build"]'::jsonb
WHERE code = 'TESTING';

-- DATABASE - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["database", "security"]'::jsonb
WHERE code = 'DATABASE';

-- PERFORMANCE - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["performance", "database"]'::jsonb
WHERE code = 'PERFORMANCE';

-- API - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["api", "security"]'::jsonb
WHERE code = 'API';

-- DESIGN - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["ui", "code_structure"]'::jsonb
WHERE code = 'DESIGN';

-- GITHUB - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'sonnet',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["deployment", "build", "ci_cd"]'::jsonb
WHERE code = 'GITHUB';

-- DOCMON - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'sonnet',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["documentation", "protocol"]'::jsonb
WHERE code = 'DOCMON';

-- RETRO - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'sonnet',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["protocol", "process"]'::jsonb
WHERE code = 'RETRO';

-- UAT - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["testing", "ui"]'::jsonb
WHERE code = 'UAT';

-- DEPENDENCY - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["deployment", "build"]'::jsonb
WHERE code = 'DEPENDENCY';

-- STORIES - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["protocol", "requirements"]'::jsonb
WHERE code = 'STORIES';

-- VALIDATION - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["code_structure", "protocol", "testing"]'::jsonb
WHERE code = 'VALIDATION';

-- REGRESSION - Teammate
UPDATE leo_sub_agents SET
  model_tier = 'opus',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write", "SendMessage", "TaskUpdate", "TaskList", "TaskGet"]'::jsonb,
  category_mappings = '["refactoring", "testing", "code_structure"]'::jsonb
WHERE code = 'REGRESSION';

-- QUICKFIX - Teammate (if exists)
UPDATE leo_sub_agents SET
  model_tier = 'sonnet',
  team_role = 'teammate',
  allowed_tools = '["Bash", "Read", "Write"]'::jsonb,
  category_mappings = '["code_structure", "testing", "build"]'::jsonb
WHERE code = 'QUICKFIX';

-- ─── 4. Seed team templates ────────────────────────────────────────────────

INSERT INTO team_templates (id, name, description, roles, task_structure, leader_agent_code) VALUES
(
  'rca-investigation',
  'RCA Investigation Team',
  'Root cause analysis team: RCA analyst leads with 2 domain specialists investigating in parallel, followed by synthesis.',
  '[
    {"agent_code": "RCA", "role_name": "rca-lead", "task_template": "Lead the root cause investigation for: {task_description}. Coordinate domain experts and synthesize findings.", "team_role": "leader"},
    {"agent_code": "DATABASE", "role_name": "db-specialist", "task_template": "Investigate database-related aspects of: {task_description}. Check schemas, queries, connections, and data integrity.", "team_role": "teammate"},
    {"agent_code": "API", "role_name": "api-specialist", "task_template": "Investigate API-related aspects of: {task_description}. Check endpoints, request/response patterns, and integration points.", "team_role": "teammate"}
  ]'::jsonb,
  '[
    {"subject": "Investigate database layer", "description": "Analyze database-related causes: schema issues, query performance, connection problems, data integrity", "assignee_role": "db-specialist", "blocked_by": []},
    {"subject": "Investigate API layer", "description": "Analyze API-related causes: endpoint issues, request patterns, error responses, integration failures", "assignee_role": "api-specialist", "blocked_by": []},
    {"subject": "Synthesize findings and produce CAPA", "description": "Combine domain expert findings, perform 5-whys analysis, produce corrective and preventive actions", "assignee_role": "rca-lead", "blocked_by": ["task-0", "task-1"]}
  ]'::jsonb,
  'RCA'
),
(
  'security-audit',
  'Security Audit Team',
  'Security audit team: Security lead coordinates database, API, and testing agents for comprehensive security review.',
  '[
    {"agent_code": "SECURITY", "role_name": "security-lead", "task_template": "Lead security audit for: {task_description}. Coordinate domain specialists and compile findings.", "team_role": "leader"},
    {"agent_code": "DATABASE", "role_name": "db-auditor", "task_template": "Audit database security for: {task_description}. Check RLS policies, access controls, SQL injection vectors.", "team_role": "teammate"},
    {"agent_code": "API", "role_name": "api-auditor", "task_template": "Audit API security for: {task_description}. Check authentication, authorization, input validation, OWASP top 10.", "team_role": "teammate"},
    {"agent_code": "TESTING", "role_name": "security-tester", "task_template": "Design security test cases for: {task_description}. Cover auth bypass, injection, privilege escalation.", "team_role": "teammate"}
  ]'::jsonb,
  '[
    {"subject": "Audit database security", "description": "Review RLS policies, access controls, credential handling, SQL injection vectors", "assignee_role": "db-auditor", "blocked_by": []},
    {"subject": "Audit API security", "description": "Review authentication, authorization, input validation, OWASP top 10 compliance", "assignee_role": "api-auditor", "blocked_by": []},
    {"subject": "Design security tests", "description": "Create test cases for auth bypass, injection, privilege escalation, data exposure", "assignee_role": "security-tester", "blocked_by": []},
    {"subject": "Compile security report", "description": "Synthesize all findings into prioritized security report with remediation plan", "assignee_role": "security-lead", "blocked_by": ["task-0", "task-1", "task-2"]}
  ]'::jsonb,
  'SECURITY'
),
(
  'performance-review',
  'Performance Review Team',
  'Performance review team: Performance lead coordinates database and API agents for bottleneck analysis.',
  '[
    {"agent_code": "PERFORMANCE", "role_name": "perf-lead", "task_template": "Lead performance review for: {task_description}. Coordinate specialists and identify bottlenecks.", "team_role": "leader"},
    {"agent_code": "DATABASE", "role_name": "db-perf", "task_template": "Analyze database performance for: {task_description}. Check query plans, indexes, connection pooling, N+1 queries.", "team_role": "teammate"},
    {"agent_code": "API", "role_name": "api-perf", "task_template": "Analyze API performance for: {task_description}. Check response times, payload sizes, caching, rate limiting.", "team_role": "teammate"}
  ]'::jsonb,
  '[
    {"subject": "Analyze database performance", "description": "Review query plans, index usage, connection pooling, N+1 patterns, slow query log", "assignee_role": "db-perf", "blocked_by": []},
    {"subject": "Analyze API performance", "description": "Review response times, payload sizes, caching headers, rate limiting, compression", "assignee_role": "api-perf", "blocked_by": []},
    {"subject": "Compile performance report", "description": "Synthesize findings into prioritized optimization plan with expected impact estimates", "assignee_role": "perf-lead", "blocked_by": ["task-0", "task-1"]}
  ]'::jsonb,
  'PERFORMANCE'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
