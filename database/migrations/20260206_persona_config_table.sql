-- Persona Configuration Table
-- SD-MAN-GEN-TITLE-TARGET-APPLICATION-001
--
-- Makes persona validation target-application-aware.
-- Previously: hardcoded FORBIDDEN_PERSONAS global list in persona-templates.js
-- Now: per-application config in database with sd_type overrides
--
-- Key behavior change:
--   EHG_Engineer: developers ARE the users, technical personas allowed
--   EHG: business-focused, technical personas forbidden
--   Default: conservative (same as current global behavior)

-- Step 1: Create persona_config table
CREATE TABLE IF NOT EXISTS persona_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_application TEXT NOT NULL,
    mandatory_personas TEXT[] NOT NULL DEFAULT '{}',
    allowed_personas TEXT[] DEFAULT NULL,
    forbidden_personas TEXT[] DEFAULT NULL,
    optional_triggers JSONB DEFAULT '{}'::jsonb,
    sd_type_overrides JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_application)
);

-- Add comments
COMMENT ON TABLE persona_config IS 'Per-application persona validation rules. Determines which personas are mandatory, allowed, or forbidden for each target application. SD-MAN-GEN-TITLE-TARGET-APPLICATION-001';
COMMENT ON COLUMN persona_config.target_application IS 'Application identifier (EHG, EHG_Engineer, etc.)';
COMMENT ON COLUMN persona_config.mandatory_personas IS 'Personas that MUST be included for this app';
COMMENT ON COLUMN persona_config.allowed_personas IS 'If set, ONLY these personas are allowed (whitelist). NULL means all non-forbidden are allowed';
COMMENT ON COLUMN persona_config.forbidden_personas IS 'Personas that are BLOCKED for this app. NULL means no personas are forbidden';
COMMENT ON COLUMN persona_config.optional_triggers IS 'Conditional personas: {"persona_id": "trigger_keyword"} e.g. {"eva": "automation", "devops_engineer": "infra"}';
COMMENT ON COLUMN persona_config.sd_type_overrides IS 'Per-SD-type overrides: {"infrastructure": {"allow_technical": true}} overrides forbidden list for that SD type';

-- Step 2: Seed data for known applications
INSERT INTO persona_config (target_application, mandatory_personas, forbidden_personas, optional_triggers, sd_type_overrides)
VALUES
  -- EHG (runtime app): Business users only, technical personas forbidden
  ('EHG',
   ARRAY['chairman', 'solo_entrepreneur'],
   ARRAY['developer', 'dba', 'admin', 'engineer', 'ops', 'devops', 'sysadmin', 'backend', 'frontend', 'qa', 'tester', 'it', 'infrastructure', 'platform'],
   '{"eva": "automation"}'::jsonb,
   '{"infrastructure": {"allow_technical": true}, "database": {"allow_technical": true}}'::jsonb
  ),
  -- EHG_Engineer (governance/tooling): Developers ARE the users, no forbidden personas
  ('EHG_Engineer',
   ARRAY['chairman'],
   NULL,
   '{"devops_engineer": "infra", "eva": "automation"}'::jsonb,
   '{}'::jsonb
  ),
  -- Default fallback: conservative (same as current global behavior)
  ('_default',
   ARRAY['chairman'],
   ARRAY['developer', 'dba', 'admin', 'engineer', 'ops', 'devops', 'sysadmin', 'backend', 'frontend', 'qa', 'tester', 'it', 'infrastructure', 'platform'],
   '{"eva": "automation"}'::jsonb,
   '{"infrastructure": {"allow_technical": true}, "documentation": {"allow_technical": true}, "refactor": {"allow_technical": true}, "database": {"allow_technical": true}}'::jsonb
  )
ON CONFLICT (target_application) DO NOTHING;

-- Step 3: Add updated_at trigger
CREATE OR REPLACE FUNCTION update_persona_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_persona_config_updated_at ON persona_config;
CREATE TRIGGER trg_persona_config_updated_at
  BEFORE UPDATE ON persona_config
  FOR EACH ROW
  EXECUTE FUNCTION update_persona_config_updated_at();

-- Step 4: Index for lookups
CREATE INDEX IF NOT EXISTS idx_persona_config_active ON persona_config(target_application) WHERE is_active = true;

-- Success message
SELECT 'Migration complete: persona_config table created with seed data for EHG, EHG_Engineer, and _default' AS result;
