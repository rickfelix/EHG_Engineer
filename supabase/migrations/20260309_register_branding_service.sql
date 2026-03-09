-- Venture Factory: Register Branding Service + Telemetry Table
-- SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
-- Idempotent: ON CONFLICT DO NOTHING / IF NOT EXISTS

-- ============================================================
-- 1. Register branding service in ehg_services
-- ============================================================
INSERT INTO ehg_services (service_key, display_name, description, artifact_schema, version, sla_tier)
VALUES (
  'branding',
  'Branding Service',
  'Generates confidence-scored brand identity artifacts (colors, typography, voice, logo spec) for ventures with Decision Filter Engine routing',
  '{
    "type": "object",
    "required": ["venture_id", "brand_name", "color_palette", "typography", "brand_voice"],
    "properties": {
      "venture_id": {"type": "string", "format": "uuid"},
      "brand_name": {"type": "string", "minLength": 1, "maxLength": 100},
      "tagline": {"type": "string", "maxLength": 200},
      "color_palette": {
        "type": "object",
        "required": ["primary", "secondary", "accent"],
        "properties": {
          "primary": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
          "secondary": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
          "accent": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}
        }
      },
      "typography": {
        "type": "object",
        "required": ["heading_font", "body_font"],
        "properties": {
          "heading_font": {"type": "string"},
          "body_font": {"type": "string"}
        }
      },
      "brand_voice": {
        "type": "object",
        "required": ["tone", "personality_traits"],
        "properties": {
          "tone": {"type": "string", "enum": ["professional", "friendly", "authoritative", "playful", "technical", "warm"]},
          "personality_traits": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 5}
        }
      }
    }
  }'::jsonb,
  '1.0.0',
  'standard'
)
ON CONFLICT (service_key) DO NOTHING;

-- ============================================================
-- 2. Create service_telemetry table for cross-venture intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS service_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key TEXT NOT NULL,
  venture_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  confidence_score NUMERIC(4,3),
  routing_decision TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add check constraint for routing_decision
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_telemetry_routing_check'
  ) THEN
    ALTER TABLE service_telemetry ADD CONSTRAINT service_telemetry_routing_check
      CHECK (routing_decision IS NULL OR routing_decision IN ('auto_approve', 'review_flagged', 'draft_only'));
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_service_telemetry_venture ON service_telemetry(venture_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_telemetry_service ON service_telemetry(service_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_telemetry_routing ON service_telemetry(routing_decision) WHERE routing_decision IS NOT NULL;

-- ============================================================
-- 3. Insert initial version record for branding service
-- ============================================================
INSERT INTO service_versions (service_id, version, artifact_schema, changelog)
SELECT
  id,
  '1.0.0',
  artifact_schema,
  'Initial branding service: color palette, typography, brand voice, logo spec generation with Decision Filter Engine confidence routing'
FROM ehg_services
WHERE service_key = 'branding'
ON CONFLICT (service_id, version) DO NOTHING;
