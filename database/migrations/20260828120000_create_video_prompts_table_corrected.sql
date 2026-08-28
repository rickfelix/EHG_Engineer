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

-- Policy: Users can view prompts for their own ventures
DROP POLICY IF EXISTS "Users can view prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can view prompts for their ventures" ON public.video_prompts
  FOR SELECT
  USING (
    venture_id IN (
      SELECT id FROM public.ventures WHERE created_by = auth.uid()
    )
  );

-- Policy: Users can create prompts for their own ventures
DROP POLICY IF EXISTS "Users can create prompts for their ventures" ON public.video_prompts;
CREATE POLICY "Users can create prompts for their ventures" ON public.video_prompts
  FOR INSERT
  WITH CHECK (
    venture_id IN (
      SELECT id FROM public.ventures WHERE created_by = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can update their own prompts
DROP POLICY IF EXISTS "Users can update their own prompts" ON public.video_prompts;
CREATE POLICY "Users can update their own prompts" ON public.video_prompts
  FOR UPDATE
  USING (
    venture_id IN (
      SELECT id FROM public.ventures WHERE created_by = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can delete their own prompts
DROP POLICY IF EXISTS "Users can delete their own prompts" ON public.video_prompts;
CREATE POLICY "Users can delete their own prompts" ON public.video_prompts
  FOR DELETE
  USING (
    venture_id IN (
      SELECT id FROM public.ventures WHERE created_by = auth.uid()
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
