-- @approved-by: rickfelix@example.com
-- SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A (Child A — keystone)
-- Migration: Create unified public.venture_stages table + uni-directional sync triggers
--
-- Design: database-agent PLAN evidence b91e2eed (CONDITIONAL_PASS). This is the
-- keystone unification of stage_config + lifecycle_stage_config into a single
-- canonical venture_stages superset table. ADDITIVE, BACKWARD-COMPATIBLE, REVERSIBLE.
--
-- HARD GUARDRAILS honored:
--   * stage_config and lifecycle_stage_config structure/data are NEVER altered,
--     dropped, truncated, or mutated. We only ADD sync triggers to them.
--   * fn_advance_venture_stage (write-path) and advisory_checkpoints_stage_number_fkey
--     are NOT touched (those are Child C).
--   * Fully idempotent / re-runnable: IF NOT EXISTS + guarded DO-blocks throughout.
--
-- FR map (PRD-SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A):
--   FR-1 venture_stages superset table + canonical_rule CHECK + component_path
--   FR-2 public.canonical_rule(text,text) IMMUTABLE (20260519 never applied to live)
--   FR-3 backfill 26 rows from stage_config ⋈ lifecycle_stage_config
--   FR-4 uni-directional old->new sync triggers (idempotent upsert/delete, no recursion)
--   FR-5 venture_stages_audit + audit trigger + updated_at trigger + RLS + realtime pub
--   FR-6 repoint 4 read-only RPCs (signatures unchanged) to read venture_stages
--   FR-7 self-verifying DO-block (count=26, canonical_rule holds, set equality)
--
-- Rollback companion: 20260529_create_venture_stages_unified_rollback.sql
--
-- NOTE on transactions: apply-migration.js wraps the whole file in a single
-- transaction (BEGIN ... COMMIT) and holds advisory locks for its duration, so
-- we deliberately do NOT issue our own BEGIN/COMMIT here. The script's wrapper
-- guarantees the FR-7 verification DO-block (which RAISEs on failure) rolls back
-- EVERYTHING — including any success audit row — if any assertion fails.

-- =========================================================================
-- FR-2: canonical_rule(text,text) IMMUTABLE
-- Migration 20260519 that defines it was NEVER applied to the live DB, so we
-- create it here. Body is byte-identical to 20260519. CREATE OR REPLACE is
-- idempotent and remains valid whether or not 20260519 is later applied.
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
  'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-4 / reused by '
  'SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A FR-2: asserts (canonical work_type, '
  'gate_type) pair is legal. IMMUTABLE so it is safe in CHECK constraints.';

-- =========================================================================
-- FR-1: venture_stages superset table
-- TEXT for all string columns (widens lifecycle_stage_config varchars).
-- CHECK enforces gate/work-type legality via canonical_rule(work_type, gate_type).
-- component_path is new, nullable, app-only (backfilled later by Child D).
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.venture_stages (
  stage_number       INTEGER PRIMARY KEY,
  stage_name         TEXT NOT NULL,
  stage_key          TEXT NOT NULL UNIQUE,
  description        TEXT,
  phase_number       INTEGER NOT NULL,
  phase_name         TEXT NOT NULL,
  chunk              TEXT NOT NULL,
  gate_type          TEXT NOT NULL DEFAULT 'none'
                       CHECK (gate_type IN ('none', 'kill', 'promotion')),
  review_mode        TEXT NOT NULL DEFAULT 'auto'
                       CHECK (review_mode IN ('auto', 'review', 'manual')),
  work_type          TEXT NOT NULL
                       CHECK (work_type IN ('artifact_only', 'automated_check', 'decision_gate', 'sd_required')),
  sd_required        BOOLEAN NOT NULL DEFAULT false,
  sd_suffix          TEXT,
  advisory_enabled   BOOLEAN NOT NULL DEFAULT false,
  depends_on         INTEGER[] NOT NULL DEFAULT '{}',
  required_artifacts TEXT[] NOT NULL DEFAULT '{}',
  metadata           JSONB NOT NULL DEFAULT '{}',
  component_path     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venture_stages_canonical_rule_check
    CHECK (public.canonical_rule(work_type, gate_type))
);

COMMENT ON TABLE public.venture_stages IS
  'SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A: canonical unified superset of '
  'stage_config + lifecycle_stage_config. Read-only via RLS; written only by '
  'uni-directional sync triggers from the two legacy tables during the transition.';
COMMENT ON COLUMN public.venture_stages.component_path IS
  'New app-only column. NULL until backfilled by Child D.';

-- =========================================================================
-- FR-3: Backfill 26 rows from stage_config ⋈ lifecycle_stage_config on stage_number.
--   names/key/gate_type/review_mode/chunk        <- stage_config
--   work_type/phase_number/phase_name/sd_required/
--     sd_suffix/advisory_enabled/depends_on/
--     required_artifacts/metadata/description     <- lifecycle_stage_config
--   component_path                                <- NULL
-- Idempotent: ON CONFLICT (stage_number) DO UPDATE refreshes all merged columns.
-- =========================================================================
INSERT INTO public.venture_stages (
  stage_number, stage_name, stage_key, description, phase_number, phase_name,
  chunk, gate_type, review_mode, work_type, sd_required, sd_suffix,
  advisory_enabled, depends_on, required_artifacts, metadata, component_path
)
SELECT
  sc.stage_number,
  sc.stage_name,
  sc.stage_key,
  lc.description,
  lc.phase_number,
  lc.phase_name::text,
  sc.chunk,
  sc.gate_type,
  sc.review_mode,
  lc.work_type::text,
  COALESCE(lc.sd_required, false),
  lc.sd_suffix::text,
  COALESCE(lc.advisory_enabled, false),
  COALESCE(lc.depends_on, '{}'),
  COALESCE(lc.required_artifacts, '{}'),
  COALESCE(lc.metadata, '{}'::jsonb),
  NULL::text
FROM public.stage_config sc
JOIN public.lifecycle_stage_config lc ON lc.stage_number = sc.stage_number
ON CONFLICT (stage_number) DO UPDATE SET
  stage_name         = EXCLUDED.stage_name,
  stage_key          = EXCLUDED.stage_key,
  description        = EXCLUDED.description,
  phase_number       = EXCLUDED.phase_number,
  phase_name         = EXCLUDED.phase_name,
  chunk              = EXCLUDED.chunk,
  gate_type          = EXCLUDED.gate_type,
  review_mode        = EXCLUDED.review_mode,
  work_type          = EXCLUDED.work_type,
  sd_required        = EXCLUDED.sd_required,
  sd_suffix          = EXCLUDED.sd_suffix,
  advisory_enabled   = EXCLUDED.advisory_enabled,
  depends_on         = EXCLUDED.depends_on,
  required_artifacts = EXCLUDED.required_artifacts,
  metadata           = EXCLUDED.metadata;
  -- NOTE: component_path is intentionally NOT overwritten on conflict so a
  -- later Child D backfill is preserved across re-runs of this migration.

-- =========================================================================
-- FR-5a: venture_stages_audit append-only table (mirrors stage_config_audit)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.venture_stages_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number   INTEGER NOT NULL,
  changed_column TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  changed_by     TEXT NOT NULL DEFAULT CURRENT_USER,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venture_stages_audit IS
  'SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A: append-only audit of venture_stages '
  'column changes. Mirrors stage_config_audit.';

-- =========================================================================
-- FR-5b: AFTER UPDATE audit trigger (per-column IS DISTINCT FROM, SECURITY DEFINER)
-- Covers every business column of venture_stages.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_venture_stages_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.stage_name IS DISTINCT FROM NEW.stage_name THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'stage_name', OLD.stage_name, NEW.stage_name);
  END IF;
  IF OLD.stage_key IS DISTINCT FROM NEW.stage_key THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'stage_key', OLD.stage_key, NEW.stage_key);
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'description', OLD.description, NEW.description);
  END IF;
  IF OLD.phase_number IS DISTINCT FROM NEW.phase_number THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'phase_number', OLD.phase_number::text, NEW.phase_number::text);
  END IF;
  IF OLD.phase_name IS DISTINCT FROM NEW.phase_name THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'phase_name', OLD.phase_name, NEW.phase_name);
  END IF;
  IF OLD.chunk IS DISTINCT FROM NEW.chunk THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'chunk', OLD.chunk, NEW.chunk);
  END IF;
  IF OLD.gate_type IS DISTINCT FROM NEW.gate_type THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'gate_type', OLD.gate_type, NEW.gate_type);
  END IF;
  IF OLD.review_mode IS DISTINCT FROM NEW.review_mode THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'review_mode', OLD.review_mode, NEW.review_mode);
  END IF;
  IF OLD.work_type IS DISTINCT FROM NEW.work_type THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'work_type', OLD.work_type, NEW.work_type);
  END IF;
  IF OLD.sd_required IS DISTINCT FROM NEW.sd_required THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'sd_required', OLD.sd_required::text, NEW.sd_required::text);
  END IF;
  IF OLD.sd_suffix IS DISTINCT FROM NEW.sd_suffix THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'sd_suffix', OLD.sd_suffix, NEW.sd_suffix);
  END IF;
  IF OLD.advisory_enabled IS DISTINCT FROM NEW.advisory_enabled THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'advisory_enabled', OLD.advisory_enabled::text, NEW.advisory_enabled::text);
  END IF;
  IF OLD.depends_on IS DISTINCT FROM NEW.depends_on THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'depends_on', OLD.depends_on::text, NEW.depends_on::text);
  END IF;
  IF OLD.required_artifacts IS DISTINCT FROM NEW.required_artifacts THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'required_artifacts', OLD.required_artifacts::text, NEW.required_artifacts::text);
  END IF;
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'metadata', OLD.metadata::text, NEW.metadata::text);
  END IF;
  IF OLD.component_path IS DISTINCT FROM NEW.component_path THEN
    INSERT INTO venture_stages_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'component_path', OLD.component_path, NEW.component_path);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venture_stages_audit ON public.venture_stages;
CREATE TRIGGER trg_venture_stages_audit
  AFTER UPDATE ON public.venture_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_venture_stages_audit_trigger();

-- =========================================================================
-- FR-5c: append-only guard on venture_stages_audit (mirrors fn_stage_config_audit_immutable)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_venture_stages_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'venture_stages_audit is append-only. UPDATE and DELETE are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_venture_stages_audit_immutable ON public.venture_stages_audit;
CREATE TRIGGER trg_venture_stages_audit_immutable
  BEFORE DELETE OR UPDATE ON public.venture_stages_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_venture_stages_audit_immutable();

-- =========================================================================
-- FR-5d: BEFORE UPDATE updated_at trigger (reuses existing public.set_updated_at())
-- =========================================================================
DROP TRIGGER IF EXISTS trg_venture_stages_set_updated_at ON public.venture_stages;
CREATE TRIGGER trg_venture_stages_set_updated_at
  BEFORE UPDATE ON public.venture_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- FR-5e: RLS mirroring stage_config (read-only: select allowed, all writes denied).
-- Deliberately NOT mirroring lifecycle_stage_config's permissive policies.
-- The sync triggers and backfill run as SECURITY DEFINER / migration role, which
-- bypasses RLS, so write propagation continues to work despite deny_write.
-- =========================================================================
ALTER TABLE public.venture_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_stages_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_venture_stages ON public.venture_stages;
CREATE POLICY select_venture_stages ON public.venture_stages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS deny_write_venture_stages ON public.venture_stages;
CREATE POLICY deny_write_venture_stages ON public.venture_stages
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (false);

DROP POLICY IF EXISTS select_venture_stages_audit ON public.venture_stages_audit;
CREATE POLICY select_venture_stages_audit ON public.venture_stages_audit
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS deny_write_venture_stages_audit ON public.venture_stages_audit;
CREATE POLICY deny_write_venture_stages_audit ON public.venture_stages_audit
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (false);

-- =========================================================================
-- FR-5f: add venture_stages to supabase_realtime publication (guarded)
-- =========================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.venture_stages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- already a member; no-op
  WHEN undefined_object THEN
    RAISE NOTICE 'Publication supabase_realtime does not exist; skipping ADD TABLE venture_stages';
END $$;

-- =========================================================================
-- FR-4: Uni-directional old->new sync triggers.
-- Writes to either legacy table propagate to venture_stages by stage_number.
-- venture_stages NEVER writes back (no trigger on venture_stages writes to the
-- legacy tables) => no recursion. Idempotent upsert makes double-fire harmless.
-- A merged row needs BOTH legacy tables; each sync trigger re-reads its sibling.
-- =========================================================================

-- Shared helper: upsert the merged venture_stages row for a given stage_number,
-- re-joining BOTH legacy tables. Used by both sync triggers.
CREATE OR REPLACE FUNCTION public.fn_sync_venture_stages_upsert(p_stage_number INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.venture_stages (
    stage_number, stage_name, stage_key, description, phase_number, phase_name,
    chunk, gate_type, review_mode, work_type, sd_required, sd_suffix,
    advisory_enabled, depends_on, required_artifacts, metadata
  )
  SELECT
    sc.stage_number,
    sc.stage_name,
    sc.stage_key,
    lc.description,
    lc.phase_number,
    lc.phase_name::text,
    sc.chunk,
    sc.gate_type,
    sc.review_mode,
    lc.work_type::text,
    COALESCE(lc.sd_required, false),
    lc.sd_suffix::text,
    COALESCE(lc.advisory_enabled, false),
    COALESCE(lc.depends_on, '{}'),
    COALESCE(lc.required_artifacts, '{}'),
    COALESCE(lc.metadata, '{}'::jsonb)
  FROM public.stage_config sc
  JOIN public.lifecycle_stage_config lc ON lc.stage_number = sc.stage_number
  WHERE sc.stage_number = p_stage_number
  ON CONFLICT (stage_number) DO UPDATE SET
    stage_name         = EXCLUDED.stage_name,
    stage_key          = EXCLUDED.stage_key,
    description        = EXCLUDED.description,
    phase_number       = EXCLUDED.phase_number,
    phase_name         = EXCLUDED.phase_name,
    chunk              = EXCLUDED.chunk,
    gate_type          = EXCLUDED.gate_type,
    review_mode        = EXCLUDED.review_mode,
    work_type          = EXCLUDED.work_type,
    sd_required        = EXCLUDED.sd_required,
    sd_suffix          = EXCLUDED.sd_suffix,
    advisory_enabled   = EXCLUDED.advisory_enabled,
    depends_on         = EXCLUDED.depends_on,
    required_artifacts = EXCLUDED.required_artifacts,
    metadata           = EXCLUDED.metadata;
  -- component_path intentionally preserved (Child D owns it).
END;
$$;

-- Trigger fn for stage_config writes.
CREATE OR REPLACE FUNCTION public.tg_stage_config_sync_venture_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.venture_stages WHERE stage_number = OLD.stage_number;
    RETURN OLD;
  ELSE
    -- INSERT or UPDATE: re-derive the merged row (only succeeds once the matching
    -- lifecycle_stage_config row also exists; otherwise the join is empty = no-op).
    PERFORM public.fn_sync_venture_stages_upsert(NEW.stage_number);
    -- If stage_number itself changed on UPDATE, remove the stale old row.
    IF TG_OP = 'UPDATE' AND OLD.stage_number IS DISTINCT FROM NEW.stage_number THEN
      DELETE FROM public.venture_stages WHERE stage_number = OLD.stage_number;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_config_sync_venture_stages ON public.stage_config;
CREATE TRIGGER trg_stage_config_sync_venture_stages
  AFTER INSERT OR UPDATE OR DELETE ON public.stage_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stage_config_sync_venture_stages();

-- Trigger fn for lifecycle_stage_config writes.
CREATE OR REPLACE FUNCTION public.tg_lifecycle_sync_venture_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.venture_stages WHERE stage_number = OLD.stage_number;
    RETURN OLD;
  ELSE
    PERFORM public.fn_sync_venture_stages_upsert(NEW.stage_number);
    IF TG_OP = 'UPDATE' AND OLD.stage_number IS DISTINCT FROM NEW.stage_number THEN
      DELETE FROM public.venture_stages WHERE stage_number = OLD.stage_number;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_lifecycle_sync_venture_stages ON public.lifecycle_stage_config;
CREATE TRIGGER trg_lifecycle_sync_venture_stages
  AFTER INSERT OR UPDATE OR DELETE ON public.lifecycle_stage_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_lifecycle_sync_venture_stages();

-- =========================================================================
-- FR-6: Repoint the 4 READ-ONLY RPCs to venture_stages via CREATE OR REPLACE.
-- Signatures & return shapes UNCHANGED. venture_stages stores TEXT, but the
-- original RPCs return `character varying` columns, so we CAST TEXT -> varchar
-- to preserve the identical return type (else 42P13 cannot-change-return-type).
-- Does NOT touch fn_advance_venture_stage or advisory_checkpoints_stage_number_fkey.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_gate_stages()
RETURNS integer[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY_AGG(stage_number ORDER BY stage_number)
  FROM public.venture_stages
  WHERE gate_type != 'none';
$$;

CREATE OR REPLACE FUNCTION public.get_sd_required_stages()
RETURNS TABLE(stage_number integer, stage_name character varying, sd_suffix character varying)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.stage_number,
    vs.stage_name::varchar,
    vs.sd_suffix::varchar
  FROM public.venture_stages vs
  WHERE vs.sd_required = true
  ORDER BY vs.stage_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_info(p_stage_number integer)
RETURNS TABLE(stage_number integer, stage_name character varying, phase_name character varying, work_type character varying, sd_required boolean, advisory_enabled boolean)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.stage_number,
    vs.stage_name::varchar,
    vs.phase_name::varchar,
    vs.work_type::varchar,
    vs.sd_required,
    vs.advisory_enabled
  FROM public.venture_stages vs
  WHERE vs.stage_number = p_stage_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stages_by_phase(p_phase_number integer)
RETURNS TABLE(stage_number integer, stage_name character varying, work_type character varying)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.stage_number,
    vs.stage_name::varchar,
    vs.work_type::varchar
  FROM public.venture_stages vs
  WHERE vs.phase_number = p_phase_number
  ORDER BY vs.stage_number;
END;
$$;

-- =========================================================================
-- FR-7: Self-verifying DO-block. RAISE EXCEPTION on any failure aborts the txn.
--   (1) count(venture_stages) = 26
--   (2) canonical_rule(work_type, gate_type) holds for every row
--   (3) stage_number set-equality vs BOTH legacy tables
-- =========================================================================
DO $$
DECLARE
  v_count            INTEGER;
  v_bad_canonical    INTEGER;
  v_vs_not_sc        TEXT;
  v_sc_not_vs        TEXT;
  v_vs_not_lc        TEXT;
  v_lc_not_vs        TEXT;
BEGIN
  -- (1) row count
  SELECT count(*) INTO v_count FROM public.venture_stages;
  IF v_count <> 26 THEN
    RAISE EXCEPTION 'venture_stages row count is %, expected 26', v_count;
  END IF;

  -- (2) canonical_rule holds for every row
  SELECT count(*) INTO v_bad_canonical
  FROM public.venture_stages
  WHERE NOT public.canonical_rule(work_type, gate_type);
  IF v_bad_canonical > 0 THEN
    RAISE EXCEPTION 'canonical_rule(work_type, gate_type) violated by % venture_stages row(s)', v_bad_canonical;
  END IF;

  -- (3a) set equality vs stage_config
  SELECT string_agg(stage_number::text, ',') INTO v_vs_not_sc
  FROM (SELECT stage_number FROM public.venture_stages
        EXCEPT SELECT stage_number FROM public.stage_config) a;
  SELECT string_agg(stage_number::text, ',') INTO v_sc_not_vs
  FROM (SELECT stage_number FROM public.stage_config
        EXCEPT SELECT stage_number FROM public.venture_stages) b;
  IF v_vs_not_sc IS NOT NULL OR v_sc_not_vs IS NOT NULL THEN
    RAISE EXCEPTION 'stage_number set mismatch vs stage_config. In venture_stages not stage_config: %; in stage_config not venture_stages: %',
      COALESCE(v_vs_not_sc, '(none)'), COALESCE(v_sc_not_vs, '(none)');
  END IF;

  -- (3b) set equality vs lifecycle_stage_config
  SELECT string_agg(stage_number::text, ',') INTO v_vs_not_lc
  FROM (SELECT stage_number FROM public.venture_stages
        EXCEPT SELECT stage_number FROM public.lifecycle_stage_config) c;
  SELECT string_agg(stage_number::text, ',') INTO v_lc_not_vs
  FROM (SELECT stage_number FROM public.lifecycle_stage_config
        EXCEPT SELECT stage_number FROM public.venture_stages) d;
  IF v_vs_not_lc IS NOT NULL OR v_lc_not_vs IS NOT NULL THEN
    RAISE EXCEPTION 'stage_number set mismatch vs lifecycle_stage_config. In venture_stages not lifecycle: %; in lifecycle not venture_stages: %',
      COALESCE(v_vs_not_lc, '(none)'), COALESCE(v_lc_not_vs, '(none)');
  END IF;

  RAISE NOTICE 'venture_stages verification PASSED: 26 rows, canonical_rule holds for all, stage_number set-equal to both legacy tables.';
END $$;
