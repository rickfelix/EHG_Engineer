-- Migration: Skills Inventory tables for Capability Ledger
-- SD: SD-SKILLS-INVENTORY-001
-- Description: Track team skills, proficiency levels, and gap analysis

-- ============================================
-- Table: skills_inventory
-- ============================================
CREATE TABLE IF NOT EXISTS skills_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Skill definition
  skill_code VARCHAR(30) UNIQUE NOT NULL, -- SKILL-001, SKILL-002
  skill_name TEXT NOT NULL,
  skill_category VARCHAR(50) NOT NULL CHECK (skill_category IN ('technical', 'domain', 'leadership', 'process', 'tools')),
  description TEXT,

  -- Proficiency tracking
  current_proficiency INTEGER DEFAULT 0 CHECK (current_proficiency >= 0 AND current_proficiency <= 5),
  -- 0=None, 1=Awareness, 2=Beginner, 3=Intermediate, 4=Advanced, 5=Expert
  target_proficiency INTEGER DEFAULT 3 CHECK (target_proficiency >= 0 AND target_proficiency <= 5),
  proficiency_gap INTEGER GENERATED ALWAYS AS (target_proficiency - current_proficiency) STORED,

  -- Coverage
  team_members_with_skill INTEGER DEFAULT 0,
  bus_factor INTEGER DEFAULT 0, -- How many people can cover if one leaves

  -- Criticality
  is_critical BOOLEAN DEFAULT FALSE,
  criticality_score INTEGER DEFAULT 50 CHECK (criticality_score >= 0 AND criticality_score <= 100),

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),

  -- Metadata
  created_by TEXT DEFAULT 'SYSTEM',
  updated_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills_inventory(skill_category);
CREATE INDEX IF NOT EXISTS idx_skills_gap ON skills_inventory(proficiency_gap DESC);
CREATE INDEX IF NOT EXISTS idx_skills_critical ON skills_inventory(is_critical, criticality_score DESC);

-- ============================================
-- Table: skill_assignments
-- ============================================
CREATE TABLE IF NOT EXISTS skill_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills_inventory(id) ON DELETE CASCADE,
  assigned_to TEXT NOT NULL, -- Team member name/identifier

  -- Individual proficiency
  proficiency_level INTEGER DEFAULT 1 CHECK (proficiency_level >= 0 AND proficiency_level <= 5),
  last_assessed TIMESTAMPTZ DEFAULT NOW(),

  -- Notes
  notes TEXT,
  certifications TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(skill_id, assigned_to)
);

-- ============================================
-- View: Skills Gap Analysis
-- ============================================
CREATE OR REPLACE VIEW v_skills_gap_analysis AS
SELECT
  si.skill_code,
  si.skill_name,
  si.skill_category,
  si.current_proficiency,
  si.target_proficiency,
  si.proficiency_gap,
  si.is_critical,
  si.criticality_score,
  si.bus_factor,
  si.team_members_with_skill,
  CASE
    WHEN si.proficiency_gap >= 3 AND si.is_critical THEN 'critical_gap'
    WHEN si.proficiency_gap >= 2 THEN 'significant_gap'
    WHEN si.proficiency_gap >= 1 THEN 'minor_gap'
    WHEN si.proficiency_gap <= 0 THEN 'no_gap'
    ELSE 'unknown'
  END AS gap_severity,
  CASE
    WHEN si.bus_factor <= 1 AND si.is_critical THEN 'critical_risk'
    WHEN si.bus_factor <= 1 THEN 'high_risk'
    WHEN si.bus_factor <= 2 THEN 'moderate_risk'
    ELSE 'low_risk'
  END AS bus_factor_risk
FROM skills_inventory si
WHERE si.status = 'active'
ORDER BY
  si.is_critical DESC,
  si.proficiency_gap DESC,
  si.criticality_score DESC;

-- ============================================
-- Function: Update skill metrics
-- ============================================
CREATE OR REPLACE FUNCTION update_skill_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update team member count and average proficiency
  UPDATE skills_inventory
  SET
    team_members_with_skill = (
      SELECT COUNT(*) FROM skill_assignments WHERE skill_id = NEW.skill_id
    ),
    current_proficiency = COALESCE((
      SELECT ROUND(AVG(proficiency_level))::INTEGER
      FROM skill_assignments
      WHERE skill_id = NEW.skill_id
    ), 0),
    bus_factor = (
      SELECT COUNT(*)
      FROM skill_assignments
      WHERE skill_id = NEW.skill_id AND proficiency_level >= 3
    ),
    updated_at = NOW()
  WHERE id = NEW.skill_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_skill_metrics
AFTER INSERT OR UPDATE OR DELETE ON skill_assignments
FOR EACH ROW EXECUTE FUNCTION update_skill_metrics();

-- ============================================
-- Seed data: Initial skills
-- ============================================
INSERT INTO skills_inventory (skill_code, skill_name, skill_category, description, target_proficiency, is_critical, criticality_score)
VALUES
  ('SKILL-001', 'React/TypeScript', 'technical', 'Frontend development with React and TypeScript', 4, TRUE, 90),
  ('SKILL-002', 'PostgreSQL/Supabase', 'technical', 'Database design, queries, and Supabase integration', 4, TRUE, 85),
  ('SKILL-003', 'System Architecture', 'technical', 'High-level system design and architecture decisions', 3, TRUE, 80),
  ('SKILL-004', 'Venture Evaluation', 'domain', 'Assessing venture viability and risk', 4, TRUE, 95),
  ('SKILL-005', 'AI/LLM Integration', 'technical', 'Working with AI models and prompt engineering', 3, FALSE, 70)
ON CONFLICT (skill_code) DO UPDATE SET updated_at = NOW();

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE skills_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view skills"
ON skills_inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage skills"
ON skills_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view assignments"
ON skill_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage assignments"
ON skill_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON skills_inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_assignments TO authenticated;
GRANT SELECT ON v_skills_gap_analysis TO authenticated;
