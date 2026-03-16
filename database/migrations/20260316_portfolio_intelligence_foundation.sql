-- Migration: Portfolio Intelligence Foundation
-- SD: SD-LEO-INFRA-PORTFOLIO-INTELLIGENCE-FOUNDATION-001
-- Date: 2026-03-16
-- Description: Creates foundation tables for portfolio intelligence:
--   customer_personas, venture_persona_mapping, global_competitors,
--   risk_templates, exit_playbooks, and links competitors to global_competitors.
--
-- Rollback (in reverse order):
--   ALTER TABLE competitors DROP COLUMN IF EXISTS global_competitor_id;
--   DROP TABLE IF EXISTS venture_persona_mapping;
--   DROP TABLE IF EXISTS customer_personas;
--   DROP TABLE IF EXISTS global_competitors;
--   DROP TABLE IF EXISTS risk_templates;
--   DROP TABLE IF EXISTS exit_playbooks;

-- ============================================================
-- 1. customer_personas
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  demographics JSONB DEFAULT '{}'::jsonb,
  goals TEXT[] DEFAULT '{}',
  pain_points TEXT[] DEFAULT '{}',
  psychographics JSONB DEFAULT '{}'::jsonb,
  industry TEXT,
  archetype TEXT,
  source_venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  canonical_id UUID REFERENCES customer_personas(id) ON DELETE SET NULL,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE customer_personas IS 'Canonical customer persona catalog. Personas can be venture-specific (source_venture_id) or global (canonical_id IS NULL).';
COMMENT ON COLUMN customer_personas.canonical_id IS 'Self-referencing FK for deduplication. NULL means canonical, non-NULL points to the canonical version.';
COMMENT ON COLUMN customer_personas.archetype IS 'High-level persona archetype (e.g., early_adopter, enterprise_buyer, prosumer).';

-- Partial unique index: enforce uniqueness among canonical personas only
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_personas_canonical
  ON customer_personas (name, COALESCE(industry, ''))
  WHERE canonical_id IS NULL;

-- ============================================================
-- 2. venture_persona_mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS venture_persona_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES customer_personas(id) ON DELETE CASCADE,
  relevance_score NUMERIC(3,2) DEFAULT 1.0,
  notes TEXT,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venture_id, persona_id)
);

COMMENT ON TABLE venture_persona_mapping IS 'Maps customer personas to ventures with a relevance score (0.00-1.00).';

-- ============================================================
-- 3. global_competitors
-- ============================================================
CREATE TABLE IF NOT EXISTS global_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  founded_year INTEGER,
  employee_range TEXT,
  funding_stage TEXT,
  headquarters TEXT,
  industries TEXT[] DEFAULT '{}',
  canonical_id UUID REFERENCES global_competitors(id) ON DELETE SET NULL,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE global_competitors IS 'Global competitor catalog for cross-venture competitive intelligence. Supports deduplication via canonical_id.';

-- Partial unique index: enforce uniqueness among canonical competitors only
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_competitors_canonical
  ON global_competitors (name, COALESCE(website, ''))
  WHERE canonical_id IS NULL;

-- ============================================================
-- 4. risk_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  default_likelihood INTEGER CHECK (default_likelihood BETWEEN 1 AND 5),
  default_impact INTEGER CHECK (default_impact BETWEEN 1 AND 5),
  mitigation_strategies TEXT[] DEFAULT '{}',
  applicable_archetypes TEXT[] DEFAULT '{}',
  applicable_stages INTEGER[] DEFAULT '{}',
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE risk_templates IS 'Reusable risk assessment templates categorized by type and applicable to specific archetypes and venture stages.';

-- ============================================================
-- 5. exit_playbooks
-- ============================================================
CREATE TABLE IF NOT EXISTS exit_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exit_type TEXT NOT NULL,
  description TEXT,
  prerequisites TEXT[] DEFAULT '{}',
  timeline_months INTEGER,
  target_multiple_range NUMRANGE,
  applicable_archetypes TEXT[] DEFAULT '{}',
  steps JSONB DEFAULT '[]'::jsonb,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE exit_playbooks IS 'Templated exit strategy playbooks (IPO, acquisition, merger, etc.) with prerequisites, timeline, and step-by-step guidance.';

-- ============================================================
-- 6. ALTER competitors: link to global_competitors
-- ============================================================
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS global_competitor_id UUID REFERENCES global_competitors(id) ON DELETE SET NULL;

COMMENT ON COLUMN competitors.global_competitor_id IS 'FK to global_competitors for cross-venture competitive intelligence linkage.';

-- ============================================================
-- 7. updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_customer_personas') THEN
    CREATE TRIGGER set_updated_at_customer_personas
      BEFORE UPDATE ON customer_personas
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_venture_persona_mapping') THEN
    CREATE TRIGGER set_updated_at_venture_persona_mapping
      BEFORE UPDATE ON venture_persona_mapping
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_global_competitors') THEN
    CREATE TRIGGER set_updated_at_global_competitors
      BEFORE UPDATE ON global_competitors
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_risk_templates') THEN
    CREATE TRIGGER set_updated_at_risk_templates
      BEFORE UPDATE ON risk_templates
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_exit_playbooks') THEN
    CREATE TRIGGER set_updated_at_exit_playbooks
      BEFORE UPDATE ON exit_playbooks
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  END IF;
END;
$$;

-- ============================================================
-- 8. RLS Policies
-- ============================================================

-- --- customer_personas (catalog table) ---
ALTER TABLE customer_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_customer_personas_service_role
  ON customer_personas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY select_customer_personas_authenticated
  ON customer_personas FOR SELECT TO authenticated
  USING (true);

-- --- venture_persona_mapping ---
ALTER TABLE venture_persona_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_venture_persona_mapping_service_role
  ON venture_persona_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY select_venture_persona_mapping_authenticated
  ON venture_persona_mapping FOR SELECT TO authenticated
  USING (true);

CREATE POLICY insert_venture_persona_mapping_authenticated
  ON venture_persona_mapping FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_id
      AND v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY update_venture_persona_mapping_authenticated
  ON venture_persona_mapping FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_id
      AND v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_id
      AND v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

-- --- global_competitors (catalog table) ---
ALTER TABLE global_competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_global_competitors_service_role
  ON global_competitors FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY select_global_competitors_authenticated
  ON global_competitors FOR SELECT TO authenticated
  USING (true);

-- --- risk_templates (catalog table) ---
ALTER TABLE risk_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_risk_templates_service_role
  ON risk_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY select_risk_templates_authenticated
  ON risk_templates FOR SELECT TO authenticated
  USING (true);

-- --- exit_playbooks (catalog table) ---
ALTER TABLE exit_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_exit_playbooks_service_role
  ON exit_playbooks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY select_exit_playbooks_authenticated
  ON exit_playbooks FOR SELECT TO authenticated
  USING (true);
