-- Migration: Fix column name references in check_orphaned_work function
-- SD: SD-GENESIS-V31-MASON-P1
-- Issue: Function references non-existent 'name' and 'category' columns
-- Fix: Use correct column names 'deliverable_name' and 'deliverable_type'

CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id VARCHAR,
  p_from_type VARCHAR,
  p_to_type VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  from_profile RECORD;
  to_profile RECORD;
  orphaned_work JSONB := '{"deliverables": [], "user_stories": [], "has_orphans": false}'::jsonb;
  completed_deliverables JSONB;
  validated_stories JSONB;
BEGIN
  -- Get validation profiles
  SELECT * INTO from_profile FROM sd_type_validation_profiles WHERE sd_type = p_from_type;
  SELECT * INTO to_profile FROM sd_type_validation_profiles WHERE sd_type = p_to_type;

  -- Check for completed deliverables that would be orphaned
  IF COALESCE(from_profile.requires_deliverables, true) AND NOT COALESCE(to_profile.requires_deliverables, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'title', deliverable_name,  -- FIXED: was 'name', now 'deliverable_name'
      'status', completion_status,
      'type', deliverable_type     -- FIXED: was 'category', now 'deliverable_type'
    ))
    INTO completed_deliverables
    FROM sd_scope_deliverables
    WHERE sd_id = p_sd_id
    AND completion_status = 'completed';

    IF completed_deliverables IS NOT NULL AND jsonb_array_length(completed_deliverables) > 0 THEN
      orphaned_work := jsonb_set(orphaned_work, '{deliverables}', completed_deliverables);
      orphaned_work := jsonb_set(orphaned_work, '{has_orphans}', 'true'::jsonb);
    END IF;
  END IF;

  -- Check for validated user stories that would be orphaned
  IF COALESCE(from_profile.requires_user_stories, from_profile.requires_e2e_tests, true)
     AND NOT COALESCE(to_profile.requires_user_stories, to_profile.requires_e2e_tests, true) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'status', status,
      'validation_status', validation_status
    ))
    INTO validated_stories
    FROM user_stories
    WHERE sd_id = p_sd_id
    AND (status = 'completed' OR validation_status = 'validated');

    IF validated_stories IS NOT NULL AND jsonb_array_length(validated_stories) > 0 THEN
      orphaned_work := jsonb_set(orphaned_work, '{user_stories}', validated_stories);
      orphaned_work := jsonb_set(orphaned_work, '{has_orphans}', 'true'::jsonb);
    END IF;
  END IF;

  RETURN orphaned_work;
END;
$$;

-- Add migration comment
COMMENT ON FUNCTION check_orphaned_work(VARCHAR, VARCHAR, VARCHAR) IS
'SD-GENESIS-V31-MASON-P1: Fixed column name references (name→deliverable_name, category→deliverable_type)';
