// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1
// Coordinator identity resolution: file-first, DB fallback.
// Workers call getActiveCoordinatorId() to find a coordinator session_id; the coordinator
// calls setActiveCoordinator() at /coordinator start and clearActiveCoordinator() at stop.

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_THRESHOLD_MIN = 10;
const ACTIVE_COORDINATOR_FILE = path.resolve(__dirname, '../../.claude/active-coordinator.json');

function readPointerFile(file = ACTIVE_COORDINATOR_FILE) {
  // SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 FR-7: optional file arg for test
  // injectability; defaults to ACTIVE_COORDINATOR_FILE so existing callers are byte-identical.
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
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
  if (row) return row.session_id;

  // 3) SD-LEO-INFRA-ADD-PART-MUTUAL-001 (default-OFF): every flag-based path above
  //    returned null. Before concluding "no coordinator," fall back to the 3-part
  //    self-ID handshake — it discovers a live coordinator that self-identified via
  //    a self_id_reply even when is_coordinator was never set (the post-restart gap),
  //    and otherwise broadcasts a discovery request so the live coordinator's tick
  //    replies + re-registers (self-heal). Flag stays PRIMARY; this is fallback-only.
  //    Guarded by the flag at THIS scope so flag-OFF is byte-identical (no new require,
  //    no new query). Lazy-require avoids a circular dependency with self-id-handshake.
  //    Fail-open: any error falls through to the legacy null return.
  if (String(process.env.COORD_SELF_ID_V1 ?? 'false').toLowerCase() !== 'false') {
    try {
      const { discoverCoordinatorViaHandshake } = require('./self-id-handshake.cjs');
      const viaHandshake = await discoverCoordinatorViaHandshake(
        supabase,
        process.env.CLAUDE_SESSION_ID || null,
      );
      if (viaHandshake) return viaHandshake;
    } catch { /* fail-open — fall through to null */ }
  }
  return null;
}

async function setActiveCoordinator(supabase, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('setActiveCoordinator: sessionId required');
  }

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / FR-1: register-before-retire ordering.
  // Under flag-ON: (1) drain → (2) upsert NEW holder → (3) retire incumbents → (4) write pointer.
  // Under flag-OFF: legacy order is (1) write pointer → (2) drain → (3) upsert NEW holder.
  // The flag-OFF pointer write is kept BEFORE the DB upsert to preserve byte-identical legacy
  // behavior for existing callers.

  if (!isTwoWayV2Enabled()) {
    // ---- FLAG-OFF: legacy order (byte-identical to pre-FR-1 behavior) ----
    writePointerFile({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      host: os.hostname()
    });

    if (!supabase) return;

    // QF-20260504-964 FIX 2: drain broadcast-coordinator buffer to this session.
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

    // SD-FDBK-INFRA-COORDINATOR-IDENTITY-SILENTLY-001: UPSERT so row is created if absent.
    await supabase
      .from('claude_sessions')
      .upsert({
        session_id: sessionId,
        metadata: merged,
        heartbeat_at: new Date().toISOString(),
        status: 'active'
      }, { onConflict: 'session_id' });

    return;
  }

  // ---- FLAG-ON: register-before-retire (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A FR-1) ----
  // Invariant: never a 0-holder instant (new registered before any retire),
  //            never 2 left (all incumbents retired after new is durable).

  if (!supabase) {
    // No DB — fall back to pointer write only (best-effort).
    writePointerFile({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      host: os.hostname()
    });
    return;
  }

  // Step 1: drain broadcast-coordinator buffer (unchanged).
  const drainCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('session_coordination')
    .update({ target_session: sessionId })
    .eq('target_session', 'broadcast-coordinator')
    .gte('created_at', drainCutoff);

  // Step 2: register the NEW holder as coordinator FIRST (durable DB registration).
  // Finding 2 (HIGH lost-update race): use the ATOMIC `set_coordinator_flag(p_session_id)` RPC
  //   (single in-DB UPSERT with jsonb `||`) instead of a JS read-merge-write on the whole metadata
  //   object — concurrent writers must not clobber each other's sibling keys.
  // Finding 3 (LOW observability): capture {error} and console.warn so a failed singleton-identity
  //   register is observable. FAIL-OPEN: never throw.
  try {
    const { error: setErr } = await supabase.rpc('set_coordinator_flag', { p_session_id: sessionId });
    if (setErr) {
      console.warn(`   ⚠️  [COORD_REGISTER_FAILED] set_coordinator_flag(${sessionId}): ${setErr.message} (non-fatal)`);
    }
  } catch (e) {
    console.warn(`   ⚠️  [COORD_REGISTER_THREW] set_coordinator_flag(${sessionId}): ${(e && e.message) || e} (non-fatal)`);
    /* fail-open */
  }

  // Step 3: retire OTHER incumbent coordinators (metadata-only clear, no pointer touch).
  // Finding 1 (MEDIUM mutual annihilation): a naive `!== sessionId` retire loop means two
  //   coordinators registering CONCURRENTLY each retire the other → 0 holders. Guard with the
  //   canonical election: snapshot all fresh is_coordinator sessions and ONLY retire-others when
  //   THIS session is the canonical winner. If some OTHER fresh holder is canonical, retire NOTHING
  //   (defer — the canonical winner's own call / the next sweep's FR-2 auto-resolve converges).
  //   This matches the SAFE elect-then-clear-all-except-winner pattern used by the FR-2 auto-resolve
  //   in coordination-events.cjs.
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
    const { data: incumbents, error: snapErr } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .gte('heartbeat_at', cutoff)
      .filter('metadata->>is_coordinator', 'eq', 'true');
    if (snapErr) {
      console.warn(`   ⚠️  [COORD_RETIRE_SNAPSHOT_FAILED] ${snapErr.message} (non-fatal; deferring retire)`);
    } else if (Array.isArray(incumbents) && incumbents.length > 1) {
      const winner = pickCanonicalCoordinator(incumbents);
      // Only retire others if THIS session is the canonical winner. Otherwise defer (Finding 1).
      if (winner && winner.session_id === sessionId) {
        for (const inc of incumbents) {
          if (inc.session_id !== sessionId) {
            // clearCoordinatorFlagFromSession is already fail-open; wrap for belt-and-suspenders.
            try { await clearCoordinatorFlagFromSession(supabase, inc.session_id); } catch { /* fail-open */ }
          }
        }
      } else if (winner) {
        console.warn(`   ⚠️  [COORD_REGISTER_DEFER_RETIRE] this session ${sessionId} is not the canonical winner (${winner.session_id}); deferring retire to avoid mutual annihilation (non-fatal)`);
      }
    }
    // ≤1 incumbent (only us) → nothing to retire.
  } catch (e) {
    console.warn(`   ⚠️  [COORD_RETIRE_THREW] ${(e && e.message) || e} (non-fatal — retire MUST NOT interrupt the caller)`);
    /* fail-open — retire errors MUST NOT throw or interrupt the caller */
  }

  // Step 4: write pointer LAST (after DB register + retire) so the file always points at
  // a session that already has a DB row, and is never deleted by the retire loop above.
  writePointerFile({
    session_id: sessionId,
    started_at: new Date().toISOString(),
    host: os.hostname()
  });
}

// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / FR-1 + Finding 2 (atomic) + Finding 3 (observe):
// Metadata-only clear — NO pointer-file touch. Used for retiring incumbent
// coordinators without destroying the new holder's pointer file.
//
// Finding 2 (HIGH lost-update race): use the ATOMIC `clear_coordinator_flag(p_session_id)` RPC
//   (a single in-DB UPDATE with jsonb `-`, defined in
//   database/migrations/20260614_role_handoff_atomic_coordinator_flag.sql) instead of a JS
//   read-modify-write on the whole metadata object — the JS path could clobber a concurrent
//   write / resurrect a retired coordinator.
// Finding 3 (LOW observability): capture the RPC {error} and console.warn (with the session_id)
//   on failure so a swallowed singleton-identity write is observable. Still FAIL-OPEN: never throw.
async function clearCoordinatorFlagFromSession(supabase, sessionId) {
  if (!supabase || !sessionId) return;
  try {
    const { error } = await supabase.rpc('clear_coordinator_flag', { p_session_id: sessionId });
    if (error) {
      console.warn(`   ⚠️  [COORD_RETIRE_FAILED] clear_coordinator_flag(${sessionId}): ${error.message} (non-fatal; 2-holder risk)`);
    }
  } catch (e) {
    console.warn(`   ⚠️  [COORD_RETIRE_THREW] clear_coordinator_flag(${sessionId}): ${(e && e.message) || e} (non-fatal; 2-holder risk)`);
    /* fail-open — never throw */
  }
}

async function clearActiveCoordinator(supabase, sessionId, opts = {}) {
  // SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 FR-7: optional opts.pointerFile for test
  // injectability; defaults to ACTIVE_COORDINATOR_FILE so existing 2-arg callers are byte-identical.
  const pointerFile = (opts && opts.pointerFile) || ACTIVE_COORDINATOR_FILE;
  try {
    if (fs.existsSync(pointerFile)) fs.unlinkSync(pointerFile);
  } catch { /* ignore */ }

  // Delegate the metadata-only clear to the shared helper (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A).
  await clearCoordinatorFlagFromSession(supabase, sessionId);
}

module.exports = {
  ACTIVE_COORDINATOR_FILE,
  STALE_THRESHOLD_MIN,
  getActiveCoordinatorId,
  setActiveCoordinator,
  clearActiveCoordinator,
  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A (additive, flag-gated) — exported for
  // coordination-events.cjs auto-resolve (FR-2) and tests (TS-1/TS-2/TS-3).
  clearCoordinatorFlagFromSession,
  // exported for tests
  readPointerFile,
  writePointerFile,
  // SD-LEO-INFRA-COMPLETE-TWO-WAY-001 (additive, default-OFF) — exported for tests
  isTwoWayV2Enabled,
  pickCanonicalCoordinator,
  electCoordinatorFromDb
};
