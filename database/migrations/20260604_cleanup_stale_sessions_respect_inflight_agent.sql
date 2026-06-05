-- ============================================================================
-- SD-FDBK-INFRA-CLAIM-SWEEP-LIVENESS-001  (FR-2)
-- Make cleanup_stale_sessions() HONOR an in-flight session's expected_silence_until
-- so an actively-running (mid-long-Task/sub-agent) session is not STALE-released
-- merely because its heartbeat aged past the stale threshold.
--
-- Sibling FR-1 (scripts/hooks/pre-tool-enforce.cjs) await-persists
-- claude_sessions.expected_silence_until (~up to 30 min future, clamped by
-- MAX_SILENCE_MS in scripts/hooks/lib/tool-timeout.cjs) on Task/Agent dispatch.
-- This migration teaches the sweep RPC to respect that signal.
--
-- GO-GATE GUARANTEES (risk-agent e59ef164):
--  1. DEFAULT-OFF — new protective predicate gated behind config flag
--     chairman_dashboard_config.metadata->>'sweep_respect_inflight_agent'
--     (boolean, default false). When false/absent the function behaves EXACTLY
--     as the current main definition (releases as today).
--  2. HARD-CAP CEILING (unflagged-by-design) — the in-flight exemption applies
--     ONLY while heartbeat_at is within (30 + claim_ttl_minutes) minutes of NOW().
--     A genuinely-dead session whose heartbeat is older than that ceiling is
--     released even when the flag is ON and expected_silence_until is in the
--     future, so the exemption can NEVER wedge a dead claim forever.
--  3. FAIL-OPEN — the config read is wrapped in EXCEPTION WHEN OTHERS; any error
--     (missing column / bad cast / missing row) falls back to flag=false,
--     ttl=15, i.e. today's behavior. The cleanup is never aborted.
--  4. RELEASE-PAYLOAD INTEGRITY — the release UPDATE now also clears
--     worktree_branch and worktree_path alongside sd_key, so it can never leave a
--     row that violates ck_claude_sessions_worktree_state_consistency
--     (CHECK ((sd_key IS NOT NULL) OR (worktree_path IS NULL AND worktree_branch IS NULL)))
--     and silently roll back into a CLAIM_FIX churn loop.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + flag seed with ON CONFLICT DO NOTHING.
-- This is a files-only migration; do NOT apply by hand — check-readiness CI applies it.
-- ============================================================================

-- 1) Seed the default-OFF flag into the existing default config row.
--    metadata already carries claim_ttl_minutes; we add our boolean alongside it,
--    defaulting to FALSE so behavior is byte-for-byte identical to current main.
UPDATE chairman_dashboard_config
SET metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('sweep_respect_inflight_agent', false),
    updated_at = NOW()
WHERE config_key = 'default'
  AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'sweep_respect_inflight_agent');
-- (Acts as "ADD flag row defaulting to false, do nothing if already present".)

-- 2) Replace the function, preserving the LIVE main behavior exactly except for
--    the flag-gated in-flight exemption + the release-payload hardening.
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions(
  p_stale_threshold_seconds INTEGER DEFAULT 120,
  p_batch_size INTEGER DEFAULT 100
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
  -- FR-2 in-flight-respect config (fail-open defaults = current main behavior)
  v_respect_inflight BOOLEAN := false;  -- default OFF
  v_ttl_minutes      INTEGER := 15;     -- claim TTL, mirrors existing config knob
  v_hardcap_minutes  INTEGER := 45;     -- ceiling above which exemption never applies
BEGIN
  -- FAIL-OPEN config read. Any error here leaves the defaults above (flag OFF),
  -- so the function degrades to today's behavior rather than aborting cleanup.
  BEGIN
    SELECT
      COALESCE((metadata->>'sweep_respect_inflight_agent')::boolean, false),
      COALESCE((metadata->>'claim_ttl_minutes')::integer, 15)
    INTO v_respect_inflight, v_ttl_minutes
    FROM chairman_dashboard_config
    WHERE config_key = 'default'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_respect_inflight := false;
    v_ttl_minutes := 15;
  END;

  -- Hard-cap ceiling = max in-flight silence window (30 min, per FR-1
  -- MAX_SILENCE_MS) + claim TTL margin. Beyond this, no expected_silence_until
  -- can exempt a session: a dead claim cannot be wedged open forever.
  v_hardcap_minutes := 30 + GREATEST(COALESCE(v_ttl_minutes, 15), 0);

  -- Step 1: Mark active/idle sessions as stale if heartbeat too old.
  WITH stale_sessions AS (
    SELECT session_id
    FROM claude_sessions
    WHERE status IN ('active', 'idle')
      AND heartbeat_at < NOW() - (p_stale_threshold_seconds || ' seconds')::INTERVAL
      -- FR-2 in-flight exemption (DEFAULT-OFF). When v_respect_inflight is false
      -- the whole parenthesised term is false and NOT(false)=true, so this clause
      -- is a no-op → identical to current main. When the flag is ON, a session
      -- with a future expected_silence_until is skipped, UNLESS its heartbeat is
      -- already older than the hard-cap ceiling (then it is marked stale anyway).
      AND NOT (
        v_respect_inflight
        AND expected_silence_until IS NOT NULL
        AND expected_silence_until > NOW()
        AND heartbeat_at >= NOW() - (v_hardcap_minutes || ' minutes')::INTERVAL
      )
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE claude_sessions cs
    SET status = 'stale',
        stale_at = NOW(),
        stale_reason = 'HEARTBEAT_TIMEOUT',
        updated_at = NOW()
    FROM stale_sessions ss
    WHERE cs.session_id = ss.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_stale_count FROM updated;

  -- Step 2: Release stale sessions that have been stale for >30 seconds.
  -- RELEASE-PAYLOAD INTEGRITY: clearing sd_key would violate
  -- ck_claude_sessions_worktree_state_consistency unless worktree_path and
  -- worktree_branch are NULL too, so we clear all three together.
  WITH release_sessions AS (
    SELECT session_id, sd_key
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at < NOW() - INTERVAL '30 seconds'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  released AS (
    UPDATE claude_sessions cs
    SET status = 'released',
        released_at = NOW(),
        released_reason = 'STALE_CLEANUP',
        sd_key = NULL,
        track = NULL,
        claimed_at = NULL,
        worktree_branch = NULL,
        worktree_path = NULL,
        updated_at = NOW()
    FROM release_sessions rs
    WHERE cs.session_id = rs.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  -- LAYER-SIDE-CLAIMING-001 FR-4: clear claiming_session_id alongside
  -- active_session_id. (sd_claims table reference removed — table does not exist
  -- in current schema.)
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  )
  OR claiming_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  );

  RETURN jsonb_build_object(
    'success', true,
    'sessions_marked_stale', v_stale_count,
    'sessions_released', v_released_count,
    'stale_threshold_seconds', p_stale_threshold_seconds,
    'batch_size', p_batch_size,
    'respect_inflight_agent', v_respect_inflight,
    'hardcap_minutes', v_hardcap_minutes,
    'executed_at', NOW()
  );
END;
$function$;

COMMENT ON FUNCTION cleanup_stale_sessions IS
  'Batch cleanup of stale sessions: marks stale after threshold, releases after 30s stale. '
  'FR-2 (SD-FDBK-INFRA-CLAIM-SWEEP-LIVENESS-001): DEFAULT-OFF in-flight exemption honors '
  'expected_silence_until under config flag sweep_respect_inflight_agent, bounded by a '
  '(30 + claim_ttl) minute hard cap; fail-open config read; release clears worktree_branch/path.';

-- ============================================================================
-- ROLLBACK (manual, if ever needed):
--   Re-create the prior definition (without v_respect_inflight / the in-flight
--   exemption clause and without worktree_branch/worktree_path in the release
--   UPDATE) via CREATE OR REPLACE FUNCTION, and:
--     UPDATE chairman_dashboard_config
--        SET metadata = metadata - 'sweep_respect_inflight_agent'
--      WHERE config_key = 'default';
-- ============================================================================
