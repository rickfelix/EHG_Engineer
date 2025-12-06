-- Migration: Extend chairman_interests with Vision Alignment fields
-- SD: SD-VISION-ALIGN-001
-- Author: Database Sub-Agent
-- Date: 2025-12-04
-- Description: Adds story_beats, vision_signals, coverage_nav_item_ids, and feasibility_score
--              columns to support Scenario-Driven Vision Alignment System

-- ============================================================================
-- COLUMN ADDITIONS
-- ============================================================================

-- Story Beats: Array of narrative milestones for scenario-driven interests
-- Structure: [{ "sequence": integer, "description": "string", "acceptance_criteria": ["string"] }]
-- Example: [
--   {
--     "sequence": 1,
--     "description": "Initial customer contact establishes trust",
--     "acceptance_criteria": ["Customer responds within 48h", "Meeting scheduled"]
--   }
-- ]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'story_beats'
    ) THEN
        ALTER TABLE public.chairman_interests
        ADD COLUMN story_beats JSONB DEFAULT '[]'::jsonb;

        RAISE NOTICE '✅ Added story_beats column';
    ELSE
        RAISE NOTICE '⚠️  story_beats column already exists, skipping';
    END IF;
END $$;

COMMENT ON COLUMN public.chairman_interests.story_beats IS
'Array of story beat objects for scenario-driven interests. Structure: [{"sequence": int, "description": "string", "acceptance_criteria": ["string"]}]. Default: []';

-- Vision Signals: Measurable indicators that validate strategic direction
-- Structure: [{ "signal_type": "string", "target_metric": "string", "measurement_method": "string" }]
-- Example: [
--   {
--     "signal_type": "market_validation",
--     "target_metric": "10 qualified leads per month",
--     "measurement_method": "CRM pipeline tracking"
--   }
-- ]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'vision_signals'
    ) THEN
        ALTER TABLE public.chairman_interests
        ADD COLUMN vision_signals JSONB DEFAULT '[]'::jsonb;

        RAISE NOTICE '✅ Added vision_signals column';
    ELSE
        RAISE NOTICE '⚠️  vision_signals column already exists, skipping';
    END IF;
END $$;

COMMENT ON COLUMN public.chairman_interests.vision_signals IS
'Array of vision signal objects for strategic validation. Structure: [{"signal_type": "string", "target_metric": "string", "measurement_method": "string"}]. Default: []';

-- Coverage Nav Item IDs: Links to venture_stages_nav_items for coverage tracking
-- Structure: ["uuid", "uuid", ...]
-- Purpose: Track which navigation items are covered by this interest's scenarios
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'coverage_nav_item_ids'
    ) THEN
        ALTER TABLE public.chairman_interests
        ADD COLUMN coverage_nav_item_ids JSONB DEFAULT '[]'::jsonb;

        RAISE NOTICE '✅ Added coverage_nav_item_ids column';
    ELSE
        RAISE NOTICE '⚠️  coverage_nav_item_ids column already exists, skipping';
    END IF;
END $$;

COMMENT ON COLUMN public.chairman_interests.coverage_nav_item_ids IS
'Array of venture_stages_nav_items UUIDs tracking coverage. Structure: ["uuid1", "uuid2", ...]. Default: []';

-- Feasibility Score: Russian Judge scoring (0-10) for implementation feasibility
-- Range: 0 (not feasible) to 10 (highly feasible)
-- NULL = not scored yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'feasibility_score'
    ) THEN
        ALTER TABLE public.chairman_interests
        ADD COLUMN feasibility_score INTEGER CHECK (feasibility_score BETWEEN 0 AND 10);

        RAISE NOTICE '✅ Added feasibility_score column';
    ELSE
        RAISE NOTICE '⚠️  feasibility_score column already exists, skipping';
    END IF;
END $$;

COMMENT ON COLUMN public.chairman_interests.feasibility_score IS
'Russian Judge scoring 0-10 for implementation feasibility. NULL = not scored yet. CHECK constraint: 0-10 inclusive.';

-- ============================================================================
-- UPDATED_AT TRIGGER UPDATE
-- ============================================================================

-- The existing update_chairman_interests_updated_at() trigger function already handles
-- updated_at timestamp updates for ALL columns on the table (including new columns).
-- No trigger changes needed.

-- ============================================================================
-- RLS POLICY VERIFICATION
-- ============================================================================

-- The existing RLS policies already cover ALL columns on the table:
-- - select_own_chairman_interests: Users can SELECT their own interests
-- - insert_own_chairman_interests: Users can INSERT their own interests
-- - update_own_chairman_interests: Users can UPDATE their own interests
-- - delete_own_chairman_interests: Users can DELETE their own interests
-- - service_role_chairman_interests: Service role has full access
--
-- No RLS policy changes needed.

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
BEGIN
  -- Check all new columns exist
  FOREACH col IN ARRAY ARRAY['story_beats', 'vision_signals', 'coverage_nav_item_ids', 'feasibility_score']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chairman_interests' AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
    END IF;
  END LOOP;

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration verification failed: Missing columns %', missing_columns;
  END IF;

  RAISE NOTICE '✅ Migration verified: All 4 columns added successfully';
  RAISE NOTICE '   - story_beats (JSONB, default: [])';
  RAISE NOTICE '   - vision_signals (JSONB, default: [])';
  RAISE NOTICE '   - coverage_nav_item_ids (JSONB, default: [])';
  RAISE NOTICE '   - feasibility_score (INTEGER, CHECK: 0-10)';
END $$;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Insert new chairman interest with vision alignment data
-- INSERT INTO public.chairman_interests (
--   user_id,
--   interest_type,
--   name,
--   priority,
--   story_beats,
--   vision_signals,
--   coverage_nav_item_ids,
--   feasibility_score
-- ) VALUES (
--   auth.uid(),
--   'market',
--   'Healthcare AI startups',
--   8,
--   '[{"sequence": 1, "description": "First customer deployment", "acceptance_criteria": ["Live in production", "User feedback positive"]}]'::jsonb,
--   '[{"signal_type": "revenue", "target_metric": "$100K MRR", "measurement_method": "Stripe dashboard"}]'::jsonb,
--   '["550e8400-e29b-41d4-a716-446655440000"]'::jsonb,
--   7
-- );

-- Example 2: Update existing interest with story beats
-- UPDATE public.chairman_interests
-- SET story_beats = '[
--   {"sequence": 1, "description": "Discovery call", "acceptance_criteria": ["Pain points identified"]},
--   {"sequence": 2, "description": "POC delivered", "acceptance_criteria": ["Stakeholder approval"]}
-- ]'::jsonb
-- WHERE id = '[UUID]' AND user_id = auth.uid();

-- Example 3: Query interests with feasibility scores >= 7
-- SELECT name, feasibility_score, story_beats
-- FROM public.chairman_interests
-- WHERE user_id = auth.uid()
--   AND feasibility_score >= 7
--   AND is_active = true
-- ORDER BY feasibility_score DESC, priority DESC;
