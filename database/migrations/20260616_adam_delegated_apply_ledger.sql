-- 20260616_adam_delegated_apply_ledger.sql
-- SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 (FR-4): the audit ledger for Adam delegated DB applies.
-- @approved-by: codestreetlabs@gmail.com
--
-- CHAIRMAN-BOOTSTRAP (NOT self-applyable by the delegation): this migration ENABLEs RLS + CREATEs a
-- POLICY — exactly the data-access-policy class the delegation reserves as CHAIRMAN-ONLY (fail-closed).
-- So the ledger's own table is created via the chairman 3-factor --prod-deploy path, BEFORE the
-- delegation kill-switch (LEO_ADAM_DBAPPLY_DELEGATION) is ever turned on. Default-OFF delegation means
-- no delegated apply (hence no ledger write) can occur until the chairman has bootstrapped this table.
--
-- Records EVERY delegated-apply attempt (applied / rejected / error) — who/what/when/approval-basis.

BEGIN;

CREATE TABLE IF NOT EXISTS adam_delegated_apply_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_path    text,
  migration_sha256  text,
  delegatable       boolean NOT NULL,            -- the fail-closed scope verdict (isDelegatableForApply)
  delegatable_kind  text,                        -- 'additive' | 'governed_insert' | NULL (when not delegatable)
  outcome           text NOT NULL,               -- 'applied' | 'rejected' | 'error'
  reject_factor     text,                        -- guard factor on rejection (scope / token / kill_switch / flag / delegated_marker)
  reason            text,                        -- human-readable basis
  approval_basis    text,                        -- the durable chairman-authorization reference
  approved_by       text NOT NULL DEFAULT 'adam (delegated)',
  success           boolean,                     -- true on applied, false on rejected/error
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adam_delegated_apply_ledger_created ON adam_delegated_apply_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adam_delegated_apply_ledger_outcome ON adam_delegated_apply_ledger (outcome);

ALTER TABLE adam_delegated_apply_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY adam_delegated_apply_ledger_read ON adam_delegated_apply_ledger
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY adam_delegated_apply_ledger_service_write ON adam_delegated_apply_ledger
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE adam_delegated_apply_ledger IS
  'SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001: audit of every Adam delegated DB-apply attempt (applied/rejected/error). Chairman-bootstrapped; delegation is default-OFF (LEO_ADAM_DBAPPLY_DELEGATION).';

COMMIT;

-- ROLLBACK: DROP TABLE IF EXISTS adam_delegated_apply_ledger;
