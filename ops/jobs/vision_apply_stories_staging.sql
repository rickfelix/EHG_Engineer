-- Vision Stories Apply (staging)
-- Reads curated story manifest from ops/inbox/, creates stories with DRY_RUN safety.
-- Target: sd_backlog_map with item_type='story' (or eng_user_stories if exists)
-- Required psql vars: DRY_RUN (0|1), ON_ERROR_STOP=1
\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 0) Input from ops/inbox/ (curated from template)
--    Expected headers:
--    action,venture_id,sd_id,prd_id,title,priority,status,item_type,acceptance_criteria_json,story_points,notes

-- 1) Stage input into temp table
CREATE TEMP TABLE stg_story_manifest(
  action text, venture_id uuid, sd_id uuid, prd_id uuid,
  title text, priority text, status text, item_type text,
  acceptance_criteria_json text, story_points text, notes text
);
\copy stg_story_manifest FROM 'ops/inbox/vision_story_manifest.csv' CSV HEADER

-- 2) Normalize + validate inputs (keep only 'create')
CREATE TEMP TABLE story_in AS
SELECT
  LOWER(COALESCE(action,'create')) AS action,
  venture_id, sd_id, prd_id,
  NULLIF(TRIM(title),'') AS title,
  -- Priority mapping (accept P0..P3 or High/Medium/Low)
  CASE
    WHEN priority ~* '^(P[0-3])'            THEN UPPER(priority)
    WHEN priority ~* '^high'                THEN 'High'
    WHEN priority ~* '^medium'              THEN 'Medium'
    WHEN priority ~* '^low'                 THEN 'Low'
    ELSE 'P3'  -- Default
  END AS priority,
  COALESCE(NULLIF(TRIM(status),''), 'draft') AS status,
  COALESCE(NULLIF(TRIM(item_type),''), 'story') AS item_type,
  NULLIF(TRIM(acceptance_criteria_json),'') AS acceptance_criteria_json,
  CASE
    WHEN story_points ~ '^[0-9]+$' THEN story_points::integer
    ELSE 3  -- Default story points
  END AS story_points,
  NULLIF(TRIM(notes),'') AS notes
FROM stg_story_manifest
WHERE LOWER(COALESCE(action,'create'))='create';

-- 3) Check if eng_user_stories table exists
DO $$
DECLARE
  has_user_stories boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='eng_user_stories'
  ) INTO has_user_stories;

  -- Store in temp table for later reference
  CREATE TEMP TABLE target_info AS
  SELECT has_user_stories AS use_user_stories_table;
END $$;

-- 4) Utilities
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- Slugify title for story_key
CREATE TEMP FUNCTION _slugify(txt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(txt,'')), '[^a-z0-9]+', '-', 'g')
$$;

-- Generate story key from title with collision handling
CREATE TEMP FUNCTION _story_key_with_suffix(title text, suffix integer DEFAULT 0) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN suffix = 0 THEN 'story-' || _slugify(title)
    ELSE 'story-' || _slugify(title) || '-' || suffix::text
  END
$$;

-- 5) Prepare results table
CREATE TEMP TABLE apply_results(
  entity text, action text, status text,
  sd_id uuid, prd_id uuid, story_id uuid, story_key text, msg text
);

-- 6) Apply stories based on target table
DO $$
DECLARE
  r RECORD;
  use_stories_table boolean;
  v_story_id uuid;
  v_story_key text;
  exists_id uuid;
BEGIN
  SELECT use_user_stories_table INTO use_stories_table FROM target_info LIMIT 1;

  FOR r IN SELECT * FROM story_in LOOP
    -- Validate required fields
    IF r.title IS NULL THEN
      INSERT INTO apply_results(entity,action,status,msg)
      VALUES('story','create','error','missing title');
      CONTINUE;
    END IF;

    -- Recommend having at least prd_id
    IF r.prd_id IS NULL AND r.sd_id IS NULL THEN
      INSERT INTO apply_results(entity,action,status,msg)
      VALUES('story','create','warning','no prd_id or sd_id provided');
    END IF;

    -- Generate unique story_key
    DECLARE
      key_suffix integer := 0;
      key_exists boolean;
    BEGIN
      LOOP
        v_story_key := _story_key_with_suffix(r.title, key_suffix);

        -- Check if this key already exists in sd_backlog_map
        IF NOT use_stories_table THEN
          SELECT EXISTS(
            SELECT 1 FROM sd_backlog_map WHERE story_key = v_story_key
          ) INTO key_exists;
        ELSE
          key_exists := false;  -- eng_user_stories doesn't have story_key column
        END IF;

        EXIT WHEN NOT key_exists OR key_suffix > 99;  -- Safety limit
        key_suffix := key_suffix + 1;
      END LOOP;
    END;

    -- Check for existing story (idempotent on prd_id+title OR sd_id+title)
    IF use_stories_table THEN
      -- Check eng_user_stories
      IF r.prd_id IS NOT NULL THEN
        EXECUTE 'SELECT id FROM eng_user_stories WHERE prd_id = $1 AND title = $2 LIMIT 1'
          INTO exists_id USING r.prd_id, r.title;
      ELSIF r.sd_id IS NOT NULL THEN
        EXECUTE 'SELECT id FROM eng_user_stories WHERE sd_id = $1 AND title = $2 LIMIT 1'
          INTO exists_id USING r.sd_id, r.title;
      END IF;
    ELSE
      -- Check sd_backlog_map
      IF r.prd_id IS NOT NULL THEN
        SELECT backlog_id INTO exists_id
        FROM sd_backlog_map
        WHERE prd_id = r.prd_id
          AND title = r.title
          AND item_type = 'story'
        LIMIT 1;
      ELSIF r.sd_id IS NOT NULL THEN
        -- Look up sd_key for sd_id to check by sd_key
        DECLARE v_temp_sd_key text;
        BEGIN
          SELECT sd_key INTO v_temp_sd_key FROM strategic_directives_v2 WHERE id = r.sd_id LIMIT 1;
          IF v_temp_sd_key IS NOT NULL THEN
            SELECT backlog_id INTO exists_id
            FROM sd_backlog_map
            WHERE sd_key = v_temp_sd_key
              AND title = r.title
              AND item_type = 'story'
            LIMIT 1;
          END IF;
        END;
      END IF;
    END IF;

    IF exists_id IS NOT NULL THEN
      INSERT INTO apply_results(entity,action,status,sd_id,prd_id,story_id,story_key,msg)
      VALUES('story','create','exists',r.sd_id,r.prd_id,exists_id,v_story_key,'skipped - already exists');
      CONTINUE;
    END IF;

    -- Create new story
    IF :DRY_RUN::int = 1 THEN
      INSERT INTO apply_results(entity,action,status,sd_id,prd_id,story_key,msg)
      VALUES('story','create','would_create',r.sd_id,r.prd_id,v_story_key,'dry-run');
    ELSE
      IF use_stories_table THEN
        -- Insert into eng_user_stories
        EXECUTE '
          INSERT INTO eng_user_stories(
            id, venture_id, sd_id, prd_id, title, priority, status,
            acceptance_criteria_json, story_points, notes, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6,
            COALESCE($7::jsonb, ''[]''::jsonb), $8, $9, NOW()
          ) RETURNING id'
        INTO v_story_id
        USING r.venture_id, r.sd_id, r.prd_id, r.title, r.priority, r.status,
              r.acceptance_criteria_json, r.story_points, r.notes;
      ELSE
        -- Insert into sd_backlog_map as item_type='story'
        -- Get sd_key if we have sd_id
        DECLARE v_sd_key text;
        BEGIN
          IF r.sd_id IS NOT NULL THEN
            SELECT sd_key INTO v_sd_key FROM strategic_directives_v2 WHERE id = r.sd_id LIMIT 1;
          END IF;

          INSERT INTO sd_backlog_map(
            backlog_id, sd_key, prd_id, title, description,
            priority, status, item_type, story_key, story_points,
            acceptance_criteria_json, created_at
          ) VALUES (
            gen_random_uuid(), v_sd_key, r.prd_id, r.title, r.notes,
            r.priority, r.status, r.item_type, v_story_key, r.story_points,
            COALESCE(r.acceptance_criteria_json::jsonb, '[]'::jsonb), NOW()
          ) RETURNING backlog_id INTO v_story_id;
        END;
      END IF;

      INSERT INTO apply_results(entity,action,status,sd_id,prd_id,story_id,story_key,msg)
      VALUES('story','create','created',r.sd_id,r.prd_id,v_story_id,v_story_key,'ok');
    END IF;
  END LOOP;
END $$;

-- 7) Emit results
\copy (SELECT * FROM apply_results ORDER BY entity, status DESC) TO 'ops/checks/out/vision_story_apply_results.csv' WITH CSV HEADER;

-- 8) Summary statistics
DO $$
DECLARE
  created_count integer;
  exists_count integer;
  would_count integer;
  error_count integer;
  target_table text;
BEGIN
  SELECT COUNT(*) INTO created_count FROM apply_results WHERE status = 'created';
  SELECT COUNT(*) INTO exists_count FROM apply_results WHERE status = 'exists';
  SELECT COUNT(*) INTO would_count FROM apply_results WHERE status = 'would_create';
  SELECT COUNT(*) INTO error_count FROM apply_results WHERE status = 'error';

  SELECT CASE WHEN use_user_stories_table THEN 'eng_user_stories' ELSE 'sd_backlog_map' END
  INTO target_table FROM target_info LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE 'Vision Story Apply Summary:';
  RAISE NOTICE '  Target table: %', target_table;
  RAISE NOTICE '  Created: %', created_count;
  RAISE NOTICE '  Already exists: %', exists_count;
  RAISE NOTICE '  Would create (dry-run): %', would_count;
  RAISE NOTICE '  Errors: %', error_count;
END $$;

-- 9) Commit/rollback by DRY_RUN
DO $$
BEGIN
  IF :DRY_RUN::int = 1 THEN
    RAISE NOTICE '';
    RAISE NOTICE 'DRY_RUN=1, rolling back.';
    ROLLBACK;
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE 'DRY_RUN=0, committing changes.';
    COMMIT;
  END IF;
END $$;