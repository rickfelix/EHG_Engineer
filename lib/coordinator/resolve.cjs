// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1
// Coordinator identity resolution: file-first, DB fallback.
// Workers call getActiveCoordinatorId() to find a coordinator session_id; the coordinator
// calls setActiveCoordinator() at /coordinator start and clearActiveCoordinator() at stop.

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_THRESHOLD_MIN = 10;
const ACTIVE_COORDINATOR_FILE = path.resolve(__dirname, '../../.claude/active-coordinator.json');

function readPointerFile() {
  try {
    if (!fs.existsSync(ACTIVE_COORDINATOR_FILE)) return null;
    const raw = fs.readFileSync(ACTIVE_COORDINATOR_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data.session_id !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function writePointerFile(payload) {
  fs.mkdirSync(path.dirname(ACTIVE_COORDINATOR_FILE), { recursive: true });
  fs.writeFileSync(ACTIVE_COORDINATOR_FILE, JSON.stringify(payload, null, 2));
}

async function queryDbForCoordinator(supabase) {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at, metadata')
    .gte('heartbeat_at', cutoff)
    .filter('metadata->>is_coordinator', 'eq', 'true')
    .order('heartbeat_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0];
}

// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-1: feature flag, default-OFF.
// Read INSIDE function bodies only (never at module scope) so requiring this
// module with the flag off triggers zero new behavior and zero DB calls at
// import time. With the flag off the resolution path below is byte-identical to
// the prior SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 behavior.
function isTwoWayV2Enabled() {
  return process.env.COORDINATOR_TWOWAY_V2 === 'on';
}

// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-3: deterministic single-winner election.
// Pure: given candidate coordinator rows, pick ONE authoritative winner by
// (coordinator_since DESC, NULLS LAST, session_id ASC). Most-recently-started
// coordinator wins — matching the legacy file-overwrite "last /coordinator start
// wins" intent and preventing a zombie incumbent from blocking a fresh takeover.
// NULL coordinator_since is ordered last; session_id is a stable deterministic
// tiebreak so resolution never flaps between equally-ranked candidates.
function pickCanonicalCoordinator(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidates = rows
    .filter(r => r && typeof r.session_id === 'string')
    .map(r => ({
      session_id: r.session_id,
      since: (r.metadata && typeof r.metadata.coordinator_since === 'string')
        ? r.metadata.coordinator_since
        : null
    }));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    // coordinator_since DESC, NULLS LAST
    if (a.since !== null || b.since !== null) {
      if (a.since === null) return 1;
      if (b.since === null) return -1;
      if (a.since !== b.since) return a.since > b.since ? -1 : 1;
    }
    // tiebreak: session_id ASC (stable + deterministic)
    if (a.session_id < b.session_id) return -1;
    if (a.session_id > b.session_id) return 1;
    return 0;
  });
  return candidates[0];
}

// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-3+FR-4: DB-canonical election.
// Fetch ALL fresh is_coordinator sessions (not limit-1) and elect a single
// winner. Returns a session_id or null. Fail-open (GG-5): any error returns null
// so the caller falls back to the legacy file-first chain; this function never
// throws and never mutates is_coordinator (GG-6, read-only resolution).
async function electCoordinatorFromDb(supabase) {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .gte('heartbeat_at', cutoff)
      .filter('metadata->>is_coordinator', 'eq', 'true');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const winner = pickCanonicalCoordinator(data);
    return winner ? winner.session_id : null;
  } catch {
    return null;
  }
}

async function getActiveCoordinatorId(supabase) {
  // SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-3+FR-4 (default-OFF): when enabled, the
  // DB is the canonical pointer — elect a single authoritative coordinator from
  // claude_sessions and return it (the local file is demoted to a cache used only
  // by the legacy path below). Fail-open: on no-result/error we fall through to
  // the byte-identical legacy file-first resolution, so flag-OFF is unchanged.
  if (isTwoWayV2Enabled() && supabase) {
    const elected = await electCoordinatorFromDb(supabase);
    if (elected) return elected;
    // DB reachable-but-empty or errored → fall through to legacy chain (fail-open).
  }

  // 1) File-first lookup. The pointer file is rewritten on every /coordinator start
  //    so its session_id is always the most-recently-started coordinator.
  const pointer = readPointerFile();
  if (pointer && pointer.session_id) {
    if (!supabase) return pointer.session_id;
    // Verify heartbeat is fresh — file may be stale if coordinator exited ungracefully.
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at')
      .eq('session_id', pointer.session_id)
      .gte('heartbeat_at', cutoff)
      .maybeSingle();
    if (row) return pointer.session_id;
    // file is stale; fall through to DB scan
  }

  // 2) DB fallback. Scans for any session with metadata.is_coordinator=true
  //    and a heartbeat within STALE_THRESHOLD_MIN. Returns most recently active.
  if (!supabase) return null;
  const row = await queryDbForCoordinator(supabase);
  return row ? row.session_id : null;
}

async function setActiveCoordinator(supabase, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('setActiveCoordinator: sessionId required');
  }

  writePointerFile({
    session_id: sessionId,
    started_at: new Date().toISOString(),
    host: os.hostname()
  });

  if (!supabase) return;

  // QF-20260504-964 FIX 2: drain broadcast-coordinator buffer to this session.
  // Worker /signal calls during a coord-down window write to target_session=
  // 'broadcast-coordinator'; the new coord must inherit them or they're invisible.
  const drainCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('session_coordination')
    .update({ target_session: sessionId })
    .eq('target_session', 'broadcast-coordinator')
    .gte('created_at', drainCutoff);

  const { data: row } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();

  const merged = {
    ...(row?.metadata || {}),
    is_coordinator: true,
    coordinator_since: new Date().toISOString()
  };

  await supabase
    .from('claude_sessions')
    .update({ metadata: merged })
    .eq('session_id', sessionId);
}

async function clearActiveCoordinator(supabase, sessionId) {
  try {
    if (fs.existsSync(ACTIVE_COORDINATOR_FILE)) fs.unlinkSync(ACTIVE_COORDINATOR_FILE);
  } catch { /* ignore */ }

  if (!supabase || !sessionId) return;
  const { data: row } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!row) return;

  const next = { ...(row.metadata || {}) };
  delete next.is_coordinator;
  delete next.coordinator_since;

  await supabase
    .from('claude_sessions')
    .update({ metadata: next })
    .eq('session_id', sessionId);
}

module.exports = {
  ACTIVE_COORDINATOR_FILE,
  STALE_THRESHOLD_MIN,
  getActiveCoordinatorId,
  setActiveCoordinator,
  clearActiveCoordinator,
  // exported for tests
  readPointerFile,
  writePointerFile,
  // SD-LEO-INFRA-COMPLETE-TWO-WAY-001 (additive, default-OFF) — exported for tests
  isTwoWayV2Enabled,
  pickCanonicalCoordinator,
  electCoordinatorFromDb
};
