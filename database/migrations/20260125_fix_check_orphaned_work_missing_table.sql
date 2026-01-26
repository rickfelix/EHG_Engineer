-- Migration: Fix check_orphaned_work function - remove non-existent table reference
-- Date: 2026-01-25
-- Issue: Function references e2e_test_scenarios table which does not exist
--
-- This is a follow-up fix after the UUID type mismatch was corrected.

CREATE OR REPLACE FUNCTION public.check_orphaned_work(
  p_sd_id character varying,
  p_from_type character varying,
  p_to_type character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  sd_id_found VARCHAR;
  orphaned_stories INT := 0;
  orphaned_deliverables INT := 0;
  orphaned_handoffs INT := 0;
  result JSONB;
BEGIN
  -- Get sd_id using VARCHAR (not UUID) since id column is VARCHAR
  SELECT id INTO sd_id_found
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_id OR id = p_sd_id;

  IF sd_id_found IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id,
      'has_orphans', false,
      'has_orphaned_work', false
    );
  END IF;

  -- Count potentially orphaned work (using VARCHAR for FK lookups)
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_id_found;

  SELECT COUNT(*) INTO orphaned_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_found;

  -- Note: e2e_test_scenarios table does not exist in current schema
  -- Removed that check to prevent runtime errors

  SELECT COUNT(*) INTO orphaned_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_found;

  result := jsonb_build_object(
    'has_orphans', (orphaned_stories + orphaned_deliverables + orphaned_handoffs) > 0,
    'has_orphaned_work', (orphaned_stories + orphaned_deliverables + orphaned_handoffs) > 0,
    'orphaned_stories', orphaned_stories,
    'orphaned_deliverables', orphaned_deliverables,
    'orphaned_handoffs', orphaned_handoffs,
    'total_orphaned_items', orphaned_stories + orphaned_deliverables + orphaned_handoffs,
    'deliverables', '[]'::jsonb,
    'user_stories', '[]'::jsonb
  );

  RETURN result;
END;
$function$;
