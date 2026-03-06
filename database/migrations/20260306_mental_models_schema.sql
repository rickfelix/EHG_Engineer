-- Mental Models Repository Schema
-- SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
-- 4 tables: mental_models, mental_model_applications, mental_model_effectiveness, mental_model_archetype_affinity

-- ============================================================
-- Table 1: mental_models — Core model definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS mental_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('decision', 'market', 'psychology', 'growth', 'framework')),
  description TEXT NOT NULL,
  core_concept TEXT NOT NULL,
  applicable_stages INTEGER[] NOT NULL,
  applicable_paths TEXT[],
  applicable_strategies TEXT[],
  applicable_archetypes TEXT[],
  difficulty_level TEXT DEFAULT 'intermediate' CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced')),
  exercise_template JSONB,
  evaluation_rubric JSONB,
  artifact_template JSONB,
  prompt_context_block TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE mental_models IS 'Core mental model definitions for structured decision-making frameworks';
COMMENT ON COLUMN mental_models.applicable_stages IS 'Array of stage numbers where this model applies (e.g., {0,1,2})';
COMMENT ON COLUMN mental_models.applicable_paths IS 'Array of path names (competitor_teardown, discovery_mode, blueprint_browse)';
COMMENT ON COLUMN mental_models.prompt_context_block IS 'Pre-formatted text block for injection into LLM prompts';

CREATE INDEX IF NOT EXISTS idx_mental_models_stages ON mental_models USING GIN (applicable_stages);
CREATE INDEX IF NOT EXISTS idx_mental_models_paths ON mental_models USING GIN (applicable_paths);
CREATE INDEX IF NOT EXISTS idx_mental_models_active ON mental_models (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mental_models_category ON mental_models (category);

-- ============================================================
-- Table 2: mental_model_applications — Application tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS mental_model_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES mental_models(id) ON DELETE CASCADE,
  venture_id UUID,
  stage_number INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('path_injection', 'synthesis', 'stage_hook')),
  path_used TEXT,
  strategy_used TEXT,
  applied_by TEXT DEFAULT 'ai_auto' CHECK (applied_by IN ('ai_auto', 'manual')),
  exercise_output JSONB,
  evaluation_score NUMERIC CHECK (evaluation_score >= 0 AND evaluation_score <= 10),
  artifact_data JSONB,
  operator_rating INTEGER CHECK (operator_rating >= 1 AND operator_rating <= 5),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(venture_id, model_id, stage_number, layer)
);

COMMENT ON TABLE mental_model_applications IS 'Tracks which models were applied to which ventures at which stages';

CREATE INDEX IF NOT EXISTS idx_mma_venture ON mental_model_applications (venture_id);
CREATE INDEX IF NOT EXISTS idx_mma_model_stage ON mental_model_applications (model_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_mma_layer ON mental_model_applications (layer);

-- ============================================================
-- Table 3: mental_model_effectiveness — Aggregate scoring
-- ============================================================
CREATE TABLE IF NOT EXISTS mental_model_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES mental_models(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  path TEXT,
  strategy TEXT,
  venture_archetype TEXT,
  application_count INTEGER DEFAULT 0,
  avg_evaluation_score NUMERIC,
  avg_operator_rating NUMERIC,
  stage_progression_correlation NUMERIC CHECK (stage_progression_correlation >= -1 AND stage_progression_correlation <= 1),
  revenue_correlation NUMERIC,
  composite_effectiveness_score NUMERIC,
  last_calculated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mme_model_stage_path_strat_arch
  ON mental_model_effectiveness (model_id, stage_number, COALESCE(path, ''), COALESCE(strategy, ''), COALESCE(venture_archetype, ''));

COMMENT ON TABLE mental_model_effectiveness IS 'Aggregate effectiveness scores correlated with venture outcomes';

CREATE INDEX IF NOT EXISTS idx_mme_model ON mental_model_effectiveness (model_id);
CREATE INDEX IF NOT EXISTS idx_mme_composite ON mental_model_effectiveness (composite_effectiveness_score DESC);

-- ============================================================
-- Table 4: mental_model_archetype_affinity — Archetype-specific affinity
-- ============================================================
CREATE TABLE IF NOT EXISTS mental_model_archetype_affinity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES mental_models(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  path TEXT,
  affinity_score NUMERIC DEFAULT 0.5 CHECK (affinity_score >= 0 AND affinity_score <= 1),
  sample_size INTEGER DEFAULT 0,
  confidence_level TEXT DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mmaa_model_arch_path
  ON mental_model_archetype_affinity (model_id, archetype, COALESCE(path, ''));

COMMENT ON TABLE mental_model_archetype_affinity IS 'Which models work best for which venture archetypes';

CREATE INDEX IF NOT EXISTS idx_mmaa_model ON mental_model_archetype_affinity (model_id);
CREATE INDEX IF NOT EXISTS idx_mmaa_archetype ON mental_model_archetype_affinity (archetype);

-- ============================================================
-- Triggers: updated_at auto-update
-- ============================================================
CREATE OR REPLACE TRIGGER update_mental_models_updated_at
  BEFORE UPDATE ON mental_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_mmaa_updated_at
  BEFORE UPDATE ON mental_model_archetype_affinity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE mental_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE mental_model_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mental_model_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE mental_model_archetype_affinity ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY mental_models_service_all ON mental_models FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mental_model_applications_service_all ON mental_model_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mental_model_effectiveness_service_all ON mental_model_effectiveness FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mental_model_archetype_affinity_service_all ON mental_model_archetype_affinity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon/authenticated: read access
CREATE POLICY mental_models_anon_select ON mental_models FOR SELECT TO anon USING (true);
CREATE POLICY mental_model_applications_anon_select ON mental_model_applications FOR SELECT TO anon USING (true);
CREATE POLICY mental_model_effectiveness_anon_select ON mental_model_effectiveness FOR SELECT TO anon USING (true);
CREATE POLICY mental_model_archetype_affinity_anon_select ON mental_model_archetype_affinity FOR SELECT TO anon USING (true);

-- Anon: insert/update for application logging (non-blocking writes from backend)
CREATE POLICY mental_model_applications_anon_insert ON mental_model_applications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY mental_model_applications_anon_update ON mental_model_applications FOR UPDATE TO anon USING (true) WITH CHECK (true);
