-- Migration: Add planning_section to PRD table
-- Purpose: Add structured planning section to PRDs for enhanced implementation guidance
-- Date: 2025-09-24
-- LEO Protocol: v4.2.0 - Planning Mode Integration Phase 2

-- Add planning_section to product_requirements_v2 table
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS planning_section JSONB DEFAULT '{
  "implementation_steps": [],
  "risk_analysis": {},
  "resource_requirements": {},
  "timeline_breakdown": {},
  "reasoning_depth_used": "standard",
  "quality_gates": [],
  "success_metrics": []
}';

-- Add reasoning analysis fields to store automatic reasoning results
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS reasoning_analysis JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS complexity_analysis JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS reasoning_depth VARCHAR(20) DEFAULT 'standard' CHECK (reasoning_depth IN ('quick', 'standard', 'deep', 'ultra')),
ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100);

-- Create index for reasoning depth queries
CREATE INDEX IF NOT EXISTS idx_prd_reasoning_depth ON product_requirements_v2(reasoning_depth);
CREATE INDEX IF NOT EXISTS idx_prd_confidence_score ON product_requirements_v2(confidence_score DESC);

-- Create trigger to automatically update planning_section when reasoning_analysis changes
CREATE OR REPLACE FUNCTION update_planning_section_from_reasoning()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if reasoning_analysis has changed and is not empty
  IF NEW.reasoning_analysis IS DISTINCT FROM OLD.reasoning_analysis AND
     NEW.reasoning_analysis IS NOT NULL AND
     jsonb_typeof(NEW.reasoning_analysis) = 'object' AND
     NEW.reasoning_analysis != '{}' THEN

    -- Extract planning information from reasoning analysis
    NEW.planning_section := jsonb_build_object(
      'implementation_steps',
      COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'steps', '[]'::jsonb),

      'risk_analysis',
      jsonb_build_object(
        'identified_risks', COALESCE(NEW.reasoning_analysis->'strategic_analysis'->'risks', '[]'::jsonb),
        'mitigation_strategies', COALESCE(NEW.reasoning_analysis->'risk_analysis'->'mitigation_strategies', '[]'::jsonb),
        'technical_risks', COALESCE(NEW.reasoning_analysis->'risk_analysis'->'technical_risks', '[]'::jsonb),
        'business_risks', COALESCE(NEW.reasoning_analysis->'risk_analysis'->'business_risks', '[]'::jsonb)
      ),

      'resource_requirements',
      jsonb_build_object(
        'estimated_resources', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'resources', '"Standard resource allocation"'::jsonb),
        'timeline_estimate', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'timeline', '"Standard timeline"'::jsonb),
        'resource_optimization', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'resource_optimization', '""'::jsonb)
      ),

      'timeline_breakdown',
      jsonb_build_object(
        'phased_approach', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'phased_approach', '[]'::jsonb),
        'critical_path', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'critical_path_analysis', '""'::jsonb),
        'estimated_duration', COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'timeline', '"Standard timeline"'::jsonb)
      ),

      'reasoning_depth_used',
      COALESCE(NEW.reasoning_depth, 'standard'),

      'quality_gates',
      COALESCE(NEW.reasoning_analysis->'implementation_analysis'->'quality_gates',
        '["Requirements Review", "Implementation Review", "Testing Review", "Deployment Review"]'::jsonb),

      'success_metrics',
      COALESCE(NEW.reasoning_analysis->'synthesis'->'success_metrics',
        '["All requirements implemented", "Tests passing", "Performance targets met"]'::jsonb),

      'confidence_assessment',
      jsonb_build_object(
        'overall_confidence', COALESCE(NEW.confidence_score, 70),
        'recommendation', COALESCE(NEW.reasoning_analysis->'synthesis'->'recommendation', '"Proceed with implementation"'::jsonb),
        'alternatives_considered', COALESCE(NEW.reasoning_analysis->'synthesis'->'alternatives_considered', '[]'::jsonb)
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS planning_section_auto_update_trigger ON product_requirements_v2;
CREATE TRIGGER planning_section_auto_update_trigger
  BEFORE INSERT OR UPDATE OF reasoning_analysis ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_planning_section_from_reasoning();

-- Create view for PRD analytics including reasoning insights
CREATE OR REPLACE VIEW prd_reasoning_analytics AS
SELECT
  id,
  title,
  priority,
  reasoning_depth,
  confidence_score,
  (reasoning_analysis->'synthesis'->>'confidence')::integer as synthesis_confidence,
  (complexity_analysis->>'complexityScore')::integer as complexity_score,
  (complexity_analysis->>'triggerReasons') as complexity_triggers,
  planning_section->'implementation_steps' as planned_steps,
  planning_section->'risk_analysis'->'identified_risks' as identified_risks,
  planning_section->'quality_gates' as quality_gates,
  created_at,
  updated_at
FROM product_requirements_v2
WHERE reasoning_analysis IS NOT NULL AND reasoning_analysis != '{}'
ORDER BY confidence_score DESC NULLS LAST, created_at DESC;

-- Create function to get PRDs by reasoning complexity
CREATE OR REPLACE FUNCTION get_prds_by_reasoning_depth(depth_filter VARCHAR DEFAULT NULL)
RETURNS TABLE (
  prd_id VARCHAR,
  title TEXT,
  reasoning_depth VARCHAR,
  complexity_score INTEGER,
  confidence_score INTEGER,
  implementation_steps JSONB,
  risk_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.reasoning_depth,
    (p.complexity_analysis->>'complexityScore')::integer,
    p.confidence_score,
    p.planning_section->'implementation_steps',
    jsonb_array_length(COALESCE(p.planning_section->'risk_analysis'->'identified_risks', '[]'::jsonb)),
    p.created_at
  FROM product_requirements_v2 p
  WHERE
    (depth_filter IS NULL OR p.reasoning_depth = depth_filter)
    AND p.reasoning_analysis IS NOT NULL
    AND p.reasoning_analysis != '{}'
  ORDER BY
    CASE p.reasoning_depth
      WHEN 'ultra' THEN 4
      WHEN 'deep' THEN 3
      WHEN 'standard' THEN 2
      WHEN 'quick' THEN 1
    END DESC,
    p.confidence_score DESC NULLS LAST,
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Update existing PRDs to have default planning structure (for any existing PRDs)
UPDATE product_requirements_v2
SET planning_section = '{
  "implementation_steps": ["Analyze requirements", "Design solution", "Implement", "Test", "Deploy"],
  "risk_analysis": {"identified_risks": ["Standard implementation risks"]},
  "resource_requirements": {"estimated_resources": "Standard resource allocation"},
  "timeline_breakdown": {"estimated_duration": "Standard timeline"},
  "reasoning_depth_used": "standard",
  "quality_gates": ["Requirements Review", "Implementation Review", "Testing Review"],
  "success_metrics": ["Requirements met", "Quality standards achieved"]
}'
WHERE planning_section IS NULL OR planning_section = '{}';

COMMENT ON COLUMN product_requirements_v2.planning_section IS 'Structured planning information including implementation steps, risks, resources, and timeline';
COMMENT ON COLUMN product_requirements_v2.reasoning_analysis IS 'Full chain-of-thought reasoning results from automatic analysis';
COMMENT ON COLUMN product_requirements_v2.complexity_analysis IS 'Complexity scoring and trigger analysis results';
COMMENT ON COLUMN product_requirements_v2.reasoning_depth IS 'Depth of reasoning used (quick, standard, deep, ultra)';
COMMENT ON COLUMN product_requirements_v2.confidence_score IS 'Confidence score (0-100) from reasoning analysis';

COMMENT ON FUNCTION update_planning_section_from_reasoning IS 'Automatically extracts planning information from reasoning analysis';
COMMENT ON VIEW prd_reasoning_analytics IS 'Analytics view for PRD reasoning and planning insights';
COMMENT ON FUNCTION get_prds_by_reasoning_depth IS 'Retrieves PRDs filtered by reasoning depth with key planning metrics';