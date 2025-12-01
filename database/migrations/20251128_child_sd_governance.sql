-- LEO Protocol v4.3.3 - Child SD Governance Enhancement
-- Purpose: Establish proper parent/child SD relationships with workflow controls
-- Reference: docs/recommendations/child-sd-pattern-for-phased-work.md

-- ============================================================================
-- 1. ADD parent_sd_id COLUMN (if not exists)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'parent_sd_id'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN parent_sd_id TEXT REFERENCES strategic_directives_v2(id);

    COMMENT ON COLUMN strategic_directives_v2.parent_sd_id IS
      'Parent SD ID for child SDs. Child SDs inherit workflow from parent or follow independent cycles.';
  END IF;
END $$;

-- ============================================================================
-- 2. ADD relationship_type COLUMN
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'relationship_type'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN relationship_type TEXT DEFAULT 'standalone'
    CHECK (relationship_type IN ('standalone', 'parent', 'child_phase', 'child_independent'));

    COMMENT ON COLUMN strategic_directives_v2.relationship_type IS
      'SD relationship type: standalone (normal), parent (orchestrator), child_phase (inherits workflow from parent), child_independent (own full workflow)';
  END IF;
END $$;

-- Create index for parent lookups
CREATE INDEX IF NOT EXISTS idx_sd_parent_sd_id ON strategic_directives_v2(parent_sd_id);

-- ============================================================================
-- 3. CREATE VIEW: sd_family_tree (parent-child relationships)
-- ============================================================================

CREATE OR REPLACE VIEW sd_family_tree AS
SELECT
  parent.id AS parent_id,
  parent.title AS parent_title,
  parent.status AS parent_status,
  parent.current_phase AS parent_phase,
  parent.checkpoint_plan->'total_checkpoints' AS checkpoint_count,
  child.id AS child_id,
  child.title AS child_title,
  child.status AS child_status,
  child.current_phase AS child_phase,
  child.relationship_type,
  child.priority AS child_priority,
  child.progress AS child_progress,
  CASE child.priority
    WHEN 'critical' THEN 0.40
    WHEN 'high' THEN 0.30
    WHEN 'medium' THEN 0.20
    WHEN 'low' THEN 0.10
    ELSE 0.25
  END AS child_weight
FROM strategic_directives_v2 parent
JOIN strategic_directives_v2 child ON child.parent_sd_id = parent.id
WHERE parent.relationship_type = 'parent'
ORDER BY parent.id, child.priority DESC, child.id;

-- ============================================================================
-- 4. FUNCTION: Calculate parent SD progress from children
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_parent_sd_progress(p_sd_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_child_count INTEGER;
  v_total_weight NUMERIC := 0;
  v_weighted_progress NUMERIC := 0;
  v_child RECORD;
BEGIN
  -- Check if this SD has children
  SELECT COUNT(*) INTO v_child_count
  FROM strategic_directives_v2
  WHERE parent_sd_id = p_sd_id;

  IF v_child_count = 0 THEN
    -- No children, return NULL to use standard progress
    RETURN NULL;
  END IF;

  -- Calculate weighted progress from children
  FOR v_child IN
    SELECT
      progress,
      CASE priority
        WHEN 'critical' THEN 0.40
        WHEN 'high' THEN 0.30
        WHEN 'medium' THEN 0.20
        WHEN 'low' THEN 0.10
        ELSE 0.25
      END AS weight
    FROM strategic_directives_v2
    WHERE parent_sd_id = p_sd_id
  LOOP
    v_total_weight := v_total_weight + v_child.weight;
    v_weighted_progress := v_weighted_progress + (v_child.progress * v_child.weight);
  END LOOP;

  IF v_total_weight = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_weighted_progress / v_total_weight);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCTION: Validate child SD phase transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_child_sd_phase_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_phase TEXT;
  v_parent_status TEXT;
  v_relationship_type TEXT;
BEGIN
  -- Only validate if this is a child SD with parent
  IF NEW.parent_sd_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get relationship type
  v_relationship_type := COALESCE(NEW.relationship_type, 'child_phase');

  -- Child SDs with 'child_phase' relationship inherit workflow from parent
  IF v_relationship_type = 'child_phase' THEN
    -- Get parent's phase and status
    SELECT current_phase, status INTO v_parent_phase, v_parent_status
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    -- Parent must be in EXEC phase for child_phase SDs to be activated
    IF NEW.status IN ('active', 'in_progress')
       AND v_parent_phase != 'EXEC' THEN
      RAISE EXCEPTION 'LEO Protocol: Child SD % cannot be activated while parent % is in % phase. Parent must be in EXEC phase first.',
        NEW.id, NEW.parent_sd_id, v_parent_phase;
    END IF;

    -- Child inherits phase from parent for child_phase type
    IF NEW.current_phase != v_parent_phase
       AND NEW.status IN ('active', 'in_progress') THEN
      NEW.current_phase := v_parent_phase;
      RAISE NOTICE 'LEO Protocol: Child SD % phase synchronized with parent (%) to %',
        NEW.id, NEW.parent_sd_id, v_parent_phase;
    END IF;
  END IF;

  -- child_independent SDs go through full LEO cycle independently
  -- No additional validation needed - they follow standard SD rules

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for child SD validation
DROP TRIGGER IF EXISTS validate_child_sd_phase ON strategic_directives_v2;
CREATE TRIGGER validate_child_sd_phase
  BEFORE INSERT OR UPDATE OF status, current_phase
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_child_sd_phase_transition();

-- ============================================================================
-- 6. LOG THE MIGRATION
-- ============================================================================

INSERT INTO leo_protocol_changes (
  protocol_id,
  change_type,
  description,
  changed_fields,
  change_reason,
  changed_by
) VALUES (
  'leo-v4-3-3-ui-parity',
  'schema_enhancement',
  'Child SD Governance - Parent/Child SD Relationship Controls',
  '{
    "columns_added": ["parent_sd_id", "relationship_type"],
    "views_created": ["sd_family_tree"],
    "functions_created": ["calculate_parent_sd_progress", "validate_child_sd_phase_transition"],
    "triggers_created": ["validate_child_sd_phase"]
  }',
  'Establish proper parent/child SD relationships with workflow controls. Addresses gap identified during SD-UI-PARITY-001 implementation where child SDs lacked clear governance.',
  'SD-UI-PARITY-001-CHILD-SD-GOVERNANCE'
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '
=============================================================================
CHILD SD GOVERNANCE MIGRATION COMPLETE
=============================================================================

NEW COLUMNS:
  parent_sd_id - Links child SD to parent
  relationship_type - Defines child behavior:
    - standalone: Normal SD (default)
    - parent: Orchestrator SD (has children)
    - child_phase: Inherits workflow from parent (shares EXEC phase)
    - child_independent: Own full LEO cycle

NEW VIEW:
  sd_family_tree - Shows parent/child relationships with progress

NEW FUNCTIONS:
  calculate_parent_sd_progress() - Weighted progress from children
  validate_child_sd_phase_transition() - Enforces child/parent rules

RELATIONSHIP TYPES:
  child_phase: Use when children share parent''s EXEC phase
               - Children activated when parent enters EXEC
               - Children inherit phase from parent
               - Progress rolls up to parent

  child_independent: Use when children need own full workflow
               - Each child goes through LEAD→PLAN→EXEC cycle
               - Own handoffs required for each child

USAGE:
  -- Create child SD linked to parent
  UPDATE strategic_directives_v2
  SET parent_sd_id = ''SD-UI-PARITY-001'',
      relationship_type = ''child_phase''
  WHERE id = ''SD-UI-PARITY-001A'';

  -- View family tree
  SELECT * FROM sd_family_tree WHERE parent_id = ''SD-UI-PARITY-001'';
=============================================================================';
END $$;
