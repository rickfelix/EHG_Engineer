-- vision_build_gauge — historized snapshots of the auto-computed vision BUILD-completeness gauge.
-- SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-2).
-- Minimal ADDITIVE table — no change to any existing table. APPEND-ONLY: one row per VDR run
-- (scripts/vision-gauge-refresh.mjs), so the overall %, per-layer breakdown, and the full
-- component/probe results are historized for trend ("Adam works it down"). The denominator is
-- inspectable (components JSONB) so the percentage is auditable and never fabricated.
--
-- CHAIRMAN PROD-DEPLOY GATE: this migration is intentionally NOT yet attested. Before applying to
-- production with `node scripts/apply-migration.js <file> --prod-deploy`, the CHAIRMAN must add the
-- line `-- @approved-by: <chairman-email>` (matching git user.email) — it is deliberately absent
-- here because the worker may not self-author the chairman attestation (CONST-002).

CREATE TABLE IF NOT EXISTS vision_build_gauge (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_pct        integer,                       -- 0..100; NULL when the gauge was unavailable (vision doc absent)
  available          boolean NOT NULL DEFAULT true, -- false ⇒ the gauge could not be computed this run
  per_layer          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { infrastructure, application, venture, process } → pct|null
  components          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ capability, layer, status, detail, score }] — the auditable denominator
  denominator        integer NOT NULL DEFAULT 0,    -- probeable capabilities (status != 'unknown') = the % denominator
  total_capabilities integer NOT NULL DEFAULT 0,    -- all REQUIRED capabilities parsed from EHG-VISION.md
  unknown_count      integer NOT NULL DEFAULT 0,    -- capabilities excluded from the denominator (unprobeable)
  source             text NOT NULL DEFAULT 'vdr',   -- producer tag (the Vision Denominator Registry)
  measured_at        timestamptz NOT NULL DEFAULT now()
);

-- Trend reads (latest snapshot / time series) order by measured_at.
CREATE INDEX IF NOT EXISTS idx_vision_build_gauge_measured_at ON vision_build_gauge (measured_at DESC);

-- RLS: authenticated read; service_role full write (governance-table convention — mirrors
-- adam_adherence_ledger / venture_guardrail_state).
ALTER TABLE vision_build_gauge ENABLE ROW LEVEL SECURITY;

CREATE POLICY vision_build_gauge_read ON vision_build_gauge
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY vision_build_gauge_service_write ON vision_build_gauge
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE vision_build_gauge IS 'Historized vision BUILD-completeness gauge snapshots (SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 FR-2). Append-only; written by scripts/vision-gauge-refresh.mjs from the Vision Denominator Registry; read by the Adam exec-summary + the Chairman-UI build-% tile. components JSONB is the inspectable, auditable denominator.';

-- In-migration verify (green-now): assert the table + index + policies exist after apply.
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vision_build_gauge') THEN
    RAISE EXCEPTION 'vision_build_gauge table was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vision_build_gauge_measured_at') THEN
    RAISE EXCEPTION 'idx_vision_build_gauge_measured_at index was not created';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'vision_build_gauge') < 2 THEN
    RAISE EXCEPTION 'vision_build_gauge RLS policies were not created';
  END IF;
END
$verify$;
