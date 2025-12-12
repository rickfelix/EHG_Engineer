-- LEO Protocol v4.3.4 - Simplify Parent-Child SD Model (Option D)
-- Purpose: Remove child_phase/child_independent, use single 'child' type with batch approval
-- Reference: docs/plans/PLAN-PARENT-CHILD-SD-PROTOCOL-CLARITY-V2.md

-- ============================================================================
-- 1. MIGRATE EXISTING CHILD SDs FIRST
-- ============================================================================

-- Convert child_phase and child_independent to 'child'
UPDATE strategic_directives_v2
SET relationship_type = 'child'
WHERE relationship_type IN ('child_phase', 'child_independent');

-- ============================================================================
-- 2. UPDATE relationship_type CONSTRAINT
-- ============================================================================

-- Drop old constraint
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_relationship_type_check;

-- Add new constraint (standalone, parent, child only)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_relationship_type_check
CHECK (relationship_type IN ('standalone', 'parent', 'child'));

-- ============================================================================
-- 3. ADD dependency_chain COLUMN
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'dependency_chain'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN dependency_chain JSONB;

    COMMENT ON COLUMN strategic_directives_v2.dependency_chain IS
      'For parent SDs: ordered list of child SD IDs with dependencies. Format: {"children": [{"sd_id": "SD-X", "order": 1, "depends_on": null}]}';
  END IF;
END $$;

-- ============================================================================
-- 4. UPDATE VALIDATION TRIGGER (Sequential Execution)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_child_sd_sequence()
RETURNS TRIGGER AS $$
DECLARE
  v_parent RECORD;
  v_child_info RECORD;
  v_dependency_id TEXT;
  v_dependency_status TEXT;
BEGIN
  -- Only validate child SDs entering exec_active or in_progress
  IF NEW.relationship_type != 'child' OR NEW.status NOT IN ('exec_active', 'in_progress') THEN
    RETURN NEW;
  END IF;

  -- Get parent SD with dependency_chain
  SELECT id, dependency_chain INTO v_parent
  FROM strategic_directives_v2
  WHERE id = NEW.parent_sd_id;

  -- If no dependency chain defined, allow execution
  IF v_parent.dependency_chain IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find this child in the dependency chain
  SELECT child->>'depends_on' INTO v_dependency_id
  FROM jsonb_array_elements(v_parent.dependency_chain->'children') AS child
  WHERE child->>'sd_id' = NEW.id;

  -- If this child has a dependency, check it's completed
  IF v_dependency_id IS NOT NULL THEN
    SELECT status INTO v_dependency_status
    FROM strategic_directives_v2
    WHERE id = v_dependency_id;

    IF v_dependency_status IS NULL THEN
      RAISE EXCEPTION 'LEO Protocol: Child SD % dependency % not found', NEW.id, v_dependency_id;
    END IF;

    IF v_dependency_status != 'completed' THEN
      RAISE EXCEPTION 'LEO Protocol: Child SD % cannot start until dependency % completes (current status: %)',
        NEW.id, v_dependency_id, v_dependency_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS validate_child_sd_phase ON strategic_directives_v2;
DROP TRIGGER IF EXISTS validate_child_sd_sequence ON strategic_directives_v2;

-- Create new trigger
CREATE TRIGGER validate_child_sd_sequence
  BEFORE UPDATE OF status
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_child_sd_sequence();

-- ============================================================================
-- 5. UPDATE sd_family_tree VIEW
-- ============================================================================

DROP VIEW IF EXISTS sd_family_tree;

CREATE VIEW sd_family_tree AS
SELECT
  parent.id AS parent_id,
  parent.title AS parent_title,
  parent.status AS parent_status,
  parent.current_phase AS parent_phase,
  parent.dependency_chain,
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
  END AS child_weight,
  -- Extract dependency info from parent's dependency_chain
  (
    SELECT dep_child->>'depends_on'
    FROM jsonb_array_elements(parent.dependency_chain->'children') AS dep_child
    WHERE dep_child->>'sd_id' = child.id
  ) AS depends_on,
  (
    SELECT (dep_child->>'order')::INTEGER
    FROM jsonb_array_elements(parent.dependency_chain->'children') AS dep_child
    WHERE dep_child->>'sd_id' = child.id
  ) AS execution_order
FROM strategic_directives_v2 parent
JOIN strategic_directives_v2 child ON child.parent_sd_id = parent.id
WHERE parent.relationship_type = 'parent'
ORDER BY parent.id, execution_order NULLS LAST, child.priority DESC, child.id;

-- ============================================================================
-- 6. HELPER FUNCTION: Get Next Child to Execute
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_child_sd(p_parent_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_next_child TEXT;
BEGIN
  -- Find first child in dependency chain that is not completed
  SELECT child->>'sd_id' INTO v_next_child
  FROM jsonb_array_elements(
    (SELECT dependency_chain->'children'
     FROM strategic_directives_v2
     WHERE id = p_parent_id)
  ) AS child
  WHERE NOT EXISTS (
    SELECT 1 FROM strategic_directives_v2
    WHERE id = child->>'sd_id'
    AND status = 'completed'
  )
  ORDER BY (child->>'order')::INTEGER
  LIMIT 1;

  RETURN v_next_child;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_child_sd IS
  'Returns the next child SD ID that should be executed based on dependency chain order';

-- ============================================================================
-- 7. UPDATE PROGRESS CALCULATION (No Changes Needed)
-- ============================================================================

-- calculate_parent_sd_progress() function already exists and works correctly
-- It calculates weighted average from children regardless of relationship_type

-- ============================================================================
-- 8. LOG THE MIGRATION
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
  'schema_simplification',
  'Simplify Parent-Child SD Model - Remove child_phase/child_independent, use single child type',
  '{
    "constraint_updated": "relationship_type CHECK",
    "values_removed": ["child_phase", "child_independent"],
    "values_added": ["child"],
    "column_added": "dependency_chain",
    "trigger_updated": "validate_child_sd_sequence",
    "view_updated": "sd_family_tree",
    "function_added": "get_next_child_sd"
  }',
  'Option D simplification: Every child goes through full LEAD→PLAN→EXEC, parent provides batch LEAD approval, children execute sequentially per dependency chain',
  'PLAN-PARENT-CHILD-SD-PROTOCOL-CLARITY-V2'
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_old_child_count INTEGER;
  v_new_child_count INTEGER;
BEGIN
  -- Count migrated children
  SELECT COUNT(*) INTO v_new_child_count
  FROM strategic_directives_v2
  WHERE relationship_type = 'child';

  RAISE NOTICE '
=============================================================================
PARENT-CHILD SD SIMPLIFICATION COMPLETE (Option D)
=============================================================================

RELATIONSHIP TYPES (Simplified):
  - standalone: Normal SD (default)
  - parent: Orchestrator, no implementation code
  - child: Has parent_sd_id, full LEAD→PLAN→EXEC workflow

MIGRATED:
  - child_phase → child: % records
  - child_independent → child: % records

NEW FEATURES:
  - dependency_chain column: Defines sequential execution order
  - validate_child_sd_sequence trigger: Enforces dependencies
  - get_next_child_sd() function: Returns next child to execute
  - sd_family_tree view: Shows execution order and dependencies

WORKFLOW:
  Parent: LEAD → PLAN (creates children) → waits
  Children: PLAN → EXEC → Complete (sequential per dependency_chain)
  Parent: Auto-completes after last child

EXAMPLE dependency_chain:
  {
    "children": [
      {"sd_id": "SD-X-A", "order": 1, "depends_on": null},
      {"sd_id": "SD-X-B", "order": 2, "depends_on": "SD-X-A"},
      {"sd_id": "SD-X-C", "order": 3, "depends_on": "SD-X-B"}
    ]
  }

NEXT STEPS:
  1. Insert protocol sections: node scripts/insert-parent-child-protocol-sections.js
  2. Regenerate CLAUDE files: node scripts/generate-claude-md-from-db.js
=============================================================================', v_new_child_count, v_new_child_count;
END $$;
