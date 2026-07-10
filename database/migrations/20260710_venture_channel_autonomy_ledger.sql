-- @approved-by: codestreetlabs@gmail.com
-- venture_channel_autonomy / venture_channel_publish_ledger / venture_channel_secrets /
-- venture_inbound_messages — Distribution EXECUTE-rail safety schema.
-- SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C (FR-1, FR-2, FR-3, FR-4).
--
-- All four tables are ADDITIVE (CREATE TABLE IF NOT EXISTS) — no change to any existing
-- table's shape. venture_distribution_channels gains liveness columns via ADD COLUMN
-- IF NOT EXISTS. Modeled on solomon_advice_outcome_ledger's decision/outcome enum shape
-- (20260701_solomon_advice_outcome_ledger.sql) and venture_db_secrets' secret_ref-only
-- pattern (20260614_venture_db_secrets.sql) — never a new autonomy taxonomy, never a
-- plaintext credential.
--
-- SECURITY: venture_channel_secrets stores REFERENCES only (a secret-manager key), never
-- a plaintext credential or token — this migration contains no credential literals.

-- ============================================================================
-- STEP 1: Per-channel autonomy state (FR-3) — propose-and-approve default, data-driven
-- graduation to autonomous. Deliberately NOT the eva_autonomy_level (L0-L4) enum: that
-- taxonomy governs venture-lifecycle STAGE gates, a different axis from per-channel
-- publish autonomy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_channel_autonomy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  autonomy_state  TEXT NOT NULL DEFAULT 'propose_and_approve'
                    CHECK (autonomy_state IN ('propose_and_approve', 'autonomous')),
  clean_streak    INTEGER NOT NULL DEFAULT 0,
  graduated_at    TIMESTAMPTZ,
  graduated_by    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_vca_venture ON venture_channel_autonomy(venture_id);

COMMENT ON TABLE venture_channel_autonomy IS
  'Per-(venture,channel) publish-autonomy state. propose_and_approve is the fail-closed default; autonomous is reached only via venture_channel_publish_ledger proven-outcome graduation, never a manual toggle. Read by lib/marketing/publisher/index.js publish() BEFORE adapter construction (TR-1).';

-- ============================================================================
-- STEP 2: Proven-outcome publish ledger (FR-3) — one row per publish decision+outcome,
-- feeds venture_channel_autonomy graduation. outcome is set from the ACTUAL observed
-- post/engagement result, never self-reported (mirrors solomon_advice_outcome_ledger's
-- CONST-002 proposer!=approver discipline).
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_channel_publish_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  content_ref     TEXT,
  correlation_id  TEXT NOT NULL,
  decision        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (decision IN ('pending', 'accepted', 'rejected', 'partial')),
  decision_by     TEXT,
  decision_at     TIMESTAMPTZ,
  outcome         TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (outcome IN ('unknown', 'shipped_clean', 'reverted', 'caused_rework')),
  outcome_ref     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (correlation_id)
);

CREATE INDEX IF NOT EXISTS idx_vcpl_venture_channel ON venture_channel_publish_ledger(venture_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_vcpl_created ON venture_channel_publish_ledger(created_at DESC);

COMMENT ON TABLE venture_channel_publish_ledger IS
  'Per-publish decision+outcome feeding venture_channel_autonomy graduation. N consecutive shipped_clean+accepted rows for a (venture,channel) graduates it to autonomous; any reverted/caused_rework immediately resets clean_streak and demotes back to propose_and_approve.';

-- ============================================================================
-- STEP 3: Per-venture channel credential references (FR-1, FR-2) — mirrors
-- venture_db_secrets: a secret_ref indirection, never a plaintext credential.
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_channel_secrets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL,
  provider        TEXT,
  secret_ref      TEXT NOT NULL, -- external secret-manager key; never a plaintext credential
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_vcs_venture ON venture_channel_secrets(venture_id);

COMMENT ON TABLE venture_channel_secrets IS
  'Per-(venture,channel) credential REFERENCE for publisher adapters (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-1/FR-2). storeSecret() writes here; adapters resolve secret_ref at call time — never persisted plaintext, never a shared cross-venture identity.';

-- ============================================================================
-- STEP 4: Inbound reply/DM ingestion (FR-4) — the prompt-injection floor. No ingestion
-- path exists today; raw_text is NEVER fed to an LLM directly, only sanitized content
-- after quarantine review.
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_inbound_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id          UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  channel_type        TEXT NOT NULL,
  channel_id          UUID REFERENCES distribution_channels(id) ON DELETE SET NULL,
  external_message_id TEXT NOT NULL,
  raw_text            TEXT NOT NULL,
  sanitization_status TEXT NOT NULL DEFAULT 'unprocessed'
                        CHECK (sanitization_status IN ('unprocessed', 'sanitized', 'quarantined')),
  quarantine_reason   TEXT,
  received_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_type, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_vim_venture ON venture_inbound_messages(venture_id);
CREATE INDEX IF NOT EXISTS idx_vim_status ON venture_inbound_messages(sanitization_status);

COMMENT ON TABLE venture_inbound_messages IS
  'Inbound social reply/DM ingestion — the prompt-injection floor (FR-4). raw_text is public-origin DATA, never instructions: it is NEVER string-concatenated into a tool-enabled LLM prompt. Only sanitization_status=sanitized content may be used downstream; quarantined items require human disposition via chairman_decisions.';

-- ============================================================================
-- STEP 5: Adapter liveness map on the existing venture_distribution_channels join (FR-1).
-- ============================================================================

ALTER TABLE venture_distribution_channels
  ADD COLUMN IF NOT EXISTS liveness_state TEXT NOT NULL DEFAULT 'wired_but_silent'
    CHECK (liveness_state IN ('wired_but_silent', 'proven_live'));
ALTER TABLE venture_distribution_channels
  ADD COLUMN IF NOT EXISTS auth_verified_at TIMESTAMPTZ;
ALTER TABLE venture_distribution_channels
  ADD COLUMN IF NOT EXISTS ratelimit_verified_at TIMESTAMPTZ;
ALTER TABLE venture_distribution_channels
  ADD COLUMN IF NOT EXISTS first_post_observed_at TIMESTAMPTZ;
ALTER TABLE venture_distribution_channels
  ADD COLUMN IF NOT EXISTS liveness_evidence_ref TEXT;

COMMENT ON COLUMN venture_distribution_channels.liveness_state IS
  'wired_but_silent until a live-post liveness proof (auth + rate-limit + one real observed post) flips it to proven_live. "Adapter exists" alone never counts as proven_live.';

-- ============================================================================
-- STEP 6: Ops-visibility read-model views (FR-7) — the durable inspectability contract
-- in place of a new frontend page. Pending approvals / quarantine disposition route
-- through the existing chairman_decisions surface, not new UI.
--
-- SECURITY (adversarial review, PR #5791): every view here is created WITH
-- (security_invoker = true) — PostgreSQL 15+/Supabase's fix for the "Security Definer
-- View" pitfall. Without it, a view runs with the CREATING role's privileges (which
-- typically bypasses its own RLS as the table owner), silently exposing every venture's
-- rows to any querying role regardless of the authenticated-scoped RLS policies defined
-- in STEP 8 below — including v_injection_quarantine_queue, which would otherwise leak
-- flagged prompt-injection content across ventures/companies. security_invoker makes
-- each view honor the QUERYING role's own RLS instead.
-- ============================================================================

CREATE OR REPLACE VIEW v_channel_autonomy_state
WITH (security_invoker = true) AS
SELECT
  vca.venture_id,
  vca.channel_type,
  vca.autonomy_state,
  vca.clean_streak,
  vca.graduated_at,
  vca.graduated_by,
  COUNT(vcpl.id) FILTER (WHERE vcpl.outcome = 'shipped_clean' AND vcpl.decision = 'accepted') AS shipped_clean_count,
  COUNT(vcpl.id) FILTER (WHERE vcpl.outcome IN ('reverted', 'caused_rework')) AS failure_count,
  MAX(vcpl.created_at) AS last_publish_at
FROM venture_channel_autonomy vca
LEFT JOIN venture_channel_publish_ledger vcpl
  ON vcpl.venture_id = vca.venture_id AND vcpl.channel_type = vca.channel_type
GROUP BY vca.venture_id, vca.channel_type, vca.autonomy_state, vca.clean_streak, vca.graduated_at, vca.graduated_by;

-- KNOWN LIMITATION: distribution_channels.channel_type is a coarse category enum
-- ('social'|'email'|'web'|'other', 20260105_marketing_content_distribution.sql) and
-- .platform ('linkedin'|'twitter'|...) does not include every publisher/index.js
-- adapter key ('x', 'bluesky' — bluesky has no distribution_channels row at all today).
-- The publish()-path tables (venture_channel_autonomy/_secrets, keyed on the adapter
-- `platform` string) and venture_distribution_channels (keyed on distribution_channels.id,
-- a DIFFERENT taxonomy for the distribution-PLAN side) are not joinable on a shared
-- channel identifier without a taxonomy reconciliation that is out of this SD's scope
-- (see lib/marketing/channel-secrets.js's resolveChannelCredentials docstring for the
-- same gap). This view reports venture_distribution_channels' own liveness columns
-- directly — dc.name is included as a human-readable label only, NOT as a reliable
-- join key back to the publish()-path `platform` identifier.
CREATE OR REPLACE VIEW v_publisher_adapter_liveness
WITH (security_invoker = true) AS
SELECT
  vdc.venture_id,
  dc.name AS channel_label,
  dc.platform,
  vdc.liveness_state,
  vdc.auth_verified_at,
  vdc.ratelimit_verified_at,
  vdc.first_post_observed_at,
  vdc.liveness_evidence_ref
FROM venture_distribution_channels vdc
JOIN distribution_channels dc ON dc.id = vdc.channel_id;

CREATE OR REPLACE VIEW v_injection_quarantine_queue
WITH (security_invoker = true) AS
SELECT
  id,
  venture_id,
  channel_type,
  external_message_id,
  quarantine_reason,
  received_at,
  created_at
FROM venture_inbound_messages
WHERE sanitization_status = 'quarantined'
ORDER BY created_at DESC;

-- ============================================================================
-- STEP 7: updated_at triggers (mirror trg_solomon_advice_outcome_ledger_updated_at)
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_venture_channel_autonomy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vca_updated ON venture_channel_autonomy;
CREATE TRIGGER trg_vca_updated BEFORE UPDATE ON venture_channel_autonomy
  FOR EACH ROW EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at();

DROP TRIGGER IF EXISTS trg_vcpl_updated ON venture_channel_publish_ledger;
CREATE TRIGGER trg_vcpl_updated BEFORE UPDATE ON venture_channel_publish_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at();

DROP TRIGGER IF EXISTS trg_vcs_updated ON venture_channel_secrets;
CREATE TRIGGER trg_vcs_updated BEFORE UPDATE ON venture_channel_secrets
  FOR EACH ROW EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at();

-- ============================================================================
-- STEP 8: RLS — mirror the vdc_venture_access pattern exactly (authenticated read
-- scoped to venture's company_id via user_company_access; service_role full access).
-- ============================================================================

ALTER TABLE venture_channel_autonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_channel_publish_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_channel_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vca_venture_access" ON venture_channel_autonomy
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "vca_service_role" ON venture_channel_autonomy
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "vcpl_venture_access" ON venture_channel_publish_ledger
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "vcpl_service_role" ON venture_channel_publish_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- venture_channel_secrets: NO authenticated read at all (secret_ref values, even as
-- references, are service_role-only — mirrors venture_db_secrets).
CREATE POLICY "vcs_service_role_only" ON venture_channel_secrets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "vim_venture_access" ON venture_inbound_messages
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "vim_service_role" ON venture_inbound_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
