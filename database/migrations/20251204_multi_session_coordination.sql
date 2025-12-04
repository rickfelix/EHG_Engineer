-- Multi-Session Claude Code Coordination System
-- Purpose: Enable multiple Claude Code instances to coordinate work on parallel SD tracks
-- Created: 2025-12-04
-- Part of: LEO Protocol SD Orchestration

-- ============================================================================
-- TABLE: claude_sessions
-- Purpose: Track active Claude Code sessions across terminals
-- ============================================================================
CREATE TABLE IF NOT EXISTS claude_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,              -- Format: session_<uuid8>_tty<N>_<pid>
  sd_id TEXT,                                   -- Currently claimed SD (null if idle)
  track TEXT CHECK (track IN ('A', 'B', 'C', 'STANDALONE')),
  tty TEXT,                                     -- Terminal identifier (/dev/pts/N)
  pid INTEGER,                                  -- Process ID
  hostname TEXT,                                -- Machine hostname
  codebase TEXT,                                -- 'EHG' or 'EHG_Engineer'
  claimed_at TIMESTAMPTZ,                       -- When SD was claimed
  heartbeat_at TIMESTAMPTZ DEFAULT NOW(),       -- Last activity timestamp
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'idle', 'stale', 'released')),
  metadata JSONB DEFAULT '{}'::jsonb,           -- Extensible (branch, context_usage, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_sessions_status ON claude_sessions(status);
CREATE INDEX IF NOT EXISTS idx_claude_sessions_sd ON claude_sessions(sd_id) WHERE sd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claude_sessions_track ON claude_sessions(track) WHERE track IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claude_sessions_heartbeat ON claude_sessions(heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_claude_sessions_tty_pid ON claude_sessions(tty, pid);

-- ============================================================================
-- TABLE: sd_claims
-- Purpose: Historical record of SD claims (supports analytics and audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,                          -- References strategic_directives_v2.legacy_id
  session_id TEXT NOT NULL REFERENCES claude_sessions(session_id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  release_reason TEXT CHECK (release_reason IN ('completed', 'timeout', 'manual', 'conflict', 'session_ended')),
  metadata JSONB DEFAULT '{}'::jsonb,           -- Context at claim time
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sd_claims_active ON sd_claims(sd_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sd_claims_session ON sd_claims(session_id);
CREATE INDEX IF NOT EXISTS idx_sd_claims_sd ON sd_claims(sd_id);

-- ============================================================================
-- MODIFY: strategic_directives_v2
-- Add active_session_id for quick lookup of who's working on what
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2' AND column_name = 'active_session_id'
  ) THEN
    ALTER TABLE strategic_directives_v2
      ADD COLUMN active_session_id TEXT;
  END IF;
END $$;

-- Note: We don't add a FK constraint because sessions may be cleaned up
-- while SD record persists. The application layer handles consistency.

CREATE INDEX IF NOT EXISTS idx_sd_active_session ON strategic_directives_v2(active_session_id)
  WHERE active_session_id IS NOT NULL;

-- ============================================================================
-- VIEW: v_active_sessions
-- Purpose: All sessions with computed staleness (5 min threshold)
-- ============================================================================
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title as sd_title,
  cs.track,
  cs.tty,
  cs.pid,
  cs.hostname,
  cs.codebase,
  cs.claimed_at,
  cs.heartbeat_at,
  cs.status,
  cs.metadata,
  cs.created_at,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) as heartbeat_age_seconds,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60 as heartbeat_age_minutes,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'  -- 5 minutes
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END as computed_status,
  CASE
    WHEN cs.claimed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - cs.claimed_at)) / 60
    ELSE NULL
  END as claim_duration_minutes
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.legacy_id
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;

-- ============================================================================
-- VIEW: v_sd_parallel_opportunities
-- Purpose: Identify SDs available for parallel work across tracks
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_parallel_opportunities AS
WITH active_baseline AS (
  SELECT id FROM sd_execution_baselines WHERE is_active = TRUE LIMIT 1
),
active_claims AS (
  SELECT DISTINCT sd_id, track, session_id
  FROM v_active_sessions
  WHERE computed_status = 'active' AND sd_id IS NOT NULL
),
active_tracks AS (
  SELECT DISTINCT track FROM active_claims
),
ready_sds AS (
  SELECT
    bi.sd_id,
    sd.title,
    sd.priority,
    bi.track,
    bi.sequence_rank,
    bi.is_ready,
    bi.dependency_health_score,
    sd.status as sd_status,
    sd.progress_percentage,
    ac.session_id as claimed_by_session,
    CASE
      WHEN ac.sd_id IS NOT NULL THEN 'claimed'
      WHEN bi.track IN (SELECT track FROM active_tracks) THEN 'track_busy'
      WHEN NOT bi.is_ready THEN 'blocked'
      WHEN sd.status IN ('completed', 'cancelled') THEN 'done'
      ELSE 'available'
    END as availability
  FROM sd_baseline_items bi
  JOIN strategic_directives_v2 sd ON bi.sd_id = sd.legacy_id
  LEFT JOIN active_claims ac ON bi.sd_id = ac.sd_id
  WHERE bi.baseline_id = (SELECT id FROM active_baseline)
)
SELECT
  *,
  CASE availability
    WHEN 'available' THEN 1
    WHEN 'track_busy' THEN 2
    WHEN 'blocked' THEN 3
    WHEN 'claimed' THEN 4
    WHEN 'done' THEN 5
  END as availability_priority
FROM ready_sds
WHERE availability != 'done'
ORDER BY availability_priority, track, sequence_rank;

-- ============================================================================
-- VIEW: v_parallel_track_status
-- Purpose: Summary of each track's status for parallel opportunity detection
-- ============================================================================
CREATE OR REPLACE VIEW v_parallel_track_status AS
WITH track_summary AS (
  SELECT
    track,
    COUNT(*) as total_sds,
    COUNT(*) FILTER (WHERE availability = 'available') as available_sds,
    COUNT(*) FILTER (WHERE availability = 'claimed') as claimed_sds,
    COUNT(*) FILTER (WHERE availability = 'blocked') as blocked_sds,
    MIN(CASE WHEN availability = 'available' THEN sequence_rank END) as next_available_rank,
    MIN(CASE WHEN availability = 'available' THEN sd_id END) as next_available_sd
  FROM v_sd_parallel_opportunities
  WHERE track IS NOT NULL
  GROUP BY track
),
active_session_per_track AS (
  SELECT track, session_id, sd_id, heartbeat_age_minutes
  FROM v_active_sessions
  WHERE computed_status = 'active' AND sd_id IS NOT NULL
)
SELECT
  ts.track,
  CASE ts.track
    WHEN 'A' THEN 'Infrastructure/Safety'
    WHEN 'B' THEN 'Feature/Stages'
    WHEN 'C' THEN 'Quality'
    WHEN 'STANDALONE' THEN 'Standalone'
  END as track_name,
  ts.total_sds,
  ts.available_sds,
  ts.claimed_sds,
  ts.blocked_sds,
  ts.next_available_sd,
  aspt.session_id as active_session,
  aspt.sd_id as active_sd,
  aspt.heartbeat_age_minutes as session_age_minutes,
  CASE
    WHEN aspt.session_id IS NOT NULL THEN 'occupied'
    WHEN ts.available_sds > 0 THEN 'open'
    WHEN ts.blocked_sds > 0 THEN 'blocked'
    ELSE 'empty'
  END as track_status
FROM track_summary ts
LEFT JOIN active_session_per_track aspt ON ts.track = aspt.track
ORDER BY ts.track;

-- ============================================================================
-- FUNCTION: claim_sd
-- Purpose: Atomically claim an SD for a session (prevents race conditions)
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_sd(
  p_sd_id TEXT,
  p_session_id TEXT,
  p_track TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing_claim RECORD;
  v_conflict RECORD;
  v_result JSONB;
BEGIN
  -- Check if SD is already claimed by another active session
  SELECT cs.session_id, cs.sd_id, vas.computed_status
  INTO v_existing_claim
  FROM claude_sessions cs
  JOIN v_active_sessions vas ON cs.session_id = vas.session_id
  WHERE cs.sd_id = p_sd_id
    AND vas.computed_status = 'active'
    AND cs.session_id != p_session_id
  LIMIT 1;

  IF v_existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_claimed',
      'message', format('SD %s is already claimed by session %s', p_sd_id, v_existing_claim.session_id),
      'claimed_by', v_existing_claim.session_id
    );
  END IF;

  -- Check for blocking conflicts with active SDs
  SELECT cm.*, vas.sd_id as active_sd, vas.session_id as active_session
  INTO v_conflict
  FROM sd_conflict_matrix cm
  JOIN v_active_sessions vas ON (
    (cm.sd_id_a = p_sd_id AND cm.sd_id_b = vas.sd_id) OR
    (cm.sd_id_b = p_sd_id AND cm.sd_id_a = vas.sd_id)
  )
  WHERE cm.resolved_at IS NULL
    AND cm.conflict_severity = 'blocking'
    AND vas.computed_status = 'active'
    AND vas.session_id != p_session_id
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict',
      'message', format('SD %s has blocking conflict with active SD %s', p_sd_id, v_conflict.active_sd),
      'conflict_type', v_conflict.conflict_type,
      'conflicting_sd', v_conflict.active_sd,
      'conflicting_session', v_conflict.active_session
    );
  END IF;

  -- Release any existing claim for this session
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'manual'
  WHERE session_id = p_session_id AND released_at IS NULL;

  -- Clear any previous active_session_id for this session
  UPDATE strategic_directives_v2
  SET active_session_id = NULL
  WHERE active_session_id = p_session_id;

  -- Create new claim
  INSERT INTO sd_claims (sd_id, session_id, track)
  VALUES (p_sd_id, p_session_id, p_track);

  -- Update session
  UPDATE claude_sessions
  SET sd_id = p_sd_id,
      track = p_track,
      claimed_at = NOW(),
      heartbeat_at = NOW(),
      status = 'active'
  WHERE session_id = p_session_id;

  -- Update SD
  UPDATE strategic_directives_v2
  SET active_session_id = p_session_id,
      is_working_on = true
  WHERE legacy_id = p_sd_id;

  RETURN jsonb_build_object(
    'success', true,
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track,
    'claimed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: release_sd
-- Purpose: Release an SD claim for a session
-- ============================================================================
CREATE OR REPLACE FUNCTION release_sd(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'manual'
) RETURNS JSONB AS $$
DECLARE
  v_sd_id TEXT;
BEGIN
  -- Get current SD
  SELECT sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_claim',
      'message', 'Session has no active SD claim'
    );
  END IF;

  -- Release the claim
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = p_reason
  WHERE session_id = p_session_id AND released_at IS NULL;

  -- Update session
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      heartbeat_at = NOW(),
      status = 'idle'
  WHERE session_id = p_session_id;

  -- Update SD
  UPDATE strategic_directives_v2
  SET active_session_id = NULL,
      is_working_on = false
  WHERE legacy_id = v_sd_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd', v_sd_id,
    'reason', p_reason
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: cleanup_stale_sessions
-- Purpose: Release claims from sessions inactive for more than 5 minutes
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_stale_sessions() RETURNS JSONB AS $$
DECLARE
  v_stale_count INTEGER := 0;
  v_session RECORD;
BEGIN
  -- Find and process stale sessions
  FOR v_session IN
    SELECT session_id, sd_id
    FROM claude_sessions
    WHERE status NOT IN ('released', 'stale')
      AND EXTRACT(EPOCH FROM (NOW() - heartbeat_at)) > 300  -- 5 minutes
  LOOP
    -- Release any claim
    IF v_session.sd_id IS NOT NULL THEN
      PERFORM release_sd(v_session.session_id, 'timeout');
    END IF;

    -- Mark session as stale
    UPDATE claude_sessions
    SET status = 'stale'
    WHERE session_id = v_session.session_id;

    v_stale_count := v_stale_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'stale_sessions_cleaned', v_stale_count,
    'cleaned_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: update_session_heartbeat
-- Purpose: Touch the heartbeat timestamp for a session
-- ============================================================================
CREATE OR REPLACE FUNCTION update_session_heartbeat(
  p_session_id TEXT
) RETURNS JSONB AS $$
BEGIN
  UPDATE claude_sessions
  SET heartbeat_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'heartbeat_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- Enable RLS but allow access for internal tooling
-- ============================================================================
ALTER TABLE claude_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_claims ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon (internal tooling)
CREATE POLICY "Allow all for anon" ON claude_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON claude_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sd_claims FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sd_claims FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE claude_sessions IS 'Tracks active Claude Code sessions for multi-instance coordination. Sessions auto-register and update heartbeat on sd:next/sd:claim.';
COMMENT ON TABLE sd_claims IS 'Historical record of SD claims by sessions. Supports analytics and audit trail.';
COMMENT ON VIEW v_active_sessions IS 'All sessions with computed staleness. Sessions are stale after 5 minutes of no heartbeat.';
COMMENT ON VIEW v_sd_parallel_opportunities IS 'SDs available for parallel work, showing which are claimed, blocked, or available.';
COMMENT ON VIEW v_parallel_track_status IS 'Summary of each track for parallel opportunity detection.';
COMMENT ON FUNCTION claim_sd IS 'Atomically claim an SD for a session. Prevents race conditions and checks for conflicts.';
COMMENT ON FUNCTION release_sd IS 'Release an SD claim for a session.';
COMMENT ON FUNCTION cleanup_stale_sessions IS 'Release claims from sessions inactive for more than 5 minutes.';
