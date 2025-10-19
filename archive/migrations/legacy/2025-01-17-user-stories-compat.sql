-- User Story System Compatibility Layer
-- Additive-only, idempotent, RLS-safe migration
-- For use in Supabase SQL Editor

-- ========================================
-- 1. Add story columns to sd_backlog_map
-- ========================================

-- Add item_type column
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS item_type TEXT
CHECK (item_type IN ('epic', 'story', 'task'))
DEFAULT 'story';

-- Add parent_id for hierarchy
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS parent_id TEXT;

-- Add sequence_no for ordering
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS sequence_no INTEGER;

-- Add story fields
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS story_key TEXT;

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS story_title TEXT;

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS story_description TEXT;

-- Add verification tracking
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS verification_status TEXT
CHECK (verification_status IN ('not_run', 'failing', 'passing'))
DEFAULT 'not_run';

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS verification_source JSONB;

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS coverage_pct INTEGER
CHECK (coverage_pct >= 0 AND coverage_pct <= 100);

ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS test_file_path TEXT;

-- Add acceptance criteria (normalized)
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB;

-- Add import tracking
ALTER TABLE sd_backlog_map
ADD COLUMN IF NOT EXISTS story_import_run_id UUID DEFAULT gen_random_uuid();

-- ========================================
-- 2. Add constraints
-- ========================================

-- Add unique constraint for SD + backlog item
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sd_backlog_map_unique_sd_backlog'
    ) THEN
        ALTER TABLE sd_backlog_map
        ADD CONSTRAINT sd_backlog_map_unique_sd_backlog
        UNIQUE (sd_id, backlog_id);
    END IF;
END $$;

-- Add FK to strategic_directives_v2 (uses string ID)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sd_backlog_map_sd_id_fkey'
    ) THEN
        ALTER TABLE sd_backlog_map
        ADD CONSTRAINT sd_backlog_map_sd_id_fkey
        FOREIGN KEY (sd_id)
        REFERENCES strategic_directives_v2(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for story lookups
CREATE INDEX IF NOT EXISTS idx_sd_backlog_story_key
ON sd_backlog_map(story_key);

CREATE INDEX IF NOT EXISTS idx_sd_backlog_verification
ON sd_backlog_map(sd_id, verification_status)
WHERE story_key IS NOT NULL;

-- ========================================
-- 3. Create mapping views
-- ========================================

-- View to map SD IDs to keys (SD uses id as PK, no legacy_id universally populated)
CREATE OR REPLACE VIEW v_sd_keys AS
SELECT
    id as sd_id,
    COALESCE(legacy_id, id) as sd_key,
    title,
    status,
    priority
FROM strategic_directives_v2;

COMMENT ON VIEW v_sd_keys IS 'Maps SD internal IDs to external keys for API compatibility';

-- View to normalize PRD acceptance criteria
CREATE OR REPLACE VIEW v_prd_acceptance AS
SELECT
    pr.id as prd_id,
    pr.directive_id as sd_id,
    sd.sd_key,
    pr.title as prd_title,
    CASE
        -- Try acceptance_criteria first (array)
        WHEN pr.acceptance_criteria IS NOT NULL AND
             jsonb_typeof(to_jsonb(pr.acceptance_criteria)) = 'array' AND
             jsonb_array_length(to_jsonb(pr.acceptance_criteria)) > 0
        THEN to_jsonb(pr.acceptance_criteria)
        -- Fall back to test_scenarios
        WHEN pr.test_scenarios IS NOT NULL AND
             jsonb_typeof(to_jsonb(pr.test_scenarios)) = 'array' AND
             jsonb_array_length(to_jsonb(pr.test_scenarios)) > 0
        THEN to_jsonb(pr.test_scenarios)
        -- Try validation_checklist
        WHEN pr.validation_checklist IS NOT NULL AND
             jsonb_typeof(to_jsonb(pr.validation_checklist)) = 'array' AND
             jsonb_array_length(to_jsonb(pr.validation_checklist)) > 0
        THEN to_jsonb(pr.validation_checklist)
        -- Empty array if nothing found
        ELSE '[]'::jsonb
    END as acceptance_jsonb
FROM product_requirements_v2 pr
JOIN v_sd_keys sd ON pr.directive_id = sd.sd_id;

COMMENT ON VIEW v_prd_acceptance IS 'Normalized view of PRD acceptance criteria from various source fields';

-- ========================================
-- 4. Create story verification views
-- ========================================

-- Story verification status view
CREATE OR REPLACE VIEW v_story_verification_status AS
SELECT
    sbm.sd_id,
    sk.sd_key,
    sbm.backlog_id,
    sbm.story_key,
    COALESCE(sbm.story_title, sbm.backlog_title) as story_title,
    COALESCE(sbm.story_description, sbm.item_description) as story_description,
    sbm.item_type,
    sbm.priority,
    sbm.sequence_no,
    COALESCE(sbm.verification_status, 'not_run') as status,
    sbm.verification_source,
    sbm.last_verified_at,
    sbm.coverage_pct,
    sbm.test_file_path,
    CASE
        WHEN sbm.last_verified_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (NOW() - sbm.last_verified_at))::INT
        ELSE NULL
    END as seconds_since_last_run
FROM sd_backlog_map sbm
JOIN v_sd_keys sk ON sbm.sd_id = sk.sd_id
WHERE sbm.story_key IS NOT NULL;

COMMENT ON VIEW v_story_verification_status IS 'Current verification status of all user stories';

-- SD release gate view
CREATE OR REPLACE VIEW v_sd_release_gate AS
WITH story_stats AS (
    SELECT
        sd_id,
        COUNT(*) as total_stories,
        COUNT(*) FILTER (WHERE verification_status = 'passing') as passing_count,
        COUNT(*) FILTER (WHERE verification_status = 'failing') as failing_count,
        COUNT(*) FILTER (WHERE verification_status = 'not_run' OR verification_status IS NULL) as not_run_count,
        AVG(COALESCE(coverage_pct, 0))::INT as avg_coverage
    FROM sd_backlog_map
    WHERE story_key IS NOT NULL
    GROUP BY sd_id
)
SELECT
    sk.sd_id,
    sk.sd_key,
    sk.title as sd_title,
    COALESCE(ss.total_stories, 0) as total_stories,
    COALESCE(ss.passing_count, 0) as passing_count,
    COALESCE(ss.failing_count, 0) as failing_count,
    COALESCE(ss.not_run_count, 0) as not_run_count,
    CASE
        WHEN COALESCE(ss.total_stories, 0) = 0 THEN 100
        ELSE ROUND((ss.passing_count::NUMERIC / ss.total_stories) * 100)
    END as passing_pct,
    COALESCE(ss.avg_coverage, 0) as avg_coverage,
    80 as coverage_target, -- Default target
    CASE
        WHEN COALESCE(ss.total_stories, 0) = 0 THEN true
        WHEN ss.passing_count = ss.total_stories THEN true
        WHEN (ss.passing_count::NUMERIC / ss.total_stories) >= 0.8 THEN true
        ELSE false
    END as ready
FROM v_sd_keys sk
LEFT JOIN story_stats ss ON sk.sd_id = ss.sd_id
WHERE sk.status IN ('active', 'in_progress', 'pending_approval');

COMMENT ON VIEW v_sd_release_gate IS 'Release readiness based on story verification status';

-- ========================================
-- 5. Story generation function
-- ========================================

CREATE OR REPLACE FUNCTION fn_generate_stories_from_prd(
    p_sd_key TEXT,
    p_prd_id TEXT,  -- Using TEXT since PRD id is string
    p_mode TEXT DEFAULT 'dry_run'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sd_id TEXT;
    v_sd_key TEXT;
    v_acceptance JSONB;
    v_stories JSONB := '[]'::JSONB;
    v_story JSONB;
    v_story_key TEXT;
    v_existing_count INT;
    v_created_count INT := 0;
    v_index INT := 0;
    v_item JSONB;
BEGIN
    -- Resolve SD ID from key (handle both formats)
    SELECT sd_id, sd_key INTO v_sd_id, v_sd_key
    FROM v_sd_keys
    WHERE sd_key = p_sd_key OR sd_id = p_sd_key;

    IF v_sd_id IS NULL THEN
        RAISE EXCEPTION 'Strategic directive not found: %', p_sd_key;
    END IF;

    -- Get acceptance criteria from normalized view
    SELECT acceptance_jsonb INTO v_acceptance
    FROM v_prd_acceptance
    WHERE prd_id = p_prd_id AND sd_id = v_sd_id;

    IF v_acceptance IS NULL OR jsonb_array_length(v_acceptance) = 0 THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'No acceptance criteria found for PRD',
            'sd_key', v_sd_key,
            'prd_id', p_prd_id,
            'stories', '[]'::jsonb
        );
    END IF;

    -- Process each acceptance criterion
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_acceptance)
    LOOP
        v_index := v_index + 1;

        -- Generate deterministic story key
        v_story_key := v_sd_key || ':US-' ||
            SUBSTRING(MD5(v_sd_key || '::' || COALESCE(v_item->>'title', v_item->>'text', v_index::text)), 1, 8);

        -- Build story object
        v_story := jsonb_build_object(
            'story_key', v_story_key,
            'story_title', COALESCE(v_item->>'title', v_item->>'text', 'Story ' || v_index),
            'story_description', COALESCE(v_item->>'description', v_item->>'details', ''),
            'sequence_no', v_index,
            'priority', COALESCE(v_item->>'priority', 'medium'),
            'acceptance_criteria', v_item
        );

        v_stories := v_stories || v_story;

        -- In upsert mode, actually create the stories
        IF p_mode = 'upsert' THEN
            -- Check if exists
            SELECT COUNT(*) INTO v_existing_count
            FROM sd_backlog_map
            WHERE sd_id = v_sd_id AND story_key = v_story_key;

            IF v_existing_count = 0 THEN
                -- Create new backlog item with story
                INSERT INTO sd_backlog_map (
                    sd_id,
                    backlog_id,
                    backlog_title,
                    story_key,
                    story_title,
                    story_description,
                    item_type,
                    sequence_no,
                    priority,
                    acceptance_criteria,
                    verification_status,
                    phase
                ) VALUES (
                    v_sd_id,
                    gen_random_uuid()::text,
                    v_story->>'story_title',
                    v_story_key,
                    v_story->>'story_title',
                    v_story->>'story_description',
                    'story',
                    v_index,
                    v_story->>'priority',
                    v_item,
                    'not_run',
                    'planning'
                )
                ON CONFLICT (sd_id, backlog_id) DO UPDATE
                SET
                    story_key = EXCLUDED.story_key,
                    story_title = EXCLUDED.story_title,
                    story_description = EXCLUDED.story_description,
                    sequence_no = EXCLUDED.sequence_no,
                    acceptance_criteria = EXCLUDED.acceptance_criteria;

                v_created_count := v_created_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- Return result
    RETURN jsonb_build_object(
        'status', CASE WHEN p_mode = 'dry_run' THEN 'preview' ELSE 'success' END,
        'mode', p_mode,
        'sd_key', v_sd_key,
        'sd_id', v_sd_id,
        'prd_id', p_prd_id,
        'total_criteria', jsonb_array_length(v_acceptance),
        'stories_generated', jsonb_array_length(v_stories),
        'stories_created', v_created_count,
        'stories', v_stories
    );
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION fn_generate_stories_from_prd FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_generate_stories_from_prd TO service_role;

-- Grant view permissions
GRANT SELECT ON v_sd_keys TO authenticated, anon;
GRANT SELECT ON v_prd_acceptance TO authenticated, anon;
GRANT SELECT ON v_story_verification_status TO authenticated, anon;
GRANT SELECT ON v_sd_release_gate TO authenticated, anon;

-- ========================================
-- 6. Helper function to verify setup
-- ========================================

CREATE OR REPLACE FUNCTION verify_story_setup()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check columns exist
    RETURN QUERY
    SELECT
        'Story columns' as check_name,
        CASE
            WHEN COUNT(*) = 11 THEN 'PASS'
            ELSE 'FAIL'
        END as status,
        'Found ' || COUNT(*) || ' of 11 expected columns' as details
    FROM information_schema.columns
    WHERE table_name = 'sd_backlog_map'
    AND column_name IN (
        'item_type', 'parent_id', 'sequence_no', 'story_key',
        'story_title', 'story_description', 'verification_status',
        'verification_source', 'last_verified_at', 'coverage_pct',
        'test_file_path'
    );

    -- Check constraints
    RETURN QUERY
    SELECT
        'Unique constraint' as check_name,
        CASE
            WHEN COUNT(*) > 0 THEN 'PASS'
            ELSE 'FAIL'
        END as status,
        'sd_backlog_map_unique_sd_backlog exists' as details
    FROM pg_constraint
    WHERE conname = 'sd_backlog_map_unique_sd_backlog';

    -- Check views
    RETURN QUERY
    SELECT
        'Views created' as check_name,
        CASE
            WHEN COUNT(*) = 4 THEN 'PASS'
            ELSE 'FAIL'
        END as status,
        'Found ' || COUNT(*) || ' of 4 expected views' as details
    FROM pg_views
    WHERE schemaname = 'public'
    AND viewname IN (
        'v_sd_keys',
        'v_prd_acceptance',
        'v_story_verification_status',
        'v_sd_release_gate'
    );

    -- Check function
    RETURN QUERY
    SELECT
        'Generation function' as check_name,
        CASE
            WHEN COUNT(*) > 0 THEN 'PASS'
            ELSE 'FAIL'
        END as status,
        'fn_generate_stories_from_prd exists' as details
    FROM pg_proc
    WHERE proname = 'fn_generate_stories_from_prd';
END;
$$;

-- Run verification
SELECT * FROM verify_story_setup();