-- ============================================================================
-- Fix: bootstrap_venture_workflow creates all 25 stage work rows
-- ============================================================================
-- Previously tier capped the row count (tier 0=3, tier 1=10, tier 2=15).
-- This broke useVentureWorkflow.currentStage for stages beyond the cap,
-- since it looks for stage_status='in_progress' in venture_stage_work.
--
-- Fix: Always create all 25 rows. Tier controls UI visibility, not row existence.
-- The tier_max is still returned for reference but no longer limits row creation.
-- ============================================================================

CREATE OR REPLACE FUNCTION bootstrap_venture_workflow(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_venture RECORD;
  v_tier_max INTEGER;
  v_stage INTEGER;
  v_work_type TEXT;
  v_rows_created INTEGER := 0;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23];
BEGIN
  -- Lock the venture row to prevent concurrent bootstraps
  SELECT id, name, tier, current_lifecycle_stage
    INTO v_venture
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- Tier max is informational only — all 25 rows are always created
  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 25
  END;

  -- Create venture_stage_work rows for ALL 25 stages
  FOR v_stage IN 1..25 LOOP
    -- Determine work_type
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type,
      started_at
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage = 1 THEN 'in_progress' ELSE 'not_started' END,
      v_work_type,
      CASE WHEN v_stage = 1 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    IF FOUND THEN
      v_rows_created := v_rows_created + 1;
    END IF;
  END LOOP;

  -- Insert STAGE_ENTRY event for stage 1 (idempotent via check)
  IF NOT EXISTS (
    SELECT 1 FROM stage_events
    WHERE venture_id = p_venture_id
      AND stage_number = 1
      AND event_type = 'STAGE_ENTRY'
  ) THEN
    INSERT INTO stage_events (
      id,
      venture_id,
      stage_number,
      event_type,
      event_data,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_venture_id,
      1,
      'STAGE_ENTRY',
      jsonb_build_object('source', 'bootstrap', 'tier_max', v_tier_max),
      NOW()
    );
  END IF;

  -- Record bootstrap transition (from_stage=0 for initial bootstrap)
  INSERT INTO venture_stage_transitions (
    venture_id,
    from_stage,
    to_stage,
    transition_type,
    approved_by,
    handoff_data,
    idempotency_key
  ) VALUES (
    p_venture_id,
    0,
    1,
    'normal',
    'system:bootstrap',
    jsonb_build_object('tier_max', v_tier_max, 'rows_created', v_rows_created),
    uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, p_venture_id::text || ':bootstrap')
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'tier', v_venture.tier,
    'tier_max', v_tier_max,
    'stages_created', v_rows_created
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id
  );
END;
$fn$;

-- ============================================================================
-- Backfill: Add missing stage work rows for existing ventures
-- ============================================================================
-- Existing ventures (like NichePulse) only have rows up to their tier cap.
-- This inserts rows for stages 11-25 for any venture missing them.
-- ON CONFLICT DO NOTHING makes it safe to re-run.
-- ============================================================================

DO $$
DECLARE
  v_venture RECORD;
  v_stage INTEGER;
  v_work_type TEXT;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23];
  v_total_inserted INTEGER := 0;
BEGIN
  FOR v_venture IN
    SELECT DISTINCT venture_id FROM venture_stage_work
  LOOP
    FOR v_stage IN 1..25 LOOP
      IF v_stage = ANY(v_gate_stages) THEN
        v_work_type := 'decision_gate';
      ELSIF v_stage = 2 THEN
        v_work_type := 'automated_check';
      ELSE
        v_work_type := 'artifact_only';
      END IF;

      INSERT INTO venture_stage_work (
        venture_id,
        lifecycle_stage,
        stage_status,
        work_type
      ) VALUES (
        v_venture.venture_id,
        v_stage,
        'not_started',
        v_work_type
      )
      ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

      IF FOUND THEN
        v_total_inserted := v_total_inserted + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfilled % stage work rows across existing ventures', v_total_inserted;
END;
$$;
