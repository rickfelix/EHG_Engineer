-- SD-LEO-INFRA-FIX-CREATE-REPLACE-001
-- Fix create_or_replace_session to MERGE claude_sessions.metadata instead of REPLACE it.
--
-- BUG: the ON CONFLICT (session_id) DO UPDATE branch set `metadata = EXCLUDED.metadata`,
-- which overwrites the entire metadata JSONB on every session re-init. Any keys the live
-- session already carried (is_coordinator, claim flags, auto_proceed, etc.) that the re-init
-- caller did NOT re-pass were silently wiped — demoting a coordinator and dropping claim
-- state on a routine reconnect.
--
-- FIX: shallow-merge the incoming metadata onto the existing row metadata:
--   metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
-- The `||` operator keeps every existing top-level key, and lets the caller's new values win
-- on a key collision (so a re-init can still update a flag it explicitly re-passes). Keys the
-- caller omits are preserved. The INSERT path is unchanged (a brand-new row has no prior
-- metadata to preserve). Idempotent: CREATE OR REPLACE, no data migration.
--
-- This rebases on the CURRENT live definition (20260509_layer1_claiming_session_id_release_parity.sql:
-- uses sd_key + clears claiming_session_id; the 20260201 body referenced a since-removed sd_id column),
-- changing ONLY the ON CONFLICT metadata assignment.
--
-- DATA-SAFETY: additive behavior change only. Applying this migration modifies NO rows; it
-- redefines a function. Reversible by restoring `metadata = EXCLUDED.metadata`.

CREATE OR REPLACE FUNCTION create_or_replace_session(
  p_session_id TEXT,
  p_machine_id TEXT,
  p_terminal_id TEXT,
  p_tty TEXT,
  p_pid INTEGER,
  p_hostname TEXT,
  p_codebase TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_terminal_identity TEXT;
  v_previous_session RECORD;
  v_auto_released BOOLEAN := false;
  v_previous_session_id TEXT := NULL;
BEGIN
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  SELECT session_id, sd_key, status INTO v_previous_session
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_previous_session IS NOT NULL THEN
    UPDATE claude_sessions
    SET status = 'released',
        released_at = NOW(),
        released_reason = 'AUTO_REPLACED',
        updated_at = NOW()
    WHERE session_id = v_previous_session.session_id;

    IF v_previous_session.sd_key IS NOT NULL THEN
      -- LAYER-SIDE-CLAIMING-001 FR-2: clear claiming_session_id alongside active_session_id.
      -- (sd_claims table reference removed — table does not exist in current schema.)
      UPDATE strategic_directives_v2
      SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
      WHERE active_session_id = v_previous_session.session_id
         OR claiming_session_id = v_previous_session.session_id;
    END IF;

    v_auto_released := true;
    v_previous_session_id := v_previous_session.session_id;

    RAISE NOTICE 'Auto-released previous session % for terminal %',
      v_previous_session.session_id, v_terminal_identity;
  END IF;

  INSERT INTO claude_sessions (
    session_id, machine_id, terminal_id, tty, pid, hostname, codebase,
    status, heartbeat_at, metadata, created_at, updated_at
  ) VALUES (
    p_session_id, p_machine_id, p_terminal_id, p_tty, p_pid, p_hostname, p_codebase,
    'idle', NOW(), p_metadata, NOW(), NOW()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    machine_id = EXCLUDED.machine_id,
    terminal_id = EXCLUDED.terminal_id,
    tty = EXCLUDED.tty,
    pid = EXCLUDED.pid,
    hostname = EXCLUDED.hostname,
    heartbeat_at = NOW(),
    -- SD-LEO-INFRA-FIX-CREATE-REPLACE-001: merge, do not replace, so a re-init never wipes
    -- is_coordinator / claim flags the live session already carried.
    metadata = COALESCE(claude_sessions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    status = CASE
      WHEN claude_sessions.status = 'released' THEN 'idle'
      ELSE claude_sessions.status
    END,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'terminal_identity', v_terminal_identity,
    'auto_released', v_auto_released,
    'previous_session_id', v_previous_session_id,
    'created_at', NOW()
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'terminal_conflict',
      'message', format('Terminal identity %s already claimed by another session', v_terminal_identity)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_or_replace_session IS
  'Atomically creates a session, auto-releasing any previous session for the same terminal identity. Layer 1 parity (LAYER-SIDE-CLAIMING-001): clears claiming_session_id alongside active_session_id. Part of FR-1. SD-LEO-INFRA-FIX-CREATE-REPLACE-001: re-init MERGES metadata (|| existing) so is_coordinator/claim flags survive a reconnect.';

-- In-migration self-verification (runs inside apply-migration's transaction; fleet-safe:
-- unique synthetic session/terminal ids that match no real session, cleaned up before COMMIT).
-- Proves the merge: a re-init that omits is_coordinator/claim flags MUST preserve them, while
-- still applying the caller's new keys. Mirrors the DO $verify$ ASSERT pattern used by
-- 20260530_rescan_stage20_reason.sql (SD-LEO-INFRA-STAGE-RESCAN-STAGE-001).
DO $verify$
DECLARE
  v_meta  JSONB;
  v_sid   TEXT := 'verify-fix-create-replace-001-' || gen_random_uuid()::text;
  v_term  TEXT := 'verify-machine-fix-create-replace-001-' || gen_random_uuid()::text;
  v_tty   TEXT := 'verify-tty-' || gen_random_uuid()::text;
BEGIN
  -- Seed: a live session carrying a coordinator flag + a claim flag.
  PERFORM create_or_replace_session(v_sid, v_term, NULL, v_tty, 999001, 'verify-host', 'verify-codebase',
    '{"is_coordinator": true, "claim_flag": "held"}'::jsonb);
  -- Re-init the SAME session with metadata that OMITS those flags (the bug's trigger).
  PERFORM create_or_replace_session(v_sid, v_term, NULL, v_tty, 999001, 'verify-host', 'verify-codebase',
    '{"auto_proceed": true}'::jsonb);

  SELECT metadata INTO v_meta FROM claude_sessions WHERE session_id = v_sid;

  ASSERT v_meta ? 'is_coordinator' AND (v_meta->>'is_coordinator')::boolean = true,
    'FIX-CREATE-REPLACE: is_coordinator was WIPED on re-init (metadata merge failed)';
  ASSERT v_meta ? 'claim_flag' AND v_meta->>'claim_flag' = 'held',
    'FIX-CREATE-REPLACE: claim_flag was WIPED on re-init (metadata merge failed)';
  ASSERT v_meta ? 'auto_proceed' AND (v_meta->>'auto_proceed')::boolean = true,
    'FIX-CREATE-REPLACE: new metadata key from re-init was not applied';

  -- Cleanup the synthetic verification session (so nothing leaks past COMMIT).
  DELETE FROM claude_sessions WHERE session_id = v_sid;

  RAISE NOTICE 'FIX-CREATE-REPLACE verify OK: re-init merged metadata, preserving is_coordinator + claim_flag and applying auto_proceed.';
END
$verify$;

-- ROLLBACK: re-apply 20260509_layer1_claiming_session_id_release_parity.sql's definition, i.e. set
--   metadata = EXCLUDED.metadata
-- in the ON CONFLICT branch (restores the replace-on-reinit behavior).
