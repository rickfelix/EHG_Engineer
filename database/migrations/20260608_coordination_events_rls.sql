-- ============================================================================
-- SD-LEO-GEN-ENABLE-RLS-SERVICE-001
-- Enable RLS + service_role-only (append-only) policy on public.coordination_events
-- ----------------------------------------------------------------------------
-- WHY: The Supabase database-linter ERRORs that public.coordination_events has
-- RLS DISABLED while exposed via PostgREST. Empirically verified that the anon
-- role can READ and WRITE arbitrary rows. Today the blast radius is low-medium
-- (table empty, detector feature default-OFF behind COORD_DETECTORS_V2, sole
-- writer scripts/stale-session-sweep.cjs uses the service-role key, no anon /
-- frontend reader), but the anon-WRITE path is a forward-looking log /
-- observability-poisoning vector: an attacker holding the published anon key
-- could inject forged SPLIT_BRAIN / STUCK_WORKER / CLAIM_HALF_WRITE anomaly rows
-- that the planned epic-#3 self-improvement loop + coordinator will consume.
--
-- WHAT: Enable RLS, lock writes to service_role only, REVOKE all from anon /
-- authenticated, and make the log append-only (no UPDATE/DELETE for anyone) —
-- both at the privilege layer and via a BEFORE UPDATE/DELETE trigger hard stop.
-- Modeled on the codebase canonical analog
-- database/migrations/20260607_auto_exec_engine_audit.sql:64-136.
--
-- SAFETY: append-only lockdown in the safe direction; the sole writer uses
-- service_role (unaffected), the table is empty, and no code subscribes to it
-- via Realtime (verified pre-apply against pg_publication_tables). Idempotent:
-- safe to re-run. Rollback is the DOWN block at the bottom.
-- ============================================================================

ALTER TABLE public.coordination_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. APPEND-ONLY hard guarantee: a BEFORE UPDATE OR DELETE trigger that RAISES
--    regardless of role (defense beyond the withheld grants / absent policies).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coordination_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'coordination_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

COMMENT ON FUNCTION public.coordination_events_append_only() IS
  'Append-only guard for coordination_events: raises on any UPDATE/DELETE. SD-LEO-GEN-ENABLE-RLS-SERVICE-001.';

-- CREATE OR REPLACE (PG14+) is idempotent; DROP IF EXISTS kept as belt-and-suspenders.
DROP TRIGGER IF EXISTS trg_coordination_events_append_only
  ON public.coordination_events;
CREATE OR REPLACE TRIGGER trg_coordination_events_append_only
  BEFORE UPDATE OR DELETE ON public.coordination_events
  FOR EACH ROW
  EXECUTE FUNCTION public.coordination_events_append_only();

-- ---------------------------------------------------------------------------
-- 2. RLS policies. SELECT + INSERT for service_role only. No UPDATE/DELETE
--    policy (and no UPDATE/DELETE grant), so those paths are denied at both the
--    RLS layer AND the privilege layer; the trigger is the hard stop.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS coordination_events_select_service_role ON public.coordination_events;
CREATE POLICY coordination_events_select_service_role
  ON public.coordination_events
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS coordination_events_insert_service_role ON public.coordination_events;
CREATE POLICY coordination_events_insert_service_role
  ON public.coordination_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Table grants. SELECT + INSERT to service_role; REVOKE everything from the
--    PostgREST-exposed anon / authenticated roles (the actual vulnerability).
--    service_role keeps INSERT as its only write path (no UPDATE/DELETE).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.coordination_events TO service_role;

-- The fix: anon / authenticated must hold NO privilege on this table.
REVOKE ALL ON public.coordination_events FROM anon;
REVOKE ALL ON public.coordination_events FROM authenticated;

-- service_role must never be able to UPDATE/DELETE/TRUNCATE the append-only log
-- (INSERT is its only write path). The trigger is the hard stop regardless.
REVOKE UPDATE, DELETE, TRUNCATE ON public.coordination_events FROM service_role;

-- ============================================================================
-- DOWN / ROLLBACK  (apply manually to reverse this migration)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   DROP POLICY IF EXISTS coordination_events_insert_service_role ON public.coordination_events;
--   DROP POLICY IF EXISTS coordination_events_select_service_role ON public.coordination_events;
--   DROP TRIGGER IF EXISTS trg_coordination_events_append_only ON public.coordination_events;
--   DROP FUNCTION IF EXISTS public.coordination_events_append_only();
--   ALTER TABLE public.coordination_events DISABLE ROW LEVEL SECURITY;
--   -- NOTE: this rollback re-exposes the anon read/write vector the linter flagged.
-- COMMIT;
-- ============================================================================
