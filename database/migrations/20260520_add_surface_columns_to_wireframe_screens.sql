-- SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B (original author)
-- NEUTRALIZED by SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 (D1 — closes feedback 6359dc60), 2026-05-21
--
-- ============================================================================
-- TOMBSTONE — why this migration is an inert, to_regclass-guarded no-op
-- ============================================================================
-- public.wireframe_screens NEVER EXISTED. Audience "surface" is a property stored
-- inside the venture_artifacts JSONB (artifact_type='wireframe_screens'), NOT a
-- relational table. The original `ALTER TABLE public.wireframe_screens ADD COLUMN
-- IF NOT EXISTS ...` guards the COLUMN, not the missing TABLE, so applying it errors
-- with "relation \"public.wireframe_screens\" does not exist" on any migration runner.
-- Verified read-only 2026-05-21: to_regclass('public.wireframe_screens') IS NULL.
--
-- FIX (additive, ZERO production-data impact): wrap the ALTERs in a to_regclass guard
-- so the migration is a clean no-op when the table is absent, while remaining
-- forward-compatible — the ALTERs still run should a real wireframe_screens table ever
-- be created. No data is mutated. The companion
-- 20260520_backfill_wireframe_surface_rollback.sql is already fully-commented / inert
-- and is intentionally left as-is.
--
-- The ALTER-without-CREATE migration-readiness lint is intentionally OUT OF SCOPE for
-- this SD (tracked separately as a QF).
--
-- Reversible: revert this file via git; the neutralization changes no DB state.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.wireframe_screens') IS NOT NULL THEN
    -- Forward-compatible branch: only reached if a real wireframe_screens table exists.
    ALTER TABLE public.wireframe_screens
      ADD COLUMN IF NOT EXISTS surface TEXT
        CHECK (surface IN ('marketing', 'auth', 'app'));

    ALTER TABLE public.wireframe_screens
      ADD COLUMN IF NOT EXISTS page_type TEXT;

    COMMENT ON COLUMN public.wireframe_screens.surface IS
      'SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B: '
      'Audience surface classification. '
      'marketing = public-facing pages (landing, pricing, features). '
      'auth = sign-up / sign-in / password-reset flows. '
      'app = authenticated product screens (dashboard, settings, profile). '
      'NULL = pre-migration row or flag-off generation.';

    COMMENT ON COLUMN public.wireframe_screens.page_type IS
      'SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B: '
      'Lowercase slug derived from the screen name/role '
      '(e.g. landing, signup, login, dashboard, settings, profile, pricing, onboarding). '
      'Populated when EVA_SURFACE_AWARE_ENABLED=true at generation time.';
  ELSE
    RAISE NOTICE '[SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 D1] public.wireframe_screens does not exist (surface lives in venture_artifacts JSONB). Intentional no-op tombstone — nothing to do.';
  END IF;
END $$;

-- =========================================================================
-- ROLLBACK (DOWN) — only meaningful if the forward-compatible branch ran.
-- =========================================================================
-- DO $$
-- BEGIN
--   IF to_regclass('public.wireframe_screens') IS NOT NULL THEN
--     ALTER TABLE public.wireframe_screens DROP COLUMN IF EXISTS surface;
--     ALTER TABLE public.wireframe_screens DROP COLUMN IF EXISTS page_type;
--   END IF;
-- END $$;
