-- SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation) — faithful copy-rename of 20260615_role_handoff_atomic_adam_flag.sql
--
-- The Solomon-singleton mirror of 20260614_role_handoff_atomic_coordinator_flag.sql (sibling A). The
-- Solomon tag lives on claude_sessions.metadata as { role:'solomon', solomon_since:<ts>, non_fleet:true }.
-- solomon-register.cjs today does a JS read-merge-write of the WHOLE metadata object (registerSolomon:74
-- `update({ metadata: merged })`) — the lost-update race the atomic-coordinator-flag RPCs fixed for
-- the coordinator. These two SECURITY DEFINER RPCs perform an ATOMIC in-DB jsonb mutation (single
-- statement; Postgres row-lock serializes concurrent mutations; `||`/`-` operate on the LIVE row,
-- never a stale JS snapshot), preserving all sibling metadata keys.
--
-- DATA-SAFETY: additive. Applying creates two functions and modifies NO real rows (the DO $verify$
-- block seeds + deletes a synthetic session inside the transaction). Reversible via DROP FUNCTION
-- (see the _DOWN companion). Chairman-gated for prod-apply (NO -- @approved-by): the JS writer
-- (Phase A) fail-softs when the RPC is absent, so the feature is dormant-but-safe until apply.

-- ── clear_solomon_flag ───────────────────────────────────────────────────────────────────────────
-- Atomically remove the Solomon tag keys from one session's metadata. Sibling keys (callsign,
-- fleet_identity, claim flags, etc.) are preserved — `-` drops only the three named keys.
CREATE OR REPLACE FUNCTION clear_solomon_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Drop solomon_since + non_fleet always; drop the GENERIC 'role' key ONLY when it is 'solomon' (never
  -- strip a legitimate role='worker'/'coordinator' tag — review finding: 'role' is not Solomon-exclusive).
  UPDATE claude_sessions
  SET metadata = CASE
                   WHEN COALESCE(metadata, '{}'::jsonb)->>'role' = 'solomon'
                     THEN COALESCE(metadata, '{}'::jsonb) - 'role' - 'solomon_since' - 'non_fleet'
                   ELSE COALESCE(metadata, '{}'::jsonb) - 'solomon_since' - 'non_fleet'
                 END
  WHERE session_id = p_session_id;
$$;

COMMENT ON FUNCTION clear_solomon_flag(TEXT) IS
  'SD-LEO-INFRA-SOLOMON-CONSULT-001A: atomically drop the Solomon tag (role + solomon_since + non_fleet) from a session''s metadata (jsonb `-`), preserving all sibling keys. Race-safe retire path for a stale prior Solomon.';

-- ── set_solomon_flag ─────────────────────────────────────────────────────────────────────────────
-- Atomically stamp role=solomon + a fresh solomon_since + non_fleet onto a session's metadata, bump
-- heartbeat_at + status, and CREATE the row if absent (mirrors the JS register's create-if-absent
-- intent). `||` merges onto the LIVE row value so concurrent writers never clobber sibling keys.
CREATE OR REPLACE FUNCTION set_solomon_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('role', 'solomon', 'solomon_since', now()::text, 'non_fleet', true),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('role', 'solomon', 'solomon_since', now()::text, 'non_fleet', true),
    heartbeat_at = now(),
    status = 'active',
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_solomon_flag(TEXT) IS
  'SD-LEO-INFRA-SOLOMON-CONSULT-001A: atomically register a session as Solomon (role=solomon + fresh solomon_since + non_fleet via jsonb `||`), bump heartbeat_at + status=active, create the row if absent. Race-safe replacement for the JS read-merge-write register path.';

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs inside apply-migration's transaction; fleet-safe (unique synthetic session id, cleaned up
-- before COMMIT). Proves: set stamps the Solomon tag + preserves a sibling key; a re-set re-stamps;
-- clear drops only the Solomon keys + preserves the sibling; create-if-absent works.
DO $verify$
DECLARE
  v_meta JSONB;
  v_sid  TEXT := 'verify-role-handoff-atomic-solomon-' || gen_random_uuid()::text;
BEGIN
  -- Seed a session with a sibling key that MUST survive.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, '{"claim_flag": "held"}'::jsonb, now(), 'active', now(), now());

  -- set on the EXISTING row stamps the Solomon tag + keeps the sibling.
  PERFORM set_solomon_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'solomon', 'ROLE-HANDOFF-ATOMIC-SOLOMON: set_solomon_flag did not set role=solomon';
  ASSERT v_meta ? 'solomon_since', 'ROLE-HANDOFF-ATOMIC-SOLOMON: set_solomon_flag did not stamp solomon_since';
  ASSERT (v_meta->>'non_fleet')::boolean = true, 'ROLE-HANDOFF-ATOMIC-SOLOMON: set_solomon_flag did not set non_fleet';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-SOLOMON: set_solomon_flag clobbered the sibling claim_flag';

  -- clear drops only the Solomon keys, preserving the sibling.
  PERFORM clear_solomon_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT NOT (v_meta ? 'role'), 'ROLE-HANDOFF-ATOMIC-SOLOMON: clear_solomon_flag left role behind';
  ASSERT NOT (v_meta ? 'solomon_since'), 'ROLE-HANDOFF-ATOMIC-SOLOMON: clear_solomon_flag left solomon_since behind';
  ASSERT NOT (v_meta ? 'non_fleet'), 'ROLE-HANDOFF-ATOMIC-SOLOMON: clear_solomon_flag left non_fleet behind';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-SOLOMON: clear_solomon_flag wiped the sibling claim_flag (used `-` wrong)';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_solomon_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'solomon', 'ROLE-HANDOFF-ATOMIC-SOLOMON: set_solomon_flag did not CREATE a missing row';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'ROLE-HANDOFF-ATOMIC-SOLOMON verify OK: set stamps + preserves siblings, clear drops only Solomon keys, create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION clear_solomon_flag(TEXT); DROP FUNCTION set_solomon_flag(TEXT);
-- (see the _DOWN companion). Additive + fully reversible — no data migration to undo.
