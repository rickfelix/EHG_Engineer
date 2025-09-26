-- Strategic Directive Overlap Detection Tables
-- Part of Enhanced Validation Sub-Agent System
-- Detects and tracks overlapping scope between SDs

-- Drop existing tables if they exist
DROP TABLE IF EXISTS sd_overlap_analysis CASCADE;
DROP TABLE IF EXISTS sd_dependency_graph CASCADE;
DROP VIEW IF EXISTS v_sd_overlap_matrix CASCADE;

-- Table to store overlap analysis results
CREATE TABLE sd_overlap_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd1_id TEXT NOT NULL,
  sd2_id TEXT NOT NULL,
  analysis_timestamp TIMESTAMP DEFAULT NOW(),

  -- Overlap metrics
  overlap_score NUMERIC(5,2) CHECK (overlap_score >= 0 AND overlap_score <= 100),
  stage_overlap_count INTEGER DEFAULT 0,
  keyword_similarity NUMERIC(5,2) DEFAULT 0,
  functional_overlap NUMERIC(5,2) DEFAULT 0,
  resource_conflicts INTEGER DEFAULT 0,

  -- Detailed overlap data
  overlapping_stages INTEGER[],
  overlapping_items JSONB DEFAULT '[]'::jsonb,
  shared_keywords TEXT[],
  conflicting_resources JSONB DEFAULT '{}'::jsonb,

  -- Recommendations
  recommendation TEXT CHECK (recommendation IN (
    'NO_ACTION',
    'CONSOLIDATE',
    'SEQUENCE',
    'SHARE_COMPONENTS',
    'ESCALATE',
    'BLOCK'
  )),
  recommended_sequence TEXT[], -- Array of SD IDs in recommended execution order
  resolution_notes TEXT,

  -- Metadata
  analyzed_by TEXT DEFAULT 'VALIDATION',
  human_reviewed BOOLEAN DEFAULT FALSE,
  review_notes TEXT,

  -- Ensure we don't duplicate analysis
  CONSTRAINT unique_sd_pair UNIQUE (sd1_id, sd2_id),
  CONSTRAINT different_sds CHECK (sd1_id != sd2_id)
);

-- Table to track SD dependencies and relationships
CREATE TABLE sd_dependency_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_sd_id TEXT NOT NULL,
  to_sd_id TEXT NOT NULL,
  dependency_type TEXT CHECK (dependency_type IN (
    'PREREQUISITE',      -- Must complete from_sd before to_sd
    'BLOCKS',           -- from_sd blocks to_sd
    'ENHANCES',         -- to_sd enhances from_sd
    'CONFLICTS',        -- Mutual conflict
    'SHARES_RESOURCES', -- Share components/data
    'PARALLEL_OK'       -- Can run in parallel
  )),
  dependency_strength TEXT CHECK (dependency_strength IN (
    'HARD',    -- Must respect dependency
    'SOFT',    -- Should respect dependency
    'OPTIONAL' -- Nice to respect dependency
  )),
  detected_at TIMESTAMP DEFAULT NOW(),
  detection_method TEXT, -- How was this dependency detected
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Prevent duplicate edges in graph
  CONSTRAINT unique_dependency UNIQUE (from_sd_id, to_sd_id, dependency_type)
);

-- View to show overlap matrix between all SDs
CREATE VIEW v_sd_overlap_matrix AS
WITH sd_pairs AS (
  SELECT
    s1.id as sd1_id,
    s1.sd_key as sd1_key,
    s1.title as sd1_title,
    s2.id as sd2_id,
    s2.sd_key as sd2_key,
    s2.title as sd2_title,
    oa.overlap_score,
    oa.recommendation,
    oa.stage_overlap_count,
    oa.keyword_similarity,
    oa.functional_overlap,
    oa.overlapping_stages,
    oa.analysis_timestamp
  FROM strategic_directives_v2 s1
  CROSS JOIN strategic_directives_v2 s2
  LEFT JOIN sd_overlap_analysis oa ON
    (oa.sd1_id = s1.id AND oa.sd2_id = s2.id) OR
    (oa.sd1_id = s2.id AND oa.sd2_id = s1.id)
  WHERE s1.id < s2.id  -- Avoid duplicates and self-joins
    AND s1.status IN ('draft', 'active', 'in_progress')
    AND s2.status IN ('draft', 'active', 'in_progress')
)
SELECT
  sd1_key,
  sd1_title,
  sd2_key,
  sd2_title,
  COALESCE(overlap_score, 0) as overlap_score,
  COALESCE(recommendation, 'NOT_ANALYZED') as recommendation,
  COALESCE(stage_overlap_count, 0) as stage_conflicts,
  COALESCE(keyword_similarity, 0) as keyword_match,
  COALESCE(functional_overlap, 0) as functional_match,
  overlapping_stages,
  CASE
    WHEN overlap_score IS NULL THEN 'Pending Analysis'
    WHEN overlap_score >= 70 THEN 'High Overlap - Review Required'
    WHEN overlap_score >= 40 THEN 'Moderate Overlap - Consider Consolidation'
    WHEN overlap_score >= 20 THEN 'Low Overlap - Monitor'
    ELSE 'No Significant Overlap'
  END as overlap_status,
  analysis_timestamp
FROM sd_pairs
ORDER BY COALESCE(overlap_score, 0) DESC;

-- Function to calculate keyword similarity between two texts
CREATE OR REPLACE FUNCTION calculate_keyword_similarity(
  text1 TEXT,
  text2 TEXT
) RETURNS NUMERIC AS $$
DECLARE
  words1 TEXT[];
  words2 TEXT[];
  common_words INTEGER;
  total_words INTEGER;
BEGIN
  -- Extract significant words (length > 3, lowercase)
  words1 := ARRAY(
    SELECT DISTINCT lower(word)
    FROM unnest(string_to_array(text1, ' ')) AS word
    WHERE length(word) > 3
  );

  words2 := ARRAY(
    SELECT DISTINCT lower(word)
    FROM unnest(string_to_array(text2, ' ')) AS word
    WHERE length(word) > 3
  );

  -- Calculate intersection
  common_words := CARDINALITY(
    ARRAY(
      SELECT unnest(words1)
      INTERSECT
      SELECT unnest(words2)
    )
  );

  -- Calculate union for Jaccard similarity
  total_words := CARDINALITY(words1) + CARDINALITY(words2) - common_words;

  IF total_words = 0 THEN
    RETURN 0;
  END IF;

  -- Return Jaccard similarity coefficient as percentage
  RETURN ROUND((common_words::NUMERIC / total_words::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to detect overlaps between two SDs
CREATE OR REPLACE FUNCTION analyze_sd_overlap(
  p_sd1_id TEXT,
  p_sd2_id TEXT
) RETURNS sd_overlap_analysis AS $$
DECLARE
  v_result sd_overlap_analysis;
  v_overlap_score NUMERIC;
  v_stage_overlap INTEGER;
  v_keyword_sim NUMERIC;
  v_functional_overlap NUMERIC;
  v_overlapping_stages INTEGER[];
  v_overlapping_items JSONB;
  v_recommendation TEXT;
BEGIN
  -- Get SD details
  WITH sd_data AS (
    SELECT
      s.id,
      s.title,
      s.description,
      s.objective,
      ARRAY_AGG(DISTINCT b.stage_number) as stages,
      COUNT(DISTINCT b.backlog_id) as item_count,
      STRING_AGG(b.backlog_title, ' ') as all_titles
    FROM strategic_directives_v2 s
    LEFT JOIN sd_backlog_map b ON b.sd_id = s.id
    WHERE s.id IN (p_sd1_id, p_sd2_id)
    GROUP BY s.id, s.title, s.description, s.objective
  ),
  overlap_calc AS (
    SELECT
      d1.id as sd1_id,
      d2.id as sd2_id,
      -- Calculate stage overlap
      CARDINALITY(
        ARRAY(
          SELECT unnest(d1.stages)
          INTERSECT
          SELECT unnest(d2.stages)
        )
      ) as stage_overlap,
      -- Get overlapping stages
      ARRAY(
        SELECT unnest(d1.stages)
        INTERSECT
        SELECT unnest(d2.stages)
        ORDER BY 1
      ) as overlapping_stages,
      -- Calculate keyword similarity
      calculate_keyword_similarity(
        COALESCE(d1.title, '') || ' ' || COALESCE(d1.all_titles, ''),
        COALESCE(d2.title, '') || ' ' || COALESCE(d2.all_titles, '')
      ) as keyword_similarity
    FROM sd_data d1
    JOIN sd_data d2 ON d1.id != d2.id
    WHERE d1.id = p_sd1_id AND d2.id = p_sd2_id
  )
  SELECT
    stage_overlap,
    overlapping_stages,
    keyword_similarity
  INTO
    v_stage_overlap,
    v_overlapping_stages,
    v_keyword_sim
  FROM overlap_calc;

  -- Get overlapping backlog items
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'sd1_item', b1.backlog_title,
        'sd2_item', b2.backlog_title,
        'stage', b1.stage_number,
        'similarity_type', CASE
          WHEN b1.stage_number = b2.stage_number THEN 'same_stage'
          WHEN b1.backlog_title ILIKE '%' || b2.backlog_title || '%' OR
               b2.backlog_title ILIKE '%' || b1.backlog_title || '%' THEN 'title_match'
          ELSE 'keyword_match'
        END
      )
    ), '[]'::jsonb)
  INTO v_overlapping_items
  FROM sd_backlog_map b1
  JOIN sd_backlog_map b2 ON b1.sd_id != b2.sd_id
    AND (
      b1.stage_number = b2.stage_number
      OR b1.backlog_title ILIKE '%' || split_part(b2.backlog_title, ' ', 1) || '%'
    )
  WHERE b1.sd_id = p_sd1_id AND b2.sd_id = p_sd2_id;

  -- Calculate functional overlap (simplified - could be enhanced)
  v_functional_overlap := GREATEST(
    v_keyword_sim * 0.5,
    v_stage_overlap * 10
  );

  -- Calculate overall overlap score
  v_overlap_score := LEAST(100,
    (v_stage_overlap * 20) +     -- Stage overlap weighted heavily
    (v_keyword_sim * 0.4) +       -- Keyword similarity
    (v_functional_overlap * 0.4)  -- Functional overlap
  );

  -- Determine recommendation
  v_recommendation := CASE
    WHEN v_overlap_score >= 70 THEN 'CONSOLIDATE'
    WHEN v_overlap_score >= 50 AND v_stage_overlap > 2 THEN 'SEQUENCE'
    WHEN v_overlap_score >= 30 THEN 'SHARE_COMPONENTS'
    WHEN v_overlap_score >= 20 THEN 'NO_ACTION'
    ELSE 'NO_ACTION'
  END;

  -- Build result
  v_result.sd1_id := p_sd1_id;
  v_result.sd2_id := p_sd2_id;
  v_result.overlap_score := v_overlap_score;
  v_result.stage_overlap_count := v_stage_overlap;
  v_result.keyword_similarity := v_keyword_sim;
  v_result.functional_overlap := v_functional_overlap;
  v_result.overlapping_stages := v_overlapping_stages;
  v_result.overlapping_items := v_overlapping_items;
  v_result.recommendation := v_recommendation;
  v_result.resource_conflicts := 0; -- TODO: Implement resource conflict detection

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX idx_overlap_sd1 ON sd_overlap_analysis(sd1_id);
CREATE INDEX idx_overlap_sd2 ON sd_overlap_analysis(sd2_id);
CREATE INDEX idx_overlap_score ON sd_overlap_analysis(overlap_score DESC);
CREATE INDEX idx_overlap_timestamp ON sd_overlap_analysis(analysis_timestamp DESC);
CREATE INDEX idx_dependency_from ON sd_dependency_graph(from_sd_id);
CREATE INDEX idx_dependency_to ON sd_dependency_graph(to_sd_id);
CREATE INDEX idx_dependency_type ON sd_dependency_graph(dependency_type);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON sd_overlap_analysis TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sd_dependency_graph TO authenticated;
GRANT SELECT ON v_sd_overlap_matrix TO authenticated;

-- Add comments
COMMENT ON TABLE sd_overlap_analysis IS 'Stores overlap analysis results between strategic directives';
COMMENT ON TABLE sd_dependency_graph IS 'Tracks dependencies and relationships between strategic directives';
COMMENT ON VIEW v_sd_overlap_matrix IS 'Matrix view showing overlap scores between all active SDs';
COMMENT ON FUNCTION analyze_sd_overlap IS 'Analyzes overlap between two strategic directives';
COMMENT ON FUNCTION calculate_keyword_similarity IS 'Calculates Jaccard similarity coefficient for keyword overlap';