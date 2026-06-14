-- SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001 — dedicated cloud-health substrate for the
-- chairman-away PAUSE ladder. Coordinator spec-fork ruling 3e11be61: fork2 =
-- dedicated-table-additive-migration (clean separation; do NOT overload the local-model
-- rollout llm_canary_state row or its advance_canary_stage/get_canary_state RPCs).
--
-- ADDITIVE ONLY: CREATE TABLE + seed one singleton row. No ALTER/DROP of any existing
-- object. Columns mirror EXACTLY the health-signal shape the source-agnostic pure
-- evaluator scripts/continuity/llm-degradation-detector.mjs::evaluateDegradationRung reads,
-- so detectFromDb can repoint here with no evaluator change. The cloud-cap feeder
-- (scripts/continuity/cloud-cap-feeder.mjs) is the SOLE writer of this row.

CREATE TABLE IF NOT EXISTS llm_cloud_health (
  -- Enforced singleton: exactly one row, addressed by id='singleton'.
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),

  -- Lifecycle: 'rolling' while the feeder is actively probing (arms the PAUSE trigger in
  -- the evaluator), 'paused' between probe batches (disarms false-PAUSE on a quiescent fleet).
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('rolling', 'paused')),

  -- Live cloud-cap signal (stamped by the feeder from real Anthropic 429/5xx/overloaded/timeout outcomes).
  current_error_rate DECIMAL(5,4),                                    -- failures / total probes in the batch
  error_rate_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.05,           -- MODEL_FALLBACK if current > this
  current_latency_p95_ms INTEGER,                                    -- p95 latency over the probe batch
  baseline_latency_p95_ms INTEGER,                                   -- stamped once on first healthy batch
  latency_multiplier_threshold DECIMAL(4,2) NOT NULL DEFAULT 2.0,    -- SINGLE_SESSION if p95 > mult * baseline
  consecutive_failures INTEGER NOT NULL DEFAULT 0,                   -- incremented on a bad batch, reset on healthy
  failures_before_rollback INTEGER NOT NULL DEFAULT 3,              -- PAUSE_AND_SURFACE if >= this AND status='rolling'
  last_quality_check_at TIMESTAMPTZ,                                 -- when the feeder last probed (liveness)

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton (idempotent). Default status='paused' => evaluator reads NORMAL until
-- the feeder first probes, which is the correct fail-open posture for a fresh substrate.
INSERT INTO llm_cloud_health (id, status)
VALUES ('singleton', 'paused')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE llm_cloud_health IS
  'Singleton live cloud-health signal for the chairman-away degradation ladder (SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001). Sole writer: scripts/continuity/cloud-cap-feeder.mjs. Read by llm-degradation-detector.mjs::detectFromDb. Distinct from llm_canary_state (local-model rollout).';

-- RLS: parity with the sibling continuity tables (llm_canary_state/_transitions/_metrics) and the
-- repo standard (SD-SEC-DB-LINTER-001 — every public table must have RLS enabled). The feeder +
-- detectFromDb use the service-role client (RLS-bypass), so this is additive/zero-functional-risk;
-- without it the security-linter sentinel (rls_disabled_in_public) goes red and the writable health
-- row is exposed to anon/authenticated via PostgREST.
ALTER TABLE llm_cloud_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON llm_cloud_health FROM anon, authenticated;
GRANT ALL ON llm_cloud_health TO service_role;
CREATE POLICY service_role_full_access ON llm_cloud_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);
