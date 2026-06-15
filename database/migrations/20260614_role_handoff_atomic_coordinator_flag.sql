-- SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / Finding 2 (HIGH — lost-update race)
-- Atomic jsonb coordinator-flag RPCs for the singleton role-session handoff protocol.
--
-- BUG (the same class FIX-CREATE-REPLACE-001 fixed for create_or_replace_session):
--   lib/coordinator/resolve.cjs did a JS read-modify-write on the WHOLE metadata JSONB:
--     setActiveCoordinator → SELECT metadata → merge is_coordinator in JS → write whole object
--     clearCoordinatorFlagFromSession → SELECT metadata → delete keys in JS → write whole object
--   Under concurrent identity writes (two coordinators registering, or a register racing a
--   retire) the two read-modify-write cycles interleave: one writer's whole-object write
--   clobbers the other's, RESURRECTING a retired coordinator or DROPPING a freshly-registered
--   one. The window is exactly the race the singleton protocol must never lose.
--
-- FIX: two SECURITY DEFINER RPCs that perform an ATOMIC jsonb mutation in-database (single
--   UPDATE statement; Postgres row-lock serializes concurrent mutations of the same row, and
--   `||` / `-` operate on the live row value, never a stale JS snapshot):
--     set_coordinator_flag(p_session_id)   → || jsonb_build_object('is_coordinator', true, ...)
--     clear_coordinator_flag(p_session_id) → metadata - 'is_coordinator' - 'coordinator_since'
--   set_coordinator_flag also CREATES the row if absent (INSERT ... ON CONFLICT), mirroring the
--   existing JS upsert's create-if-absent path so a coordinator whose claude_sessions row does
--   not yet exist still registers durably.
--
-- DATA-SAFETY: additive. Applying this migration creates two functions and modifies NO rows
--   (the DO $verify$ block seeds + deletes synthetic sessions inside the transaction). Reversible
--   via DROP FUNCTION (see the _DOWN companion). Chairman-gated for prod-apply (expected).

-- ── clear_coordinator_flag ───────────────────────────────────────────────────────────────────
-- Atomically remove the coordinator keys from a single session's metadata. Sibling keys (claim
-- flags, auto_proceed, callsign, etc.) are preserved — `-` only drops the two named keys.
CREATE OR REPLACE FUNCTION clear_coordinator_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE claude_sessions
  SET metadata = COALESCE(metadata, '{}'::jsonb) - 'is_coordinator' - 'coordinator_since'
  WHERE session_id = p_session_id;
$$;

COMMENT ON FUNCTION clear_coordinator_flag(TEXT) IS
  'SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A: atomically drop is_coordinator + coordinator_since from a session''s metadata (jsonb `-`), preserving all sibling keys. Race-safe replacement for the JS read-modify-write retire path.';

-- ── set_coordinator_flag ─────────────────────────────────────────────────────────────────────
-- Atomically stamp is_coordinator=true + a fresh coordinator_since onto a session's metadata,
-- bump heartbeat_at + status, and CREATE the row if it does not exist (mirrors the JS upsert's
-- create-if-absent path). `||` merges onto the LIVE row value, so concurrent writers never
-- clobber each other's sibling keys.
CREATE OR REPLACE FUNCTION set_coordinator_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('is_coordinator', true, 'coordinator_since', now()::text),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('is_coordinator', true, 'coordinator_since', now()::text),
    heartbeat_at = now(),
    status = 'active',
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_coordinator_flag(TEXT) IS
  'SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A: atomically register a session as coordinator (is_coordinator=true + fresh coordinator_since via jsonb `||`), bump heartbeat_at + status=active, create the row if absent. Race-safe replacement for the JS read-merge-write register path.';

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs inside apply-migration's transaction; fleet-safe (unique synthetic session ids matching
-- no real session, cleaned up before COMMIT). Proves: set then clear leaves NO coordinator keys
-- AND preserves a sibling metadata key. Mirrors the DO $verify$ ASSERT pattern used by
-- 20260614_fix_create_or_replace_session_metadata_merge.sql.
DO $verify$
DECLARE
  v_meta JSONB;
  v_sid  TEXT := 'verify-role-handoff-atomic-' || gen_random_uuid()::text;
BEGIN
  -- Seed a session with a coordinator flag AND a sibling claim flag.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, '{"is_coordinator": true, "claim_flag": "held"}'::jsonb, now(), 'active', now(), now());

  -- set_coordinator_flag on the EXISTING row must keep the sibling key and (re)stamp the flag.
  PERFORM set_coordinator_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true,
    'ROLE-HANDOFF-ATOMIC: set_coordinator_flag did not set is_coordinator=true';
  ASSERT v_meta ? 'coordinator_since',
    'ROLE-HANDOFF-ATOMIC: set_coordinator_flag did not stamp coordinator_since';
  ASSERT v_meta ? 'claim_flag' AND v_meta->>'claim_flag' = 'held',
    'ROLE-HANDOFF-ATOMIC: set_coordinator_flag clobbered the sibling claim_flag';

  -- clear_coordinator_flag must drop BOTH coordinator keys and preserve the sibling key.
  PERFORM clear_coordinator_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT NOT (v_meta ? 'is_coordinator'),
    'ROLE-HANDOFF-ATOMIC: clear_coordinator_flag left is_coordinator behind';
  ASSERT NOT (v_meta ? 'coordinator_since'),
    'ROLE-HANDOFF-ATOMIC: clear_coordinator_flag left coordinator_since behind';
  ASSERT v_meta ? 'claim_flag' AND v_meta->>'claim_flag' = 'held',
    'ROLE-HANDOFF-ATOMIC: clear_coordinator_flag wiped the sibling claim_flag (used `-` wrong)';

  -- Prove the create-if-absent path: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_coordinator_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true,
    'ROLE-HANDOFF-ATOMIC: set_coordinator_flag did not CREATE a missing row (create-if-absent failed)';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;

  RAISE NOTICE 'ROLE-HANDOFF-ATOMIC verify OK: set then clear leaves no coordinator keys, preserves siblings, and create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION clear_coordinator_flag(TEXT); DROP FUNCTION set_coordinator_flag(TEXT);
-- (see the _DOWN companion migration). Additive + fully reversible — no data migration to undo.
