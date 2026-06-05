-- SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001 (epic #4)
-- Coordination Observability: durable, structured store for fleet-coordination
-- anomaly events emitted by the read-only detectors (lib/coordinator/detectors.cjs).
--
-- ADDITIVE ONLY. No existing table is altered. The detectors that write here are
-- DEFAULT-OFF behind COORD_DETECTORS_V2, so this table stays empty until the flag
-- is enabled. Consumed later by epic #3 (the self-improvement loop) and surfaced
-- by fleet-dashboard. Idempotent (IF NOT EXISTS) so re-application is safe.
--
-- session_id / sd_key are plain text (NOT foreign keys): events are an immutable
-- observation log that must survive the deletion/rotation of the sessions or SDs
-- they reference.

CREATE TABLE IF NOT EXISTS coordination_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text        NOT NULL,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  severity         text        NOT NULL DEFAULT 'info'
                     CHECK (severity IN ('info', 'warning', 'critical')),
  session_id       text,
  sd_key           text,
  detector_version text,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Most reads are "recent events of type X" and "recent events by severity".
CREATE INDEX IF NOT EXISTS idx_coord_events_type_detected
  ON coordination_events (event_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_coord_events_severity_detected
  ON coordination_events (severity, detected_at DESC);

COMMENT ON TABLE coordination_events IS
  'epic #4 (SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001): structured fleet-coordination anomaly events from the read-only detectors; written only when COORD_DETECTORS_V2 is enabled.';
COMMENT ON COLUMN coordination_events.event_type IS
  'SPLIT_BRAIN | THUNDERING_HERD | REPLY_STARVATION | STUCK_WORKER | CLAIM_HALF_WRITE';
COMMENT ON COLUMN coordination_events.detector_version IS
  'Detector bundle version that emitted the row (e.g. COORD_DETECTORS_V2).';
COMMENT ON COLUMN coordination_events.payload IS
  'Detector {reason, evidence} — the matched predicate output.';
