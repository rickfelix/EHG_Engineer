-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (Michael foundation, FR-1) — copy-rename of
-- 20260630_role_handoff_atomic_solomon_flag.sql (itself a copy-rename of the Adam flag migration).
--
-- The Michael-singleton mirror of the coordinator/adam/solomon atomic-flag RPCs. The Michael tag lives
-- on claude_sessions.metadata as { role:'michael', michael_since:<ts>, non_fleet:true }. These two
-- SECURITY DEFINER RPCs perform an ATOMIC in-DB jsonb mutation (single statement; the Postgres row
-- lock serializes concurrent mutations; `||`/`-` operate on the LIVE row, never a stale JS snapshot),
-- preserving all sibling metadata keys. scripts/michael-register.cjs calls set_michael_flag first and
-- fail-softs to a JS merge while this migration is unapplied, so the file is dormant-but-safe.
--
-- PRIVILEGES (SECURITY evidence 2ca8b0ee, critical): the Solomon copy source carries no REVOKE/GRANT
-- text and the live set_solomon_flag is safe ONLY because its ACL was set out-of-band. The public
-- schema's default ACL for functions grants EXECUTE to anon and authenticated (measured: 653 of 807
-- public functions are anon-EXECUTE), and apply-migration connects as postgres, so a bare CREATE
-- FUNCTION here would land as an anon-callable RLS-bypass write on claude_sessions (stamping
-- non_fleet=true on any session is a fleet-wide claim denial-of-service via
-- lib/claim/build-forbidden-session.cjs). The REVOKE/GRANT lines below are therefore part of the
-- contract, and the DO $verify$ block asserts them with has_function_privilege.
--
-- DATA-SAFETY: additive. Applying creates two functions and modifies NO real rows (the DO $verify$
-- block seeds + deletes a synthetic session inside the transaction). Reversible via the _DOWN
-- companion. Chairman-gated for prod-apply (Tier 3): the approved-by marker line is added only after
-- chairman sign-off (spec docs/michael/02-SPEC.md section 2).

-- ── clear_michael_flag ───────────────────────────────────────────────────────────────────────────
-- Atomically remove the Michael tag keys from one session's metadata. Sibling keys (callsign,
-- fleet_identity, claim flags, etc.) are preserved — `-` drops only the named keys.
-- non_fleet is dropped ONLY when the row's role is 'michael' (SECURITY evidence 2ca8b0ee, low: the
-- Solomon precedent strips non_fleet unconditionally, which could de-flag another role's seat).
CREATE OR REPLACE FUNCTION clear_michael_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE claude_sessions
  SET metadata = CASE
                   WHEN COALESCE(metadata, '{}'::jsonb)->>'role' = 'michael'
                     THEN COALESCE(metadata, '{}'::jsonb) - 'role' - 'michael_since' - 'non_fleet'
                   ELSE COALESCE(metadata, '{}'::jsonb) - 'michael_since'
                 END
  WHERE session_id = p_session_id;
$$;

REVOKE ALL ON FUNCTION clear_michael_flag(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_michael_flag(TEXT) TO service_role;

COMMENT ON FUNCTION clear_michael_flag(TEXT) IS
  'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A: atomically drop the Michael tag (role + michael_since + non_fleet, the latter two only when role=michael) from a session''s metadata (jsonb `-`), preserving all sibling keys. Race-safe retire path for a stale prior Michael. service_role EXECUTE only.';

-- ── set_michael_flag ─────────────────────────────────────────────────────────────────────────────
-- Atomically stamp role=michael + a fresh michael_since + non_fleet onto a session's metadata, bump
-- heartbeat_at + status, and CREATE the row if absent (mirrors the JS register's create-if-absent
-- intent). `||` merges onto the LIVE row value so concurrent writers never clobber sibling keys.
CREATE OR REPLACE FUNCTION set_michael_flag(p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('role', 'michael', 'michael_since', now()::text, 'non_fleet', true),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('role', 'michael', 'michael_since', now()::text, 'non_fleet', true),
    heartbeat_at = now(),
    status = 'active',
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION set_michael_flag(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_michael_flag(TEXT) TO service_role;

COMMENT ON FUNCTION set_michael_flag(TEXT) IS
  'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A: atomically register a session as Michael (role=michael + fresh michael_since + non_fleet via jsonb `||`), bump heartbeat_at + status=active, create the row if absent. Race-safe replacement for the JS read-merge-write register path. service_role EXECUTE only.';

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs inside apply-migration's transaction; fleet-safe (unique synthetic session id, cleaned up
-- before COMMIT). Proves: set stamps the Michael tag + preserves a sibling key; a re-set re-stamps;
-- clear drops only the Michael keys + preserves the sibling; clear on a non-michael row leaves
-- role and non_fleet alone; create-if-absent works; anon/authenticated cannot EXECUTE either RPC.
DO $verify$
DECLARE
  v_meta JSONB;
  v_sid  TEXT := 'verify-role-handoff-atomic-michael-' || gen_random_uuid()::text;
BEGIN
  -- Seed a session with a sibling key that MUST survive.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, '{"claim_flag": "held"}'::jsonb, now(), 'active', now(), now());

  -- set on the EXISTING row stamps the Michael tag + keeps the sibling.
  PERFORM set_michael_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'michael', 'ROLE-HANDOFF-ATOMIC-MICHAEL: set_michael_flag did not set role=michael';
  ASSERT v_meta ? 'michael_since', 'ROLE-HANDOFF-ATOMIC-MICHAEL: set_michael_flag did not stamp michael_since';
  ASSERT (v_meta->>'non_fleet')::boolean = true, 'ROLE-HANDOFF-ATOMIC-MICHAEL: set_michael_flag did not set non_fleet';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-MICHAEL: set_michael_flag clobbered the sibling claim_flag';

  -- clear drops only the Michael keys, preserving the sibling.
  PERFORM clear_michael_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT NOT (v_meta ? 'role'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag left role behind';
  ASSERT NOT (v_meta ? 'michael_since'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag left michael_since behind';
  ASSERT NOT (v_meta ? 'non_fleet'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag left non_fleet behind';
  ASSERT v_meta->>'claim_flag' = 'held', 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag wiped the sibling claim_flag (used `-` wrong)';

  -- clear on a row tagged for ANOTHER role must not strip that role's tag or its non_fleet.
  UPDATE claude_sessions SET metadata = '{"role": "solomon", "non_fleet": true, "michael_since": "stale"}'::jsonb WHERE session_id = v_sid;
  PERFORM clear_michael_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'solomon', 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag stripped a non-michael role';
  ASSERT (v_meta->>'non_fleet')::boolean = true, 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag stripped another role''s non_fleet';
  ASSERT NOT (v_meta ? 'michael_since'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: clear_michael_flag left a stray michael_since on a non-michael row';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_michael_flag(v_sid);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta->>'role' = 'michael', 'ROLE-HANDOFF-ATOMIC-MICHAEL: set_michael_flag did not CREATE a missing row';

  -- privilege posture: neither RPC is callable by the PostgREST anon or authenticated roles.
  ASSERT NOT has_function_privilege('anon', 'set_michael_flag(text)', 'EXECUTE'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: anon can EXECUTE set_michael_flag';
  ASSERT NOT has_function_privilege('authenticated', 'set_michael_flag(text)', 'EXECUTE'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: authenticated can EXECUTE set_michael_flag';
  ASSERT NOT has_function_privilege('anon', 'clear_michael_flag(text)', 'EXECUTE'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: anon can EXECUTE clear_michael_flag';
  ASSERT NOT has_function_privilege('authenticated', 'clear_michael_flag(text)', 'EXECUTE'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: authenticated can EXECUTE clear_michael_flag';
  ASSERT has_function_privilege('service_role', 'set_michael_flag(text)', 'EXECUTE'), 'ROLE-HANDOFF-ATOMIC-MICHAEL: service_role cannot EXECUTE set_michael_flag';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'ROLE-HANDOFF-ATOMIC-MICHAEL verify OK: set stamps + preserves siblings, clear drops only Michael keys, create-if-absent works, anon/authenticated denied.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION clear_michael_flag(TEXT); DROP FUNCTION set_michael_flag(TEXT);
-- (see the _DOWN companion). Additive + fully reversible — no data migration to undo.
