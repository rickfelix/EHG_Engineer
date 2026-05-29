-- Migration: Capability Reuse Dedup Guard
-- SD: SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 | FR-5
-- Date: 2026-05-29
-- Purpose: Make capability reuse recording idempotent. fn_record_capability_reuse
--   previously did an unconditional INSERT + reuse_count+1 on every call, so any
--   hook retry / backfill overlap inflated reuse_count -> graph_centrality
--   (FLOOR(reuse_count/2)) -> plane1_score. This adds a UNIQUE(capability_id,
--   reusing_sd_id) constraint and rewrites the function to INSERT ... ON CONFLICT
--   DO NOTHING, incrementing reuse_count ONLY when a row was actually inserted.
-- Validated by DATABASE sub-agent (evidence b4125535-127c-4ea1-afc3-34f694e356fc).

BEGIN;

-- Guard-add UNIQUE constraint (Postgres lacks ADD CONSTRAINT IF NOT EXISTS).
-- capability_reuse_log currently has 0 rows, so no existing-data violation risk.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_capability_reuse_log_cap_sd'
      AND conrelid = 'public.capability_reuse_log'::regclass
  ) THEN
    ALTER TABLE public.capability_reuse_log
      ADD CONSTRAINT uq_capability_reuse_log_cap_sd
      UNIQUE (capability_id, reusing_sd_id);
    RAISE NOTICE 'UNIQUE constraint uq_capability_reuse_log_cap_sd added';
  ELSE
    RAISE NOTICE 'UNIQUE constraint uq_capability_reuse_log_cap_sd already exists, skipping';
  END IF;
END
$$;

-- Replace fn_record_capability_reuse with an idempotent version.
-- Behavior preserved except: duplicate (capability_id, reusing_sd_id) pairs are
-- ignored (ON CONFLICT DO NOTHING) and reuse_count/reused_by_sds/last_reused_at
-- are updated ONLY when a new log row was actually inserted.
CREATE OR REPLACE FUNCTION public.fn_record_capability_reuse(
  p_capability_key character varying,
  p_reusing_sd_id  character varying,
  p_reuse_context  text DEFAULT NULL,
  p_reuse_type     character varying DEFAULT 'direct'
)
RETURNS void LANGUAGE plpgsql AS $func$
DECLARE
  v_capability_id UUID;
  v_sd_uuid       UUID;
  v_row_count     INTEGER := 0;
BEGIN
  SELECT id INTO v_capability_id
  FROM public.sd_capabilities
  WHERE capability_key = p_capability_key
  LIMIT 1;

  IF v_capability_id IS NULL THEN
    RAISE NOTICE 'capability not found: %', p_capability_key;
    RETURN;
  END IF;

  SELECT uuid_id INTO v_sd_uuid
  FROM public.strategic_directives_v2
  WHERE id = p_reusing_sd_id;

  INSERT INTO public.capability_reuse_log (
    capability_id, capability_key, reusing_sd_id, reusing_sd_uuid, reuse_context, reuse_type
  ) VALUES (
    v_capability_id, p_capability_key, p_reusing_sd_id, v_sd_uuid, p_reuse_context, p_reuse_type
  )
  ON CONFLICT (capability_id, reusing_sd_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RAISE NOTICE 'duplicate capability reuse ignored (capability=%, sd=%)', p_capability_key, p_reusing_sd_id;
    RETURN;
  END IF;

  UPDATE public.sd_capabilities
  SET
    reuse_count    = reuse_count + 1,
    last_reused_at = CURRENT_TIMESTAMP,
    reused_by_sds  = reused_by_sds || jsonb_build_array(jsonb_build_object(
      'sd_id', p_reusing_sd_id,
      'date', CURRENT_TIMESTAMP::text,
      'context', p_reuse_context
    ))
  WHERE id = v_capability_id;
END;
$func$;

COMMENT ON FUNCTION public.fn_record_capability_reuse IS
'Records a capability reuse event idempotently. UNIQUE(capability_id, reusing_sd_id) + ON CONFLICT DO NOTHING ensures reuse_count increments at most once per (capability, reusing SD). SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 FR-5.';

COMMIT;
