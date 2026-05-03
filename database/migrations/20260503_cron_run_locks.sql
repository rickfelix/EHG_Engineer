-- ============================================================================
-- cron_run_locks: TTL-based claim-by-row lock primitive for cron entrypoints
-- ============================================================================
--
-- Purpose: replace pg_advisory_lock for the FR-C generator (and future cron
-- jobs) so the lock survives the Supabase RPC connection model. Postgres
-- session-scoped advisory locks are released as soon as the pooled connection
-- returns, which defeats their cross-tick guarantee when called over PostgREST.
--
-- A claim row carries an owner UUID (minted by the caller) and an expires_at
-- timestamp. try_claim_cron_lock() succeeds when no row exists OR the existing
-- row is expired; release_cron_lock() deletes only when the owner UUID matches
-- (so a late release from a prior tick can't drop the current owner's claim).
--
-- Replaces SUPABASE_POOLER_URL dependency in scripts/cron/fr-c-generator.mjs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cron_run_locks (
  name        text PRIMARY KEY,
  owner       uuid NOT NULL,
  locked_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

COMMENT ON TABLE public.cron_run_locks IS
  'TTL-based row locks for cron entrypoints invoked over Supabase RPC. See try_claim_cron_lock()/release_cron_lock().';

-- ----------------------------------------------------------------------------
-- try_claim_cron_lock(p_name, p_owner, p_ttl_seconds) → boolean
--
-- Returns true if the caller now owns the lock; false if a non-expired claim
-- by another owner is already in place. Uses INSERT ... ON CONFLICT DO UPDATE
-- with a WHERE that only overwrites expired rows, so the read-and-claim is
-- atomic.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_claim_cron_lock(
  p_name        text,
  p_owner       uuid,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner uuid;
BEGIN
  IF p_name IS NULL OR length(p_name) = 0 THEN
    RAISE EXCEPTION 'try_claim_cron_lock: p_name required';
  END IF;
  IF p_owner IS NULL THEN
    RAISE EXCEPTION 'try_claim_cron_lock: p_owner required';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'try_claim_cron_lock: p_ttl_seconds must be >= 1';
  END IF;

  INSERT INTO public.cron_run_locks (name, owner, locked_at, expires_at)
  VALUES (p_name, p_owner, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (name) DO UPDATE
    SET owner = EXCLUDED.owner,
        locked_at = EXCLUDED.locked_at,
        expires_at = EXCLUDED.expires_at
    WHERE public.cron_run_locks.expires_at <= now()
  RETURNING owner INTO v_winner;

  RETURN v_winner = p_owner;
END;
$$;

COMMENT ON FUNCTION public.try_claim_cron_lock(text, uuid, integer) IS
  'Atomic claim-or-noop. Returns true if caller now owns the lock; false if held by another non-expired owner.';

-- ----------------------------------------------------------------------------
-- release_cron_lock(p_name, p_owner) → boolean
--
-- Owner-scoped delete. Returns true if a row was actually removed (i.e. the
-- caller still owned the lock at release time). Returns false if the row was
-- already taken over by a later tick after expiry.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_cron_lock(
  p_name  text,
  p_owner uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.cron_run_locks
   WHERE name = p_name AND owner = p_owner;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.release_cron_lock(text, uuid) IS
  'Owner-scoped release. Returns true if the row was deleted; false if a later tick already took ownership after expiry.';

-- ----------------------------------------------------------------------------
-- Grants — service_role calls these from cron jobs; revoke from anon.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.try_claim_cron_lock(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_cron_lock(text, uuid)            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_cron_lock(text, uuid, integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text, uuid)            TO service_role, authenticated;

-- Lock down direct table writes; service_role uses the RPC functions.
ALTER TABLE public.cron_run_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_run_locks_service_all ON public.cron_run_locks;
CREATE POLICY cron_run_locks_service_all ON public.cron_run_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Rollback (manual):
--   DROP POLICY IF EXISTS cron_run_locks_service_all ON public.cron_run_locks;
--   DROP FUNCTION IF EXISTS public.release_cron_lock(text, uuid);
--   DROP FUNCTION IF EXISTS public.try_claim_cron_lock(text, uuid, integer);
--   DROP TABLE IF EXISTS public.cron_run_locks;
