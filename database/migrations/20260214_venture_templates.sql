-- Venture Templates: Reusable patterns from successful ventures
-- SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-3, FR-4)
--
-- Stores structured templates extracted at Stage 25 completion,
-- versioned immutably, with effectiveness scoring.

CREATE TABLE IF NOT EXISTS venture_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_venture_id uuid NOT NULL REFERENCES ventures(id),
  template_name   text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  domain_tags     text[] NOT NULL DEFAULT '{}',
  template_data   jsonb NOT NULL DEFAULT '{}',
  effectiveness_score numeric(5,2) NOT NULL DEFAULT 0
    CHECK (effectiveness_score >= 0 AND effectiveness_score <= 100),
  usage_count     integer NOT NULL DEFAULT 0,
  is_current      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one current version per source venture
CREATE UNIQUE INDEX idx_venture_templates_current
  ON venture_templates (source_venture_id)
  WHERE is_current = true;

-- Domain tag search (GIN for array containment queries)
CREATE INDEX idx_venture_templates_domain_tags
  ON venture_templates USING gin (domain_tags);

-- Template data search (GIN for JSONB queries)
CREATE INDEX idx_venture_templates_data
  ON venture_templates USING gin (template_data);

-- Effectiveness ranking
CREATE INDEX idx_venture_templates_effectiveness
  ON venture_templates (effectiveness_score DESC)
  WHERE is_current = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_venture_templates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_venture_templates_updated_at
  BEFORE UPDATE ON venture_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_venture_templates_updated_at();

-- RLS
ALTER TABLE venture_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY venture_templates_read ON venture_templates
  FOR SELECT USING (true);

CREATE POLICY venture_templates_write ON venture_templates
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE venture_templates IS 'Reusable patterns extracted from ventures completing Stage 25';
COMMENT ON COLUMN venture_templates.template_data IS 'JSONB: scoring_thresholds, architecture_patterns, dfe_calibrations, pricing_params, gtm_effectiveness';
COMMENT ON COLUMN venture_templates.is_current IS 'Only one version per source_venture can be current; old versions set to false';
