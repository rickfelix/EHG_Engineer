-- SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B (FR-1) — atomic handoff-memory write RPC.
--
-- A relaunching singleton (Adam/Solomon/coordinator) needs to persist in-flight state that is
-- NOT already DB-backed via claude_sessions.metadata.working_context or session_coordination
-- (mid-reasoning context, a reply it intended to send but had not) before it relaunches onto a
-- fresh checkout. Writing this from JS by SELECT metadata -> merge in JS -> write the WHOLE
-- object is the exact lost-update race the working_context / coordinator-flag RPCs already
-- fixed for this table.
--
-- FIX: one SECURITY DEFINER RPC that performs an ATOMIC jsonb mutation in a single UPDATE
--   statement (Postgres row-lock serializes concurrent mutations of the same row; `||` operates
--   on the LIVE row value, never a stale JS snapshot):
--     set_session_handoff_memory(p_session_id, p_hm)
--        -> metadata = COALESCE(metadata,'{}') || jsonb_build_object('handoff_memory', p_hm)
--   handoff_memory is a SINGLE managed key, so a whole-key replace is correct (the application
--   builds the next handoff_memory value via lib/coordinator/handoff-memory.cjs and persists it
--   wholesale); sibling metadata keys are preserved because `||` merges onto the live row.
--   Create-if-absent mirrors the established set_session_working_context path so a session whose
--   row does not yet exist still persists its handoff memory.
--
-- DATA-SAFETY: additive. Applying this migration creates ONE function and modifies NO real rows
--   (the DO $verify$ block seeds + deletes a synthetic session inside the transaction). Reversible
--   via DROP FUNCTION. Chairman-gated for prod-apply (no -- @approved-by attestation), matching
--   database/migrations/20260615_set_session_working_context.sql's own convention: the JS writer
--   (lib/coordinator/handoff-memory-store.cjs) FAIL-SOFTS when this function is absent, so the
--   feature is dormant-but-safe until the chairman applies the migration.

CREATE OR REPLACE FUNCTION set_session_handoff_memory(p_session_id TEXT, p_hm JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('handoff_memory', p_hm),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('handoff_memory', p_hm),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_session_handoff_memory(TEXT, JSONB) IS
  'SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B: atomically set metadata.handoff_memory for one session (jsonb ||), preserving all sibling metadata keys. Race-safe replacement for a JS read-modify-write. Create-if-absent mirrors set_session_working_context.';

-- In-migration self-verification (runs inside the apply transaction; aborts on any ASSERT)
DO $verify$
DECLARE
  v_sid  TEXT := 'verify-handoff-mem-' || md5(clock_timestamp()::text);
  v_meta JSONB;
  v_hm1  JSONB := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind','reply_owed','summary','s1')),'captured_at','2026-07-02T10:00:00Z','predecessor_session_id',null);
  v_hm2  JSONB := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind','consult','summary','s2')),'captured_at','2026-07-02T10:05:00Z','predecessor_session_id',v_sid);
BEGIN
  -- Seed an existing session carrying a sibling metadata key that MUST survive the write.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, jsonb_build_object('is_coordinator', true, 'claim_flag', 'held'), now(), 'active', now(), now());

  -- set on an EXISTING row: handoff_memory stored, sibling keys preserved.
  PERFORM set_session_handoff_memory(v_sid, v_hm1);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'handoff_memory', 'HANDOFF-MEM: handoff_memory not set';
  ASSERT (v_meta->'handoff_memory'->'items'->0->>'summary') = 's1', 'HANDOFF-MEM: item payload not stored';
  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true, 'HANDOFF-MEM: clobbered sibling is_coordinator';
  ASSERT v_meta->>'claim_flag' = 'held', 'HANDOFF-MEM: clobbered sibling claim_flag';

  -- a second set REPLACES the handoff_memory value wholesale (single managed key), siblings intact.
  PERFORM set_session_handoff_memory(v_sid, v_hm2);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT (v_meta->'handoff_memory'->'items'->0->>'summary') = 's2', 'HANDOFF-MEM: second set did not replace';
  ASSERT v_meta->>'claim_flag' = 'held', 'HANDOFF-MEM: second set clobbered sibling';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_session_handoff_memory(v_sid, v_hm1);
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'handoff_memory', 'HANDOFF-MEM: create-if-absent failed';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'HANDOFF-MEM verify OK: atomic set preserves siblings, replaces the managed key, and create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION set_session_handoff_memory(TEXT, JSONB);
-- Additive + fully reversible — no data migration to undo.
