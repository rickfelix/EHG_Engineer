-- Sprint 4: Smart Search Foundation Database Schema
-- SD-002: AI Navigation - Intelligent Search Implementation
-- Created: 2025-09-23
-- LEO Protocol: v4.2.0

-- ============================================
-- 1. SEARCH INDEX TABLE
-- ============================================
-- Stores indexed content for fast searching
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(50) NOT NULL, -- 'navigation', 'command', 'content', 'shortcut'
  content_id VARCHAR(255) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  keywords TEXT[], -- Array of keywords for GIN indexing
  metadata JSONB DEFAULT '{}',
  search_weight INTEGER DEFAULT 100, -- Higher weight = higher relevance
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_search_index_keywords ON search_index USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index USING GIN(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_search_index_description ON search_index USING GIN(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_search_index_content_type ON search_index(content_type);
CREATE INDEX IF NOT EXISTS idx_search_index_active ON search_index(is_active) WHERE is_active = true;

-- ============================================
-- 2. SEARCH HISTORY TABLE
-- ============================================
-- Tracks user searches for learning and analytics
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) DEFAULT 'anonymous',
  query TEXT NOT NULL,
  normalized_query TEXT, -- Lowercase, trimmed version for grouping
  results JSONB DEFAULT '[]', -- Array of result IDs and scores
  result_count INTEGER DEFAULT 0,
  selected_result VARCHAR(255), -- Which result user clicked
  search_time_ms INTEGER, -- Response time in milliseconds
  context JSONB DEFAULT '{}', -- Current path, time of day, etc.
  session_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for history analysis
CREATE INDEX IF NOT EXISTS idx_search_history_user_query ON search_history(user_id, normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_selected ON search_history(selected_result) WHERE selected_result IS NOT NULL;

-- ============================================
-- 3. SEARCH RANKINGS TABLE
-- ============================================
-- Tracks click-through rates and relevance scores
CREATE TABLE IF NOT EXISTS search_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) DEFAULT 'global', -- Can be user-specific or global
  click_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0, -- How many times shown in results
  last_clicked TIMESTAMPTZ,
  relevance_score FLOAT DEFAULT 0.5, -- 0.0 to 1.0 relevance
  boost_factor FLOAT DEFAULT 1.0, -- Manual boost for important items
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, user_id)
);

-- Indexes for ranking queries
CREATE INDEX IF NOT EXISTS idx_search_rankings_content ON search_rankings(content_id, user_id);
CREATE INDEX IF NOT EXISTS idx_search_rankings_relevance ON search_rankings(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_rankings_clicks ON search_rankings(click_count DESC);

-- ============================================
-- 4. SEARCH SUGGESTIONS TABLE
-- ============================================
-- Stores popular queries for autocomplete
CREATE TABLE IF NOT EXISTS search_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL UNIQUE,
  normalized_query TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  is_promoted BOOLEAN DEFAULT false, -- Manually promoted suggestions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_suggestions_query ON search_suggestions(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_suggestions_frequency ON search_suggestions(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_search_suggestions_promoted ON search_suggestions(is_promoted) WHERE is_promoted = true;

-- ============================================
-- 5. FUNCTIONS
-- ============================================

-- Function to perform smart search
CREATE OR REPLACE FUNCTION smart_search(
  p_query TEXT,
  p_user_id VARCHAR(255) DEFAULT 'anonymous',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  content_id VARCHAR(255),
  content_type VARCHAR(50),
  title VARCHAR(255),
  description TEXT,
  score FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized_query TEXT;
BEGIN
  -- Normalize the query
  v_normalized_query := LOWER(TRIM(p_query));
  
  -- Return ranked results combining text search and user preferences
  RETURN QUERY
  WITH text_matches AS (
    SELECT 
      si.content_id,
      si.content_type,
      si.title,
      si.description,
      si.metadata,
      si.search_weight,
      -- Calculate text relevance score
      GREATEST(
        ts_rank(to_tsvector('english', si.title), plainto_tsquery('english', v_normalized_query)),
        ts_rank(to_tsvector('english', COALESCE(si.description, '')), plainto_tsquery('english', v_normalized_query)) * 0.5,
        CASE WHEN v_normalized_query = ANY(si.keywords) THEN 1.0 ELSE 0.0 END
      ) as text_score
    FROM search_index si
    WHERE si.is_active = true
      AND (
        to_tsvector('english', si.title) @@ plainto_tsquery('english', v_normalized_query)
        OR to_tsvector('english', COALESCE(si.description, '')) @@ plainto_tsquery('english', v_normalized_query)
        OR v_normalized_query = ANY(si.keywords)
        OR si.title ILIKE '%' || v_normalized_query || '%'
      )
  ),
  ranked_results AS (
    SELECT
      tm.content_id,
      tm.content_type,
      tm.title,
      tm.description,
      tm.metadata,
      -- Combine text score with user preferences and click data
      (
        tm.text_score * tm.search_weight * 0.4 +  -- Text relevance (40%)
        COALESCE(sr.relevance_score, 0.5) * 100 * 0.3 +  -- User relevance (30%)
        COALESCE(LOG(sr.click_count + 1), 0) * 10 * 0.2 +  -- Popularity (20%)
        COALESCE(sr.boost_factor, 1.0) * 50 * 0.1  -- Manual boost (10%)
      ) as final_score
    FROM text_matches tm
    LEFT JOIN search_rankings sr ON 
      sr.content_id = tm.content_id 
      AND sr.user_id IN (p_user_id, 'global')
  )
  SELECT 
    content_id,
    content_type,
    title,
    description,
    final_score as score,
    metadata
  FROM ranked_results
  ORDER BY final_score DESC
  LIMIT p_limit;
END;
$$;

-- Function to record search feedback
CREATE OR REPLACE FUNCTION record_search_feedback(
  p_query TEXT,
  p_selected_content_id VARCHAR(255),
  p_user_id VARCHAR(255) DEFAULT 'anonymous',
  p_shown_results JSONB DEFAULT '[]'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Update click count for selected result
  IF p_selected_content_id IS NOT NULL THEN
    INSERT INTO search_rankings (content_id, user_id, click_count, last_clicked)
    VALUES (p_selected_content_id, p_user_id, 1, NOW())
    ON CONFLICT (content_id, user_id) DO UPDATE
    SET 
      click_count = search_rankings.click_count + 1,
      last_clicked = NOW(),
      relevance_score = LEAST(search_rankings.relevance_score + 0.01, 1.0),
      updated_at = NOW();
  END IF;
  
  -- Update impression count for all shown results
  FOR v_result IN SELECT * FROM jsonb_array_elements(p_shown_results)
  LOOP
    INSERT INTO search_rankings (content_id, user_id, impression_count)
    VALUES (v_result->>'id', p_user_id, 1)
    ON CONFLICT (content_id, user_id) DO UPDATE
    SET 
      impression_count = search_rankings.impression_count + 1,
      updated_at = NOW();
  END LOOP;
  
  -- Update search suggestions
  INSERT INTO search_suggestions (query, normalized_query, frequency, last_used)
  VALUES (p_query, LOWER(TRIM(p_query)), 1, NOW())
  ON CONFLICT (query) DO UPDATE
  SET 
    frequency = search_suggestions.frequency + 1,
    last_used = NOW();
END;
$$;

-- Function to get search suggestions
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_prefix TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  suggestion TEXT,
  frequency INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.query as suggestion,
    ss.frequency
  FROM search_suggestions ss
  WHERE ss.normalized_query LIKE LOWER(TRIM(p_prefix)) || '%'
    OR ss.is_promoted = true
  ORDER BY 
    ss.is_promoted DESC,
    ss.frequency DESC,
    ss.last_used DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- 6. TRIGGERS
-- ============================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_search_index_updated_at
  BEFORE UPDATE ON search_index
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_search_rankings_updated_at
  BEFORE UPDATE ON search_rankings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. INITIAL DATA POPULATION
-- ============================================

-- Populate search index with navigation shortcuts from Sprint 3
INSERT INTO search_index (content_type, content_id, title, description, keywords, search_weight)
VALUES 
  ('navigation', 'nav_dashboard', 'Dashboard', 'Main application dashboard', ARRAY['dashboard', 'home', 'main', 'overview'], 150),
  ('navigation', 'nav_portfolio', 'Portfolio', 'View your work portfolio', ARRAY['portfolio', 'projects', 'work', 'showcase'], 120),
  ('navigation', 'nav_settings', 'Settings', 'Application settings and preferences', ARRAY['settings', 'preferences', 'config', 'configuration'], 100),
  ('navigation', 'nav_analytics', 'Analytics', 'View usage analytics and metrics', ARRAY['analytics', 'metrics', 'stats', 'statistics'], 110),
  ('navigation', 'nav_search', 'Search', 'Smart search interface', ARRAY['search', 'find', 'query', 'lookup'], 140),
  ('command', 'cmd_new_project', 'New Project', 'Create a new project', ARRAY['new', 'create', 'project', 'add'], 130),
  ('command', 'cmd_export', 'Export Data', 'Export data to various formats', ARRAY['export', 'download', 'save', 'output'], 90),
  ('command', 'cmd_refresh', 'Refresh', 'Refresh current view', ARRAY['refresh', 'reload', 'update', 'sync'], 80),
  ('shortcut', 'shortcut_cmd1', 'Command+1', 'Dashboard shortcut', ARRAY['cmd1', 'shortcut', 'keyboard'], 70)
ON CONFLICT (content_id) DO NOTHING;

-- Add some promoted suggestions
INSERT INTO search_suggestions (query, normalized_query, is_promoted)
VALUES 
  ('Dashboard', 'dashboard', true),
  ('Settings', 'settings', true),
  ('Search', 'search', true),
  ('Help', 'help', true)
ON CONFLICT (query) DO NOTHING;

-- ============================================
-- 8. COMMENTS
-- ============================================
COMMENT ON TABLE search_index IS 'Sprint 4: Stores indexed content for smart search functionality';
COMMENT ON TABLE search_history IS 'Sprint 4: Tracks user search queries and interactions for learning';
COMMENT ON TABLE search_rankings IS 'Sprint 4: Maintains relevance scores and click-through rates';
COMMENT ON TABLE search_suggestions IS 'Sprint 4: Stores popular queries for autocomplete suggestions';
COMMENT ON FUNCTION smart_search IS 'Sprint 4: Main search function with intelligent ranking';
COMMENT ON FUNCTION record_search_feedback IS 'Sprint 4: Records user interactions to improve search relevance';
COMMENT ON FUNCTION get_search_suggestions IS 'Sprint 4: Returns autocomplete suggestions based on prefix';