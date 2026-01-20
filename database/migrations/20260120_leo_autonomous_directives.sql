-- Migration: LEO Autonomous Continuation Directives
-- SD: SD-LEO-CONTINUITY-001
-- Purpose: Store autonomous continuation directives that guide AI agent behavior
-- Architecture: Option D (Database + Phase File Generation) - validated by multi-AI triangulation

-- ============================================================================
-- STEP 1: Create the leo_autonomous_directives table
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_autonomous_directives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  directive_code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  enforcement_point VARCHAR(50) NOT NULL CHECK (enforcement_point IN ('ALWAYS', 'ON_FAILURE', 'HANDOFF_START')),
  is_blocking BOOLEAN DEFAULT false,
  applies_to_phases VARCHAR(20)[] DEFAULT ARRAY['LEAD', 'PLAN', 'EXEC'],
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE leo_autonomous_directives IS 'Stores autonomous continuation directives that guide AI agent behavior during LEO protocol execution (SD-LEO-CONTINUITY-001)';
COMMENT ON COLUMN leo_autonomous_directives.directive_code IS 'Unique code for the directive (e.g., AUTO_CONTINUE, FIVE_WHYS_RCA)';
COMMENT ON COLUMN leo_autonomous_directives.enforcement_point IS 'When to display: ALWAYS (static in phase files), ON_FAILURE (runtime on errors), HANDOFF_START (at phase transitions)';
COMMENT ON COLUMN leo_autonomous_directives.is_blocking IS 'If true, directive must be acknowledged before proceeding';
COMMENT ON COLUMN leo_autonomous_directives.applies_to_phases IS 'Array of phases where this directive applies (LEAD, PLAN, EXEC)';

-- ============================================================================
-- STEP 2: Create index for fast lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leo_autonomous_directives_enforcement
  ON leo_autonomous_directives(enforcement_point)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_leo_autonomous_directives_active
  ON leo_autonomous_directives(active, display_order);

-- ============================================================================
-- STEP 3: Seed the 5 autonomous continuation directives
-- ============================================================================

INSERT INTO leo_autonomous_directives (directive_code, title, content, enforcement_point, is_blocking, applies_to_phases, display_order) VALUES

-- Directive 1: Autonomous Continuation (ALWAYS)
('AUTO_CONTINUE',
 'Autonomous Continuation',
 'Continue through the strategic directive and its children SDs autonomously until completion or blocker. Do not stop to ask for permission at each step - work through the full LEAD→PLAN→EXEC cycle continuously.',
 'ALWAYS',
 false,
 ARRAY['LEAD', 'PLAN', 'EXEC'],
 1),

-- Directive 2: 5-Whys Root Cause Analysis (ON_FAILURE - conditional)
('FIVE_WHYS_RCA',
 '5-Whys Root Cause Analysis',
 'When encountering issues or blockers, determine the root cause by asking five whys before attempting fixes. Use /escalate to invoke the formal 5-Whys analysis process. Do not apply surface-level fixes that mask underlying problems.',
 'ON_FAILURE',
 false,
 ARRAY['PLAN', 'EXEC'],
 2),

-- Directive 3: Sustainable Resolution (ON_FAILURE - conditional)
('SUSTAINABLE_RESOLUTION',
 'Sustainable Resolution',
 'Resolve root causes so they do not happen again in the future. Update processes, documentation, or automation to prevent recurrence. A fix that only addresses symptoms will create future debt.',
 'ON_FAILURE',
 false,
 ARRAY['PLAN', 'EXEC'],
 3),

-- Directive 4: Quality Over Speed (ALWAYS)
('QUALITY_OVER_SPEED',
 'Quality Over Speed',
 'Prioritize quality over speed. Do not cut corners. Ensure tests pass, code is clean, and documentation is updated. A quick hack that creates technical debt is not a solution.',
 'ALWAYS',
 false,
 ARRAY['LEAD', 'PLAN', 'EXEC'],
 4),

-- Directive 5: Protocol Familiarization (HANDOFF_START)
('PROTOCOL_FAMILIARIZATION',
 'Protocol Familiarization',
 'At each handoff point, familiarize yourself with and read the LEO protocol documentation for the relevant phase. Load CLAUDE_LEAD.md for LEAD phase, CLAUDE_PLAN.md for PLAN phase, CLAUDE_EXEC.md for EXEC phase.',
 'HANDOFF_START',
 false,
 ARRAY['LEAD', 'PLAN', 'EXEC'],
 5)

ON CONFLICT (directive_code) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  enforcement_point = EXCLUDED.enforcement_point,
  is_blocking = EXCLUDED.is_blocking,
  applies_to_phases = EXCLUDED.applies_to_phases,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- ============================================================================
-- STEP 4: Create helper function to fetch directives by enforcement point
-- ============================================================================

CREATE OR REPLACE FUNCTION get_autonomous_directives(p_enforcement_point VARCHAR DEFAULT NULL)
RETURNS TABLE (
  directive_code VARCHAR,
  title VARCHAR,
  content TEXT,
  enforcement_point VARCHAR,
  is_blocking BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.directive_code,
    d.title,
    d.content,
    d.enforcement_point,
    d.is_blocking
  FROM leo_autonomous_directives d
  WHERE d.active = true
    AND (p_enforcement_point IS NULL OR d.enforcement_point = p_enforcement_point)
  ORDER BY d.display_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_autonomous_directives IS 'Fetch active autonomous directives, optionally filtered by enforcement point';

-- ============================================================================
-- STEP 5: Verification query
-- ============================================================================

-- Verify directives were created
DO $$
DECLARE
  directive_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO directive_count FROM leo_autonomous_directives WHERE active = true;
  IF directive_count = 5 THEN
    RAISE NOTICE '✅ Migration successful: % autonomous directives created', directive_count;
  ELSE
    RAISE WARNING '⚠️ Expected 5 directives, found %', directive_count;
  END IF;
END $$;
