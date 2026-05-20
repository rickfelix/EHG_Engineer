-- SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B
-- Migration: Add surface + page_type columns to wireframe_screens
--
-- Makes audience surface a structurally-tracked property of Stage 15 screens.
-- Both columns are nullable (additive) so existing rows are unaffected.
-- surface is constrained to the three canonical values; NULL is allowed for
-- rows written before the feature flag was enabled.
--
-- Reversible: DOWN block at the bottom drops both columns.

BEGIN;

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

COMMIT;

-- =========================================================================
-- ROLLBACK (DOWN) — uncomment to revert.
-- =========================================================================
-- BEGIN;
--   ALTER TABLE public.wireframe_screens DROP COLUMN IF EXISTS surface;
--   ALTER TABLE public.wireframe_screens DROP COLUMN IF EXISTS page_type;
-- COMMIT;
