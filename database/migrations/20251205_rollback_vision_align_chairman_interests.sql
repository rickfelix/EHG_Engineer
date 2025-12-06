-- Rollback: Remove vision alignment columns from chairman_interests
-- Reverses: 20251204_sd_vision_align_001_chairman_interests_extensions.sql
-- SD: SD-VISION-ALIGN-001 (CANCELLED)
-- Date: 2025-12-05

DO $$
BEGIN
    -- Drop story_beats column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'story_beats'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN story_beats;
        RAISE NOTICE '✅ Dropped story_beats column';
    END IF;

    -- Drop vision_signals column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'vision_signals'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN vision_signals;
        RAISE NOTICE '✅ Dropped vision_signals column';
    END IF;

    -- Drop coverage_nav_item_ids column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'coverage_nav_item_ids'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN coverage_nav_item_ids;
        RAISE NOTICE '✅ Dropped coverage_nav_item_ids column';
    END IF;

    -- Drop feasibility_score column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'feasibility_score'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN feasibility_score;
        RAISE NOTICE '✅ Dropped feasibility_score column';
    END IF;

    RAISE NOTICE '✅ Rollback complete: chairman_interests restored to base schema';
END $$;

-- Verification
DO $$
DECLARE
  remaining_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['story_beats', 'vision_signals', 'coverage_nav_item_ids', 'feasibility_score']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chairman_interests' AND column_name = col
    ) THEN
      remaining_columns := array_append(remaining_columns, col);
    END IF;
  END LOOP;

  IF array_length(remaining_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Rollback verification failed: Columns still exist: %', remaining_columns;
  END IF;

  RAISE NOTICE '✅ Verification passed: All 4 columns removed successfully';
END $$;
