-- Board Infrastructure Migration
-- Required for SD-BOARD-VISUAL-BUILDER-001
-- Creates tables from SD-BOARD-GOVERNANCE-001 (Phase 1)

-- 1. Board Members Table
CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID, -- References crewai_agents(id) when that table exists
  board_role VARCHAR(100) NOT NULL,
  voting_weight DECIMAL(3,2) DEFAULT 1.0,
  expertise_domains TEXT[] NOT NULL,
  appointment_date TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_board_members_status ON board_members(status);
CREATE INDEX idx_board_members_agent_id ON board_members(agent_id);

-- 2. Board Meetings Table
CREATE TABLE IF NOT EXISTS board_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_key VARCHAR(50) UNIQUE NOT NULL,
  meeting_type VARCHAR(50) NOT NULL,
  agenda TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome JSONB,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  workflow_id UUID, -- References crewai_flows(id) when that table exists
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_board_meetings_status ON board_meetings(status);
CREATE INDEX idx_board_meetings_meeting_type ON board_meetings(meeting_type);
CREATE INDEX idx_board_meetings_scheduled_at ON board_meetings(scheduled_at DESC);

-- 3. Board Meeting Attendance Table
CREATE TABLE IF NOT EXISTS board_meeting_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES board_meetings(id) ON DELETE CASCADE,
  board_member_id UUID REFERENCES board_members(id) ON DELETE CASCADE,
  attended BOOLEAN DEFAULT false,
  vote VARCHAR(20) CHECK (vote IN ('approve', 'reject', 'abstain', NULL)),
  notes TEXT,
  voting_weight_used DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendance_meeting_id ON board_meeting_attendance(meeting_id);
CREATE INDEX idx_attendance_member_id ON board_meeting_attendance(board_member_id);

-- RLS Policies (enable RLS)
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_meeting_attendance ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read board data
CREATE POLICY "board_members_read_policy" ON board_members FOR SELECT USING (true);
CREATE POLICY "board_meetings_read_policy" ON board_meetings FOR SELECT USING (true);
CREATE POLICY "attendance_read_policy" ON board_meeting_attendance FOR SELECT USING (true);

-- Policy: Only service role can write (admin operations)
CREATE POLICY "board_members_write_policy" ON board_members FOR ALL USING (current_user = 'service_role');
CREATE POLICY "board_meetings_write_policy" ON board_meetings FOR ALL USING (current_user = 'service_role');
CREATE POLICY "attendance_write_policy" ON board_meeting_attendance FOR ALL USING (current_user = 'service_role');

-- Seed Data: 7 Board Members (EVA + 6 specialists)
INSERT INTO board_members (board_role, voting_weight, expertise_domains, metadata) VALUES
  ('Board Chair (EVA)', 1.5, ARRAY['strategic', 'governance', 'oversight'], '{"name": "EVA", "description": "Executive Virtual Assistant - Board Chair"}'),
  ('Chief Financial Officer', 1.5, ARRAY['financial', 'budget', 'fundraising'], '{"name": "AI CFO", "description": "Oversees financial health and investment decisions"}'),
  ('Chief Technology Officer', 1.5, ARRAY['technical', 'architecture', 'security'], '{"name": "AI CTO", "description": "Assesses technical feasibility and technology risk"}'),
  ('Go-To-Market Strategist', 1.5, ARRAY['market', 'competitive', 'growth'], '{"name": "AI GTM Strategist", "description": "Evaluates market opportunity and growth strategy"}'),
  ('Chief Legal Officer', 1.2, ARRAY['legal', 'compliance', 'regulatory'], '{"name": "AI Legal/Compliance", "description": "Identifies regulatory risks and legal implications"}'),
  ('Chief Operating Officer', 1.3, ARRAY['operations', 'execution', 'resources'], '{"name": "AI COO", "description": "Assesses operational feasibility and execution risks"}'),
  ('Venture CEO Agent', 1.0, ARRAY['venture_specific'], '{"name": "AI CEO Agent", "description": "Presents venture case to board"}')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE board_members IS 'Board of Directors members with voting weights and expertise domains';
COMMENT ON TABLE board_meetings IS 'Board meetings with agenda, outcomes, and workflow linkage';
COMMENT ON TABLE board_meeting_attendance IS 'Attendance and voting records for board meetings';