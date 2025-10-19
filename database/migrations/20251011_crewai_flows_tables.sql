-- CrewAI Flows Database Schema
-- SD-BOARD-VISUAL-BUILDER-001
-- Visual workflow definitions and execution tracking

-- ============================================================================
-- PREREQUISITE: Board infrastructure tables MUST exist first
-- ============================================================================
-- TODO (SD-BOARD-VISUAL-BUILDER-001): Before applying this migration, ensure:
--   1. board_members table exists (from SD-BOARD-GOVERNANCE-001)
--   2. board_meetings table exists (from SD-BOARD-GOVERNANCE-001)
--   3. board_meeting_attendance table exists (from SD-BOARD-GOVERNANCE-001)
--
-- If tables missing, apply: database/migrations/20251011_board_infrastructure_tables.sql
-- Requires: Supabase CLI with proper permissions OR manual SQL execution via dashboard
-- Estimated effort: 5-10 minutes
-- Current state: Prerequisite not met - BLOCKER for EXEC phase
-- ============================================================================

-- 1. CrewAI Flows Table (Workflow Definitions)
CREATE TABLE IF NOT EXISTS crewai_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key VARCHAR(100) UNIQUE NOT NULL,
  flow_name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Visual workflow definition (JSON from React Flow)
  flow_definition JSONB NOT NULL,

  -- Generated Python code (from JSON → Python generator)
  python_code TEXT,

  -- Metadata
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'deprecated')),
  version INTEGER DEFAULT 1,
  parent_flow_id UUID REFERENCES crewai_flows(id), -- For versioning

  -- Ownership
  created_by UUID, -- References auth.users(id) when available
  updated_by UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  -- Additional metadata
  metadata JSONB,

  -- Tags for categorization
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Usage tracking
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_crewai_flows_status ON crewai_flows(status);
CREATE INDEX idx_crewai_flows_created_by ON crewai_flows(created_by);
CREATE INDEX idx_crewai_flows_tags ON crewai_flows USING GIN(tags);
CREATE INDEX idx_crewai_flows_created_at ON crewai_flows(created_at DESC);

-- Full-text search on flow names and descriptions
CREATE INDEX idx_crewai_flows_search ON crewai_flows USING GIN(
  to_tsvector('english', coalesce(flow_name, '') || ' ' || coalesce(description, ''))
);

-- 2. CrewAI Flow Executions Table (Execution History)
CREATE TABLE IF NOT EXISTS crewai_flow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to flow definition
  flow_id UUID NOT NULL REFERENCES crewai_flows(id) ON DELETE CASCADE,

  -- Unique execution identifier
  execution_key VARCHAR(100) UNIQUE NOT NULL,

  -- Input/Output state
  input_state JSONB,
  output_state JSONB,

  -- Execution status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,
  error_type VARCHAR(100),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Resource usage
  token_count INTEGER,
  cost_usd DECIMAL(10, 4),

  -- Link to board meeting (if workflow is board-related)
  board_meeting_id UUID, -- References board_meetings(id) when table exists

  -- Execution context
  executed_by UUID, -- References auth.users(id) when available
  execution_mode VARCHAR(20) DEFAULT 'manual' CHECK (execution_mode IN ('manual', 'scheduled', 'triggered')),

  -- Additional metadata
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX idx_flow_exec_flow_id ON crewai_flow_executions(flow_id);
CREATE INDEX idx_flow_exec_status ON crewai_flow_executions(status);
CREATE INDEX idx_flow_exec_started_at ON crewai_flow_executions(started_at DESC);
CREATE INDEX idx_flow_exec_board_meeting_id ON crewai_flow_executions(board_meeting_id);
CREATE INDEX idx_flow_exec_executed_by ON crewai_flow_executions(executed_by);

-- Composite index for dashboard queries (recent executions by flow)
CREATE INDEX idx_flow_exec_recent ON crewai_flow_executions(flow_id, started_at DESC);

-- 3. Workflow Templates Table (Pre-built workflow templates)
CREATE TABLE IF NOT EXISTS crewai_flow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key VARCHAR(100) UNIQUE NOT NULL,
  template_name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- e.g., 'board_meeting', 'decision_making', 'analysis'

  -- Template definition (similar to flow_definition but with placeholders)
  template_definition JSONB NOT NULL,

  -- Required parameters for instantiation
  required_parameters JSONB, -- Schema for parameters user must provide

  -- Metadata
  is_official BOOLEAN DEFAULT false, -- Official templates vs user-created
  usage_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2), -- User ratings 0.00-5.00
  rating_count INTEGER DEFAULT 0,

  -- Ownership
  created_by UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Additional metadata
  metadata JSONB,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX idx_flow_templates_category ON crewai_flow_templates(category);
CREATE INDEX idx_flow_templates_is_official ON crewai_flow_templates(is_official);
CREATE INDEX idx_flow_templates_tags ON crewai_flow_templates USING GIN(tags);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE crewai_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crewai_flow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crewai_flow_templates ENABLE ROW LEVEL SECURITY;

-- Flows: All authenticated users can read active flows
CREATE POLICY "flows_read_active" ON crewai_flows
  FOR SELECT
  USING (status = 'active' OR status = 'draft');

-- Flows: Users can create their own flows
CREATE POLICY "flows_create_own" ON crewai_flows
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Flows: Users can update their own flows
CREATE POLICY "flows_update_own" ON crewai_flows
  FOR UPDATE
  USING (auth.uid() = created_by);

-- Flows: Users can delete their own draft flows
CREATE POLICY "flows_delete_own_draft" ON crewai_flows
  FOR DELETE
  USING (auth.uid() = created_by AND status = 'draft');

-- Executions: Users can read their own executions
CREATE POLICY "executions_read_own" ON crewai_flow_executions
  FOR SELECT
  USING (auth.uid() = executed_by);

-- Executions: Users can create executions
CREATE POLICY "executions_create" ON crewai_flow_executions
  FOR INSERT
  WITH CHECK (auth.uid() = executed_by);

-- Templates: All users can read templates
CREATE POLICY "templates_read_all" ON crewai_flow_templates
  FOR SELECT
  USING (true);

-- Templates: Only admins can create/update official templates
-- (User-created templates via separate policy)
CREATE POLICY "templates_create_user" ON crewai_flow_templates
  FOR INSERT
  WITH CHECK (auth.uid() = created_by AND is_official = false);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flows_updated_at
  BEFORE UPDATE ON crewai_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON crewai_flow_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update execution count when flow is executed
CREATE OR REPLACE FUNCTION update_flow_execution_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crewai_flows
  SET execution_count = execution_count + 1,
      last_executed_at = NOW()
  WHERE id = NEW.flow_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flow_execution_counter
  AFTER INSERT ON crewai_flow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_flow_execution_count();

-- Calculate duration when execution completes
CREATE OR REPLACE FUNCTION calculate_execution_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_duration_calculator
  BEFORE UPDATE ON crewai_flow_executions
  FOR EACH ROW
  WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
  EXECUTE FUNCTION calculate_execution_duration();

-- ============================================================================
-- Seed Data: 3 Official Board Meeting Templates
-- ============================================================================

INSERT INTO crewai_flow_templates (template_key, template_name, description, category, is_official, template_definition, required_parameters, metadata) VALUES
(
  'weekly-board-meeting',
  'Weekly Board Meeting',
  'Standard weekly board meeting workflow with parallel reports from CFO, CTO, and GTM, followed by discussion and voting',
  'board_meeting',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "start", "data": {"label": "Start Meeting"}},
      {"id": "parallel-reports", "type": "parallel", "data": {"label": "Board Reports", "tasks": ["cfo_report", "cto_report", "gtm_report"]}},
      {"id": "eva-synthesis", "type": "agent_task", "data": {"label": "EVA Synthesizes", "agent": "EVA"}},
      {"id": "decision", "type": "decision", "data": {"label": "Red Flags?", "condition": "has_red_flags"}},
      {"id": "voting", "type": "parallel", "data": {"label": "Board Vote", "tasks": ["board_vote"]}},
      {"id": "end", "type": "end", "data": {"label": "End Meeting"}}
    ],
    "edges": [
      {"source": "start", "target": "parallel-reports"},
      {"source": "parallel-reports", "target": "eva-synthesis"},
      {"source": "eva-synthesis", "target": "decision"},
      {"source": "decision", "target": "voting", "label": "no"},
      {"source": "decision", "target": "end", "label": "yes"},
      {"source": "voting", "target": "end"}
    ]
  }',
  '{"meeting_date": "string", "agenda_items": "array"}',
  '{"estimated_duration": "15-20 minutes", "board_members_required": 7}'
),
(
  'emergency-board-session',
  'Emergency Board Session',
  'Urgent decision-making workflow triggered by critical events (burn rate, compliance issues, etc.)',
  'board_meeting',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "start", "data": {"label": "Emergency Trigger"}},
      {"id": "responsible-member", "type": "agent_task", "data": {"label": "Present Situation"}},
      {"id": "parallel-analysis", "type": "parallel", "data": {"label": "Board Analysis"}},
      {"id": "debate", "type": "agent_task", "data": {"label": "Discussion"}},
      {"id": "decision-type", "type": "router", "data": {"label": "Decision Type"}},
      {"id": "weighted-vote", "type": "parallel", "data": {"label": "Weighted Voting"}},
      {"id": "end", "type": "end", "data": {"label": "Record Decision"}}
    ],
    "edges": [
      {"source": "start", "target": "responsible-member"},
      {"source": "responsible-member", "target": "parallel-analysis"},
      {"source": "parallel-analysis", "target": "debate"},
      {"source": "debate", "target": "decision-type"},
      {"source": "decision-type", "target": "weighted-vote"},
      {"source": "weighted-vote", "target": "end"}
    ]
  }',
  '{"trigger_event": "string", "severity": "string"}',
  '{"estimated_duration": "20-30 minutes", "requires_unanimous": false}'
),
(
  'investment-approval',
  'Investment Approval Workflow',
  'Comprehensive venture investment analysis and approval process with multi-domain expert evaluation',
  'board_meeting',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "start", "data": {"label": "Venture Proposal"}},
      {"id": "ceo-presentation", "type": "agent_task", "data": {"label": "AI CEO Presents"}},
      {"id": "parallel-analysis", "type": "parallel", "data": {"label": "Expert Analysis", "tasks": ["cfo_financial", "cto_technical", "gtm_market", "legal_compliance"]}},
      {"id": "wait", "type": "wait", "data": {"label": "Wait for All"}},
      {"id": "blocker-check", "type": "router", "data": {"label": "Any Blockers?"}},
      {"id": "board-discussion", "type": "agent_task", "data": {"label": "Q&A with CEO"}},
      {"id": "weighted-vote", "type": "parallel", "data": {"label": "Board Vote"}},
      {"id": "vote-decision", "type": "decision", "data": {"label": "Vote Passes?"}},
      {"id": "approve", "type": "end", "data": {"label": "Approve + RAID Log"}},
      {"id": "reject", "type": "end", "data": {"label": "Reject + Feedback"}}
    ],
    "edges": [
      {"source": "start", "target": "ceo-presentation"},
      {"source": "ceo-presentation", "target": "parallel-analysis"},
      {"source": "parallel-analysis", "target": "wait"},
      {"source": "wait", "target": "blocker-check"},
      {"source": "blocker-check", "target": "reject", "label": "yes"},
      {"source": "blocker-check", "target": "board-discussion", "label": "no"},
      {"source": "board-discussion", "target": "weighted-vote"},
      {"source": "weighted-vote", "target": "vote-decision"},
      {"source": "vote-decision", "target": "approve", "label": "yes"},
      {"source": "vote-decision", "target": "reject", "label": "no"}
    ]
  }',
  '{"venture_id": "uuid", "investment_amount": "number", "venture_stage": "string"}',
  '{"estimated_duration": "25-35 minutes", "threshold": "60% weighted approval"}'
)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE crewai_flows IS 'Visual workflow definitions created in React Flow builder, with generated Python code';
COMMENT ON TABLE crewai_flow_executions IS 'Execution history and state tracking for workflows';
COMMENT ON TABLE crewai_flow_templates IS 'Pre-built workflow templates (official and user-created)';

COMMENT ON COLUMN crewai_flows.flow_definition IS 'JSON from React Flow: nodes, edges, positions, configurations';
COMMENT ON COLUMN crewai_flows.python_code IS 'Auto-generated Python code using CrewAI Flows decorators (@start, @listen, @router)';
COMMENT ON COLUMN crewai_flow_executions.execution_key IS 'Unique identifier for tracking (format: FLOW-KEY-TIMESTAMP)';
COMMENT ON COLUMN crewai_flow_executions.board_meeting_id IS 'Links workflow execution to board meeting (when applicable)';
