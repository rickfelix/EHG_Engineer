-- SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-2) — atomic working_context write RPC.
--
-- The chairman-directed working_context (a per-operator-session LIST of concurrent workstreams)
-- lives on claude_sessions.metadata.working_context. Writing it from JS by SELECT metadata →
-- merge in JS → write the WHOLE object is the lost-update race FIX-CREATE-REPLACE-001 and the
-- atomic coordinator-flag RPCs already fixed for the same table: a concurrent writer of a sibling
-- metadata key (is_coordinator, claim flags, fleet_identity, heartbeat) gets clobbered.
--
-- FIX: one SECURITY DEFINER RPC that performs an ATOMIC jsonb mutation in a single UPDATE
--   statement (Postgres row-lock serializes concurrent mutations of the same row; `||` operates
--   on the LIVE row value, never a stale JS snapshot):
--     set_session_working_context(p_session_id, p_wc)
--        → metadata = COALESCE(metadata,'{}') || jsonb_build_object('working_context', p_wc)
--   working_context is a SINGLE managed key, so a whole-key replace is correct (the application
--   builds the next working_context value via lib/coordinator/working-context.cjs and persists it
--   wholesale); sibling metadata keys are preserved because `||` merges onto the live row.
--   Create-if-absent mirrors the established set_coordinator_flag path so a session whose row does
--   not yet exist still persists its context.
--
-- DATA-SAFETY: additive. Applying this migration creates ONE function and modifies NO real rows
--   (the DO $verify$ block seeds + deletes a synthetic session inside the transaction). Reversible
--   via DROP FUNCTION. Chairman-gated for prod-apply (no -- @approved-by attestation): the JS
--   writer (lib/coordinator/working-context-store.cjs) FAIL-SOFTS when this function is absent, so
--   the feature is dormant-but-safe until the chairman applies the migration.

CREATE OR REPLACE FUNCTION set_session_working_context(p_session_id TEXT, p_wc JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('working_context', p_wc),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('working_context', p_wc),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_session_working_context(TEXT, JSONB) IS
  'SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001: atomically set metadata.working_context for one session (jsonb `||`), preserving all sibling metadata keys. Race-safe replacement for a JS read-modify-write. Create-if-absent mirrors set_coordinator_flag.';

-- ── In-migration self-verification (runs inside the apply transaction; aborts on any ASSERT) ──
DO $verify$
DECLARE
  v_sid  TEXT := 'verify-working-ctx-' || md5(clock_timestamp()::text);
  v_meta JSONB;
  v_wc1  JSONB := jsonb_build_object('mode','support','threads', jsonb_build_array(jsonb_build_object('what','t1','state','active')),'updated_at','2026-06-15T12:00:00Z');
  v_wc2  JSONB := jsonb_build_object('mode','build','threads', jsonb_build_array(jsonb_build_object('what','t2','state','waiting','waiting_on','coordinator')),'updated_at','2026-06-15T12:05:00Z');
BEGIN
  -- Seed an existing session carrying a sibling metadata key that MUST survive the write.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, jsonb_build_object('is_coordinator', true, 'claim_flag', 'held'), now(), 'active', now(), now());

  -- set on an EXISTING row: working_context stored, sibling keys preserved.
  PERFORM set_session_working_context(v_sid, v_wc1);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'working_context', 'WORKING-CTX: working_context not set';
  ASSERT (v_meta->'working_context'->'threads'->0->>'what') = 't1', 'WORKING-CTX: thread payload not stored';
  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true, 'WORKING-CTX: clobbered sibling is_coordinator';
  ASSERT v_meta->>'claim_flag' = 'held', 'WORKING-CTX: clobbered sibling claim_flag';

  -- a second set REPLACES the working_context value wholesale (single managed key), siblings intact.
  PERFORM set_session_working_context(v_sid, v_wc2);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT (v_meta->'working_context'->'threads'->0->>'what') = 't2', 'WORKING-CTX: second set did not replace';
  ASSERT (v_meta->'working_context'->'threads'->0->>'waiting_on') = 'coordinator', 'WORKING-CTX: waiting_on not persisted';
  ASSERT v_meta->>'claim_flag' = 'held', 'WORKING-CTX: second set clobbered sibling';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_session_working_context(v_sid, v_wc1);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'working_context', 'WORKING-CTX: create-if-absent failed';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'WORKING-CTX verify OK: atomic set preserves siblings, replaces the managed key, and create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION set_session_working_context(TEXT, JSONB);
-- Additive + fully reversible — no data migration to undo.
