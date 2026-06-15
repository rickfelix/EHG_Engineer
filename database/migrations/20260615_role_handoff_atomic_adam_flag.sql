-- SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C / FR-2 — atomic Adam-flag RPCs.
--
-- The Adam-singleton mirror of 20260614_role_handoff_atomic_coordinator_flag.sql (sibling A). The
-- Adam tag lives on claude_sessions.metadata as { role:'adam', adam_since:<ts>, non_fleet:true }.
-- adam-register.cjs today does a JS read-merge-write of the WHOLE metadata object (registerAdam:74
-- `update({ metadata: merged })`) — the lost-update race the atomic-coordinator-flag RPCs fixed for
-- the coordinator. These two SECURITY DEFINER RPCs perform an ATOMIC in-DB jsonb mutation (single
-- statement; Postgres row-lock serializes concurrent mutations; `||`/`-` operate on the LIVE row,
-- never a stale JS snapshot), preserving all sibling metadata keys.
--
-- DATA-SAFETY: additive. Applying creates two functions and modifies NO real rows (the DO $verify$
-- block seeds + deletes a synthetic session inside the transaction). Reversible via DROP FUNCTION
-- (see the _DOWN companion). Chairman-gated for prod-apply (NO -- @approved-by): the JS writer
-- (FR-3) fail-softs when the RPC is absent, so the feature is dormant-but-safe until apply.

-- ── clear_adam_flag ───────────────────────────────────────────────────────────────────────────
-- Atomically remove the Adam tag keys from one session's metadata. Sibling keys (callsign,
-- fleet_identity, claim flags, etc.) are preserved — `-` drops only the three named keys.
CREATE OR REPLACE FUNCTION clear_adam_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Drop adam_since + non_fleet always; drop the GENERIC 'role' key ONLY when it is 'adam' (never
  -- strip a legitimate role='worker'/'coordinator' tag — review finding: 'role' is not Adam-exclusive).
  UPDATE claude_sessions
  SET metadata = CASE
                   WHEN COALESCE(metadata, '{}'::jsonb)->>'role' = 'adam'
                     THEN COALESCE(metadata, '{}'::jsonb) - 'role' - 'adam_since' - 'non_fleet'
                   ELSE COALESCE(metadata, '{}'::jsonb) - 'adam_since' - 'non_fleet'
                 END
  WHERE session_id = p_session_id;
$$;

COMMENT ON FUNCTION clear_adam_flag(TEXT) IS
  'SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C: atomically drop the Adam tag (role + adam_since + non_fleet) from a session''s metadata (jsonb `-`), preserving all sibling keys. Race-safe retire path for a stale prior Adam.';

-- ── set_adam_flag ─────────────────────────────────────────────────────────────────────────────
-- Atomically stamp role=adam + a fresh adam_since + non_fleet onto a session's metadata, bump
-- heartbeat_at + status, and CREATE the row if absent (mirrors the JS register's create-if-absent
-- intent). `||` merges onto the LIVE row value so concurrent writers never clobber sibling keys.
CREATE OR REPLACE FUNCTION set_adam_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('role', 'adam', 'adam_since', now()::text, 'non_fleet', true),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('role', 'adam', 'adam_since', now()::text, 'non_fleet', true),
    heartbeat_at = now(),
    status = 'active',
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_adam_flag(TEXT) IS
  'SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C: atomically register a session as Adam (role=adam + fresh adam_since + non_fleet via jsonb `||`), bump heartbeat_at + status=active, create the row if absent. Race-safe replacement for the JS read-merge-write register path.';

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs inside apply-migration's transaction; fleet-safe (unique synthetic session id, cleaned up
-- before COMMIT). Proves: set stamps the Adam tag + preserves a sibling key; a re-set re-stamps;
-- clear drops only the Adam keys + preserves the sibling; create-if-absent works.
DO $verify$
DECLARE
  v_meta JSONB;
  v_sid  TEXT := 'verify-role-handoff-atomic-adam-' || gen_random_uuid()::text;
BEGIN
  -- Seed a session with a sibling key that MUST survive.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, '{"claim_flag": "held"}'::jsonb, now(), 'active', now(), now());

  -- set on the EXISTING row stamps the Adam tag + keeps the sibling.
  PERFORM set_adam_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'adam', 'ROLE-HANDOFF-ATOMIC-ADAM: set_adam_flag did not set role=adam';
  ASSERT v_meta ? 'adam_since', 'ROLE-HANDOFF-ATOMIC-ADAM: set_adam_flag did not stamp adam_since';
  ASSERT (v_meta->>'non_fleet')::boolean = true, 'ROLE-HANDOFF-ATOMIC-ADAM: set_adam_flag did not set non_fleet';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-ADAM: set_adam_flag clobbered the sibling claim_flag';

  -- clear drops only the Adam keys, preserving the sibling.
  PERFORM clear_adam_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT NOT (v_meta ? 'role'), 'ROLE-HANDOFF-ATOMIC-ADAM: clear_adam_flag left role behind';
  ASSERT NOT (v_meta ? 'adam_since'), 'ROLE-HANDOFF-ATOMIC-ADAM: clear_adam_flag left adam_since behind';
  ASSERT NOT (v_meta ? 'non_fleet'), 'ROLE-HANDOFF-ATOMIC-ADAM: clear_adam_flag left non_fleet behind';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-ADAM: clear_adam_flag wiped the sibling claim_flag (used `-` wrong)';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_adam_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'adam', 'ROLE-HANDOFF-ATOMIC-ADAM: set_adam_flag did not CREATE a missing row';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'ROLE-HANDOFF-ATOMIC-ADAM verify OK: set stamps + preserves siblings, clear drops only Adam keys, create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION clear_adam_flag(TEXT); DROP FUNCTION set_adam_flag(TEXT);
-- (see the _DOWN companion). Additive + fully reversible — no data migration to undo.
