-- ============================================================================
-- SD-GVOS-S17-PROMPT-QUALITY-ORCH-001 / CP2 / FR-2
-- Migration 7: gvos_prompt_rubrics (versioned + immutable scoring rubric)
-- ============================================================================
-- Purpose: Stores the versioned scoring rubric the prompt-quality scorer
-- (lib/gvos/prompt-quality-scorer.ts) reads at composer time. Append-only via
-- trigger; exactly one row has active=TRUE at any time (partial unique index
-- on a constant expression per DATABASE sub-agent CRIT-2 fix).
--
-- DATABASE sub-agent conditions absorbed:
--   - CRIT-2: partial unique index uses ((TRUE)) constant expression
--   - WARN-3: mirror leo_scoring_rubrics_immutable pattern (admin gate, separate
--             UPDATE + DELETE triggers, is_leo_admin() bypass for service_role)
--   - WARN-7: CHECK constraint enforces green > yellow_soft > yellow_hard > red
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.gvos_prompt_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE CHECK (version >= 1),
  weights JSONB NOT NULL,
  threshold_green INT NOT NULL CHECK (threshold_green BETWEEN 0 AND 100),
  threshold_yellow_soft INT NOT NULL CHECK (threshold_yellow_soft BETWEEN 0 AND 100),
  threshold_yellow_hard INT NOT NULL CHECK (threshold_yellow_hard BETWEEN 0 AND 100),
  threshold_red INT NOT NULL DEFAULT 0 CHECK (threshold_red BETWEEN 0 AND 100),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  -- WARN-7: thresholds must be monotonic descending
  CONSTRAINT gvos_prompt_rubrics_thresholds_monotonic
    CHECK (threshold_green > threshold_yellow_soft
       AND threshold_yellow_soft > threshold_yellow_hard
       AND threshold_yellow_hard > threshold_red)
);

COMMENT ON TABLE public.gvos_prompt_rubrics IS
  'Versioned + immutable scoring rubric for the GVOS prompt-quality scorer. Mirrors leo_scoring_rubrics_immutable pattern. SD-GVOS-S17-PROMPT-QUALITY-ORCH-001 / FR-2. Versioned-correction-via-new-row: never UPDATE an existing row — INSERT a new (version, active=TRUE) row and toggle prior active=FALSE via the canonical procedure deactivate_prior_rubric() defined below.';

COMMENT ON COLUMN public.gvos_prompt_rubrics.weights IS
  'JSONB object mapping dimension names to weights (0..100 each). Sum should equal 100. Example: {"completeness":15,"archetype_specificity":15,"typography_declared":10,"layout_token_density":15,"color_interaction":10,"negative_prompts":15,"reference_urls":10,"library_motion":10}';

COMMENT ON COLUMN public.gvos_prompt_rubrics.active IS
  'Exactly one row has active=TRUE at any time (enforced by partial unique index uq_gvos_prompt_rubrics_active_one on a constant expression — CRIT-2 fix).';

-- ============================================================================
-- CRIT-2 FIX: Partial unique index on a CONSTANT expression
-- ============================================================================
-- Indexing the column itself would cap the entire table at one row.
-- Indexing a constant expression caps the WHERE-filtered rows at one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gvos_prompt_rubrics_active_one
  ON public.gvos_prompt_rubrics ((TRUE))
  WHERE active = TRUE;

-- ============================================================================
-- STEP 2: Append-only triggers (mirror leo_scoring_rubrics_immutable pattern)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gvos_prompt_rubrics_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow if caller passes admin gate (is_leo_admin returns TRUE for service_role + chairman)
  IF public.is_leo_admin() THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION
    'gvos_prompt_rubrics is append-only. % blocked for non-admin caller. SD-GVOS-S17-PROMPT-QUALITY-ORCH-001 / FR-2.',
    TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS gvos_prompt_rubrics_block_update_trigger
  ON public.gvos_prompt_rubrics;
CREATE TRIGGER gvos_prompt_rubrics_block_update_trigger
  BEFORE UPDATE ON public.gvos_prompt_rubrics
  FOR EACH ROW
  EXECUTE FUNCTION public.gvos_prompt_rubrics_block_mutation();

DROP TRIGGER IF EXISTS gvos_prompt_rubrics_block_delete_trigger
  ON public.gvos_prompt_rubrics;
CREATE TRIGGER gvos_prompt_rubrics_block_delete_trigger
  BEFORE DELETE ON public.gvos_prompt_rubrics
  FOR EACH ROW
  EXECUTE FUNCTION public.gvos_prompt_rubrics_block_mutation();

-- ============================================================================
-- STEP 3: RLS
-- ============================================================================
ALTER TABLE public.gvos_prompt_rubrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gvos_prompt_rubrics_select_authenticated
  ON public.gvos_prompt_rubrics;
CREATE POLICY gvos_prompt_rubrics_select_authenticated
  ON public.gvos_prompt_rubrics FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

DROP POLICY IF EXISTS gvos_prompt_rubrics_insert_admin
  ON public.gvos_prompt_rubrics;
CREATE POLICY gvos_prompt_rubrics_insert_admin
  ON public.gvos_prompt_rubrics FOR INSERT
  WITH CHECK (public.is_leo_admin());

-- ============================================================================
-- STEP 4: Seed v1 rubric (mirrors DEFAULT_RUBRIC in prompt-quality-scorer.ts)
-- ============================================================================
-- INSERT IF NOT EXISTS pattern for idempotency
INSERT INTO public.gvos_prompt_rubrics (
  version, weights, threshold_green, threshold_yellow_soft, threshold_yellow_hard, threshold_red, active, notes, created_by
)
SELECT
  1,
  jsonb_build_object(
    'completeness', 15,
    'archetype_specificity', 15,
    'typography_declared', 10,
    'layout_token_density', 15,
    'color_interaction', 10,
    'negative_prompts', 15,
    'reference_urls', 10,
    'library_motion', 10
  ),
  85, 70, 50, 0,
  TRUE,
  'v1 — initial rubric. Weights derived from Devi R1 empirical findings (typography absence -7..11pp, negative prompting +8..12pp, image conditioning +5pp). Calibration data from first ~20 ventures will inform rubric v2 weight adjustments.',
  'system-migration-007'
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_prompt_rubrics WHERE version = 1);

COMMIT;
