-- Migration: venture_capabilities table
-- SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001 | US-001
-- Applied via database-agent (Supabase Dashboard SQL Editor)
--
-- This migration was executed directly through the Supabase management API.
-- This file serves as the source-of-truth documentation.

CREATE TABLE IF NOT EXISTS venture_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  origin_venture_id UUID NOT NULL REFERENCES ventures(id),
  origin_sd_key TEXT,
  capability_type TEXT NOT NULL,
  reusability_score INTEGER DEFAULT 5 CHECK (reusability_score >= 0 AND reusability_score <= 10),
  integration_dependencies JSONB DEFAULT '[]'::jsonb,
  revenue_leverage_score INTEGER DEFAULT 0 CHECK (revenue_leverage_score >= 0 AND revenue_leverage_score <= 10),
  maturity_level TEXT DEFAULT 'experimental' CHECK (maturity_level IN ('experimental', 'stable', 'production', 'deprecated')),
  consumers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, origin_venture_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vc_origin_venture ON venture_capabilities(origin_venture_id);
CREATE INDEX IF NOT EXISTS idx_vc_capability_type ON venture_capabilities(capability_type);
CREATE INDEX IF NOT EXISTS idx_vc_maturity ON venture_capabilities(maturity_level);
CREATE INDEX IF NOT EXISTS idx_vc_reusability ON venture_capabilities(reusability_score);
CREATE INDEX IF NOT EXISTS idx_vc_origin_sd ON venture_capabilities(origin_sd_key);
CREATE INDEX IF NOT EXISTS idx_vc_consumers ON venture_capabilities USING gin(consumers);
CREATE INDEX IF NOT EXISTS idx_vc_deps ON venture_capabilities USING gin(integration_dependencies);

-- RLS Policies
ALTER TABLE venture_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON venture_capabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON venture_capabilities
  FOR SELECT TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON venture_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
