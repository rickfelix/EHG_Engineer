-- SD-VISION-SECTIONS-JSONB-FORMAT-ORCH-001-B: Add diagnostic key output to vision quality trigger
-- Shows which section keys were found vs expected when validation fails

CREATE OR REPLACE FUNCTION trg_eva_vision_quality_check()
RETURNS TRIGGER AS $$
DECLARE
  issues JSONB := '[]'::jsonb;
  passed BOOLEAN := TRUE;
  content_len INTEGER;
  standard_count INTEGER := 0;
  empty_section_count INTEGER := 0;
  section_key TEXT;
  section_value TEXT;
  should_recalculate BOOLEAN := FALSE;
  v_standard_keys TEXT[] := ARRAY[
    'executive_summary', 'problem_statement', 'success_criteria',
    'personas', 'out_of_scope', 'evolution_plan',
    'ui_ux_wireframes', 'technical_approach', 'success_metrics',
    'competitive_landscape'
  ];
  v_found_keys TEXT[] := '{}';
  v_actual_keys TEXT[];
BEGIN
  -- Skip if quality_checked is already set (avoid infinite loop)
  IF TG_OP = 'UPDATE' AND OLD.quality_checked IS NOT NULL AND NEW.sections IS NOT DISTINCT FROM OLD.sections THEN
    RETURN NEW;
  END IF;

  -- Check 1: Content length >= 500 chars
  content_len := length(COALESCE(NEW.content, ''));
  IF content_len < 500 THEN
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'content_length',
      'message', format('Content is %s chars (minimum 500). Vision docs require substantive narrative.', content_len)
    );
  END IF;

  -- Check 2: Standard sections >= 8 of 10
  IF NEW.sections IS NOT NULL AND jsonb_typeof(NEW.sections) = 'object' THEN
    -- Collect actual keys for diagnostics
    SELECT array_agg(k) INTO v_actual_keys FROM jsonb_object_keys(NEW.sections) AS k;

    FOREACH section_key IN ARRAY v_standard_keys LOOP
      IF NEW.sections ? section_key THEN
        standard_count := standard_count + 1;
        v_found_keys := array_append(v_found_keys, section_key);
        -- Check 3: No empty sections (each >= 50 chars)
        IF length(COALESCE(NEW.sections->>section_key, '')) < 50 THEN
          empty_section_count := empty_section_count + 1;
        END IF;
      END IF;
    END LOOP;

    IF standard_count < 8 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'section_coverage',
        'message', format('Only %s of 10 standard sections present (minimum 8).', standard_count),
        'found_keys', to_jsonb(v_found_keys),
        'actual_keys', to_jsonb(COALESCE(v_actual_keys, '{}'::TEXT[])),
        'expected_keys', to_jsonb(v_standard_keys)
      );
    END IF;

    IF empty_section_count > 0 THEN
      passed := FALSE;
      issues := issues || jsonb_build_object(
        'check', 'section_content',
        'message', format('%s section(s) have less than 50 chars.', empty_section_count)
      );
    END IF;
  ELSE
    passed := FALSE;
    issues := issues || jsonb_build_object(
      'check', 'sections_missing',
      'message', 'Sections JSONB is NULL. Vision docs require structured sections.'
    );
  END IF;

  NEW.quality_checked := passed;
  NEW.quality_issues := issues;
  NEW.quality_checked_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
