-- SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-4) — atomic ephemeral working-signal write RPC.
--
-- The ephemeral "working/thinking" backchannel (e.g. "Adam is investigating your S17 handoff,
-- ETA ~5min") lives on claude_sessions.metadata.working_signal — deliberately OFF the durable
-- session_coordination log (fire-and-forget, self-expiring, never a chat message). Writing it
-- from JS by SELECT metadata -> merge in JS -> write the WHOLE object is the same lost-update
-- race already fixed once for this table (FIX-CREATE-REPLACE-001, set_session_working_context):
-- a concurrent writer of a sibling metadata key (working_context, is_coordinator, claim flags,
-- current_tool) gets clobbered.
--
-- FIX: one SECURITY DEFINER RPC that performs an ATOMIC jsonb mutation in a single UPDATE
--   statement (Postgres row-lock serializes concurrent mutations of the same row; `||` operates
--   on the LIVE row value, never a stale JS snapshot):
--     set_session_working_signal(p_session_id, p_body, p_eta_ms, p_expires_at)
--        -> metadata = COALESCE(metadata,'{}') || jsonb_build_object('working_signal', jsonb_build_object(...))
--   working_signal is a SINGLE managed key, so a whole-key replace is correct; sibling metadata
--   keys are preserved because `||` merges onto the live row. Create-if-absent mirrors the
--   established set_coordinator_flag / set_session_working_context path so a session whose row
--   does not yet exist still persists its signal.
--
-- SELF-EXPIRING: p_expires_at is stored alongside the signal; readers (getWorkingSignal, pure,
--   in lib/coordinator/presence-grounding-signals.cjs) treat now() > expires_at as absent — no
--   cleanup job/cron needed.
--
-- DATA-SAFETY: additive. Applying this migration creates ONE function and modifies NO real rows
--   (the DO $verify$ block seeds + deletes a synthetic session inside the transaction). Reversible
--   via DROP FUNCTION. Chairman-gated for prod-apply (no -- @approved-by attestation): the JS
--   writer (lib/coordinator/working-signal-store.cjs) FAIL-SOFTS when this function is absent, so
--   the feature is dormant-but-safe until the chairman applies the migration.

CREATE OR REPLACE FUNCTION set_session_working_signal(
  p_session_id TEXT,
  p_body TEXT,
  p_eta_ms BIGINT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signal JSONB;
BEGIN
  v_signal := jsonb_build_object(
    'body', p_body,
    'eta_ms', p_eta_ms,
    'stamped_at', now(),
    'expires_at', p_expires_at
  );

  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (
    p_session_id,
    jsonb_build_object('working_signal', v_signal),
    now(),
    'active',
    now(),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb)
               || jsonb_build_object('working_signal', v_signal),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION set_session_working_signal(TEXT, TEXT, BIGINT, TIMESTAMPTZ) IS
  'SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001: atomically set metadata.working_signal for one session (jsonb `||`), preserving all sibling metadata keys. Race-safe replacement for a JS read-modify-write. Create-if-absent mirrors set_session_working_context.';

-- In-migration self-verification (runs inside the apply transaction; aborts on any ASSERT)
DO $verify$
DECLARE
  v_sid  TEXT := 'verify-working-sig-' || md5(clock_timestamp()::text);
  v_meta JSONB;
BEGIN
  -- Seed an existing session carrying a sibling metadata key that MUST survive the write.
  INSERT INTO claude_sessions (session_id, metadata, heartbeat_at, status, created_at, updated_at)
  VALUES (v_sid, jsonb_build_object('is_coordinator', true, 'working_context', jsonb_build_object('mode','build')), now(), 'active', now(), now());

  -- set on an EXISTING row: working_signal stored, sibling keys preserved.
  PERFORM set_session_working_signal(v_sid, 'investigating S17 handoff', 300000, now() + interval '30 minutes');
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'working_signal', 'WORKING-SIG: working_signal not set';
  ASSERT (v_meta->'working_signal'->>'body') = 'investigating S17 handoff', 'WORKING-SIG: body not stored';
  ASSERT (v_meta->'working_signal'->>'eta_ms')::bigint = 300000, 'WORKING-SIG: eta_ms not stored';
  ASSERT v_meta->'working_signal' ? 'stamped_at', 'WORKING-SIG: stamped_at not set';
  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true, 'WORKING-SIG: clobbered sibling is_coordinator';
  ASSERT v_meta ? 'working_context', 'WORKING-SIG: clobbered sibling working_context';

  -- a second set REPLACES the working_signal value wholesale (single managed key), siblings intact.
  PERFORM set_session_working_signal(v_sid, 'reply drafted, sending', 30000, now() + interval '30 minutes');
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT (v_meta->'working_signal'->>'body') = 'reply drafted, sending', 'WORKING-SIG: second set did not replace';
  ASSERT v_meta ? 'is_coordinator', 'WORKING-SIG: second set clobbered sibling';

  -- create-if-absent: set on a NON-EXISTENT session registers a fresh row.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  PERFORM set_session_working_signal(v_sid, 'first contact', 60000, now() + interval '30 minutes');
  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;
  ASSERT v_meta ? 'working_signal', 'WORKING-SIG: create-if-absent failed';

  -- Cleanup so nothing leaks past COMMIT.
  DELETE FROM claude_sessions WHERE session_id = v_sid;
  RAISE NOTICE 'WORKING-SIG verify OK: atomic set preserves siblings, replaces the managed key, and create-if-absent works.';
END
$verify$;

-- ROLLBACK: DROP FUNCTION set_session_working_signal(TEXT, TEXT, BIGINT, TIMESTAMPTZ);
-- Additive + fully reversible — no data migration to undo.
