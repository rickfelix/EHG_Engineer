-- SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 FR-2: vision_readiness_blocked audit table
-- De-scoped from CAPA-2 after UNIFY-VENTURE-NON-001 overlap; covers consumer-layer graceful failure events.
-- Captures every vision-scorer.js CONDITIONAL_PASS / human_review_floor_dims event so operators
-- can see frequency and prioritize Stage-4 enrichment campaigns.

CREATE TABLE IF NOT EXISTS vision_readiness_blocked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_key text NOT NULL,
  venture_id uuid REFERENCES ventures(id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (reason IN (
    'vision_not_found',
    'vision_query_error',
    'extracted_dimensions_null',
    'content_too_short',
    'status_inactive',
    'level_below_minimum',
    'venture_id_missing'
  )),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'WARNING' CHECK (mode IN ('WARNING', 'BLOCKING')),
  attempted_by text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);

COMMENT ON TABLE vision_readiness_blocked IS
  'SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 FR-2: audit log of every vision-scorer.js graceful-failure event (verdict=human_review_floor_dims with reason=vision_not_ready). Helper at lib/eva/audit-vision-readiness.js writes rows. 60s dedup window prevents audit storm. Complementary to SD-LEO-INFRA-UNIFY-VENTURE-NON-001 (which prevents NEW unready-doc generation at the writer layer); this audit tracks consumer-side graceful failures for the 56 LEGACY unready docs.';

CREATE INDEX IF NOT EXISTS idx_vision_readiness_blocked_vision_key
  ON vision_readiness_blocked (vision_key);

CREATE INDEX IF NOT EXISTS idx_vision_readiness_blocked_blocked_at_desc
  ON vision_readiness_blocked (blocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_vision_readiness_blocked_unresolved
  ON vision_readiness_blocked (vision_key)
  WHERE resolved_at IS NULL;
