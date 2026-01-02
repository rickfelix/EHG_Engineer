-- Migration: Feedback Loop tables for Pattern Library integration
-- SD: SD-FAILURE-FEEDBACK-001
-- Description: Links post-mortems to patterns and tracks improvements

-- ============================================
-- Table: postmortem_pattern_links
-- ============================================
CREATE TABLE IF NOT EXISTS postmortem_pattern_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  postmortem_id UUID NOT NULL REFERENCES venture_postmortems(id) ON DELETE CASCADE,
  pattern_id VARCHAR(20) NOT NULL, -- References failure_patterns.pattern_id

  -- Match metadata
  confidence_score INTEGER DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  match_type VARCHAR(20) DEFAULT 'manual' CHECK (match_type IN ('manual', 'auto_suggested', 'confirmed')),

  -- Annotations
  mapper_notes TEXT,
  matched_whys INTEGER[], -- Which why numbers matched (1-5)

  -- Metadata
  created_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(postmortem_id, pattern_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_postmortem_links_postmortem ON postmortem_pattern_links(postmortem_id);
CREATE INDEX IF NOT EXISTS idx_postmortem_links_pattern ON postmortem_pattern_links(pattern_id);

-- ============================================
-- Table: pattern_improvements
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source_postmortem_id UUID REFERENCES venture_postmortems(id) ON DELETE SET NULL,

  -- Target
  target_pattern_id VARCHAR(20) NOT NULL, -- References failure_patterns.pattern_id

  -- Improvement details
  improvement_type VARCHAR(30) NOT NULL CHECK (improvement_type IN ('update_signals', 'add_prevention', 'update_mitigation', 'new_pattern', 'deprecate')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  proposed_changes JSONB DEFAULT '{}',
  -- Example: { "add_signals": ["signal1"], "update_prevention": {...} }

  -- Workflow
  status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed', 'under_review', 'approved', 'implemented', 'rejected')),

  -- Review
  reviewed_by TEXT,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Version tracking
  implemented_in_version INTEGER,
  implementation_date TIMESTAMPTZ,

  -- Metadata
  proposed_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_improvements_pattern ON pattern_improvements(target_pattern_id);
CREATE INDEX IF NOT EXISTS idx_improvements_status ON pattern_improvements(status);
CREATE INDEX IF NOT EXISTS idx_improvements_postmortem ON pattern_improvements(source_postmortem_id);

-- ============================================
-- Function: Suggest patterns for a postmortem
-- ============================================
CREATE OR REPLACE FUNCTION suggest_patterns_for_postmortem(
  p_postmortem_id UUID,
  p_min_confidence INTEGER DEFAULT 30
) RETURNS TABLE (
  pattern_id VARCHAR(20),
  pattern_name TEXT,
  category VARCHAR(100),
  confidence_score INTEGER,
  matched_keywords TEXT[]
) AS $$
DECLARE
  v_postmortem RECORD;
  v_search_text TEXT;
BEGIN
  -- Get postmortem content
  SELECT
    LOWER(COALESCE(why_1, '') || ' ' ||
    COALESCE(why_2, '') || ' ' ||
    COALESCE(why_3, '') || ' ' ||
    COALESCE(why_4, '') || ' ' ||
    COALESCE(why_5, '') || ' ' ||
    COALESCE(root_cause_summary, ''))
  INTO v_search_text
  FROM venture_postmortems
  WHERE id = p_postmortem_id;

  IF v_search_text IS NULL THEN
    RETURN;
  END IF;

  -- Search patterns by detection signals
  RETURN QUERY
  SELECT
    fp.pattern_id,
    fp.pattern_name,
    fp.category,
    -- Simple keyword matching score
    (
      SELECT COUNT(*)::INTEGER * 20
      FROM JSONB_ARRAY_ELEMENTS_TEXT(fp.detection_signals) AS signal
      WHERE v_search_text LIKE '%' || LOWER(signal) || '%'
    ) AS score,
    -- Matched signals
    ARRAY(
      SELECT signal
      FROM JSONB_ARRAY_ELEMENTS_TEXT(fp.detection_signals) AS signal
      WHERE v_search_text LIKE '%' || LOWER(signal) || '%'
    ) AS matched
  FROM failure_patterns fp
  WHERE fp.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM JSONB_ARRAY_ELEMENTS_TEXT(fp.detection_signals) AS signal
      WHERE v_search_text LIKE '%' || LOWER(signal) || '%'
    )
  ORDER BY score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Improvement pipeline
-- ============================================
CREATE OR REPLACE VIEW v_pattern_improvement_pipeline AS
SELECT
  pi.id,
  pi.target_pattern_id,
  fp.pattern_name,
  pi.improvement_type,
  pi.title,
  pi.status,
  pi.proposed_by,
  pi.created_at,
  pm.venture_name AS source_venture
FROM pattern_improvements pi
LEFT JOIN failure_patterns fp ON fp.pattern_id = pi.target_pattern_id
LEFT JOIN venture_postmortems pm ON pm.id = pi.source_postmortem_id
ORDER BY
  CASE pi.status
    WHEN 'proposed' THEN 1
    WHEN 'under_review' THEN 2
    WHEN 'approved' THEN 3
    WHEN 'implemented' THEN 4
    WHEN 'rejected' THEN 5
  END,
  pi.created_at DESC;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE postmortem_pattern_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pattern links"
ON postmortem_pattern_links FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create pattern links"
ON postmortem_pattern_links FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view improvements"
ON pattern_improvements FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can propose improvements"
ON pattern_improvements FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update their proposals"
ON pattern_improvements FOR UPDATE
TO authenticated
USING (status = 'proposed')
WITH CHECK (status IN ('proposed', 'under_review'));

CREATE POLICY "Service role can manage all"
ON postmortem_pattern_links FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage improvements"
ON pattern_improvements FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT ON postmortem_pattern_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pattern_improvements TO authenticated;
GRANT SELECT ON v_pattern_improvement_pipeline TO authenticated;
