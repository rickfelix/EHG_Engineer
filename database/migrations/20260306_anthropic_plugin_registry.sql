-- Migration: Anthropic Plugin Registry
-- SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
-- Purpose: Track discovered, evaluated, and adapted Anthropic plugins

CREATE TABLE IF NOT EXISTS anthropic_plugin_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_name TEXT NOT NULL,
  source_repo TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_commit TEXT,
  ehg_skill_id UUID REFERENCES agent_skills(id),
  fitness_score NUMERIC(3,1),
  fitness_evaluation JSONB,
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'evaluating', 'adapted', 'rejected', 'outdated')),
  adaptation_date TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_repo, plugin_name)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_plugin_registry_status
  ON anthropic_plugin_registry(status);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_source_repo
  ON anthropic_plugin_registry(source_repo);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_fitness_score
  ON anthropic_plugin_registry(fitness_score DESC NULLS LAST);

-- RLS: service_role only (automated pipeline, no user-facing access)
ALTER TABLE anthropic_plugin_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON anthropic_plugin_registry
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_updated_at_plugin_registry
  BEFORE UPDATE ON anthropic_plugin_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE anthropic_plugin_registry IS
'Registry of Anthropic-authored plugins discovered from GitHub repos.
SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
Lifecycle: discovered → evaluating → adapted/rejected → outdated';
