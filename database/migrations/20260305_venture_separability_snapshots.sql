-- Migration: venture_separability_snapshots
-- SD: SD-LEO-FEAT-ACQUISITION-READINESS-GAP-001 (ARG04:US-004)
--
-- Stores point-in-time separability score snapshots for tracking
-- how venture separability changes over time. Designed for
-- acquisition due diligence (defensible history of engineering decisions).

CREATE TABLE IF NOT EXISTS venture_separability_snapshots (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id    uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  dimension_scores jsonb NOT NULL DEFAULT '{}',
  overall_score numeric(5,2) NOT NULL,
  snapshot_type varchar(20) NOT NULL DEFAULT 'manual'
    CHECK (snapshot_type IN ('manual', 'scheduled', 'post_sd')),
  triggered_by  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for time-series queries per venture
CREATE INDEX idx_separability_snapshots_venture_time
  ON venture_separability_snapshots(venture_id, created_at DESC);

-- RLS: only venture owners can see their snapshots
ALTER TABLE venture_separability_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venture separability snapshots viewable by venture owner"
  ON venture_separability_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_separability_snapshots.venture_id
        AND v.created_by = auth.uid()
    )
  );

CREATE POLICY "Venture separability snapshots insertable by venture owner"
  ON venture_separability_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.id = venture_separability_snapshots.venture_id
        AND v.created_by = auth.uid()
    )
  );
