-- ROLLBACK for 20260824_ventures_rls_integrity_repair.sql
--
-- Restores STRUCTURE only, not data: portfolio.ventures was a dead 1-row decoy (untouched since
-- 2025-11-30) when this migration dropped it. This DOWN recreates the table/enum/policies/FKs
-- shape so the FORWARD migration is reversible, but the single stale row is NOT recreated --
-- restoring the exact prior data value has no functional purpose for a table nothing reads.
--
-- Row-count guard on public.ventures: if the forward migration's UPDATE policy has been in
-- production use, rolling back reopens the cross-tenant SELECT over-grant and the missing
-- column-level write guard. This is a KNOWN, ACCEPTED regression of rollback (restores the
-- pre-migration -- i.e. currently-live -- posture), not a defect in this DOWN file.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Reverse FR-4: drop the guard trigger + content-scoped UPDATE policy, restore the original
-- (broad, qual=true) authenticated_read_ventures SELECT policy.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ventures_content_update_policy ON public.ventures;

DROP TRIGGER IF EXISTS ventures_block_client_governance_write_trg ON public.ventures;
DROP FUNCTION IF EXISTS public.ventures_block_client_governance_write();

DROP POLICY IF EXISTS authenticated_read_ventures ON public.ventures;
CREATE POLICY authenticated_read_ventures
  ON public.ventures
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.ventures IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Reverse FR-1: recreate portfolio.ventures (structure only, empty), its 4 policies, and the 2
-- FK constraints on the dependent tables.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $create_enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'portfolio' AND t.typname = 'autonomy_level'
  ) THEN
    CREATE TYPE portfolio.autonomy_level AS ENUM (
      'L0_ADVISOR', 'L1_HUMAN_APPROVED', 'L2_AUTONOMOUS_NOTIFY', 'L3_GUARDED_AUTONOMY', 'L4_FULL_AUTONOMY'
    );
  END IF;
END
$create_enum$;

CREATE TABLE IF NOT EXISTS portfolio.ventures (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  description               TEXT,
  autonomy_level            portfolio.autonomy_level NOT NULL DEFAULT 'L0_ADVISOR',
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  kill_switch_activated_at  TIMESTAMPTZ,
  kill_switch_activated_by  UUID,
  kill_switch_reason        TEXT,
  sd_id                     TEXT,
  prd_id                    TEXT,
  guardrails                JSONB DEFAULT '{"quality_metric_floor": 0.70, "timeline_deviation_days": 7, "budget_variance_tolerance": 0.10, "require_stakeholder_notification": true}'::jsonb,
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                TEXT DEFAULT 'SYSTEM'
);

ALTER TABLE portfolio.ventures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventures_select_policy ON portfolio.ventures;
CREATE POLICY ventures_select_policy
  ON portfolio.ventures
  FOR SELECT
  TO public
  USING ((current_setting('role'::text, true) = 'service_role'::text) OR portfolio.has_venture_access(id));

DROP POLICY IF EXISTS ventures_update_policy ON portfolio.ventures;
CREATE POLICY ventures_update_policy
  ON portfolio.ventures
  FOR UPDATE
  TO public
  USING ((current_setting('role'::text, true) = 'service_role'::text) OR portfolio.has_venture_access(id));

DROP POLICY IF EXISTS ventures_insert_policy ON portfolio.ventures;
CREATE POLICY ventures_insert_policy
  ON portfolio.ventures
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS ventures_delete_policy ON portfolio.ventures;
CREATE POLICY ventures_delete_policy
  ON portfolio.ventures
  FOR DELETE
  TO service_role
  USING (true);

ALTER TABLE portfolio.kill_switch_audit_log
  DROP CONSTRAINT IF EXISTS kill_switch_audit_log_venture_id_fkey;
ALTER TABLE portfolio.kill_switch_audit_log
  ADD CONSTRAINT kill_switch_audit_log_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES portfolio.ventures(id);

ALTER TABLE governance.eva_authority_levels
  DROP CONSTRAINT IF EXISTS eva_authority_levels_venture_id_fkey;
ALTER TABLE governance.eva_authority_levels
  ADD CONSTRAINT eva_authority_levels_venture_id_fkey
  FOREIGN KEY (venture_id) REFERENCES portfolio.ventures(id);

DO $verify$
BEGIN
  ASSERT to_regclass('portfolio.ventures') IS NOT NULL, 'portfolio.ventures was not recreated';
  ASSERT to_regclass('public.ventures') IS NOT NULL, 'public.ventures is missing -- this DOWN must never run against a database missing the real table';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ventures'
      AND policyname = 'authenticated_read_ventures' AND qual = 'true'
  ) THEN
    RAISE EXCEPTION 'ventures_rls_integrity_repair DOWN: authenticated_read_ventures qual was not restored to true';
  END IF;

  RAISE NOTICE 'ventures_rls_integrity_repair DOWN verified: decoy structure + FKs restored, narrowed policies reverted';
END
$verify$;

COMMIT;
