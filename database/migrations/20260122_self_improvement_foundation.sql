-- ============================================================================
-- Self-Improvement Foundation Migration (Phase 0)
-- SD: SD-LEO-SELF-IMPROVE-FOUND-001
--
-- This migration establishes the database infrastructure for the LEO
-- Self-Improvement Loop. All changes are additive - no existing functionality
-- is modified.
--
-- Components:
-- 1. protocol_constitution table (immutable rules)
-- 2. improvement_quality_assessments table (AI scoring)
-- 3. pattern_resolution_signals table (evidence tracking)
-- 4. risk_tier column on protocol_improvement_queue
-- 5. priority column on leo_protocol_sections
-- 6. effectiveness tracking columns on protocol_improvement_queue
-- 7. RLS policies for constitution immutability
-- 8. Constitution seed data (9 rules)
-- ============================================================================

-- ============================================================================
-- 1. CREATE protocol_constitution TABLE
-- ============================================================================
-- Stores immutable constitution rules for self-improvement governance.
-- NOTE: No updated_at column - these rules cannot be modified once created.

CREATE TABLE IF NOT EXISTS protocol_constitution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(50) UNIQUE NOT NULL,
  rule_text TEXT NOT NULL,
  category VARCHAR(50),
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE protocol_constitution IS 'Immutable constitution rules for LEO self-improvement governance. Cannot be modified or deleted.';
COMMENT ON COLUMN protocol_constitution.rule_code IS 'Unique rule identifier (e.g., CONST-001)';
COMMENT ON COLUMN protocol_constitution.rule_text IS 'The actual rule text that must be followed';
COMMENT ON COLUMN protocol_constitution.category IS 'Rule category: safety, governance, audit';
COMMENT ON COLUMN protocol_constitution.rationale IS 'Explanation of why this rule exists';

-- ============================================================================
-- 2. RLS POLICIES FOR CONSTITUTION IMMUTABILITY
-- ============================================================================
-- These policies make the constitution table truly immutable by preventing
-- UPDATE and DELETE operations. INSERT is allowed for initial seeding only.

ALTER TABLE protocol_constitution ENABLE ROW LEVEL SECURITY;

-- Prevent all DELETE operations
DROP POLICY IF EXISTS no_delete_constitution ON protocol_constitution;
CREATE POLICY no_delete_constitution ON protocol_constitution
  FOR DELETE
  USING (false);

-- Prevent all UPDATE operations
DROP POLICY IF EXISTS no_update_constitution ON protocol_constitution;
CREATE POLICY no_update_constitution ON protocol_constitution
  FOR UPDATE
  USING (false);

-- Allow SELECT for everyone (read-only access)
DROP POLICY IF EXISTS select_constitution ON protocol_constitution;
CREATE POLICY select_constitution ON protocol_constitution
  FOR SELECT
  USING (true);

-- Allow INSERT (for initial seeding)
DROP POLICY IF EXISTS insert_constitution ON protocol_constitution;
CREATE POLICY insert_constitution ON protocol_constitution
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 3. ADD risk_tier COLUMN TO protocol_improvement_queue
-- ============================================================================
-- Enables classification of proposed improvements into IMMUTABLE, GOVERNED,
-- or AUTO tiers for appropriate governance routing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocol_improvement_queue'
    AND column_name = 'risk_tier'
  ) THEN
    ALTER TABLE protocol_improvement_queue
    ADD COLUMN risk_tier VARCHAR(20) DEFAULT 'GOVERNED'
      CHECK (risk_tier IN ('IMMUTABLE', 'GOVERNED', 'AUTO'));

    COMMENT ON COLUMN protocol_improvement_queue.risk_tier IS 'Risk classification: IMMUTABLE (never changes), GOVERNED (human approval), AUTO (can auto-apply if criteria met)';
  END IF;
END $$;

-- ============================================================================
-- 4. CREATE improvement_quality_assessments TABLE
-- ============================================================================
-- Stores AI quality judge evaluations for proposed improvements, including
-- scores, criteria breakdowns, and recommendations.

CREATE TABLE IF NOT EXISTS improvement_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID REFERENCES protocol_improvement_queue(id) ON DELETE CASCADE,
  evaluator_model VARCHAR(50) NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  criteria_scores JSONB,
  recommendation VARCHAR(20),
  reasoning TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE improvement_quality_assessments IS 'AI quality judge evaluations for protocol improvements';
COMMENT ON COLUMN improvement_quality_assessments.improvement_id IS 'Reference to the improvement being evaluated';
COMMENT ON COLUMN improvement_quality_assessments.evaluator_model IS 'AI model used for evaluation (e.g., claude-3-sonnet)';
COMMENT ON COLUMN improvement_quality_assessments.score IS 'Overall quality score 0-100';
COMMENT ON COLUMN improvement_quality_assessments.criteria_scores IS 'Breakdown by criteria: specificity, necessity, atomicity, safety, evidence';
COMMENT ON COLUMN improvement_quality_assessments.recommendation IS 'AI recommendation: APPROVE, REJECT, NEEDS_REVISION';
COMMENT ON COLUMN improvement_quality_assessments.reasoning IS 'Detailed reasoning for the score and recommendation';

-- ============================================================================
-- 5. ADD priority COLUMN TO leo_protocol_sections
-- ============================================================================
-- Enables classification of protocol sections as CORE (constitution-level),
-- STANDARD (normal rules), or SITUATIONAL (context-dependent).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leo_protocol_sections'
    AND column_name = 'priority'
  ) THEN
    ALTER TABLE leo_protocol_sections
    ADD COLUMN priority VARCHAR(20) DEFAULT 'STANDARD'
      CHECK (priority IN ('CORE', 'STANDARD', 'SITUATIONAL'));

    COMMENT ON COLUMN leo_protocol_sections.priority IS 'Section priority: CORE (always loaded, never removed), STANDARD (normal rules), SITUATIONAL (context-dependent)';
  END IF;
END $$;

-- ============================================================================
-- 6. CREATE pattern_resolution_signals TABLE
-- ============================================================================
-- Tracks signals that indicate when patterns (recurring issues) have been
-- resolved, enabling evidence-based improvement tracking.

CREATE TABLE IF NOT EXISTS pattern_resolution_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id VARCHAR(50) NOT NULL,
  signal_type VARCHAR(50) NOT NULL,
  signal_source TEXT,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pattern_resolution_signals IS 'Signals indicating pattern resolution for evidence tracking';
COMMENT ON COLUMN pattern_resolution_signals.pattern_id IS 'Reference to the pattern being tracked';
COMMENT ON COLUMN pattern_resolution_signals.signal_type IS 'Type of resolution signal: sd_completed, metric_improved, no_recurrence';
COMMENT ON COLUMN pattern_resolution_signals.signal_source IS 'Source of the signal (e.g., SD ID, metric name)';
COMMENT ON COLUMN pattern_resolution_signals.confidence IS 'Confidence level 0.00-1.00';

-- ============================================================================
-- 7. ADD effectiveness tracking COLUMNS TO protocol_improvement_queue
-- ============================================================================
-- Enable tracking of improvement effectiveness by storing baseline metrics,
-- post-change metrics, and rollback reasons.

DO $$
BEGIN
  -- effectiveness_measured_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocol_improvement_queue'
    AND column_name = 'effectiveness_measured_at'
  ) THEN
    ALTER TABLE protocol_improvement_queue
    ADD COLUMN effectiveness_measured_at TIMESTAMPTZ;

    COMMENT ON COLUMN protocol_improvement_queue.effectiveness_measured_at IS 'When effectiveness was measured after applying improvement';
  END IF;

  -- baseline_metric
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocol_improvement_queue'
    AND column_name = 'baseline_metric'
  ) THEN
    ALTER TABLE protocol_improvement_queue
    ADD COLUMN baseline_metric JSONB;

    COMMENT ON COLUMN protocol_improvement_queue.baseline_metric IS 'Metric values before improvement was applied';
  END IF;

  -- post_metric
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocol_improvement_queue'
    AND column_name = 'post_metric'
  ) THEN
    ALTER TABLE protocol_improvement_queue
    ADD COLUMN post_metric JSONB;

    COMMENT ON COLUMN protocol_improvement_queue.post_metric IS 'Metric values after improvement was applied';
  END IF;

  -- rollback_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'protocol_improvement_queue'
    AND column_name = 'rollback_reason'
  ) THEN
    ALTER TABLE protocol_improvement_queue
    ADD COLUMN rollback_reason TEXT;

    COMMENT ON COLUMN protocol_improvement_queue.rollback_reason IS 'If improvement was rolled back, the reason why';
  END IF;
END $$;

-- ============================================================================
-- 8. SEED CONSTITUTION RULES
-- ============================================================================
-- Insert the 9 immutable constitution rules that govern the self-improvement
-- system. Uses ON CONFLICT DO NOTHING to be idempotent.

INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES
  -- Original 5 rules
  ('CONST-001', 'All GOVERNED tier changes require human approval. AI scores inform but never decide.', 'governance', 'Ensures human oversight of significant protocol changes'),

  ('CONST-002', 'The system that proposes improvements cannot approve its own proposals.', 'safety', 'Prevents self-serving modifications and maintains separation of duties'),

  ('CONST-003', 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.', 'audit', 'Ensures traceability and accountability for all changes'),

  ('CONST-004', 'Every applied change must be reversible within the rollback window.', 'safety', 'Enables recovery from bad changes and maintains system stability'),

  ('CONST-005', 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.', 'governance', 'Ensures single source of truth and prevents configuration drift'),

  -- NEW rules from AntiGravity triangulation
  ('CONST-006', 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).', 'governance', 'Prevents protocol bloat and maintains context window efficiency'),

  ('CONST-007', 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.', 'safety', 'Limits velocity of automated changes to allow human oversight'),

  ('CONST-008', 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.', 'governance', 'Implements Chesterton''s Fence - understand why before removing'),

  ('CONST-009', 'Human can invoke FREEZE command to halt all AUTO changes immediately.', 'safety', 'Provides emergency stop capability for autonomous system')
ON CONFLICT (rule_code) DO NOTHING;

-- Also insert into leo_protocol_sections for CLAUDE.md generation
-- Note: priority column was added above in step 5
INSERT INTO leo_protocol_sections (section_type, title, content, priority)
VALUES
  ('constitution', 'CONST-001: Human Approval Required', 'All GOVERNED tier changes require human approval. AI scores inform but never decide.', 'CORE'),
  ('constitution', 'CONST-002: No Self-Approval', 'The system that proposes improvements cannot approve its own proposals.', 'CORE'),
  ('constitution', 'CONST-003: Audit Trail', 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.', 'CORE'),
  ('constitution', 'CONST-004: Rollback Capability', 'Every applied change must be reversible within the rollback window.', 'CORE'),
  ('constitution', 'CONST-005: Database First', 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.', 'CORE'),
  ('constitution', 'CONST-006: Complexity Conservation', 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).', 'CORE'),
  ('constitution', 'CONST-007: Velocity Limit', 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.', 'CORE'),
  ('constitution', 'CONST-008: Chesterton''s Fence', 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.', 'CORE'),
  ('constitution', 'CONST-009: Emergency Freeze', 'Human can invoke FREEZE command to halt all AUTO changes immediately.', 'CORE')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. CREATE INDEXES
-- ============================================================================
-- Indexes for efficient querying

CREATE INDEX IF NOT EXISTS idx_improvement_quality_improvement_id
  ON improvement_quality_assessments(improvement_id);

CREATE INDEX IF NOT EXISTS idx_improvement_quality_score
  ON improvement_quality_assessments(score);

CREATE INDEX IF NOT EXISTS idx_pattern_resolution_pattern_id
  ON pattern_resolution_signals(pattern_id);

CREATE INDEX IF NOT EXISTS idx_protocol_improvement_queue_risk_tier
  ON protocol_improvement_queue(risk_tier);

CREATE INDEX IF NOT EXISTS idx_leo_protocol_sections_priority
  ON leo_protocol_sections(priority);

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================
-- Run these after migration to verify:
--
-- 1. Constitution rules seeded:
--    SELECT COUNT(*) FROM protocol_constitution;  -- Expected: 9
--
-- 2. RLS policies active (should fail):
--    DELETE FROM protocol_constitution WHERE rule_code = 'CONST-001';
--    UPDATE protocol_constitution SET rule_text = 'modified' WHERE rule_code = 'CONST-001';
--
-- 3. New columns exist:
--    SELECT risk_tier FROM protocol_improvement_queue LIMIT 1;
--    SELECT priority FROM leo_protocol_sections LIMIT 1;
--
-- 4. New tables exist:
--    SELECT * FROM improvement_quality_assessments LIMIT 1;
--    SELECT * FROM pattern_resolution_signals LIMIT 1;
-- ============================================================================
