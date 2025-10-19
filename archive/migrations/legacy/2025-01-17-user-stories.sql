-- User Story System Migration (AMENDED)
-- Idempotent, RLS-safe, additive-only changes
-- Version: 1.1.0
-- Date: 2025-01-17

BEGIN;

-- 0. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Extend sd_backlog_map with story-specific columns
ALTER TABLE sd_backlog_map
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'story'
    CHECK (item_type IN ('epic', 'story', 'task')),
  ADD COLUMN IF NOT EXISTS parent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS sequence_no INTEGER,
  ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'not_run'
    CHECK (verification_status IN ('not_run', 'failing', 'passing')),
  ADD COLUMN IF NOT EXISTS verification_source JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_run_id UUID DEFAULT gen_random_uuid();

-- 2. Add data integrity constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uk_sd_backlog_map_sd_backlog'
  ) THEN
    ALTER TABLE sd_backlog_map
    ADD CONSTRAINT uk_sd_backlog_map_sd_backlog UNIQUE (sd_id, backlog_id);
  END IF;
END $$;

-- Add FK constraint to strategic_directives_v2
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sd_backlog_map_sd_id'
  ) THEN
    ALTER TABLE sd_backlog_map
    ADD CONSTRAINT fk_sd_backlog_map_sd_id
    FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Add optimized indexes for performance
CREATE INDEX IF NOT EXISTS idx_story_list
  ON sd_backlog_map(sd_id, item_type, sequence_no)
  INCLUDE (backlog_id, backlog_title, verification_status, verification_source, last_verified_at)
  WHERE item_type IN ('story', 'task');

CREATE INDEX IF NOT EXISTS idx_backlog_parent
  ON sd_backlog_map(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backlog_verification
  ON sd_backlog_map(verification_status, sd_id) WHERE item_type = 'story';

-- 4. Create story verification status view (no ORDER BY)
CREATE OR REPLACE VIEW v_story_verification_status AS
SELECT
  sd_id AS sd_key,
  backlog_id AS story_key,
  backlog_title AS story_title,
  item_type,
  sequence_no,
  verification_status AS status,
  last_verified_at AS last_run_at,
  verification_source->>'build_id' AS build_id,
  (verification_source->>'coverage_pct')::numeric AS coverage_pct,
  verification_source->>'test_run_id' AS test_run_id,
  acceptance_criteria,
  priority,
  parent_id
FROM sd_backlog_map
WHERE item_type IN ('story', 'task');

-- 5. Create release gate view
CREATE OR REPLACE VIEW v_sd_release_gate AS
SELECT
  sd_id AS sd_key,
  COUNT(*) AS total_stories,
  COUNT(*) FILTER (WHERE verification_status = 'passing') AS passing_count,
  COUNT(*) FILTER (WHERE verification_status = 'failing') AS failing_count,
  COUNT(*) FILTER (WHERE verification_status = 'not_run') AS not_run_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE verification_status = 'passing') /
    NULLIF(COUNT(*), 0), 2) AS passing_pct,
  (COUNT(*) FILTER (WHERE verification_status = 'passing') = COUNT(*)
    AND COUNT(*) > 0) AS ready
FROM sd_backlog_map
WHERE item_type = 'story'
GROUP BY sd_id;

-- 6. Story generation function (CORRECTED)
CREATE OR REPLACE FUNCTION fn_generate_stories_from_prd(
  p_sd_key TEXT,
  p_prd_id UUID,
  p_mode TEXT DEFAULT 'create'
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stories JSONB := '[]'::jsonb;
  v_criteria JSONB;
  v_story_key TEXT;
  v_seq INTEGER := 1;
  v_row_count INTEGER;
  criterion JSONB;
  v_inserted BOOLEAN;
BEGIN
  -- Validate inputs
  IF p_mode NOT IN ('dry_run', 'create', 'upsert') THEN
    RAISE EXCEPTION 'Invalid mode: %. Must be dry_run, create, or upsert', p_mode;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM strategic_directives_v2 WHERE id = p_sd_key) THEN
    RAISE EXCEPTION 'Strategic Directive % does not exist', p_sd_key;
  END IF;

  SELECT acceptance_criteria INTO v_criteria
  FROM product_requirements_v2
  WHERE id = p_prd_id::text;

  IF v_criteria IS NULL OR jsonb_array_length(v_criteria) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'empty',
      'message', 'No acceptance criteria found',
      'sd_key', p_sd_key,
      'prd_id', p_prd_id::text
    );
  END IF;

  FOR criterion IN SELECT * FROM jsonb_array_elements(v_criteria)
  LOOP
    v_story_key := p_sd_key || ':US-' ||
      substring(md5(criterion->>'text' || COALESCE(criterion->>'title', '')), 1, 8);

    IF p_mode = 'dry_run' THEN
      v_stories := v_stories || jsonb_build_object(
        'action', 'would_insert',
        'story_key', v_story_key,
        'sequence_no', v_seq,
        'title', COALESCE(criterion->>'title', 'Story ' || v_seq),
        'data', criterion
      );
    ELSIF p_mode = 'create' THEN
      INSERT INTO sd_backlog_map (
        sd_id, backlog_id, backlog_title, item_type,
        acceptance_criteria, verification_status, sequence_no,
        priority, import_run_id
      )
      SELECT
        p_sd_key, v_story_key,
        COALESCE(criterion->>'title', 'Story ' || v_seq),
        'story', jsonb_build_array(criterion), 'not_run', v_seq,
        COALESCE(criterion->>'priority', 'medium'), gen_random_uuid()
      WHERE NOT EXISTS (
        SELECT 1 FROM sd_backlog_map
        WHERE sd_id = p_sd_key AND backlog_id = v_story_key
      );

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inserted := v_row_count > 0;

      v_stories := v_stories || jsonb_build_object(
        'action', CASE WHEN v_inserted THEN 'created' ELSE 'skipped' END,
        'story_key', v_story_key,
        'sequence_no', v_seq
      );
    ELSE  -- upsert mode
      INSERT INTO sd_backlog_map (
        sd_id, backlog_id, backlog_title, item_type,
        acceptance_criteria, verification_status, sequence_no,
        priority, import_run_id
      ) VALUES (
        p_sd_key, v_story_key,
        COALESCE(criterion->>'title', 'Story ' || v_seq),
        'story', jsonb_build_array(criterion), 'not_run', v_seq,
        COALESCE(criterion->>'priority', 'medium'), gen_random_uuid()
      )
      ON CONFLICT (sd_id, backlog_id)
      DO UPDATE SET
        acceptance_criteria = EXCLUDED.acceptance_criteria,
        sequence_no = EXCLUDED.sequence_no,
        backlog_title = EXCLUDED.backlog_title,
        updated_at = NOW()
      RETURNING (xmax = 0) INTO v_inserted;

      v_stories := v_stories || jsonb_build_object(
        'action', CASE WHEN v_inserted THEN 'created' ELSE 'updated' END,
        'story_key', v_story_key,
        'sequence_no', v_seq
      );
    END IF;

    v_seq := v_seq + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'mode', p_mode,
    'sd_key', p_sd_key,
    'prd_id', p_prd_id::text,
    'story_count', jsonb_array_length(v_stories),
    'stories', v_stories
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', SQLERRM,
      'sd_key', p_sd_key,
      'prd_id', p_prd_id::text
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Secure function permissions
REVOKE ALL ON FUNCTION fn_generate_stories_from_prd FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_generate_stories_from_prd TO service_role;

-- 8. Audit log table
CREATE TABLE IF NOT EXISTS story_audit_log (
  id SERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  sd_key TEXT,
  story_key TEXT,
  user_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_audit_created ON story_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_audit_sd ON story_audit_log(sd_key);

-- 9. Grant view permissions (restricted)
GRANT SELECT ON v_story_verification_status TO authenticated;
GRANT SELECT ON v_sd_release_gate TO authenticated;
GRANT INSERT ON story_audit_log TO service_role;

COMMIT;