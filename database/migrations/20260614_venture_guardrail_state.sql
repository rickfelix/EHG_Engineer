-- venture_guardrail_state — per-venture record of the 8 engineered spend-guardrail decisions.
-- SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C (FR-4 / FR-5).
-- Minimal ADDITIVE table — no change to any existing table. One row per (venture_id, guardrail),
-- upserted by lib/venture-deploy/spend-guardrails.js persistGuardrailDecisions() and read
-- (fail-closed) by the 'spend guardrails ready' exit-gate verifier.
--
-- CHAIRMAN PROD-DEPLOY GATE: this migration is intentionally NOT yet attested. Before applying
-- to production with `node scripts/apply-migration.js <file> --prod-deploy`, the CHAIRMAN must add
-- the line `-- @approved-by: <chairman-email>` (matching git user.email) — it is deliberately
-- absent here because the worker may not self-author the chairman attestation (CONST-002).

CREATE TABLE IF NOT EXISTS venture_guardrail_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      uuid NOT NULL,                 -- FR-5: scopes every row to exactly one venture
  guardrail       text NOT NULL,                 -- one of the 8 canonical guardrail names
  decision        text NOT NULL CHECK (decision IN ('allow', 'block')),
  reason          text,                          -- human-readable evidence/measurement
  killswitch_open boolean NOT NULL DEFAULT false, -- true when the D1 write-ceiling kill-switch is tripped
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id, guardrail)                 -- isolation: one current row per venture per guardrail
);

CREATE INDEX IF NOT EXISTS idx_venture_guardrail_state_venture ON venture_guardrail_state (venture_id);

-- RLS: authenticated read; service_role full write (mirrors the governance-table convention,
-- e.g. adam_adherence_ledger from SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001).
ALTER TABLE venture_guardrail_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY venture_guardrail_state_read ON venture_guardrail_state
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY venture_guardrail_state_service_write ON venture_guardrail_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE venture_guardrail_state IS 'Per-venture spend-guardrail decisions (SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C). One row per (venture_id, guardrail); read fail-closed by the spend-guardrails exit-gate verifier; killswitch_open set when the D1 write-ceiling kill-switch trips.';
