-- Phase 2: Separability Scoring + Data Room Tables
-- SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B

CREATE TABLE IF NOT EXISTS venture_separability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES eva_ventures(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  infrastructure_independence NUMERIC(5,2) DEFAULT 0,
  data_portability NUMERIC(5,2) DEFAULT 0,
  ip_clarity NUMERIC(5,2) DEFAULT 0,
  team_dependency NUMERIC(5,2) DEFAULT 0,
  operational_autonomy NUMERIC(5,2) DEFAULT 0,
  dimension_weights JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_separability_scores_venture_scored
  ON venture_separability_scores (venture_id, scored_at DESC);

ALTER TABLE venture_separability_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY separability_scores_select ON venture_separability_scores FOR SELECT USING (true);
CREATE POLICY separability_scores_insert ON venture_separability_scores FOR INSERT WITH CHECK (true);
CREATE POLICY separability_scores_update ON venture_separability_scores FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS venture_data_room_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES eva_ventures(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('financial', 'ip', 'team', 'operations', 'assets')),
  artifact_version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}',
  content_hash TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_room_venture_type
  ON venture_data_room_artifacts (venture_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_data_room_current
  ON venture_data_room_artifacts (venture_id, is_current) WHERE is_current = true;

ALTER TABLE venture_data_room_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_room_artifacts_select ON venture_data_room_artifacts FOR SELECT USING (true);
CREATE POLICY data_room_artifacts_insert ON venture_data_room_artifacts FOR INSERT WITH CHECK (true);
CREATE POLICY data_room_artifacts_update ON venture_data_room_artifacts FOR UPDATE USING (true);
