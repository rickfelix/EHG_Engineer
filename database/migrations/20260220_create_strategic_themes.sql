-- Migration: Create strategic_themes table
-- Date: 2026-02-20
-- Purpose: Annual strategic themes derived from EVA vision documents
-- Pattern: Matches constitutional_amendments (RLS, triggers, naming)

-- =============================================================================
-- Phase 1: Create table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.strategic_themes (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    theme_key       TEXT            NOT NULL UNIQUE,
    title           TEXT            NOT NULL,
    description     TEXT,
    year            INTEGER         NOT NULL,
    status          TEXT            NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'active', 'archived')),
    vision_key      TEXT            REFERENCES public.eva_vision_documents(vision_key),
    derived_from_vision BOOLEAN     DEFAULT false,
    source_dimensions   JSONB,
    created_by      TEXT            DEFAULT 'chairman',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- =============================================================================
-- Phase 2: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_strategic_themes_year
    ON public.strategic_themes USING btree (year);

-- =============================================================================
-- Phase 3: Row Level Security
-- =============================================================================

ALTER TABLE public.strategic_themes ENABLE ROW LEVEL SECURITY;

-- Service role full access (matches constitutional_amendments pattern)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'strategic_themes'
          AND policyname = 'service_role_all'
    ) THEN
        CREATE POLICY service_role_all
            ON public.strategic_themes
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

-- =============================================================================
-- Phase 4: Updated_at trigger
-- =============================================================================

-- Reuse existing trigger_set_updated_at() function (already exists in DB)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_table = 'strategic_themes'
          AND trigger_name = 'set_strategic_themes_updated_at'
    ) THEN
        CREATE TRIGGER set_strategic_themes_updated_at
            BEFORE UPDATE ON public.strategic_themes
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_updated_at();
    END IF;
END
$$;

-- =============================================================================
-- Phase 5: Table and column comments
-- =============================================================================

COMMENT ON TABLE public.strategic_themes IS 'Annual strategic themes derived from EVA vision dimensions, used to group and prioritize Strategic Directives';
COMMENT ON COLUMN public.strategic_themes.theme_key IS 'Human-readable unique key, e.g. THEME-2026-001';
COMMENT ON COLUMN public.strategic_themes.vision_key IS 'FK to eva_vision_documents.vision_key - the vision this theme was derived from';
COMMENT ON COLUMN public.strategic_themes.derived_from_vision IS 'Whether this theme was auto-derived from a vision document';
COMMENT ON COLUMN public.strategic_themes.source_dimensions IS 'JSONB array of vision dimension keys used to derive this theme';
COMMENT ON COLUMN public.strategic_themes.created_by IS 'Who created this theme (default: chairman)';

-- =============================================================================
-- Rollback SQL (for reference):
-- DROP TRIGGER IF EXISTS set_strategic_themes_updated_at ON public.strategic_themes;
-- DROP POLICY IF EXISTS service_role_all ON public.strategic_themes;
-- DROP TABLE IF EXISTS public.strategic_themes;
-- =============================================================================
