-- Migration: Create automatic reasoning control system
-- Purpose: Enable automatic chain-of-thought reasoning based on complexity detection
-- Date: 2025-09-24
-- LEO Protocol: v4.2.0 - Planning Mode Integration Phase 1

-- Create table for tracking automatic reasoning sessions
CREATE TABLE IF NOT EXISTS leo_reasoning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(255),
  prd_id VARCHAR(255),

  -- Automatic reasoning depth selection
  depth_level VARCHAR(20) NOT NULL CHECK (depth_level IN ('quick', 'standard', 'deep', 'ultra')),
  complexity_score INTEGER CHECK (complexity_score >= 0 AND complexity_score <= 100),

  -- Auto-trigger analysis
  auto_trigger_reasons TEXT[] DEFAULT '{}',
  trigger_keywords TEXT[] DEFAULT '{}',

  -- Reasoning chain data
  reasoning_chain JSONB NOT NULL DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "strategic_analysis": {"objectives": [], "business_value": "", "risks": []},
  --   "technical_analysis": {"complexity": "", "dependencies": [], "architecture": ""},
  --   "user_analysis": {"personas": [], "workflows": [], "acceptance_criteria": []},
  --   "implementation_analysis": {"steps": [], "timeline": "", "resources": []},
  --   "synthesis": {"recommendation": "", "confidence": 85}
  -- }

  -- Complexity factors that triggered enhanced reasoning
  complexity_factors JSONB DEFAULT '{}',
  -- {
  --   "functional_requirements_count": 8,
  --   "technical_complexity": "high",
  --   "security_requirements": true,
  --   "performance_requirements": true,
  --   "multi_system_integration": true,
  --   "priority_level": 90
  -- }

  -- Results and quality metrics
  reasoning_quality_score INTEGER CHECK (reasoning_quality_score >= 0 AND reasoning_quality_score <= 100),
  depth_appropriateness_score INTEGER CHECK (depth_appropriateness_score >= 0 AND depth_appropriateness_score <= 100),

  -- Processing time and resource usage
  processing_time_ms INTEGER,
  context_tokens_used INTEGER,

  -- Agent and processing info
  triggered_by_agent VARCHAR(50), -- 'PLAN', 'LEAD', 'system'
  processed_by_agent VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_reasoning_sd_id ON leo_reasoning_sessions(sd_id);
CREATE INDEX idx_reasoning_prd_id ON leo_reasoning_sessions(prd_id);
CREATE INDEX idx_reasoning_depth_level ON leo_reasoning_sessions(depth_level);
CREATE INDEX idx_reasoning_complexity_score ON leo_reasoning_sessions(complexity_score DESC);
CREATE INDEX idx_reasoning_created_at ON leo_reasoning_sessions(created_at DESC);
CREATE INDEX idx_reasoning_triggered_by ON leo_reasoning_sessions(triggered_by_agent);

-- Create complexity detection configuration table
CREATE TABLE IF NOT EXISTS leo_complexity_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_name VARCHAR(100) NOT NULL UNIQUE,
  threshold_config JSONB NOT NULL,
  -- {
  --   "quick": {"min": 0, "max": 25},
  --   "standard": {"min": 25, "max": 60},
  --   "deep": {"min": 60, "max": 85},
  --   "ultra": {"min": 85, "max": 100}
  -- }
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default complexity thresholds
INSERT INTO leo_complexity_thresholds (factor_name, threshold_config) VALUES
('functional_requirements_count', '{
  "quick": {"min": 0, "max": 2},
  "standard": {"min": 2, "max": 5},
  "deep": {"min": 5, "max": 10},
  "ultra": {"min": 10, "max": 999}
}'),
('priority_level', '{
  "quick": {"min": 0, "max": 30},
  "standard": {"min": 30, "max": 70},
  "deep": {"min": 70, "max": 89},
  "ultra": {"min": 90, "max": 100}
}'),
('technical_complexity', '{
  "quick": {"keywords": ["simple", "basic", "straightforward"]},
  "standard": {"keywords": ["moderate", "standard", "typical"]},
  "deep": {"keywords": ["complex", "advanced", "integration"]},
  "ultra": {"keywords": ["critical", "mission-critical", "enterprise", "security", "performance"]}
}'),
('risk_factors', '{
  "quick": {"keywords": ["low-risk", "minor"]},
  "standard": {"keywords": ["moderate-risk", "standard"]},
  "deep": {"keywords": ["high-risk", "compliance", "audit"]},
  "ultra": {"keywords": ["critical-risk", "security", "data-breach", "downtime"]}
}')
ON CONFLICT (factor_name) DO UPDATE SET
  threshold_config = EXCLUDED.threshold_config;

-- Create automatic reasoning triggers table
CREATE TABLE IF NOT EXISTS leo_reasoning_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'keyword', 'threshold', 'pattern'
  trigger_config JSONB NOT NULL,
  resulting_depth VARCHAR(20) NOT NULL CHECK (resulting_depth IN ('quick', 'standard', 'deep', 'ultra')),
  priority INTEGER DEFAULT 50, -- Higher number = higher priority
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default automatic triggers
INSERT INTO leo_reasoning_triggers (trigger_name, trigger_type, trigger_config, resulting_depth, priority) VALUES
('High Priority Items', 'threshold', '{"field": "priority", "operator": ">=", "value": 90}', 'ultra', 90),
('Security Requirements', 'keyword', '{"keywords": ["security", "authentication", "authorization", "encryption", "compliance"]}', 'ultra', 85),
('Performance Critical', 'keyword', '{"keywords": ["performance", "optimization", "scaling", "load", "latency"]}', 'deep', 80),
('Complex Integration', 'keyword', '{"keywords": ["integration", "api", "microservice", "database", "migration"]}', 'deep', 75),
('Many Requirements', 'threshold', '{"field": "functional_requirements_count", "operator": ">=", "value": 5}', 'deep', 70),
('Standard Complexity', 'threshold', '{"field": "functional_requirements_count", "operator": ">=", "value": 2}', 'standard', 50),
('Simple Tasks', 'threshold', '{"field": "functional_requirements_count", "operator": "<", "value": 2}', 'quick', 10)
ON CONFLICT DO NOTHING;

-- Create function to calculate complexity score
CREATE OR REPLACE FUNCTION calculate_complexity_score(
  p_functional_req_count INTEGER DEFAULT 1,
  p_priority INTEGER DEFAULT 50,
  p_description TEXT DEFAULT '',
  p_requirements TEXT DEFAULT ''
) RETURNS INTEGER AS $$
DECLARE
  complexity_score INTEGER := 0;
  keyword_matches INTEGER := 0;
  text_to_analyze TEXT;
BEGIN
  text_to_analyze := COALESCE(p_description, '') || ' ' || COALESCE(p_requirements, '');
  text_to_analyze := LOWER(text_to_analyze);

  -- Base score from functional requirements count (0-30 points)
  complexity_score := complexity_score + LEAST(p_functional_req_count * 5, 30);

  -- Priority contribution (0-25 points)
  complexity_score := complexity_score + ROUND(p_priority * 0.25);

  -- Keyword analysis for technical complexity (0-45 points)
  -- Ultra complexity keywords (15 points each, max 30)
  keyword_matches := (
    SELECT COUNT(*) FROM (
      SELECT 1 WHERE text_to_analyze ~ '(critical|mission.critical|enterprise|security|performance|scalability|compliance|audit)'
    ) t
  );
  complexity_score := complexity_score + LEAST(keyword_matches * 15, 30);

  -- Deep complexity keywords (10 points each, max 20)
  keyword_matches := (
    SELECT COUNT(*) FROM (
      SELECT 1 WHERE text_to_analyze ~ '(complex|advanced|integration|api|microservice|database|migration|optimization)'
    ) t
  );
  complexity_score := complexity_score + LEAST(keyword_matches * 10, 20);

  -- Standard complexity keywords (5 points each, max 10)
  keyword_matches := (
    SELECT COUNT(*) FROM (
      SELECT 1 WHERE text_to_analyze ~ '(moderate|standard|typical|workflow|process|automation)'
    ) t
  );
  complexity_score := complexity_score + LEAST(keyword_matches * 5, 10);

  -- Cap at 100
  RETURN LEAST(complexity_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Create function to determine reasoning depth
CREATE OR REPLACE FUNCTION determine_reasoning_depth(complexity_score INTEGER)
RETURNS VARCHAR(20) AS $$
BEGIN
  CASE
    WHEN complexity_score >= 85 THEN RETURN 'ultra';
    WHEN complexity_score >= 60 THEN RETURN 'deep';
    WHEN complexity_score >= 25 THEN RETURN 'standard';
    ELSE RETURN 'quick';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update completed_at when reasoning_chain is updated
CREATE OR REPLACE FUNCTION update_reasoning_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reasoning_chain IS DISTINCT FROM OLD.reasoning_chain AND
     jsonb_array_length(NEW.reasoning_chain->'synthesis') > 0 THEN
    NEW.completed_at := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reasoning_completion_trigger
  BEFORE UPDATE ON leo_reasoning_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_reasoning_completed_at();

-- Create view for reasoning analytics
CREATE OR REPLACE VIEW reasoning_analytics AS
SELECT
  depth_level,
  COUNT(*) as session_count,
  AVG(complexity_score) as avg_complexity,
  AVG(reasoning_quality_score) as avg_quality,
  AVG(processing_time_ms) as avg_processing_time,
  AVG(context_tokens_used) as avg_tokens,
  COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_sessions,
  triggered_by_agent
FROM leo_reasoning_sessions
GROUP BY depth_level, triggered_by_agent
ORDER BY
  CASE depth_level
    WHEN 'ultra' THEN 4
    WHEN 'deep' THEN 3
    WHEN 'standard' THEN 2
    WHEN 'quick' THEN 1
  END DESC;

COMMENT ON TABLE leo_reasoning_sessions IS 'Tracks automatic chain-of-thought reasoning sessions with complexity-based depth selection';
COMMENT ON TABLE leo_complexity_thresholds IS 'Configuration for automatic complexity detection and reasoning depth triggers';
COMMENT ON TABLE leo_reasoning_triggers IS 'Rules for automatically triggering different reasoning depths based on content analysis';
COMMENT ON FUNCTION calculate_complexity_score IS 'Calculates complexity score (0-100) based on requirements count, priority, and keyword analysis';
COMMENT ON FUNCTION determine_reasoning_depth IS 'Determines appropriate reasoning depth based on complexity score';