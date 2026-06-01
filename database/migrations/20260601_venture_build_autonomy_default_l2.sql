-- ============================================================================
-- FR-4: Venture-build autonomy default L0 -> L2 + safe single-step setter
-- SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001  (DATABASE evidence a81c818b)
-- ============================================================================
-- CONTEXT (verified against live schema dedlbzhpgkmetvhbkyzq):
--   * eva_ventures and ventures are SEPARATE base tables (NOT a view).
--   * checkAutonomy() reads eva_ventures.autonomy_level (enum eva_autonomy_level).
--   * sync_ventures_to_eva_ventures_insert() OMITS autonomy_level from its INSERT
--     column list, so for trigger-synced rows the eva_ventures COLUMN DEFAULT
--     is what applies -> we MUST set the default on eva_ventures (the read side)
--     AND on ventures (the source/write side).
--   * No autonomy setter function previously existed.
--   * RLS on both tables is service_role-write only.
--
-- NON-RETROACTIVE: only the DEFAULT changes. Existing rows are NOT updated.
-- Rollback notes at bottom.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DEFAULT change on the gate-READ table (eva_ventures: enum eva_autonomy_level)
-- ---------------------------------------------------------------------------
ALTER TABLE public.eva_ventures
  ALTER COLUMN autonomy_level SET DEFAULT 'L2'::eva_autonomy_level;

-- ---------------------------------------------------------------------------
-- 2. DEFAULT change on the source/write table (ventures: text, CHECK L0..L4)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ventures
  ALTER COLUMN autonomy_level SET DEFAULT 'L2';

-- NOTE: NO UPDATE statements. The 24 existing ventures / 25 eva_ventures rows
-- remain at L0 by design (column-default changes are non-retroactive).

-- ---------------------------------------------------------------------------
-- 3. Safe single-step autonomy setter
--    - validates p_level in {L0..L4}
--    - reads current eva_ventures.autonomy_level
--    - enforces SINGLE-STEP transition: abs(idx(target) - idx(current)) = 1
--    - writes BOTH eva_ventures (enum cast) AND ventures (text)
--    - SECURITY DEFINER so it can write under service_role-only RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_venture_autonomy_level(
  p_venture_id uuid,
  p_level      text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order   text[] := ARRAY['L0','L1','L2','L3','L4'];
  v_current text;
  v_ci      int;
  v_ti      int;
BEGIN
  -- Validate target level
  IF p_level IS NULL OR p_level NOT IN ('L0','L1','L2','L3','L4') THEN
    RAISE EXCEPTION 'Invalid autonomy level: % (must be one of L0,L1,L2,L3,L4)', p_level
      USING ERRCODE = 'check_violation';
  END IF;

  -- Read current level from the gate-read table
  SELECT autonomy_level::text INTO v_current
  FROM public.eva_ventures
  WHERE venture_id = p_venture_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Venture % not found in eva_ventures', p_venture_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_ci := array_position(v_order, v_current);
  v_ti := array_position(v_order, p_level);

  -- Enforce single-step (validateLevelTransition semantics: |diff| must equal 1)
  IF abs(v_ti - v_ci) <> 1 THEN
    RAISE EXCEPTION
      'Single-step transition only: % -> % is % level(s) (validateLevelTransition requires exactly 1)',
      v_current, p_level, abs(v_ti - v_ci)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Write source table (text)
  UPDATE public.ventures
     SET autonomy_level = p_level
   WHERE id = p_venture_id;

  -- Write gate-read table (enum cast); sync triggers do NOT cover this column
  UPDATE public.eva_ventures
     SET autonomy_level = p_level::eva_autonomy_level,
         updated_at     = now()
   WHERE venture_id = p_venture_id;

  RETURN p_level;
END;
$$;

COMMENT ON FUNCTION public.set_venture_autonomy_level(uuid, text) IS
  'FR-4 SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001: single-step (|diff|=1) autonomy '
  'level setter. Writes BOTH eva_ventures (enum, gate-read) and ventures (text, source) '
  'because the ventures->eva_ventures sync triggers do not propagate autonomy_level. '
  'SECURITY DEFINER for service_role-only RLS.';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, if ever needed):
--   ALTER TABLE public.eva_ventures ALTER COLUMN autonomy_level SET DEFAULT 'L0'::eva_autonomy_level;
--   ALTER TABLE public.ventures     ALTER COLUMN autonomy_level SET DEFAULT 'L0';
--   DROP FUNCTION IF EXISTS public.set_venture_autonomy_level(uuid, text);
-- ============================================================================
