-- Migration: Create video_prompts table (syntax-corrected, idempotent)
-- Corrects ehg/supabase/migrations/20251004030000_create_video_prompts_table.sql,
-- which was never applied to the consolidated DB because it used
-- `CREATE POLICY IF NOT EXISTS`, a clause PostgreSQL does not support on CREATE
-- POLICY (42601, confirmed by direct syntax probe -- DATABASE sub-agent evidence
-- 04433ba0-7de4-43a5-a404-6001b70e5662).
--
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (FR-1 / US-001).
--
-- Fixes applied relative to the original:
--   1. Each `CREATE POLICY IF NOT EXISTS x ON video_prompts ...` is replaced with
--      `DROP POLICY IF EXISTS x ON public.video_prompts;` followed by a bare
--      `CREATE POLICY x ON public.video_prompts ...` -- this is idempotent (AC-3 / TS-7)
--      without relying on unsupported syntax.
--   2. Every bare `ventures` reference is schema-qualified as `public.ventures`.
--   3. update_updated_at_column() already exists in this DB (reused, not redefined,
--      so this migration cannot silently redefine a trigger function shared by
--      other tables).
--   4. SECURITY review db9a6d11-acd9-4ee3-8f33-99bbe50f1816 (SEC-4, 2026-08-28): the
--      policies below are scoped through user_company_access, NOT ventures.created_by
--      (which is NULL on all 152 live ventures). An earlier revision of this file scoped
--      through ventures.created_by -- syntactically valid but functionally hollow (every
--      policy denied every real user) -- and a follow-up migration,
--      20260828130000_fix_video_prompts_rls_company_access.sql, corrected it in place on
--      the live DB. That left TWO DIVERGENT REPRESENTATIONS of "what video_prompts RLS
--      should be": this file (broken model) and 20260828130000 (correct model), both
--      billed as idempotent/safe-to-rerun. Replaying THIS file after 20260828130000 would
--      have silently REGRESSED the live policies back to deny-everyone, with no error --
--      both migrations "succeed" from run-sql-migration.js's perspective; only the
--      predicate differs. Rewriting this file to create the correct policies DIRECTLY
--      removes the hazard rather than documenting it: replaying this file after
--      20260828130000 (or vice versa, in either order, any number of times) now converges
--      to the identical policy set. 20260828130000 becomes a redundant re-assertion of the
--      same predicate, kept only as the historical record of the fix, not a second
--      diverging source of truth.
--
-- Applied in a single transaction (BEGIN/COMMIT) so CREATE TABLE / indexes / RLS
-- enable cannot succeed while the policy statements fail, which would otherwise
-- leave an RLS-enabled table with zero policies -- invisible to every reader with
-- no error at read time (TR-3).
--
-- Rollback: DROP TABLE IF EXISTS public.video_prompts CASCADE; (0 production rows
-- today, so this is a safe rollback per the PRD risk register.)

BEGIN;

CREATE TABLE IF NOT EXISTS public.video_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,

  -- Prompt Configuration
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('product_demo', 'testimonial', 'feature_highlight', 'brand_story')),
  tone VARCHAR(50) NOT NULL CHECK (tone IN ('professional', 'casual', 'inspiring', 'technical')),
  duration VARCHAR(10) NOT NULL CHECK (duration IN ('30s', '60s', '90s')),
  style VARCHAR(50) NOT NULL CHECK (style IN ('cinematic', 'realistic', 'animated')),

  -- Platform-Specific Prompts
  sora_prompt TEXT,
  runway_prompt TEXT,
  kling_prompt TEXT,

  -- Usage Tracking
  used BOOLEAN DEFAULT false,
  platform_used VARCHAR(50) CHECK (platform_used IN ('sora', 'runway', 'kling', NULL)),
  performance_notes TEXT,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_video_prompts_venture ON public.video_prompts(venture_id);
CREATE INDEX IF NOT EXISTS idx_video_prompts_used ON public.video_prompts(used);
CREATE INDEX IF NOT EXISTS idx_video_prompts_created ON public.video_prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_prompts_template ON public.video_prompts(template_type);
CREATE INDEX IF NOT EXISTS idx_video_prompts_creator ON public.video_prompts(created_by);

-- Row Level Security (RLS) Policies
ALTER TABLE public.video_prompts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view prompts for ventures their company has access to (user_company_access
-- -- the SAME ownership model creative_assets_venture_access already uses successfully; NOT
-- ventures.created_by, which is NULL on all live ventures. See SEC-4 note above.)
DROP POLICY IF EXISTS "Users can view prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can view prompts for their ventures" ON public.video_prompts
  FOR SELECT
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can create prompts for ventures their company has access to; created_by must
-- be the caller (per-row authorship, even within the same company).
DROP POLICY IF EXISTS "Users can create prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can create prompts for their ventures" ON public.video_prompts
  FOR INSERT
  WITH CHECK (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can update their own prompts (company-access boundary + per-row authorship).
DROP POLICY IF EXISTS "Users can update their own prompts" ON public.video_prompts;
CREATE POLICY "Users can update their own prompts" ON public.video_prompts
  FOR UPDATE
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can delete their own prompts (company-access boundary + per-row authorship).
DROP POLICY IF EXISTS "Users can delete their own prompts" ON public.video_prompts;
CREATE POLICY "Users can delete their own prompts" ON public.video_prompts
  FOR DELETE
  USING (
    venture_id IN (
      SELECT v.id FROM public.ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM public.user_company_access WHERE user_id = auth.uid()
      )
    )
    AND created_by = auth.uid()
  );

-- Trigger to auto-update updated_at (reuses the existing shared function; does NOT
-- redefine it -- update_updated_at_column() already exists in this DB and is used
-- by other tables).
DROP TRIGGER IF EXISTS update_video_prompts_updated_at ON public.video_prompts;
CREATE TRIGGER update_video_prompts_updated_at
  BEFORE UPDATE ON public.video_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.video_prompts IS 'SD-CREATIVE-001 / SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D: AI-generated video prompts for Sora 2, Runway, and Kling platforms';
COMMENT ON COLUMN public.video_prompts.template_type IS 'Template used: product_demo, testimonial, feature_highlight, brand_story';
COMMENT ON COLUMN public.video_prompts.tone IS 'Prompt tone: professional, casual, inspiring, technical';
COMMENT ON COLUMN public.video_prompts.duration IS 'Target video duration: 30s, 60s, 90s';
COMMENT ON COLUMN public.video_prompts.style IS 'Visual style: cinematic, realistic, animated';
COMMENT ON COLUMN public.video_prompts.used IS 'Whether prompt was used on a platform';
COMMENT ON COLUMN public.video_prompts.platform_used IS 'Platform where prompt was used: sora, runway, kling';
COMMENT ON COLUMN public.video_prompts.user_rating IS 'User quality rating: 1-5 stars';

COMMIT;
