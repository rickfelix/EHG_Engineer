-- Migration: eva_event_schemas table for persistent event schema registry
-- SD: SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-C (A05: Event Schema Registry Persistence)

CREATE TABLE IF NOT EXISTS eva_event_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  version text NOT NULL,
  schema_definition jsonb NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eva_event_schemas_event_version_unique UNIQUE (event_type, version)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_eva_event_schemas_event_type ON eva_event_schemas (event_type);

-- RLS policies
ALTER TABLE eva_event_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY eva_event_schemas_authenticated_select ON eva_event_schemas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY eva_event_schemas_service_role_all ON eva_event_schemas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
