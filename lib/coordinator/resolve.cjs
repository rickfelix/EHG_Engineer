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

async function getActiveCoordinatorId(supabase) {
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
  writePointerFile
};
