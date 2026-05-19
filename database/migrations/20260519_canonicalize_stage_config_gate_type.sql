-- SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-4
-- Migration: Canonicalize stage_config.gate_type on lifecycle_stage_config.work_type
--
-- Design: Option 3 per database-agent PLAN evidence 90225882-080a-4d5c-9b1f-7fedd6886870.
--   Postgres GENERATED columns cannot reference other tables (SQLSTATE 0A000).
--   Use a regular TEXT column + IMMUTABLE canonical_rule() function + dual triggers
--   (BEFORE INSERT/UPDATE on stage_config, AFTER UPDATE OF work_type on
--   lifecycle_stage_config) + CHECK constraint asserting the canonical rule.
--
-- Closes 28th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
--
-- Run order:
--   1. Pre-check (DO block) — abort on stage_config↔lifecycle_stage_config misalignment
--   2. ADD COLUMN gate_type_canonical (nullable)
--   3. Backfill from lifecycle_stage_config.work_type
--   4. SET NOT NULL
--   5. CREATE FUNCTION canonical_rule (IMMUTABLE)
--   6. ADD CHECK constraint using canonical_rule
--   7. CREATE TRIGGERS (BEFORE on stage_config, AFTER UPDATE OF work_type on lifecycle_stage_config)
--   8. INSERT INVARIANT seed row into architectural_prevention_findings
--   9. INSERT app_config row with graduation rubric

BEGIN;

-- =========================================================================
-- Step 1: Pre-check — abort if stage_config and lifecycle_stage_config rows
-- are misaligned. Both tables MUST have the same stage_number set.
-- =========================================================================
DO $$
DECLARE
  missing_in_stage_config TEXT;
  missing_in_lifecycle TEXT;
BEGIN
  SELECT string_agg(stage_number::text, ',') INTO missing_in_stage_config
  FROM (
    SELECT lc.stage_number FROM public.lifecycle_stage_config lc
    LEFT JOIN public.stage_config sc ON sc.stage_number = lc.stage_number
    WHERE sc.stage_number IS NULL
  ) m;

  SELECT string_agg(stage_number::text, ',') INTO missing_in_lifecycle
  FROM (
    SELECT sc.stage_number FROM public.stage_config sc
    LEFT JOIN public.lifecycle_stage_config lc ON lc.stage_number = sc.stage_number
    WHERE lc.stage_number IS NULL
  ) m;

  IF missing_in_stage_config IS NOT NULL OR missing_in_lifecycle IS NOT NULL THEN
    RAISE EXCEPTION 'Stage row misalignment between stage_config and lifecycle_stage_config. '
      'Missing in stage_config: %, missing in lifecycle_stage_config: %. '
      'Reconcile before running this migration.',
      COALESCE(missing_in_stage_config, '(none)'),
      COALESCE(missing_in_lifecycle, '(none)');
  END IF;
END $$;

-- =========================================================================
-- Step 2: ADD COLUMN gate_type_canonical (nullable initially)
-- =========================================================================
ALTER TABLE public.stage_config
  ADD COLUMN IF NOT EXISTS gate_type_canonical TEXT;

-- =========================================================================
-- Step 3: Backfill gate_type_canonical from lifecycle_stage_config.work_type
-- =========================================================================
UPDATE public.stage_config sc
SET gate_type_canonical = lc.work_type
FROM public.lifecycle_stage_config lc
WHERE sc.stage_number = lc.stage_number;

-- Verify backfill complete (no nulls remain)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT count(*) INTO null_count FROM public.stage_config WHERE gate_type_canonical IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % stage_config rows still have NULL gate_type_canonical', null_count;
  END IF;
END $$;

-- =========================================================================
-- Step 4: SET NOT NULL
-- =========================================================================
ALTER TABLE public.stage_config
  ALTER COLUMN gate_type_canonical SET NOT NULL;

-- =========================================================================
-- Step 5: CREATE FUNCTION canonical_rule (IMMUTABLE)
-- Defines the legal (gate_type_canonical, gate_type) pairs.
--   sd_required     × promotion    → valid (current empirical)
--   sd_required     × kill         → valid (defensive)
--   sd_required     × none         → valid (defensive)
--   decision_gate   × promotion    → valid
--   decision_gate   × kill         → valid
--   decision_gate   × none         → valid
--   artifact_only   × promotion    → valid (empirical: S25 has this combo)
--   artifact_only   × none         → valid
--   artifact_only   × kill         → valid (defensive)
--   automated_check × none         → valid
--   automated_check × promotion    → valid (defensive)
--   automated_check × kill         → valid (defensive)
-- Effectively: any (canonical, gate_type) pair where both values are
-- members of their respective enums is permitted. This locks down the
-- ENUM membership; cross-product validation lives at higher gates.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.canonical_rule(canonical TEXT, gate_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT canonical IN ('sd_required', 'decision_gate', 'artifact_only', 'automated_check')
     AND gate_type IN ('none', 'kill', 'promotion');
$$;

COMMENT ON FUNCTION public.canonical_rule(TEXT, TEXT) IS
  'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-4: '
  'asserts (canonical work_type, gate_type) pair is legal. '
  'IMMUTABLE so it is safe in CHECK constraints. '
  'Does NOT bypass triggers under session_replication_role=replica, '
  'superuser, or COPY bulk load — those modes skip CHECK enforcement too.';

-- =========================================================================
-- Step 6: ADD CHECK constraint
-- =========================================================================
ALTER TABLE public.stage_config
  DROP CONSTRAINT IF EXISTS stage_config_canonical_rule_check;
ALTER TABLE public.stage_config
  ADD CONSTRAINT stage_config_canonical_rule_check
  CHECK (public.canonical_rule(gate_type_canonical, gate_type));

-- =========================================================================
-- Step 7: CREATE TRIGGERS
--   (a) BEFORE INSERT/UPDATE on stage_config — auto-sync canonical from
--       work_type when canonical NOT supplied (defensive)
--   (b) AFTER UPDATE OF work_type on lifecycle_stage_config — propagate
--       change to stage_config.gate_type_canonical
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_stage_config_sync_canonical()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gate_type_canonical IS NULL THEN
    SELECT work_type INTO NEW.gate_type_canonical
    FROM public.lifecycle_stage_config
    WHERE stage_number = NEW.stage_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_config_sync_canonical ON public.stage_config;
CREATE TRIGGER trg_stage_config_sync_canonical
  BEFORE INSERT OR UPDATE ON public.stage_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stage_config_sync_canonical();

CREATE OR REPLACE FUNCTION public.tg_lifecycle_propagate_canonical()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.work_type IS DISTINCT FROM OLD.work_type THEN
    UPDATE public.stage_config
    SET gate_type_canonical = NEW.work_type
    WHERE stage_number = NEW.stage_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lifecycle_propagate_canonical ON public.lifecycle_stage_config;
CREATE TRIGGER trg_lifecycle_propagate_canonical
  AFTER UPDATE OF work_type ON public.lifecycle_stage_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_lifecycle_propagate_canonical();

-- =========================================================================
-- Step 8: INVARIANT seed row in architectural_prevention_findings
-- =========================================================================
INSERT INTO public.architectural_prevention_findings (
  sub_agent_code,
  rule_name,
  verdict,
  graduation_date,
  rationale,
  metadata
) VALUES (
  'STAGE_GATE_TYPE_CANONICALIZE_INVARIANT',
  'work_type is canonical for stage gating; writers must derive from lifecycle_stage_config.work_type, not stage_config.gate_type',
  'WARNING',
  CURRENT_DATE + INTERVAL '14 days',
  'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-5: 14-day soak period before graduating to BLOCKING. Graduation criteria stored in app_config key=stage_config_gate_type_canonicalization.',
  jsonb_build_object(
    'sd_key', 'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001',
    'witness_pattern', 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
    'witness_number', 28
  )
)
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Step 9: app_config row with graduation rubric
-- =========================================================================
INSERT INTO public.app_config (key, value, description)
VALUES (
  'stage_config_gate_type_canonicalization',
  jsonb_build_object(
    'mode', 'WARNING',
    'graduation_date', (CURRENT_DATE + INTERVAL '14 days')::text,
    'rubric', jsonb_build_object(
      'writer_adoption_pct_min', 80,
      'fallback_hit_count_14d_max', 0,
      'block_dryrun_violations_max', 0
    ),
    'anchor', 'pr_merge_timestamp',
    'sd_key', 'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001'
  )::text,
  'INVARIANT graduation rubric — WARNING soak then BLOCKING for stage_config gate_type canonicalization rule'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;

-- =========================================================================
-- ROLLBACK (DOWN) — for reference; uncomment to revert.
-- =========================================================================
-- BEGIN;
--   ALTER TABLE public.stage_config DROP CONSTRAINT IF EXISTS stage_config_canonical_rule_check;
--   DROP TRIGGER IF EXISTS trg_stage_config_sync_canonical ON public.stage_config;
--   DROP TRIGGER IF EXISTS trg_lifecycle_propagate_canonical ON public.lifecycle_stage_config;
--   DROP FUNCTION IF EXISTS public.tg_stage_config_sync_canonical();
--   DROP FUNCTION IF EXISTS public.tg_lifecycle_propagate_canonical();
--   DROP FUNCTION IF EXISTS public.canonical_rule(TEXT, TEXT);
--   ALTER TABLE public.stage_config DROP COLUMN IF EXISTS gate_type_canonical;
--   DELETE FROM public.architectural_prevention_findings WHERE sub_agent_code = 'STAGE_GATE_TYPE_CANONICALIZE_INVARIANT';
--   DELETE FROM public.app_config WHERE key = 'stage_config_gate_type_canonicalization';
-- COMMIT;
