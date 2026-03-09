-- Venture Factory Database Foundation
-- SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-A
-- Creates: ehg_services, service_tasks, venture_service_bindings,
--          service_telemetry, venture_exit_readiness
-- Plus RLS policies and performance indexes
--
-- NOTE: These tables were applied to the live database on 2026-03-09.
-- This migration documents the actual deployed schema.

-- ============================================================
-- 1. ehg_services — Service Registry
-- ============================================================
CREATE TABLE IF NOT EXISTS ehg_services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key   TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  description   TEXT,
  api_version   TEXT NOT NULL DEFAULT '1.0.0',
  artifact_schema JSONB NOT NULL,            -- JSON Schema contract for service artifacts
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'deprecated', 'disabled')),
  config        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE ehg_services IS 'Registry of shared services available to ventures';
COMMENT ON COLUMN ehg_services.artifact_schema IS 'JSON Schema defining the artifact contract for this service';

-- ============================================================
-- 2. service_tasks — Task Queue with Priority Polling
-- ============================================================
CREATE TABLE IF NOT EXISTS service_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES ehg_services(id) ON DELETE CASCADE,
  task_type       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  priority        INTEGER DEFAULT 5,           -- lower = higher priority
  artifacts       JSONB,
  confidence_score NUMERIC,
  input_params    JSONB NOT NULL,              -- structured input for the task
  claimed_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE service_tasks IS 'Poll-based task queue for venture service delivery';

-- Polling performance index: venture agents poll for their pending tasks
CREATE INDEX IF NOT EXISTS idx_service_tasks_venture_pending
  ON service_tasks (venture_id, priority, created_at)
  WHERE status = 'pending';

-- Status lookup index
CREATE INDEX IF NOT EXISTS idx_service_tasks_status
  ON service_tasks (status, created_at);

-- ============================================================
-- 3. venture_service_bindings — Venture-to-Service Links
-- ============================================================
CREATE TABLE IF NOT EXISTS venture_service_bindings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id    UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  service_id    UUID NOT NULL REFERENCES ehg_services(id) ON DELETE CASCADE,
  api_version   TEXT NOT NULL DEFAULT '1.0.0',       -- pinned version
  config        JSONB DEFAULT '{}'::jsonb,           -- venture-specific overrides
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (venture_id, service_id)
);

COMMENT ON TABLE venture_service_bindings IS 'Links ventures to services with version pinning and config overrides';

-- ============================================================
-- 4. service_telemetry — Outcome Feedback Loop
-- ============================================================
CREATE TABLE IF NOT EXISTS service_telemetry (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               UUID NOT NULL REFERENCES service_tasks(id) ON DELETE CASCADE,
  venture_id            UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  service_id            UUID NOT NULL REFERENCES ehg_services(id) ON DELETE CASCADE,
  pr_url                TEXT,
  pr_status             TEXT,
  outcomes              JSONB DEFAULT '{}'::jsonb,   -- structured metrics
  venture_agent_version TEXT,
  reported_at           TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE service_telemetry IS 'Captures PR outcomes and metrics for cross-venture intelligence';

-- Aggregation index for cross-venture analytics
CREATE INDEX IF NOT EXISTS idx_service_telemetry_service
  ON service_telemetry (service_id, reported_at);

CREATE INDEX IF NOT EXISTS idx_service_telemetry_venture
  ON service_telemetry (venture_id, reported_at);

-- ============================================================
-- 5. venture_exit_readiness — Exit/Separation Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS venture_exit_readiness (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id               UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  dependency_inventory     JSONB DEFAULT '[]'::jsonb,
  data_export_status       TEXT DEFAULT 'not_started'
                           CHECK (data_export_status IN ('not_started', 'in_progress', 'completed', 'verified')),
  secret_rotation_status   TEXT DEFAULT 'not_started',
  third_party_alternatives JSONB DEFAULT '[]'::jsonb,
  separation_tested        BOOLEAN DEFAULT false,
  last_dry_run             TIMESTAMPTZ,
  estimated_separation_days INTEGER,
  notes                    TEXT,
  updated_at               TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE venture_exit_readiness IS 'Tracks venture separation readiness for exit scenarios';

-- ============================================================
-- 6. RLS Policies — Venture-Level Tenant Isolation
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE ehg_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_service_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_exit_readiness ENABLE ROW LEVEL SECURITY;

-- ehg_services: read-only for all authenticated
CREATE POLICY "ehg_services_read_all" ON ehg_services
  FOR SELECT TO authenticated USING (true);

-- service_tasks: agents can only access their own venture's tasks
-- Note: ventures.created_by is UUID type, use auth.uid() directly
CREATE POLICY "service_tasks_venture_select" ON service_tasks
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

CREATE POLICY "service_tasks_venture_update" ON service_tasks
  FOR UPDATE TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

CREATE POLICY "service_tasks_venture_insert" ON service_tasks
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

-- venture_service_bindings: read-only for agents
CREATE POLICY "vsb_venture_read" ON venture_service_bindings
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

-- service_telemetry: agents insert only for own venture
CREATE POLICY "telemetry_venture_insert" ON service_telemetry
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

CREATE POLICY "telemetry_venture_read" ON service_telemetry
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

-- venture_exit_readiness: owner read
CREATE POLICY "exit_readiness_venture_read" ON venture_exit_readiness
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

-- ============================================================
-- 7. Updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Only create triggers if they don't already exist
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_ehg_services') THEN
    CREATE TRIGGER set_updated_at_ehg_services
      BEFORE UPDATE ON ehg_services
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_service_tasks') THEN
    CREATE TRIGGER set_updated_at_service_tasks
      BEFORE UPDATE ON service_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_venture_service_bindings') THEN
    CREATE TRIGGER set_updated_at_venture_service_bindings
      BEFORE UPDATE ON venture_service_bindings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_venture_exit_readiness') THEN
    CREATE TRIGGER set_updated_at_venture_exit_readiness
      BEFORE UPDATE ON venture_exit_readiness
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
