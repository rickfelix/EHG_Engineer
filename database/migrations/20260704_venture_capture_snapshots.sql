-- venture_capture_snapshots — collect-without-promote per-stage signal capture for a venture.
-- SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (FR-1/FR-2). Chairman-ratified decision 1c1771d9
-- (2026-07-04): un-gate first-run signal extraction from the S26 template-extraction gate for
-- venture-1, retroactively for already-completed stages and forward as future stages complete —
-- WITHOUT writing to venture_templates (the application surface, which remains chairman-deferred
-- to first-revenue). This table is the quarantine/collect-only store: it captures the same shape
-- of signal the (unrelated, already-shipped) template-extractor.js sub-extractors compute, but
-- deliberately in a location the promotion/funnel-recalibration path never reads from.
--
-- Additive (new table) — no change to any existing table.
--
-- @approved-by: codestreetlabs@gmail.com

CREATE TABLE IF NOT EXISTS venture_capture_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  lifecycle_stage integer NOT NULL CHECK (lifecycle_stage >= 1 AND lifecycle_stage <= 26),
  snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance      text NOT NULL DEFAULT 'unvalidated' CHECK (provenance IN ('unvalidated', 'validated')),
  captured_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id, lifecycle_stage)
);

CREATE INDEX IF NOT EXISTS idx_venture_capture_snapshots_venture ON venture_capture_snapshots (venture_id);

-- RLS: authenticated read; service_role full write (mirrors the adam_task_ledger/
-- solomon_advice_outcome_ledger governance-table convention).
ALTER TABLE venture_capture_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_capture_snapshots_read ON venture_capture_snapshots;
CREATE POLICY venture_capture_snapshots_read ON venture_capture_snapshots
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS venture_capture_snapshots_service_write ON venture_capture_snapshots;
CREATE POLICY venture_capture_snapshots_service_write ON venture_capture_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE venture_capture_snapshots IS 'Collect-without-promote per-stage signal capture (SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001). Mirrors the shape of data lib/eva/template-extractor.js sub-extractors compute, stored OUTSIDE the venture_templates application surface. provenance stays unvalidated until the source venture outcome-resolves (killed or first-revenue) — this table itself is never promoted automatically; that remains a separate, chairman-deferred decision.';
COMMENT ON COLUMN venture_capture_snapshots.snapshot IS 'JSONB blob: { scoring_thresholds, architecture_patterns, dfe_calibrations, pricing_params, gtm_effectiveness, extractor_version, extracted_at } — same shape as template_data in venture_templates, but this row is NOT a template and NOT consumed by the promotion path.';
COMMENT ON COLUMN venture_capture_snapshots.provenance IS 'unvalidated = pre-outcome (default); validated = source venture later outcome-resolved (killed/first-revenue). Provenance alone does NOT trigger promotion — promotion is a separate, explicit, chairman-gated path that does not exist yet.';
