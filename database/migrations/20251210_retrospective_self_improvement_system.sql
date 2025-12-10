-- =====================================================================================
-- Migration: LEO Protocol Self-Improvement System
-- File: 20251210_retrospective_self_improvement_system.sql
-- Date: 2025-12-10
-- Purpose: Comprehensive self-improvement system for LEO Protocol
--          Enables database-first protocol evolution through retrospective analysis
-- =====================================================================================

-- OVERVIEW:
-- This migration creates a self-improvement system that extracts protocol improvements
-- from retrospectives and queues them for review and application. Key features:
--
-- 1. Retrospective Type Classification (LEAD_TO_PLAN, PLAN_TO_EXEC, SD_COMPLETION)
-- 2. Protocol Improvement Queue (database-first improvement tracking)
-- 3. Automatic Extraction (trigger-based extraction from retrospectives)
-- 4. Consolidation Logic (groups similar improvements, tracks evidence)
-- 5. Helper Views and Functions (query, apply, and track effectiveness)

-- =====================================================================================
-- PART 1: ADD RETROSPECTIVE_TYPE COLUMN TO RETROSPECTIVES
-- =====================================================================================

-- Add retrospective_type column with default
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS retrospective_type TEXT DEFAULT 'SD_COMPLETION';

-- Add check constraint for valid values
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_retrospective_type_check
CHECK (retrospective_type IN ('LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'SD_COMPLETION'));

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_retrospectives_retrospective_type
ON retrospectives(retrospective_type);

-- Backfill existing records (all existing records are SD_COMPLETION type)
UPDATE retrospectives
SET retrospective_type = 'SD_COMPLETION'
WHERE retrospective_type IS NULL;

-- Add comment
COMMENT ON COLUMN retrospectives.retrospective_type IS
'Type of retrospective: LEAD_TO_PLAN (approval phase), PLAN_TO_EXEC (validation phase), SD_COMPLETION (full SD retrospective)';

-- =====================================================================================
-- PART 2: CREATE PROTOCOL_IMPROVEMENT_QUEUE TABLE
-- =====================================================================================

CREATE TABLE IF NOT EXISTS protocol_improvement_queue (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking
  source_retro_id UUID REFERENCES retrospectives(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('LEAD_TO_PLAN', 'PLAN_TO_EXEC', 'SD_COMPLETION')),

  -- Improvement classification
  improvement_type TEXT NOT NULL CHECK (improvement_type IN (
    'VALIDATION_RULE',      -- New validation rule for gates
    'CHECKLIST_ITEM',       -- New checklist item for phases
    'SKILL_UPDATE',         -- Update to Claude Code skill
    'PROTOCOL_SECTION',     -- Update to protocol documentation
    'SUB_AGENT_CONFIG'      -- Sub-agent configuration change
  )),

  -- Database-first enforcement
  target_table TEXT NOT NULL,                    -- Which table to update (enforces database-first)
  target_operation TEXT NOT NULL CHECK (target_operation IN ('INSERT', 'UPDATE', 'UPSERT')),
  target_key TEXT,                               -- For updates: the key to match (e.g., 'rule_id', 'agent_code')
  payload JSONB NOT NULL,                        -- The actual data to insert/update

  -- Context and metadata
  target_phase TEXT CHECK (target_phase IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),
  description TEXT NOT NULL,                     -- Human-readable description of improvement
  evidence_count INTEGER DEFAULT 1 NOT NULL,     -- How many times this pattern has been observed

  -- Workflow status
  status TEXT DEFAULT 'PENDING' NOT NULL CHECK (status IN (
    'PENDING',      -- Awaiting review
    'APPROVED',     -- Approved for application
    'APPLIED',      -- Successfully applied to database
    'REJECTED',     -- Rejected after review
    'SUPERSEDED'    -- Replaced by newer improvement
  )),

  -- Applicability flags
  auto_applicable BOOLEAN DEFAULT FALSE,         -- Can this be auto-applied without human review?

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  applied_at TIMESTAMPTZ,

  -- Effectiveness tracking
  effectiveness_score INTEGER CHECK (effectiveness_score >= 0 AND effectiveness_score <= 100),

  -- Constraints
  CONSTRAINT must_have_db_target CHECK (
    target_table IS NOT NULL AND payload IS NOT NULL
  ),
  CONSTRAINT reviewed_fields_complete CHECK (
    (status IN ('PENDING', 'APPLIED')) OR
    (status IN ('APPROVED', 'REJECTED', 'SUPERSEDED') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_protocol_queue_status ON protocol_improvement_queue(status);
CREATE INDEX idx_protocol_queue_type ON protocol_improvement_queue(improvement_type);
CREATE INDEX idx_protocol_queue_target ON protocol_improvement_queue(target_table);
CREATE INDEX idx_protocol_queue_phase ON protocol_improvement_queue(target_phase);
CREATE INDEX idx_protocol_queue_source ON protocol_improvement_queue(source_retro_id);
CREATE INDEX idx_protocol_queue_evidence ON protocol_improvement_queue(evidence_count DESC);

-- Comments
COMMENT ON TABLE protocol_improvement_queue IS
'Queue for protocol improvements extracted from retrospectives. Enforces database-first approach by requiring target_table and payload.';

COMMENT ON COLUMN protocol_improvement_queue.evidence_count IS
'Number of times this improvement pattern has been observed. Incremented when similar improvements are consolidated.';

COMMENT ON COLUMN protocol_improvement_queue.auto_applicable IS
'Whether this improvement can be auto-applied. True only for low-risk changes like adding checklist items.';

COMMENT ON COLUMN protocol_improvement_queue.effectiveness_score IS
'Post-application effectiveness score (0-100). Measured by reduction in related issue patterns after application.';

-- =====================================================================================
-- PART 3: EXTRACTION TRIGGER FUNCTION
-- =====================================================================================

CREATE OR REPLACE FUNCTION extract_protocol_improvements_from_retro()
RETURNS TRIGGER AS $$
DECLARE
  improvement_item JSONB;
  failure_item TEXT;
  existing_queue_id UUID;
  improvement_desc TEXT;
  improvement_type TEXT;
  target_phase TEXT;
BEGIN
  -- Only process if retrospective has protocol_improvements array
  IF NEW.protocol_improvements IS NOT NULL AND jsonb_array_length(NEW.protocol_improvements) > 0 THEN

    -- Iterate through protocol_improvements array
    FOR improvement_item IN SELECT * FROM jsonb_array_elements(NEW.protocol_improvements)
    LOOP
      -- Extract fields from improvement item
      improvement_desc := improvement_item->>'improvement';
      improvement_type := CASE
        WHEN improvement_item->>'category' = 'validation' THEN 'VALIDATION_RULE'
        WHEN improvement_item->>'category' = 'checklist' THEN 'CHECKLIST_ITEM'
        WHEN improvement_item->>'category' = 'skill' THEN 'SKILL_UPDATE'
        WHEN improvement_item->>'category' = 'documentation' THEN 'PROTOCOL_SECTION'
        WHEN improvement_item->>'category' = 'sub_agent' THEN 'SUB_AGENT_CONFIG'
        ELSE 'PROTOCOL_SECTION' -- default
      END;

      target_phase := COALESCE(improvement_item->>'affected_phase', 'ALL');

      -- Check for existing similar improvement (consolidation)
      SELECT id INTO existing_queue_id
      FROM protocol_improvement_queue
      WHERE description = improvement_desc
        AND improvement_type = improvement_type
        AND status IN ('PENDING', 'APPROVED')
      LIMIT 1;

      IF existing_queue_id IS NOT NULL THEN
        -- Update evidence count for existing improvement
        UPDATE protocol_improvement_queue
        SET evidence_count = evidence_count + 1,
            updated_at = NOW()
        WHERE id = existing_queue_id;
      ELSE
        -- Insert new improvement
        INSERT INTO protocol_improvement_queue (
          source_retro_id,
          source_type,
          improvement_type,
          target_table,
          target_operation,
          payload,
          target_phase,
          description,
          evidence_count,
          auto_applicable
        ) VALUES (
          NEW.id,
          NEW.retrospective_type,
          improvement_type,
          -- Map improvement type to target table
          CASE improvement_type
            WHEN 'VALIDATION_RULE' THEN 'leo_validation_rules'
            WHEN 'CHECKLIST_ITEM' THEN 'leo_protocol_sections'
            WHEN 'SKILL_UPDATE' THEN 'leo_protocol_sections'
            WHEN 'PROTOCOL_SECTION' THEN 'leo_protocol_sections'
            WHEN 'SUB_AGENT_CONFIG' THEN 'leo_sub_agents'
          END,
          'INSERT', -- Default to INSERT, can be manually changed if needed
          improvement_item, -- Store full JSONB as payload
          target_phase,
          improvement_desc,
          1, -- Initial evidence count
          improvement_type IN ('CHECKLIST_ITEM') -- Only checklist items are auto-applicable
        );
      END IF;
    END LOOP;
  END IF;

  -- Also extract from failure_patterns if they indicate process issues
  IF NEW.failure_patterns IS NOT NULL AND array_length(NEW.failure_patterns, 1) > 0 THEN
    FOREACH failure_item IN ARRAY NEW.failure_patterns
    LOOP
      -- Only extract failure patterns that suggest protocol improvements
      IF failure_item ILIKE '%should have%' OR
         failure_item ILIKE '%missing validation%' OR
         failure_item ILIKE '%need checklist%' OR
         failure_item ILIKE '%protocol%' THEN

        -- Check for existing similar improvement
        SELECT id INTO existing_queue_id
        FROM protocol_improvement_queue
        WHERE description = failure_item
          AND status IN ('PENDING', 'APPROVED')
        LIMIT 1;

        IF existing_queue_id IS NOT NULL THEN
          UPDATE protocol_improvement_queue
          SET evidence_count = evidence_count + 1,
              updated_at = NOW()
          WHERE id = existing_queue_id;
        ELSE
          INSERT INTO protocol_improvement_queue (
            source_retro_id,
            source_type,
            improvement_type,
            target_table,
            target_operation,
            payload,
            description,
            evidence_count,
            auto_applicable
          ) VALUES (
            NEW.id,
            NEW.retrospective_type,
            'PROTOCOL_SECTION', -- Default type for failure patterns
            'leo_protocol_sections',
            'INSERT',
            jsonb_build_object('failure_pattern', failure_item),
            failure_item,
            1,
            FALSE
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS extract_improvements_trigger ON retrospectives;
CREATE TRIGGER extract_improvements_trigger
  AFTER INSERT OR UPDATE OF protocol_improvements, failure_patterns
  ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION extract_protocol_improvements_from_retro();

COMMENT ON FUNCTION extract_protocol_improvements_from_retro IS
'Automatically extracts protocol improvements from retrospectives and inserts into protocol_improvement_queue. Consolidates similar improvements by incrementing evidence_count.';

-- =====================================================================================
-- PART 4: HELPER VIEWS
-- =====================================================================================

-- View 1: Pending improvements grouped by evidence count
CREATE OR REPLACE VIEW v_pending_improvements AS
SELECT
  improvement_type,
  target_table,
  target_phase,
  description,
  evidence_count,
  COUNT(*) as occurrence_count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  ARRAY_AGG(DISTINCT source_type) as seen_in_phases,
  ARRAY_AGG(id ORDER BY created_at DESC) as queue_ids
FROM protocol_improvement_queue
WHERE status = 'PENDING'
GROUP BY improvement_type, target_table, target_phase, description, evidence_count
ORDER BY evidence_count DESC, occurrence_count DESC;

COMMENT ON VIEW v_pending_improvements IS
'Shows pending protocol improvements grouped by similarity, with evidence count and occurrence tracking. Use this to prioritize high-evidence improvements.';

-- View 2: Improvement effectiveness tracking
CREATE OR REPLACE VIEW v_improvement_effectiveness AS
SELECT
  piq.id,
  piq.improvement_type,
  piq.description,
  piq.evidence_count,
  piq.applied_at,
  piq.effectiveness_score,
  piq.target_table,
  COUNT(DISTINCT r.id) as retrospectives_referencing,
  ARRAY_AGG(DISTINCT r.sd_id) FILTER (WHERE r.sd_id IS NOT NULL) as affected_sds
FROM protocol_improvement_queue piq
LEFT JOIN retrospectives r ON r.id = piq.source_retro_id
WHERE piq.status = 'APPLIED'
GROUP BY piq.id, piq.improvement_type, piq.description, piq.evidence_count,
         piq.applied_at, piq.effectiveness_score, piq.target_table
ORDER BY piq.effectiveness_score DESC NULLS LAST, piq.applied_at DESC;

COMMENT ON VIEW v_improvement_effectiveness IS
'Tracks effectiveness of applied protocol improvements. Use this to measure ROI of protocol changes and identify high-value improvement types.';

-- =====================================================================================
-- PART 5: HELPER FUNCTIONS
-- =====================================================================================

-- Function 1: Apply protocol improvement
CREATE OR REPLACE FUNCTION apply_protocol_improvement(queue_id UUID)
RETURNS JSONB AS $$
DECLARE
  improvement_record RECORD;
  result JSONB;
BEGIN
  -- Get improvement record
  SELECT * INTO improvement_record
  FROM protocol_improvement_queue
  WHERE id = queue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Queue item not found'
    );
  END IF;

  IF improvement_record.status != 'APPROVED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item must be APPROVED before application',
      'current_status', improvement_record.status
    );
  END IF;

  -- Mark as applied (actual database changes must be done manually by reviewing the payload)
  UPDATE protocol_improvement_queue
  SET status = 'APPLIED',
      applied_at = NOW()
  WHERE id = queue_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Improvement marked as applied. Ensure manual database changes match payload.',
    'target_table', improvement_record.target_table,
    'payload', improvement_record.payload
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_protocol_improvement IS
'Marks a protocol improvement as applied. Does NOT automatically modify target tables - you must manually apply changes using the payload. This is intentional to maintain human oversight.';

-- Function 2: Consolidate similar improvements
CREATE OR REPLACE FUNCTION consolidate_similar_improvements()
RETURNS TABLE(
  consolidated_count INTEGER,
  improvement_type TEXT,
  description TEXT,
  new_evidence_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH duplicates AS (
    SELECT
      description,
      improvement_type,
      target_table,
      MIN(id) as keep_id,
      ARRAY_AGG(id) as all_ids,
      SUM(evidence_count) as total_evidence
    FROM protocol_improvement_queue
    WHERE status = 'PENDING'
    GROUP BY description, improvement_type, target_table
    HAVING COUNT(*) > 1
  )
  UPDATE protocol_improvement_queue piq
  SET evidence_count = d.total_evidence,
      status = CASE WHEN piq.id = d.keep_id THEN 'PENDING' ELSE 'SUPERSEDED' END,
      updated_at = NOW()
  FROM duplicates d
  WHERE piq.id = ANY(d.all_ids)
  RETURNING
    array_length(d.all_ids, 1) - 1 as consolidated_count,
    piq.improvement_type,
    piq.description,
    d.total_evidence as new_evidence_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION consolidate_similar_improvements IS
'Consolidates duplicate pending improvements by summing evidence_count and marking duplicates as SUPERSEDED. Run this periodically to keep queue clean.';

-- Function 3: Get pre-handoff warnings
CREATE OR REPLACE FUNCTION get_pre_handoff_warnings(handoff_type TEXT)
RETURNS TABLE(
  warning_text TEXT,
  evidence_count INTEGER,
  improvement_type TEXT,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    piq.description as warning_text,
    piq.evidence_count,
    piq.improvement_type,
    piq.created_at as last_seen
  FROM protocol_improvement_queue piq
  WHERE piq.status IN ('PENDING', 'APPROVED')
    AND (
      (handoff_type = 'LEAD_TO_PLAN' AND piq.source_type = 'LEAD_TO_PLAN') OR
      (handoff_type = 'PLAN_TO_EXEC' AND piq.source_type = 'PLAN_TO_EXEC') OR
      (handoff_type IN ('LEAD_TO_PLAN', 'PLAN_TO_EXEC') AND piq.target_phase = 'ALL')
    )
  ORDER BY piq.evidence_count DESC, piq.created_at DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pre_handoff_warnings IS
'Returns relevant protocol improvement warnings before a handoff. Use this to warn agents about known issues before they execute a phase transition.';

-- =====================================================================================
-- PART 6: RLS POLICIES
-- =====================================================================================

-- Enable RLS
ALTER TABLE protocol_improvement_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY service_role_all_protocol_queue
ON protocol_improvement_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY authenticated_read_protocol_queue
ON protocol_improvement_queue
FOR SELECT
TO authenticated
USING (true);

-- =====================================================================================
-- PART 7: GRANTS
-- =====================================================================================

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON protocol_improvement_queue TO authenticated;
GRANT ALL ON protocol_improvement_queue TO service_role;

GRANT EXECUTE ON FUNCTION apply_protocol_improvement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION consolidate_similar_improvements() TO authenticated;
GRANT EXECUTE ON FUNCTION get_pre_handoff_warnings(TEXT) TO authenticated;

-- Grant view access
GRANT SELECT ON v_pending_improvements TO authenticated;
GRANT SELECT ON v_improvement_effectiveness TO authenticated;

-- =====================================================================================
-- PART 8: VERIFICATION QUERIES
-- =====================================================================================

-- Run these queries to verify the migration succeeded:

-- 1. Check retrospective_type column exists
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'retrospectives' AND column_name = 'retrospective_type';

-- 2. Check protocol_improvement_queue table exists
-- SELECT COUNT(*) FROM protocol_improvement_queue;

-- 3. Check trigger exists
-- SELECT trigger_name, event_manipulation
-- FROM information_schema.triggers
-- WHERE event_object_table = 'retrospectives'
--   AND trigger_name = 'extract_improvements_trigger';

-- 4. Check views exist
-- SELECT table_name FROM information_schema.views
-- WHERE table_name IN ('v_pending_improvements', 'v_improvement_effectiveness');

-- 5. Check functions exist
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name IN ('apply_protocol_improvement', 'consolidate_similar_improvements', 'get_pre_handoff_warnings');

-- =====================================================================================
-- ROLLBACK INSTRUCTIONS
-- =====================================================================================

-- To rollback this migration, run the following in order:

-- DROP TRIGGER IF EXISTS extract_improvements_trigger ON retrospectives;
-- DROP FUNCTION IF EXISTS extract_protocol_improvements_from_retro();
-- DROP FUNCTION IF EXISTS apply_protocol_improvement(UUID);
-- DROP FUNCTION IF EXISTS consolidate_similar_improvements();
-- DROP FUNCTION IF EXISTS get_pre_handoff_warnings(TEXT);
-- DROP VIEW IF EXISTS v_pending_improvements;
-- DROP VIEW IF EXISTS v_improvement_effectiveness;
-- DROP TABLE IF EXISTS protocol_improvement_queue;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS retrospective_type;
-- DROP INDEX IF EXISTS idx_retrospectives_retrospective_type;

-- =====================================================================================
-- USAGE EXAMPLES
-- =====================================================================================

-- Example 1: Query pending improvements by evidence count
-- SELECT * FROM v_pending_improvements ORDER BY evidence_count DESC LIMIT 10;

-- Example 2: Get warnings before LEAD→PLAN handoff
-- SELECT * FROM get_pre_handoff_warnings('LEAD_TO_PLAN');

-- Example 3: Approve an improvement
-- UPDATE protocol_improvement_queue
-- SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = 'claude'
-- WHERE id = '<queue_id>';

-- Example 4: Apply an approved improvement
-- SELECT apply_protocol_improvement('<queue_id>');

-- Example 5: Consolidate duplicate improvements
-- SELECT * FROM consolidate_similar_improvements();

-- Example 6: Track effectiveness of applied improvements
-- SELECT * FROM v_improvement_effectiveness WHERE effectiveness_score > 75;

-- Example 7: Insert test retrospective with protocol improvement
-- INSERT INTO retrospectives (
--   sd_id, retro_type, title, retrospective_type, quality_score,
--   target_application, learning_category, protocol_improvements
-- ) VALUES (
--   'SD-TEST-001', 'SD_COMPLETION', 'Test Retro', 'SD_COMPLETION', 85,
--   'EHG_Engineer', 'PROCESS_IMPROVEMENT',
--   '[{"category":"validation","improvement":"Add validation for X","evidence":"Saw 3 times","impact":"HIGH","affected_phase":"PLAN"}]'::jsonb
-- );

-- =====================================================================================
-- MIGRATION COMPLETE
-- =====================================================================================

-- This migration creates a comprehensive self-improvement system for LEO Protocol.
-- Key features:
--   ✓ Retrospective type classification
--   ✓ Protocol improvement queue (database-first)
--   ✓ Automatic extraction from retrospectives
--   ✓ Consolidation of similar improvements
--   ✓ Pre-handoff warning system
--   ✓ Effectiveness tracking
--   ✓ Helper views and functions

-- Next steps:
-- 1. Run verification queries above
-- 2. Test with sample retrospective
-- 3. Review pending improvements: SELECT * FROM v_pending_improvements;
-- 4. Integrate with handoff scripts to show warnings
