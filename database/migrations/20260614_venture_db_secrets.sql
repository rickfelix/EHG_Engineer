-- venture_db_secrets — per-venture database connection secret REFERENCES (not literals).
-- SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B (FR-4).
-- Minimal ADDITIVE table — no change to any existing table. One row per venture
-- (UNIQUE venture_id) holding a connection_url / secret_ref for the venture's
-- routed DB (D1 / Neon / replit-postgres), populated by the provisioner's stakes-
-- routed DB step and read by sibling D (publish). Per-venture isolation: a leak in
-- one venture cannot expose another's credentials.
--
-- SECURITY: this table stores REFERENCES (a secret manager key / connection URL),
-- never a plaintext credential, and the migration itself contains NO credential
-- literals.
--
-- CHAIRMAN PROD-DEPLOY GATE: intentionally NOT yet attested. Before applying to
-- production with `node scripts/apply-migration.js <file> --prod-deploy`, the
-- CHAIRMAN must add the line `-- @approved-by: <chairman-email>` (matching
-- git user.email). It is deliberately absent here because the worker may not
-- self-author the chairman attestation (CONST-002).

CREATE TABLE IF NOT EXISTS venture_db_secrets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      uuid NOT NULL,                 -- FR-4: scopes the secret to exactly one venture
  db_provider     text NOT NULL CHECK (db_provider IN ('d1', 'neon', 'replit-postgres')),
  connection_url  text,                          -- connection string / Hyperdrive binding REFERENCE (not a literal)
  secret_ref      text,                          -- external secret-manager key for the credential
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id)                            -- isolation: one secrets row per venture
);

CREATE INDEX IF NOT EXISTS idx_venture_db_secrets_venture ON venture_db_secrets (venture_id);

-- RLS: authenticated read; service_role full write (mirrors the governance-table
-- convention, e.g. venture_guardrail_state from sibling C / adam_adherence_ledger).
ALTER TABLE venture_db_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY venture_db_secrets_read ON venture_db_secrets
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY venture_db_secrets_service_write ON venture_db_secrets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE venture_db_secrets IS 'Per-venture DB connection secret references (SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B). One row per venture (UNIQUE venture_id); stores a connection_url/secret_ref reference, never a plaintext credential; written by the stakes-routed provisioner DB step, read by sibling D publish.';
