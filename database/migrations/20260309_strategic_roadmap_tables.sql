-- ============================================================================
-- Migration: Strategic Roadmap Tables
-- SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-B
-- Date: 2026-03-09
-- Description: Foundation schema for the Strategic Roadmap artifact type.
--              4 new tables enabling wave-based planning with OKR governance
--              cascade, lifecycle-stage orchestration, and baseline versioning.
--
-- MIGRATION ORDER (FK dependency-driven):
--   Step 1: CREATE strategic_roadmaps (depends on eva_vision_documents)
--   Step 2: CREATE roadmap_waves (depends on step 1)
--   Step 3: CREATE roadmap_wave_items (depends on step 2)
--   Step 4: CREATE roadmap_baseline_snapshots (depends on step 1)
--   Step 5: Enable RLS + create policies
--   Step 6: Create indexes
--   Step 7: Add triggers + comments
--
-- ROLLBACK (see bottom of file)
-- ============================================================================

-- ============================================================================
-- STEP 1: strategic_roadmaps
-- Top-level roadmap entity linked to a vision document.
-- ============================================================================

CREATE TABLE IF NOT EXISTS strategic_roadmaps (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_key                TEXT        REFERENCES eva_vision_documents(vision_key) ON DELETE RESTRICT,
  title                     TEXT        NOT NULL,
  description               TEXT,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'active', 'archived')),
  current_baseline_version  INTEGER     NOT NULL DEFAULT 0,
  metadata                  JSONB       DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                TEXT
);

COMMENT ON TABLE strategic_roadmaps IS
  'Top-level roadmap entities for wave-based planning. Linked to vision documents for strategic alignment.';

COMMENT ON COLUMN strategic_roadmaps.vision_key IS
  'FK to eva_vision_documents.vision_key. ON DELETE RESTRICT prevents orphaning roadmaps.';

COMMENT ON COLUMN strategic_roadmaps.current_baseline_version IS
  'Points to the latest approved baseline snapshot version. 0 means no baseline yet.';

-- ============================================================================
-- STEP 2: roadmap_waves
-- Ordered wave sequences within a roadmap with OKR linkage.
-- ============================================================================

CREATE TABLE IF NOT EXISTS roadmap_waves (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id            UUID        NOT NULL REFERENCES strategic_roadmaps(id) ON DELETE CASCADE,
  sequence_rank         INTEGER     NOT NULL,
  title                 TEXT        NOT NULL,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'approved', 'active', 'completed', 'archived')),
  depends_on_wave_ids   UUID[]      DEFAULT '{}',
  okr_objective_ids     UUID[]      DEFAULT '{}',
  proposed_okrs         JSONB       DEFAULT '[]'::jsonb,
  confidence_score      NUMERIC(3,2) DEFAULT 0.00,
  progress_pct          NUMERIC(5,2) DEFAULT 0.00,
  metadata              JSONB       DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  UNIQUE (roadmap_id, sequence_rank)
);

COMMENT ON TABLE roadmap_waves IS
  'Ordered wave sequences within a roadmap. Each wave groups related intake items for phased execution.';

COMMENT ON COLUMN roadmap_waves.sequence_rank IS
  'Execution order within the roadmap. UNIQUE per roadmap ensures no duplicate ranks.';

COMMENT ON COLUMN roadmap_waves.depends_on_wave_ids IS
  'Soft array of wave UUIDs this wave depends on. No FK constraint for flexibility.';

COMMENT ON COLUMN roadmap_waves.proposed_okrs IS
  'JSONB array of proposed OKR structures. Format: [{"objective":"...", "key_results":["..."]}]';

-- ============================================================================
-- STEP 3: roadmap_wave_items
-- Links classified EVA intake items to waves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS roadmap_wave_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id           UUID        NOT NULL REFERENCES roadmap_waves(id) ON DELETE CASCADE,
  source_type       TEXT        NOT NULL CHECK (source_type IN ('todoist', 'youtube')),
  source_id         UUID        NOT NULL,
  title             TEXT,
  promoted_to_sd_key TEXT,
  priority_rank     INTEGER,
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wave_id, source_type, source_id)
);

COMMENT ON TABLE roadmap_wave_items IS
  'Links classified EVA intake items to roadmap waves. Tracks promotion to SDs.';

COMMENT ON COLUMN roadmap_wave_items.source_type IS
  'Intake source: todoist or youtube. Check constraint enforced.';

COMMENT ON COLUMN roadmap_wave_items.promoted_to_sd_key IS
  'SD key (e.g., SD-LEO-FEAT-001) if this item was promoted to a strategic directive.';

-- ============================================================================
-- STEP 4: roadmap_baseline_snapshots
-- Versioned snapshots of wave sequences for audit trail.
-- ============================================================================

CREATE TABLE IF NOT EXISTS roadmap_baseline_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id        UUID        NOT NULL REFERENCES strategic_roadmaps(id) ON DELETE CASCADE,
  version           INTEGER     NOT NULL,
  wave_sequence     JSONB       NOT NULL,
  change_rationale  TEXT,
  approved_at       TIMESTAMPTZ,
  approved_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT,
  UNIQUE (roadmap_id, version)
);

COMMENT ON TABLE roadmap_baseline_snapshots IS
  'Versioned snapshots of roadmap wave sequences. Supports Chairman approval audit trail.';

COMMENT ON COLUMN roadmap_baseline_snapshots.wave_sequence IS
  'Complete snapshot of wave ordering and items at time of baseline. JSONB NOT NULL.';

COMMENT ON COLUMN roadmap_baseline_snapshots.version IS
  'Monotonically increasing version number per roadmap. UNIQUE per roadmap.';

-- ============================================================================
-- STEP 5: RLS Policies (two-tier: service_role ALL, authenticated SELECT)
-- ============================================================================

ALTER TABLE strategic_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_wave_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_baseline_snapshots ENABLE ROW LEVEL SECURITY;

-- strategic_roadmaps
CREATE POLICY strategic_roadmaps_service_role_all ON strategic_roadmaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY strategic_roadmaps_authenticated_select ON strategic_roadmaps
  FOR SELECT TO authenticated USING (true);

-- roadmap_waves
CREATE POLICY roadmap_waves_service_role_all ON roadmap_waves
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY roadmap_waves_authenticated_select ON roadmap_waves
  FOR SELECT TO authenticated USING (true);

-- roadmap_wave_items
CREATE POLICY roadmap_wave_items_service_role_all ON roadmap_wave_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY roadmap_wave_items_authenticated_select ON roadmap_wave_items
  FOR SELECT TO authenticated USING (true);

-- roadmap_baseline_snapshots
CREATE POLICY roadmap_baseline_snapshots_service_role_all ON roadmap_baseline_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY roadmap_baseline_snapshots_authenticated_select ON roadmap_baseline_snapshots
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- STEP 6: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_roadmaps_vision_key
  ON strategic_roadmaps (vision_key) WHERE vision_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roadmaps_status
  ON strategic_roadmaps (status);

CREATE INDEX IF NOT EXISTS idx_waves_roadmap_rank
  ON roadmap_waves (roadmap_id, sequence_rank);
CREATE INDEX IF NOT EXISTS idx_waves_status
  ON roadmap_waves (status);

CREATE INDEX IF NOT EXISTS idx_wave_items_source
  ON roadmap_wave_items (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_wave_items_wave
  ON roadmap_wave_items (wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_items_promoted
  ON roadmap_wave_items (promoted_to_sd_key) WHERE promoted_to_sd_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baselines_roadmap_version
  ON roadmap_baseline_snapshots (roadmap_id, version);

-- ============================================================================
-- STEP 7: Triggers (updated_at)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_strategic_roadmaps_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_roadmap_waves_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_roadmap_wave_items_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_strategic_roadmaps_updated ON strategic_roadmaps;
CREATE TRIGGER trg_strategic_roadmaps_updated
  BEFORE UPDATE ON strategic_roadmaps
  FOR EACH ROW EXECUTE FUNCTION update_strategic_roadmaps_updated_at();

DROP TRIGGER IF EXISTS trg_roadmap_waves_updated ON roadmap_waves;
CREATE TRIGGER trg_roadmap_waves_updated
  BEFORE UPDATE ON roadmap_waves
  FOR EACH ROW EXECUTE FUNCTION update_roadmap_waves_updated_at();

DROP TRIGGER IF EXISTS trg_roadmap_wave_items_updated ON roadmap_wave_items;
CREATE TRIGGER trg_roadmap_wave_items_updated
  BEFORE UPDATE ON roadmap_wave_items
  FOR EACH ROW EXECUTE FUNCTION update_roadmap_wave_items_updated_at();

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_roadmap_wave_items_updated ON roadmap_wave_items;
-- DROP TRIGGER IF EXISTS trg_roadmap_waves_updated ON roadmap_waves;
-- DROP TRIGGER IF EXISTS trg_strategic_roadmaps_updated ON strategic_roadmaps;
-- DROP FUNCTION IF EXISTS update_roadmap_wave_items_updated_at();
-- DROP FUNCTION IF EXISTS update_roadmap_waves_updated_at();
-- DROP FUNCTION IF EXISTS update_strategic_roadmaps_updated_at();
-- DROP TABLE IF EXISTS roadmap_baseline_snapshots;
-- DROP TABLE IF EXISTS roadmap_wave_items;
-- DROP TABLE IF EXISTS roadmap_waves;
-- DROP TABLE IF EXISTS strategic_roadmaps;
