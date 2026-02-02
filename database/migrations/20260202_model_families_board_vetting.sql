-- Migration: Multi-Model Board Vetting (CONST-002 Enforcement)
-- SD: SD-LEO-SELF-IMPROVE-002C
-- Purpose: Create model_families table and supporting functions for board vetting diversity
-- Date: 2026-02-02

-- ============================================================
-- 1. MODEL FAMILIES TABLE
-- ============================================================
-- Stores AI model family classifications for CONST-002 enforcement

CREATE TABLE IF NOT EXISTS model_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id TEXT UNIQUE NOT NULL,
  family_name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  models TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for family lookup
CREATE INDEX IF NOT EXISTS idx_model_families_family_id ON model_families(family_id);
CREATE INDEX IF NOT EXISTS idx_model_families_vendor ON model_families(vendor);

-- ============================================================
-- 2. SEED DATA: AI Model Families
-- ============================================================

INSERT INTO model_families (family_id, family_name, vendor, models, description) VALUES
  ('anthropic', 'Anthropic Claude', 'Anthropic',
   ARRAY['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-opus-4', 'claude-sonnet-4'],
   'Anthropic Claude model family - Constitutional AI focused'),
  ('openai', 'OpenAI GPT', 'OpenAI',
   ARRAY['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-5', 'gpt-5.2', 'o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini'],
   'OpenAI GPT model family - General purpose LLMs'),
  ('google', 'Google Gemini', 'Google',
   ARRAY['gemini-pro', 'gemini-ultra', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-pro'],
   'Google Gemini model family - Multimodal capabilities'),
  ('meta', 'Meta Llama', 'Meta',
   ARRAY['llama-2-70b', 'llama-3-70b', 'llama-3.1-405b', 'llama-3.2-90b'],
   'Meta Llama model family - Open weights'),
  ('mistral', 'Mistral AI', 'Mistral',
   ARRAY['mistral-large', 'mistral-medium', 'mistral-small', 'mixtral-8x7b', 'mistral-nemo'],
   'Mistral AI model family - Efficient inference')
ON CONFLICT (family_id) DO UPDATE SET
  models = EXCLUDED.models,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================
-- 3. CRITIC PERSONAS TABLE
-- ============================================================
-- Stores the three board vetting personas

CREATE TABLE IF NOT EXISTS board_critic_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id TEXT UNIQUE NOT NULL,
  persona_name TEXT NOT NULL,
  evaluation_focus TEXT NOT NULL,
  critique_style TEXT NOT NULL,
  weight DECIMAL(3,2) DEFAULT 0.33,
  prompt_template TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the three critic personas
INSERT INTO board_critic_personas (persona_id, persona_name, evaluation_focus, critique_style, weight, prompt_template) VALUES
  ('skeptic', 'The Skeptic', 'Safety, risks, unintended consequences',
   'Questions assumptions, identifies failure modes, demands evidence for claims',
   0.35,
   'You are The Skeptic. Your role is to identify risks, question assumptions, and ensure proposals do not introduce safety issues. Focus on: potential failure modes, unintended consequences, security vulnerabilities, and insufficient evidence.'),
  ('pragmatist', 'The Pragmatist', 'Feasibility, implementation, value delivery',
   'Assesses practical viability, resource requirements, and incremental value',
   0.35,
   'You are The Pragmatist. Your role is to assess practical viability and implementation feasibility. Focus on: resource requirements, technical complexity, incremental delivery, and measurable outcomes.'),
  ('visionary', 'The Visionary', 'Strategic alignment, innovation, long-term impact',
   'Evaluates strategic fit, innovation potential, and systemic improvement',
   0.30,
   'You are The Visionary. Your role is to evaluate strategic alignment and innovation potential. Focus on: long-term impact, systemic improvements, alignment with objectives, and transformative potential.')
ON CONFLICT (persona_id) DO UPDATE SET
  evaluation_focus = EXCLUDED.evaluation_focus,
  critique_style = EXCLUDED.critique_style,
  weight = EXCLUDED.weight,
  prompt_template = EXCLUDED.prompt_template,
  updated_at = NOW();

-- ============================================================
-- 4. BOARD VETTING SESSIONS TABLE
-- ============================================================
-- Tracks board vetting sessions for proposals

CREATE TABLE IF NOT EXISTS board_vetting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL,
  session_status TEXT NOT NULL DEFAULT 'pending',
  board_composition JSONB NOT NULL DEFAULT '[]',
  family_diversity_score INTEGER,
  const_002_compliant BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT board_vetting_sessions_status_check
    CHECK (session_status IN ('pending', 'in_progress', 'completed', 'failed'))
);

-- Index for proposal lookup
CREATE INDEX IF NOT EXISTS idx_board_vetting_sessions_proposal
  ON board_vetting_sessions(proposal_id);

-- ============================================================
-- 5. BOARD ASSESSMENTS TABLE
-- ============================================================
-- Individual critic assessments within a vetting session

CREATE TABLE IF NOT EXISTS board_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES board_vetting_sessions(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  model_family TEXT NOT NULL,
  model_used TEXT NOT NULL,
  assessment_score INTEGER CHECK (assessment_score BETWEEN 0 AND 100),
  verdict TEXT CHECK (verdict IN ('approve', 'reject', 'conditional')),
  critique TEXT,
  risk_factors JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for board assessments
CREATE INDEX IF NOT EXISTS idx_board_assessments_session
  ON board_assessments(session_id);
CREATE INDEX IF NOT EXISTS idx_board_assessments_persona
  ON board_assessments(persona_id);

-- ============================================================
-- 6. BOARD VERDICTS VIEW
-- ============================================================
-- Aggregates assessments into final verdict with consensus

CREATE OR REPLACE VIEW v_board_verdicts AS
SELECT
  bvs.id AS session_id,
  bvs.proposal_id,
  bvs.const_002_compliant,
  bvs.family_diversity_score,
  COUNT(DISTINCT ba.model_family) AS distinct_families,
  COUNT(ba.id) AS total_assessments,

  -- Weighted consensus score
  ROUND(
    SUM(ba.assessment_score * bcp.weight) / NULLIF(SUM(bcp.weight), 0)
  )::INTEGER AS consensus_score,

  -- Verdict counts
  COUNT(CASE WHEN ba.verdict = 'approve' THEN 1 END) AS approve_count,
  COUNT(CASE WHEN ba.verdict = 'reject' THEN 1 END) AS reject_count,
  COUNT(CASE WHEN ba.verdict = 'conditional' THEN 1 END) AS conditional_count,

  -- Final verdict (2/3 majority or conditional)
  CASE
    WHEN COUNT(CASE WHEN ba.verdict = 'reject' THEN 1 END) >= 2 THEN 'reject'
    WHEN COUNT(CASE WHEN ba.verdict = 'approve' THEN 1 END) >= 2 THEN 'approve'
    ELSE 'conditional'
  END AS final_verdict,

  -- Risk tier based on consensus score
  CASE
    WHEN ROUND(SUM(ba.assessment_score * bcp.weight) / NULLIF(SUM(bcp.weight), 0)) >= 85 THEN 'low'
    WHEN ROUND(SUM(ba.assessment_score * bcp.weight) / NULLIF(SUM(bcp.weight), 0)) >= 70 THEN 'medium'
    WHEN ROUND(SUM(ba.assessment_score * bcp.weight) / NULLIF(SUM(bcp.weight), 0)) >= 50 THEN 'high'
    ELSE 'critical'
  END AS risk_tier,

  bvs.started_at,
  bvs.completed_at
FROM board_vetting_sessions bvs
LEFT JOIN board_assessments ba ON bvs.id = ba.session_id
LEFT JOIN board_critic_personas bcp ON ba.persona_id = bcp.persona_id
GROUP BY bvs.id, bvs.proposal_id, bvs.const_002_compliant,
         bvs.family_diversity_score, bvs.started_at, bvs.completed_at;

-- ============================================================
-- 7. CONST-002 VALIDATION FUNCTION
-- ============================================================
-- Validates board composition meets CONST-002 requirements

CREATE OR REPLACE FUNCTION validate_const_002_compliance(
  p_board_composition JSONB
) RETURNS JSONB AS $$
DECLARE
  v_families TEXT[];
  v_distinct_count INTEGER;
  v_min_required INTEGER := 2;
  v_result JSONB;
BEGIN
  -- Extract unique model families from board composition
  SELECT ARRAY_AGG(DISTINCT family) INTO v_families
  FROM jsonb_to_recordset(p_board_composition) AS x(family TEXT, model TEXT, persona TEXT);

  v_distinct_count := COALESCE(array_length(v_families, 1), 0);

  -- Build result
  v_result := jsonb_build_object(
    'compliant', v_distinct_count >= v_min_required,
    'distinct_families', v_distinct_count,
    'min_required', v_min_required,
    'families', v_families,
    'error', CASE
      WHEN v_distinct_count < v_min_required
      THEN format('CONST-002 violation: %s distinct model families required, found %s',
                  v_min_required, v_distinct_count)
      ELSE NULL
    END
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. HELPER FUNCTION: Get Model Family
-- ============================================================
-- Returns the family for a given model identifier

CREATE OR REPLACE FUNCTION get_model_family(
  p_model_id TEXT
) RETURNS TEXT AS $$
DECLARE
  v_family TEXT;
BEGIN
  SELECT family_id INTO v_family
  FROM model_families
  WHERE p_model_id = ANY(models)
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_family, 'unknown');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. RUBRIC VERSION SETTING
-- ============================================================
-- Track rubric versioning for board vetting

INSERT INTO leo_settings (setting_key, setting_value, category, description)
VALUES (
  'BOARD_VETTING_RUBRIC_VERSION',
  '"1.0.0"',
  'governance',
  'Current version of the board vetting rubric for multi-model assessment'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- ============================================================
-- 10. EXTEND IMPROVEMENT_QUALITY_ASSESSMENTS (FR-4)
-- ============================================================
-- Add board vetting columns to existing table

ALTER TABLE improvement_quality_assessments
  ADD COLUMN IF NOT EXISTS critic_persona TEXT,
  ADD COLUMN IF NOT EXISTS model_family TEXT,
  ADD COLUMN IF NOT EXISTS is_board_verdict BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rubric_version TEXT NOT NULL DEFAULT 'board-v1';

-- Constraint: critic_persona must be valid when is_board_verdict = FALSE
-- Note: Using DO block for idempotent constraint creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'iqa_critic_persona_check'
  ) THEN
    ALTER TABLE improvement_quality_assessments
      ADD CONSTRAINT iqa_critic_persona_check
      CHECK (
        (is_board_verdict = TRUE AND critic_persona IS NULL) OR
        (is_board_verdict = FALSE AND (critic_persona IS NULL OR critic_persona IN ('safety', 'value', 'risk')))
      );
  END IF;
END $$;

-- Index for board verdict queries (TR-4)
-- Note: Using improvement_id as per existing schema (FR-5 accepts improvement_id or proposal_id)
CREATE INDEX IF NOT EXISTS idx_iqa_board_vetting
  ON improvement_quality_assessments(improvement_id, is_board_verdict, critic_persona);
CREATE INDEX IF NOT EXISTS idx_iqa_model_family
  ON improvement_quality_assessments(model_family);

-- ============================================================
-- 11. RUBRIC_VERSION IN SYSTEM_SETTINGS (FR-6)
-- ============================================================

INSERT INTO system_settings (key, value_json, updated_by)
VALUES (
  'RUBRIC_VERSION',
  '{"scoring": "scoring-v1", "vetting": "vetting-v1", "board": "board-v1"}'::JSONB,
  'migration'
)
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = NOW();

-- ============================================================
-- 12. V_IMPROVEMENT_BOARD_VERDICTS VIEW (FR-5 Alternative)
-- ============================================================
-- Aggregates critic assessments from improvement_quality_assessments
-- into BoardVerdict format per PRD requirements

CREATE OR REPLACE VIEW v_improvement_board_verdicts AS
WITH critic_rows AS (
  SELECT
    improvement_id,
    critic_persona,
    score,
    recommendation,
    model_family,
    rubric_version
  FROM improvement_quality_assessments
  WHERE is_board_verdict = FALSE
    AND critic_persona IN ('safety', 'value', 'risk')
),
persona_scores AS (
  SELECT
    improvement_id,
    MAX(CASE WHEN critic_persona = 'safety' THEN score END) AS safety_score,
    MAX(CASE WHEN critic_persona = 'value' THEN score END) AS value_score,
    MAX(CASE WHEN critic_persona = 'risk' THEN score END) AS risk_score,
    COUNT(*) AS num_critics,
    COUNT(CASE WHEN recommendation = 'APPROVE' THEN 1 END) AS approve_count,
    COUNT(CASE WHEN recommendation = 'REJECT' THEN 1 END) AS reject_count,
    MAX(rubric_version) AS rubric_version
  FROM critic_rows
  GROUP BY improvement_id
  HAVING COUNT(*) = 3  -- Only complete assessments with all 3 personas
)
SELECT
  improvement_id,
  num_critics,
  safety_score,
  value_score,
  risk_score,
  -- Overall score: (safety + value + (100 - risk)) / 3
  ROUND((safety_score + value_score + (100 - risk_score)) / 3.0)::INTEGER AS overall_score,
  approve_count,
  reject_count,
  -- Consensus: 2/3 majority
  CASE
    WHEN approve_count >= 2 OR reject_count >= 2 THEN TRUE
    ELSE FALSE
  END AS consensus,
  -- Verdict: 2/3 rule
  CASE
    WHEN approve_count >= 2 THEN 'PROMOTE'
    WHEN reject_count >= 2 THEN 'DISMISS'
    ELSE 'QUARANTINE'
  END AS verdict,
  -- Risk tier with safety gate
  CASE
    WHEN safety_score < 70 THEN 'NEVER-AUTO'
    WHEN ROUND((safety_score + value_score + (100 - risk_score)) / 3.0) >= 85 THEN 'AUTO'
    WHEN ROUND((safety_score + value_score + (100 - risk_score)) / 3.0) >= 70 THEN 'HUMAN-REVIEW'
    ELSE 'NEVER-AUTO'
  END AS recommended_risk_tier,
  rubric_version
FROM persona_scores;

COMMENT ON VIEW v_improvement_board_verdicts IS 'BoardVerdict aggregation from improvement_quality_assessments with 2/3 consensus and safety gate (FR-5)';

-- ============================================================
-- 13. CHECK_CONST002_FAMILY_SEPARATION FUNCTION (FR-3)
-- ============================================================
-- Validates proposer/evaluator family separation per CONST-002

CREATE OR REPLACE FUNCTION check_const002_family_separation(
  p_proposer_model_id TEXT,
  p_evaluator_model_ids TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
  v_proposer_family TEXT;
  v_evaluator_family TEXT;
  v_distinct_families TEXT[] := '{}';
  v_model_id TEXT;
BEGIN
  -- Get proposer family
  v_proposer_family := get_model_family(p_proposer_model_id);

  -- If proposer is unknown, fail
  IF v_proposer_family = 'unknown' THEN
    RETURN FALSE;
  END IF;

  -- Check each evaluator
  FOREACH v_model_id IN ARRAY p_evaluator_model_ids
  LOOP
    v_evaluator_family := get_model_family(v_model_id);

    -- Proposer family must differ from all evaluator families
    IF v_evaluator_family = v_proposer_family THEN
      RETURN FALSE;
    END IF;

    -- Track distinct non-unknown families
    IF v_evaluator_family != 'unknown' AND NOT v_evaluator_family = ANY(v_distinct_families) THEN
      v_distinct_families := array_append(v_distinct_families, v_evaluator_family);
    END IF;
  END LOOP;

  -- Need at least 2 distinct non-unknown evaluator families
  IF array_length(v_distinct_families, 1) < 2 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 14. COMMENTS
-- ============================================================

COMMENT ON TABLE model_families IS 'AI model family classifications for CONST-002 multi-model diversity enforcement';
COMMENT ON TABLE board_critic_personas IS 'Three critic personas for balanced proposal evaluation: Skeptic, Pragmatist, Visionary';
COMMENT ON TABLE board_vetting_sessions IS 'Board vetting sessions tracking multi-model proposal evaluation';
COMMENT ON TABLE board_assessments IS 'Individual critic assessments within board vetting sessions';
COMMENT ON VIEW v_board_verdicts IS 'Aggregated board verdicts with weighted consensus and risk tier assignment';
COMMENT ON FUNCTION validate_const_002_compliance IS 'Validates that board composition meets CONST-002 (min 2 distinct model families)';
COMMENT ON FUNCTION get_model_family IS 'Returns the model family for a given model identifier';
COMMENT ON FUNCTION check_const002_family_separation IS 'Validates proposer family differs from evaluators and evaluators have 2+ distinct families (CONST-002)';
