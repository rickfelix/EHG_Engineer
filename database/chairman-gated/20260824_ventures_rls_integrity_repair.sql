-- SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 (FR-1..FR-4) -- Ventures RLS integrity repair.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated: this file creates a TRIGGER (client governance-write guard) and
--   REVOKE/GRANT-equivalent policy changes (narrowed SELECT qual, new UPDATE policy) -- both
--   land it in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2).
--   Per Adam's ratification of this SD's re-scope (advisory 20e9dde7, 2026-08-24T01:48:25Z):
--   these DDL pieces must be STAGED for the accumulating chairman ceremony sitting, not
--   applied directly.
--
-- ============================================================================
-- WHY THIS MIGRATION EXISTS (re-scope history).
--
-- This SD was originally commissioned from a chairman-approved architecture eval finding
-- (.artifacts/solomon-arch-eval-20260823.md, S3 finding 3) that claimed "any venture-access
-- client can UPDATE ANY ventures column via the browser, including current_lifecycle_stage."
-- A same-day "consumer census" revision of the SD's plan REPEATED, rather than corrected, the
-- root cause: both readings ran `pg_policies WHERE tablename='ventures'` with NO schemaname
-- filter and silently matched an ABANDONED `portfolio.ventures` decoy table (1 row, dead since
-- 2025-11-30, an orphaned scaffold of an abandoned SD-ARCH-EHG-000 three-schema consolidation)
-- instead of the real, live `public.ventures` (152 rows, written same-day).
--
-- A worker's empirical RLS probe (SET LOCAL ROLE authenticated inside BEGIN/ROLLBACK) plus a
-- schema-qualified pg_policies re-read FALSIFIED the premise: public.ventures carries exactly
-- 2 policies as of this SD -- 'Allow service_role to manage ventures' (ALL/service_role/
-- qual=true) and 'authenticated_read_ventures' (SELECT/authenticated/qual=true). There is NO
-- UPDATE policy for authenticated/anon at all. Coordinator disposition (signal 83226336,
-- 2026-08-23T18:47Z) accepted this in full and directed a re-scope to what the measurement
-- actually supports, ratified by Adam 2026-08-24T01:48:25Z.
--
-- THE REAL BUGS THIS MIGRATION CLOSES:
--   1. portfolio.ventures itself is the hazard -- its policies keep silently misleading any
--      unqualified pg_policies query. Retiring it removes the false-instrument entirely.
--   2. authenticated_read_ventures's qual=true is a real cross-tenant SELECT over-grant: any
--      authenticated user can read all 152 ventures regardless of ownership.
--   3. The ABSENCE of any UPDATE policy means every client-side .update() against
--      public.ventures across ~15 live call sites in the EHG app is silently RLS-denied
--      (Supabase JS does not throw on RLS-denied UPDATE -- error===null, rowCount=0), so
--      content-field edits and (until routed through the RPC) governance transitions can
--      silently no-op in production today. This migration adds a real, correctly-scoped
--      UPDATE policy instead of leaving the absence in place.
--
-- portfolio.has_venture_access(uuid) is explicitly PRESERVED -- it does not query
-- portfolio.ventures (only portfolio.current_venture()) and is live-referenced by ~9 other
-- public.*/governance.* RLS policies and 17 migration files. Only the decoy TABLE and its OWN
-- 4 policies + 2 dependent FK constraints are removed.
--
-- MODELLED ON: database/chairman-gated/20260823_chairman_ratifications.sql (header shape,
-- behavioural DO $verify$ block with distinct custom SQLSTATEs so a swallowed exception in one
-- assertion cannot mask a failure in a sibling one, apply/verify footer).
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-1: Retire the portfolio.ventures decoy (table, 4 policies, 2 dependent FK constraints on
-- OTHER tables). The two dependent tables (portfolio.kill_switch_audit_log,
-- governance.eva_authority_levels) are themselves part of the same dead 2025-11-30 scaffold
-- (zero code references in either repo, rows untouched since creation) but are NOT dropped
-- here -- only the FK constraint tying them to the decoy is removed, since dropping a table a
-- reader might still expect to exist (even if currently dead) is a larger, separately-reviewable
-- decision than closing the RLS-catalog hazard this SD is actually about.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE portfolio.kill_switch_audit_log
  DROP CONSTRAINT IF EXISTS kill_switch_audit_log_venture_id_fkey;

ALTER TABLE governance.eva_authority_levels
  DROP CONSTRAINT IF EXISTS eva_authority_levels_venture_id_fkey;

DROP TABLE IF EXISTS portfolio.ventures;
-- Dropping the table implicitly drops its own 4 policies (ventures_select_policy,
-- ventures_update_policy, ventures_insert_policy, ventures_delete_policy) and its 3 triggers
-- (trg_log_kill_switch, trg_ventures_updated_at, trg_ventures_validate_sd_fk) -- nothing else
-- references portfolio.ventures directly, per the LEAD-phase Explore pass.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-3: Narrow the cross-tenant SELECT over-grant on public.ventures. Reuses
-- portfolio.has_venture_access(uuid), the same predicate style already established in
-- tests/unit/lint/rls-anon-tenant-predicate-lint.test.js, rather than inventing new access
-- logic. service_role keeps unrestricted access via its own separate ALL policy.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_read_ventures ON public.ventures;
CREATE POLICY authenticated_read_ventures
  ON public.ventures
  FOR SELECT
  TO authenticated
  USING (portfolio.has_venture_access(id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-4: A correctly-scoped UPDATE policy (row-level: caller must have venture access) PLUS a
-- companion BEFORE UPDATE guard trigger (column-level: content-class columns may be changed by
-- a direct client write, governance-class columns may not). RLS's WITH CHECK sees only the NEW
-- row, not an OLD-vs-NEW diff, so the column-level split is expressed as a trigger rather than
-- forced into the policy itself (TR-2).
--
-- The guard distinguishes "trusted, privilege-elevated context" (the existing
-- advance_venture_stage SECURITY DEFINER RPC, owned by postgres -- confirmed as the RPC
-- actually invoked by the live client call site EHG/src/lib/ventures/advanceStage.ts, per the
-- LEAD-phase Explore pass) from "direct client write" using current_user: inside a SECURITY
-- DEFINER function, current_user becomes the function's OWNER (postgres) for the statement's
-- duration -- a standard, documented PostgreSQL mechanism, not a new convention invented here.
-- A direct client UPDATE (via Supabase's anon/authenticated JWT-bound connection) always has
-- current_user IN ('authenticated','anon'). This is a MINIMAL, non-invasive check: it requires
-- NO change to advance_venture_stage's body and does not touch the other 2 (out-of-scope,
-- flagged-for-consolidation) advance RPCs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ventures_block_client_governance_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  -- Trusted, privilege-elevated context (e.g. inside advance_venture_stage, or a direct
  -- postgres/service_role session) may write any column, including governance-class ones.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.current_lifecycle_stage IS DISTINCT FROM OLD.current_lifecycle_stage
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.orchestrator_state IS DISTINCT FROM OLD.orchestrator_state
     OR NEW.launched_at IS DISTINCT FROM OLD.launched_at
     OR NEW.workflow_status IS DISTINCT FROM OLD.workflow_status
     OR NEW.recursion_state IS DISTINCT FROM OLD.recursion_state
  THEN
    RAISE EXCEPTION
      'public.ventures: governance-class columns (current_lifecycle_stage, status, orchestrator_state, launched_at, workflow_status, recursion_state) cannot be written directly by client role %; route through the advance_venture_stage RPC.',
      current_user
      USING ERRCODE = 'P0201';
  END IF;

  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS ventures_block_client_governance_write_trg ON public.ventures;
CREATE TRIGGER ventures_block_client_governance_write_trg
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.ventures_block_client_governance_write();

-- Closes the same `SET LOCAL session_replication_role = 'replica'` bypass documented for the
-- ratification-ledger precedent -- ALWAYS-mode triggers fire in both 'origin' and 'replica'.
ALTER TABLE public.ventures ENABLE ALWAYS TRIGGER ventures_block_client_governance_write_trg;

DROP POLICY IF EXISTS ventures_content_update_policy ON public.ventures;
CREATE POLICY ventures_content_update_policy
  ON public.ventures
  FOR UPDATE
  TO authenticated
  USING (portfolio.has_venture_access(id))
  WITH CHECK (portfolio.has_venture_access(id));

COMMENT ON TABLE public.ventures IS
  'SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001. Policy posture as of this migration: '
  '(1) service_role: unrestricted (ALL, qual=true). '
  '(2) authenticated: SELECT and UPDATE scoped to portfolio.has_venture_access(id) -- NOT '
  'qual=true. UPDATE additionally column-gated by ventures_block_client_governance_write_trg: '
  'content-class columns (name, description, industry, target_market, business_model, '
  'value_proposition, projected_revenue, projected_roi, funding_required, metadata, '
  'brand_variants, growth_strategy) are directly client-writable; governance-class columns '
  '(current_lifecycle_stage, status, orchestrator_state, launched_at, workflow_status, '
  'recursion_state) must route through the advance_venture_stage RPC (or an equivalent trusted, '
  'privilege-elevated context). anon: no access. '
  'Query this posture with an EXPLICIT schemaname filter -- an unqualified pg_policies query '
  'silently matched an abandoned portfolio.ventures decoy twice before this SD retired it.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof, not merely existential -- runs inside this DO block's implicit
-- subtransaction so nothing survives whether it passes or fails.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  probe_venture_id uuid;
  probe_row_count int;
BEGIN
  ASSERT to_regclass('portfolio.ventures') IS NULL,
    'portfolio.ventures decoy still exists after DROP TABLE';

  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'has_venture_access') > 0,
    'portfolio.has_venture_access was unexpectedly removed';

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name IN ('kill_switch_audit_log_venture_id_fkey', 'eva_authority_levels_venture_id_fkey')
  ) THEN
    RAISE EXCEPTION 'ventures_rls_integrity_repair: a dependent FK constraint on the decoy survived the drop.';
  END IF;

  ASSERT to_regclass('portfolio.kill_switch_audit_log') IS NOT NULL,
    'portfolio.kill_switch_audit_log was unexpectedly dropped (only its FK to the decoy should be gone)';
  ASSERT to_regclass('governance.eva_authority_levels') IS NOT NULL,
    'governance.eva_authority_levels was unexpectedly dropped (only its FK to the decoy should be gone)';

  -- Behavioural probe using a real venture row (service_role bypasses RLS, so this DO block
  -- can freely pick an existing row) -- everything below runs in a nested block that
  -- deliberately aborts via a custom SQLSTATE so no probe mutation survives.
  SELECT id INTO probe_venture_id FROM public.ventures LIMIT 1;
  IF probe_venture_id IS NULL THEN
    RAISE EXCEPTION 'ventures_rls_integrity_repair: no venture row available to probe against.';
  END IF;

  BEGIN
    -- Positive case: a trusted context (this DO block runs as the migration's connecting role,
    -- which for a chairman-ceremony apply is service_role/postgres -- NOT authenticated/anon)
    -- can still write a governance column directly, proving the guard only restricts
    -- authenticated/anon and does not brick service-role/admin operations.
    UPDATE public.ventures SET orchestrator_state = orchestrator_state WHERE id = probe_venture_id;

    -- Negative case: simulate the client role and attempt a direct governance-column write.
    -- portfolio.has_venture_access(id) reads auth.jwt()->app_metadata->venture_id (via
    -- portfolio.current_venture()) -- a bare SET LOCAL ROLE does NOT populate this, so without
    -- explicitly faking the JWT claim, has_venture_access would deny at RLS row-selection
    -- before the trigger ever fires, making the probe below test nothing (a 0-row UPDATE is
    -- not an exception in Postgres). Fake the claim so the probe row is genuinely selectable,
    -- and the trigger's column-level guard is what actually gets exercised.
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('app_metadata', json_build_object('venture_id', probe_venture_id::text))::text,
      true
    );
    -- SET LOCAL ROLE changes current_user for the remainder of this subtransaction.
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.ventures SET current_lifecycle_stage = current_lifecycle_stage WHERE id = probe_venture_id;
      RAISE EXCEPTION 'ventures_rls_integrity_repair: GUARD DID NOT FIRE -- a client-role governance-column UPDATE was ACCEPTED.' USING ERRCODE = 'P0202';
    EXCEPTION
      WHEN SQLSTATE 'P0201' THEN NULL; -- expected: the guard trigger's own rejection
    END;

    -- Positive case under client role: a content-class column write must still succeed.
    UPDATE public.ventures SET description = description WHERE id = probe_venture_id;
    GET DIAGNOSTICS probe_row_count = ROW_COUNT;
    IF probe_row_count <> 1 THEN
      RAISE EXCEPTION 'ventures_rls_integrity_repair: GUARD OVER-BLOCKED -- a client-role content-class UPDATE was silently denied (rowCount=%).', probe_row_count USING ERRCODE = 'P0203';
    END IF;

    RESET ROLE;

    -- Deliberate cleanup abort -- discards every probe mutation above.
    RAISE EXCEPTION 'internal: discard verify-block probe mutations (expected)' USING ERRCODE = 'P0100';
  EXCEPTION
    WHEN SQLSTATE 'P0100' THEN
      RESET ROLE; -- in case the abort happened before the RESET ROLE above ran
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ventures'
      AND policyname = 'authenticated_read_ventures' AND qual <> 'true'
  ) THEN
    RAISE EXCEPTION 'ventures_rls_integrity_repair: authenticated_read_ventures still has qual=true (cross-tenant SELECT over-grant not closed).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ventures'
      AND policyname = 'ventures_content_update_policy' AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'ventures_rls_integrity_repair: ventures_content_update_policy did not land.';
  END IF;

  RAISE NOTICE 'ventures_rls_integrity_repair verified: decoy retired, FKs closed, has_venture_access preserved, SELECT narrowed, UPDATE policy + guard trigger both present and correctly discriminate content-class vs governance-class writes';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260824_ventures_rls_integrity_repair_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates a trigger +
-- narrows/adds policies):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_ventures_rls_integrity_repair.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies
--     WHERE schemaname='public' AND tablename='ventures' ORDER BY cmd;
--   -- expect: service_role ALL qual=true; authenticated SELECT qual=has_venture_access(id);
--   --         authenticated UPDATE (ventures_content_update_policy) qual=has_venture_access(id)
--   SELECT to_regclass('portfolio.ventures'); -- expect NULL
-- ============================================================================
