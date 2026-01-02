-- Migration: failure_patterns table for Anti-Pattern Library
-- SD: SD-FAILURE-PATTERNS-001
-- Description: Catalog common failure modes to prevent repetition

-- ============================================
-- Table: failure_patterns
-- ============================================
CREATE TABLE IF NOT EXISTS failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id VARCHAR(20) UNIQUE NOT NULL, -- FPAT-001, FPAT-002, etc.
  category VARCHAR(100) NOT NULL CHECK (category IN ('technical', 'process', 'communication', 'resource', 'market', 'financial')),
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Root Cause Analysis
  root_cause_analysis JSONB DEFAULT '{}',
  -- Example: { "primary_cause": "...", "contributing_factors": [...], "symptoms": [...] }

  -- Tracking
  occurrence_count INTEGER DEFAULT 1,
  first_seen_sd_id VARCHAR REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  last_seen_sd_id VARCHAR REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- Impact Assessment
  impact_score INTEGER DEFAULT 50 CHECK (impact_score >= 0 AND impact_score <= 100),
  impact_areas JSONB DEFAULT '[]', -- ["revenue", "timeline", "quality", "team"]

  -- Prevention & Mitigation
  prevention_measures JSONB DEFAULT '[]',
  -- Example: [{"measure": "...", "effectiveness": 80, "implementation_effort": "low"}]
  mitigation_strategies JSONB DEFAULT '[]',
  detection_signals JSONB DEFAULT '[]',

  -- Relationships
  related_patterns TEXT[],
  superseded_by VARCHAR(20), -- Pattern ID that replaces this one

  -- Status & Lifecycle
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
  lifecycle_status VARCHAR(20) DEFAULT 'active' CHECK (lifecycle_status IN ('draft', 'active', 'deprecated', 'superseded', 'archived')),

  -- Metadata
  created_by TEXT DEFAULT 'SYSTEM',
  updated_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_failure_patterns_category ON failure_patterns(category);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_severity ON failure_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_status ON failure_patterns(status);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_impact_score ON failure_patterns(impact_score DESC);

-- ============================================
-- Seed Data: 10 Initial Anti-Patterns
-- ============================================
INSERT INTO failure_patterns (
  pattern_id, category, severity, pattern_name, description,
  root_cause_analysis, impact_score, impact_areas, prevention_measures, detection_signals
) VALUES
-- Pattern 1: Premature Scaling
(
  'FPAT-001',
  'process',
  'high',
  'Premature Scaling',
  'Investing heavily in scaling infrastructure before achieving product-market fit. Resources spent on handling millions of users when there are only hundreds.',
  '{"primary_cause": "Optimism bias about growth trajectory", "contributing_factors": ["Pressure from investors", "Engineering desire for elegant solutions", "Fear of missing opportunity"], "symptoms": ["High infrastructure costs relative to revenue", "Over-engineered systems", "Slow iteration speed"]}',
  85,
  '["financial", "timeline", "agility"]',
  '[{"measure": "Define clear PMF metrics before scaling", "effectiveness": 90, "implementation_effort": "low"}, {"measure": "Use serverless/PaaS for MVP phase", "effectiveness": 80, "implementation_effort": "low"}]',
  '["Infrastructure costs > 30% of burn", "More than 2 engineers on DevOps before 1000 users", "Kubernetes before product-market fit"]'
),
-- Pattern 2: Feature Creep
(
  'FPAT-002',
  'process',
  'high',
  'Feature Creep Without Validation',
  'Continuously adding features based on assumptions rather than validated customer needs. Each feature adds maintenance burden without proportional value.',
  '{"primary_cause": "Lack of customer validation loop", "contributing_factors": ["Building what is easy vs what is needed", "Competitor feature matching", "Internal stakeholder requests"], "symptoms": ["Low feature adoption rates", "Increasing complexity", "Declining velocity"]}',
  80,
  '["timeline", "quality", "team"]',
  '[{"measure": "Painted door tests before building", "effectiveness": 95, "implementation_effort": "low"}, {"measure": "Usage analytics on all features", "effectiveness": 85, "implementation_effort": "medium"}]',
  '["Features with <5% usage after 30 days", "Feature requests without customer interviews", "Backlog growing faster than completion"]'
),
-- Pattern 3: Single Point of Failure
(
  'FPAT-003',
  'technical',
  'critical',
  'Single Point of Failure (Key Person)',
  'Critical knowledge or capability concentrated in one person. Their departure or unavailability creates crisis.',
  '{"primary_cause": "Failure to document and cross-train", "contributing_factors": ["Time pressure", "Hero culture", "Lack of onboarding processes"], "symptoms": ["Panic when person is unavailable", "No documentation", "Only one person can deploy/fix issues"]}',
  90,
  '["team", "timeline", "quality"]',
  '[{"measure": "Mandatory pair programming for critical systems", "effectiveness": 90, "implementation_effort": "medium"}, {"measure": "Documentation requirements in Definition of Done", "effectiveness": 85, "implementation_effort": "low"}]',
  '["Bus factor of 1 for any system", "No runbooks for critical processes", "Single approver for deployments"]'
),
-- Pattern 4: Ignoring Technical Debt
(
  'FPAT-004',
  'technical',
  'high',
  'Accumulated Technical Debt Crisis',
  'Continuously deferring code quality improvements until velocity drops to near zero. Every change becomes risky and time-consuming.',
  '{"primary_cause": "Short-term velocity prioritization", "contributing_factors": ["Deadline pressure", "Lack of quality metrics", "Technical debt invisibility"], "symptoms": ["Fear of touching old code", "Simple changes take days", "High regression rate"]}',
  75,
  '["timeline", "quality", "team"]',
  '[{"measure": "20% time allocation for tech debt", "effectiveness": 85, "implementation_effort": "medium"}, {"measure": "Tech debt tracking in backlog", "effectiveness": 70, "implementation_effort": "low"}]',
  '["Test coverage declining", "Cycle time increasing without scope increase", "Engineers avoiding certain modules"]'
),
-- Pattern 5: Vanity Metrics
(
  'FPAT-005',
  'market',
  'medium',
  'Vanity Metrics Obsession',
  'Focusing on impressive-looking metrics (downloads, signups, page views) that do not correlate with business health or customer value.',
  '{"primary_cause": "Easier to measure than meaningful metrics", "contributing_factors": ["Investor pressure for growth numbers", "Marketing-driven culture", "Lack of analytics sophistication"], "symptoms": ["High signups, low activation", "Impressive traffic, no conversions", "Growing users, declining revenue"]}',
  65,
  '["financial", "market"]',
  '[{"measure": "Define North Star metric tied to value delivery", "effectiveness": 90, "implementation_effort": "low"}, {"measure": "Cohort analysis over absolute numbers", "effectiveness": 85, "implementation_effort": "medium"}]',
  '["Reporting downloads without activation", "Page views without conversion rates", "User count without retention"]'
),
-- Pattern 6: Founder Burnout
(
  'FPAT-006',
  'resource',
  'high',
  'Founder/Key Person Burnout',
  'Unsustainable work patterns leading to decision fatigue, health issues, and potential departure. Often hidden until crisis.',
  '{"primary_cause": "Unsustainable pace and lack of delegation", "contributing_factors": ["Hero complex", "Funding pressure", "Lack of boundaries"], "symptoms": ["Declining decision quality", "Irritability and conflict", "Neglecting health"]}',
  85,
  '["team", "timeline", "quality"]',
  '[{"measure": "Mandatory time off policies", "effectiveness": 80, "implementation_effort": "low"}, {"measure": "Executive coaching requirement", "effectiveness": 75, "implementation_effort": "medium"}]',
  '["Working >60 hours consistently", "No vacation in 6+ months", "Decision reversals increasing"]'
),
-- Pattern 7: Market Timing
(
  'FPAT-007',
  'market',
  'critical',
  'Wrong Market Timing',
  'Building the right product at the wrong time - either too early (market not ready) or too late (saturated). Timing often more important than execution.',
  '{"primary_cause": "Insufficient market timing analysis", "contributing_factors": ["Confirmation bias", "Technology-driven vs market-driven", "Ignoring adoption curve position"], "symptoms": ["Low adoption despite good product", "Customers say maybe later", "Competitors with inferior products winning"]}',
  95,
  '["revenue", "market", "financial"]',
  '[{"measure": "Market timing assessment in venture evaluation", "effectiveness": 80, "implementation_effort": "low"}, {"measure": "Early adopter identification before build", "effectiveness": 85, "implementation_effort": "medium"}]',
  '["Waiting list but no conversions", "Technology exists but behavior unchanged", "Requiring significant customer education"]'
),
-- Pattern 8: Integration Hell
(
  'FPAT-008',
  'technical',
  'medium',
  'Third-Party Integration Dependency',
  'Over-reliance on third-party services that can change APIs, pricing, or availability without notice. Single integration failure cascades to product failure.',
  '{"primary_cause": "Build vs buy decision favoring speed over control", "contributing_factors": ["Startup velocity pressure", "Underestimating integration complexity", "Vendor lock-in"], "symptoms": ["Outages from vendor issues", "Surprise pricing changes", "Blocked by API limitations"]}',
  70,
  '["quality", "financial", "timeline"]',
  '[{"measure": "Abstraction layer for all external services", "effectiveness": 85, "implementation_effort": "medium"}, {"measure": "Fallback strategy for critical integrations", "effectiveness": 80, "implementation_effort": "high"}]',
  '["More than 3 critical third-party dependencies", "No API abstraction layer", "Vendor SLA not reviewed"]'
),
-- Pattern 9: Scope Ambiguity
(
  'FPAT-009',
  'communication',
  'medium',
  'Undefined Success Criteria',
  'Starting work without clear, measurable definition of done. Leads to scope creep, endless iterations, and stakeholder conflicts.',
  '{"primary_cause": "Rushing to execution without alignment", "contributing_factors": ["Assumption of shared understanding", "Avoiding difficult conversations", "Agile misinterpretation"], "symptoms": ["Its not quite right feedback", "Moving goalposts", "Stakeholder disagreements at demo"]}',
  60,
  '["timeline", "team", "quality"]',
  '[{"measure": "Written acceptance criteria before sprint", "effectiveness": 90, "implementation_effort": "low"}, {"measure": "Stakeholder sign-off on scope", "effectiveness": 85, "implementation_effort": "low"}]',
  '["Stories without acceptance criteria", "Scope changes mid-sprint", "Demo surprises"]'
),
-- Pattern 10: Cash Flow Blindness
(
  'FPAT-010',
  'financial',
  'critical',
  'Cash Flow Blindness',
  'Running out of money while focused on product and growth. Runway not actively monitored until crisis. Often combined with optimistic revenue projections.',
  '{"primary_cause": "Focus on product over finances", "contributing_factors": ["Technical founder without finance experience", "Delayed invoicing/collections", "Optimistic forecasting"], "symptoms": ["Surprise cash crunches", "Delayed vendor payments", "Emergency fundraising"]}',
  95,
  '["financial", "team", "market"]',
  '[{"measure": "Weekly cash flow review", "effectiveness": 95, "implementation_effort": "low"}, {"measure": "12-month runway minimum policy", "effectiveness": 90, "implementation_effort": "medium"}]',
  '["<6 months runway without plan", "No cash flow forecast", "Revenue projections consistently missed"]'
)
ON CONFLICT (pattern_id) DO UPDATE SET
  updated_at = NOW(),
  updated_by = 'MIGRATION';

-- ============================================
-- Function: Calculate venture risk score
-- ============================================
CREATE OR REPLACE FUNCTION calculate_venture_pattern_risk(
  p_venture_id UUID,
  p_pattern_ids TEXT[] DEFAULT NULL
) RETURNS TABLE (
  total_risk_score INTEGER,
  pattern_count INTEGER,
  high_risk_patterns TEXT[],
  risk_level VARCHAR(20)
) AS $$
DECLARE
  v_total_score INTEGER := 0;
  v_pattern_count INTEGER := 0;
  v_high_risk TEXT[] := ARRAY[]::TEXT[];
  v_risk_level VARCHAR(20);
BEGIN
  -- Get patterns to evaluate (all active if not specified)
  IF p_pattern_ids IS NULL THEN
    SELECT
      COALESCE(SUM(impact_score), 0),
      COUNT(*),
      ARRAY_AGG(pattern_id) FILTER (WHERE severity IN ('high', 'critical'))
    INTO v_total_score, v_pattern_count, v_high_risk
    FROM failure_patterns
    WHERE status = 'active';
  ELSE
    SELECT
      COALESCE(SUM(impact_score), 0),
      COUNT(*),
      ARRAY_AGG(pattern_id) FILTER (WHERE severity IN ('high', 'critical'))
    INTO v_total_score, v_pattern_count, v_high_risk
    FROM failure_patterns
    WHERE pattern_id = ANY(p_pattern_ids) AND status = 'active';
  END IF;

  -- Calculate risk level
  IF v_pattern_count = 0 THEN
    v_risk_level := 'none';
  ELSIF v_total_score / GREATEST(v_pattern_count, 1) >= 80 THEN
    v_risk_level := 'critical';
  ELSIF v_total_score / GREATEST(v_pattern_count, 1) >= 60 THEN
    v_risk_level := 'high';
  ELSIF v_total_score / GREATEST(v_pattern_count, 1) >= 40 THEN
    v_risk_level := 'medium';
  ELSE
    v_risk_level := 'low';
  END IF;

  RETURN QUERY SELECT v_total_score, v_pattern_count, v_high_risk, v_risk_level;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Pattern summary with statistics
-- ============================================
CREATE OR REPLACE VIEW v_failure_pattern_summary AS
SELECT
  pattern_id,
  pattern_name,
  category,
  severity,
  impact_score,
  occurrence_count,
  status,
  CASE
    WHEN severity = 'critical' THEN 1
    WHEN severity = 'high' THEN 2
    WHEN severity = 'medium' THEN 3
    ELSE 4
  END as severity_rank,
  created_at,
  updated_at
FROM failure_patterns
WHERE status = 'active'
ORDER BY severity_rank, impact_score DESC;

-- Grant permissions
GRANT SELECT ON failure_patterns TO authenticated;
GRANT SELECT ON v_failure_pattern_summary TO authenticated;

-- RLS Policy
ALTER TABLE failure_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view failure patterns"
ON failure_patterns FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage failure patterns"
ON failure_patterns FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
