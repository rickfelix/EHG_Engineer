-- Migration: 20251221_ai_blueprint_discovery.sql
-- SD: AI-Generated Venture Idea Discovery
-- Purpose: Add AI discovery columns to opportunity_blueprints and create opportunity_scans table

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'AI Blueprint Discovery Migration';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';
END $$;

-- =============================================================================
-- PART 1: Enhance opportunity_blueprints table
-- =============================================================================

-- Add source_type to track origin (manual vs AI-generated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'source_type'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN source_type TEXT DEFAULT 'manual';

    -- Add constraint
    ALTER TABLE public.opportunity_blueprints
    ADD CONSTRAINT chk_blueprints_source_type
    CHECK (source_type IN ('manual', 'ai_generated', 'hybrid'));

    RAISE NOTICE '[+] Added source_type column';
  ELSE
    RAISE NOTICE '[=] source_type column already exists';
  END IF;
END $$;

-- Add opportunity_box for Green/Yellow/Red classification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'opportunity_box'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN opportunity_box TEXT;

    ALTER TABLE public.opportunity_blueprints
    ADD CONSTRAINT chk_blueprints_opportunity_box
    CHECK (opportunity_box IN ('green', 'yellow', 'red'));

    RAISE NOTICE '[+] Added opportunity_box column';
  ELSE
    RAISE NOTICE '[=] opportunity_box column already exists';
  END IF;
END $$;

-- Add time_to_capture_days for opportunity timing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'time_to_capture_days'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN time_to_capture_days INTEGER;

    RAISE NOTICE '[+] Added time_to_capture_days column';
  ELSE
    RAISE NOTICE '[=] time_to_capture_days column already exists';
  END IF;
END $$;

-- Add gap_analysis JSONB for 6-dimension analysis
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'gap_analysis'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN gap_analysis JSONB DEFAULT '{}';

    COMMENT ON COLUMN public.opportunity_blueprints.gap_analysis IS
      'Six-dimension gap analysis: { features, pricing, segments, experience, integrations, quality }';

    RAISE NOTICE '[+] Added gap_analysis column';
  ELSE
    RAISE NOTICE '[=] gap_analysis column already exists';
  END IF;
END $$;

-- Add ai_metadata JSONB for AI generation details
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'ai_metadata'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN ai_metadata JSONB DEFAULT '{}';

    COMMENT ON COLUMN public.opportunity_blueprints.ai_metadata IS
      'AI generation metadata: { model, confidence, scan_id, generated_at, four_buckets }';

    RAISE NOTICE '[+] Added ai_metadata column';
  ELSE
    RAISE NOTICE '[=] ai_metadata column already exists';
  END IF;
END $$;

-- Add confidence_score for auto-approval logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'confidence_score'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN confidence_score INTEGER;

    ALTER TABLE public.opportunity_blueprints
    ADD CONSTRAINT chk_blueprints_confidence_score
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

    COMMENT ON COLUMN public.opportunity_blueprints.confidence_score IS
      'AI confidence score (0-100). >=85 auto-approved, 70-84 pending review, <70 rejected';

    RAISE NOTICE '[+] Added confidence_score column';
  ELSE
    RAISE NOTICE '[=] confidence_score column already exists';
  END IF;
END $$;

-- Add scan_id to link blueprint to discovery scan
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'opportunity_blueprints'
    AND column_name = 'scan_id'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD COLUMN scan_id UUID;

    RAISE NOTICE '[+] Added scan_id column';
  ELSE
    RAISE NOTICE '[=] scan_id column already exists';
  END IF;
END $$;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_blueprints_source_type
  ON public.opportunity_blueprints(source_type);

CREATE INDEX IF NOT EXISTS idx_blueprints_opportunity_box
  ON public.opportunity_blueprints(opportunity_box);

CREATE INDEX IF NOT EXISTS idx_blueprints_confidence_score
  ON public.opportunity_blueprints(confidence_score);

CREATE INDEX IF NOT EXISTS idx_blueprints_scan_id
  ON public.opportunity_blueprints(scan_id);

RAISE NOTICE '[+] Created indexes on opportunity_blueprints';

-- =============================================================================
-- PART 2: Create opportunity_scans table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.opportunity_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scan configuration
  scan_type TEXT NOT NULL CHECK (scan_type IN ('competitor', 'market_trend', 'full')),
  target_url TEXT,
  target_market TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Results summary
  opportunities_found INTEGER DEFAULT 0,
  blueprints_generated INTEGER DEFAULT 0,
  blueprints_auto_approved INTEGER DEFAULT 0,
  blueprints_pending_review INTEGER DEFAULT 0,

  -- Raw analysis data
  raw_analysis JSONB,
  four_buckets JSONB,
  gap_analysis JSONB,

  -- Timing
  duration_ms INTEGER,

  -- Error tracking
  error_message TEXT,

  -- Audit
  initiated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Add foreign key from blueprints to scans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_blueprints_scan_id'
  ) THEN
    ALTER TABLE public.opportunity_blueprints
    ADD CONSTRAINT fk_blueprints_scan_id
    FOREIGN KEY (scan_id) REFERENCES public.opportunity_scans(id);

    RAISE NOTICE '[+] Added foreign key from blueprints to scans';
  ELSE
    RAISE NOTICE '[=] Foreign key already exists';
  END IF;
END $$;

-- Create indexes for opportunity_scans
CREATE INDEX IF NOT EXISTS idx_scans_status
  ON public.opportunity_scans(status);

CREATE INDEX IF NOT EXISTS idx_scans_created_at
  ON public.opportunity_scans(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scans_scan_type
  ON public.opportunity_scans(scan_type);

RAISE NOTICE '[+] Created opportunity_scans table and indexes';

-- =============================================================================
-- PART 3: RLS Policies
-- =============================================================================

-- Enable RLS on opportunity_scans
ALTER TABLE public.opportunity_scans ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view scans
DROP POLICY IF EXISTS "Anyone can view scans" ON public.opportunity_scans;
CREATE POLICY "Anyone can view scans" ON public.opportunity_scans
  FOR SELECT USING (true);

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access to scans" ON public.opportunity_scans;
CREATE POLICY "Service role full access to scans" ON public.opportunity_scans
  FOR ALL USING (auth.role() = 'service_role');

RAISE NOTICE '[+] Created RLS policies for opportunity_scans';

-- =============================================================================
-- PART 4: Comments and Documentation
-- =============================================================================

COMMENT ON TABLE public.opportunity_scans IS
  'Tracks AI opportunity discovery scans. Each scan can generate multiple blueprints.';

COMMENT ON COLUMN public.opportunity_scans.scan_type IS
  'Type of scan: competitor (analyze URL), market_trend (scan market), full (comprehensive)';

COMMENT ON COLUMN public.opportunity_scans.four_buckets IS
  'Epistemic classification: { facts, assumptions, simulations, unknowns }';

COMMENT ON COLUMN public.opportunity_scans.gap_analysis IS
  'Six dimensions: { features, pricing, segments, experience, integrations, quality }';

-- =============================================================================
-- Summary
-- =============================================================================

DO $$
DECLARE
  blueprint_count INTEGER;
  scan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO blueprint_count FROM public.opportunity_blueprints;
  SELECT COUNT(*) INTO scan_count FROM public.opportunity_scans;

  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'Migration Complete';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'opportunity_blueprints: % rows (new columns added)', blueprint_count;
  RAISE NOTICE 'opportunity_scans: % rows (new table)', scan_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New columns on opportunity_blueprints:';
  RAISE NOTICE '  - source_type (manual/ai_generated/hybrid)';
  RAISE NOTICE '  - opportunity_box (green/yellow/red)';
  RAISE NOTICE '  - time_to_capture_days';
  RAISE NOTICE '  - gap_analysis (JSONB)';
  RAISE NOTICE '  - ai_metadata (JSONB)';
  RAISE NOTICE '  - confidence_score (0-100)';
  RAISE NOTICE '  - scan_id (FK to opportunity_scans)';
  RAISE NOTICE '';
  RAISE NOTICE 'Auto-approval logic:';
  RAISE NOTICE '  - confidence_score >= 85: auto-approved';
  RAISE NOTICE '  - confidence_score 70-84: pending review';
  RAISE NOTICE '  - confidence_score < 70: auto-rejected';
  RAISE NOTICE '';
END $$;
