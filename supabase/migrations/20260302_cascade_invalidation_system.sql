-- =============================================================
-- CASCADE INVALIDATION SYSTEM
-- SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-015
-- Dimensions: V09 (Strategic Governance Cascade), V06 (CLI Authority)
-- =============================================================

-- 1. cascade_invalidation_log — append-only audit of vision changes
CREATE TABLE IF NOT EXISTS cascade_invalidation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  source_key TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('version_bump', 'content_update', 'dimension_change', 'status_change')),
  old_version INT,
  new_version INT,
  changed_by TEXT,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. cascade_invalidation_flags — active work queue for stale documents
CREATE TABLE IF NOT EXISTS cascade_invalidation_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invalidation_log_id UUID NOT NULL REFERENCES cascade_invalidation_log(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('architecture_plan', 'objective', 'key_result', 'strategy')),
  document_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

-- 3. okr_vision_alignment_records — track OKR-to-vision alignment scores
CREATE TABLE IF NOT EXISTS okr_vision_alignment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID,
  key_result_id UUID,
  vision_document_id UUID NOT NULL,
  alignment_score NUMERIC(3,2) CHECK (alignment_score >= 0 AND alignment_score <= 1),
  alignment_notes TEXT,
  scored_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT at_least_one_target CHECK (objective_id IS NOT NULL OR key_result_id IS NOT NULL)
);

-- 4. Add version-pinning columns to eva_architecture_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eva_architecture_plans' AND column_name = 'vision_version_aligned_to'
  ) THEN
    ALTER TABLE eva_architecture_plans ADD COLUMN vision_version_aligned_to INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eva_architecture_plans' AND column_name = 'needs_review_since'
  ) THEN
    ALTER TABLE eva_architecture_plans ADD COLUMN needs_review_since TIMESTAMPTZ;
  END IF;
END $$;

-- 5. Add version-pinning columns to objectives
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'objectives' AND column_name = 'vision_version_aligned_to'
  ) THEN
    ALTER TABLE objectives ADD COLUMN vision_version_aligned_to INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'objectives' AND column_name = 'needs_review_since'
  ) THEN
    ALTER TABLE objectives ADD COLUMN needs_review_since TIMESTAMPTZ;
  END IF;
END $$;

-- 6. Indexes for hot query paths
CREATE INDEX IF NOT EXISTS idx_cascade_inv_flags_status
  ON cascade_invalidation_flags(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cascade_inv_flags_doc
  ON cascade_invalidation_flags(document_type, document_id);

CREATE INDEX IF NOT EXISTS idx_cascade_inv_log_source
  ON cascade_invalidation_log(source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_okr_vision_alignment_obj
  ON okr_vision_alignment_records(objective_id) WHERE objective_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_plans_needs_review
  ON eva_architecture_plans(needs_review_since) WHERE needs_review_since IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_objectives_needs_review
  ON objectives(needs_review_since) WHERE needs_review_since IS NOT NULL;

-- 7. Trigger function: auto-flag downstream on vision version bump
CREATE OR REPLACE FUNCTION fn_cascade_invalidation_on_vision_update()
RETURNS TRIGGER AS $$
DECLARE
  v_log_id UUID;
  v_arch_plan RECORD;
  v_objective RECORD;
BEGIN
  -- Only fire if version actually changed
  IF OLD.version IS DISTINCT FROM NEW.version THEN
    -- Insert invalidation log entry
    INSERT INTO cascade_invalidation_log (
      source_table, source_id, source_key,
      change_type, old_version, new_version,
      changed_by, change_summary
    ) VALUES (
      'eva_vision_documents', NEW.id, NEW.vision_key,
      'version_bump', OLD.version, NEW.version,
      NEW.created_by, 'Vision document version updated'
    ) RETURNING id INTO v_log_id;

    -- Flag all architecture plans linked to this vision
    FOR v_arch_plan IN
      SELECT id FROM eva_architecture_plans
      WHERE vision_id = NEW.id OR vision_key = NEW.vision_key
    LOOP
      INSERT INTO cascade_invalidation_flags (
        invalidation_log_id, document_type, document_id
      ) VALUES (v_log_id, 'architecture_plan', v_arch_plan.id);

      UPDATE eva_architecture_plans
      SET needs_review_since = now()
      WHERE id = v_arch_plan.id AND needs_review_since IS NULL;
    END LOOP;

    -- Flag all objectives linked to this vision
    -- objectives.vision_id references strategic_vision, not eva_vision_documents
    -- We match via vision_key pattern or through strategic_vision linkage
    FOR v_objective IN
      SELECT o.id FROM objectives o
      JOIN strategic_vision sv ON o.vision_id = sv.id
      WHERE sv.code = NEW.vision_key OR sv.title ILIKE '%' || split_part(NEW.vision_key, '-', 3) || '%'
    LOOP
      INSERT INTO cascade_invalidation_flags (
        invalidation_log_id, document_type, document_id
      ) VALUES (v_log_id, 'objective', v_objective.id);

      UPDATE objectives
      SET needs_review_since = now()
      WHERE id = v_objective.id AND needs_review_since IS NULL;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to eva_vision_documents
DROP TRIGGER IF EXISTS trg_cascade_invalidation_on_vision_update ON eva_vision_documents;
CREATE TRIGGER trg_cascade_invalidation_on_vision_update
  AFTER UPDATE ON eva_vision_documents
  FOR EACH ROW
  EXECUTE FUNCTION fn_cascade_invalidation_on_vision_update();

-- 8. RLS Policies
ALTER TABLE cascade_invalidation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_invalidation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_vision_alignment_records ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all_cascade_log" ON cascade_invalidation_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_cascade_flags" ON cascade_invalidation_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_okr_alignment" ON okr_vision_alignment_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "authenticated_read_cascade_log" ON cascade_invalidation_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_cascade_flags" ON cascade_invalidation_flags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_okr_alignment" ON okr_vision_alignment_records
  FOR SELECT TO authenticated USING (true);

-- 9. updated_at trigger for okr_vision_alignment_records
CREATE OR REPLACE FUNCTION fn_update_okr_alignment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_okr_alignment_updated_at ON okr_vision_alignment_records;
CREATE TRIGGER trg_okr_alignment_updated_at
  BEFORE UPDATE ON okr_vision_alignment_records
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_okr_alignment_timestamp();
