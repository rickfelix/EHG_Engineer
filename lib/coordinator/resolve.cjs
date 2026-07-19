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

// SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B: graduates ADAM_SOLOMON_TWOWAY_V1 from a
// doc-only placeholder (docs/architecture/solomon-activation-runbook.md Stage C) to a real gate.
// Shared by both scripts/adam-advisory.cjs and scripts/solomon-advisory.cjs's --to option so the
// two directions can never drift onto different flag semantics.
// QF-20260705-488: default flipped ON (chairman-directed, on record 2026-07-05) — the OFF default
// forced the chairman to hand-relay Solomon consult answer d7f5401c into Adam's session after
// Adam's `--to solomon` hard-errored on the gate. Direct Adam<->Solomon is now the default;
// ADAM_SOLOMON_TWOWAY_V1=off remains the explicit kill switch (any other value, incl. unset, = on).
function isAdamSolomonTwoWayV1Enabled() {
  return process.env.ADAM_SOLOMON_TWOWAY_V1 !== 'off';
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

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: election/retire snapshots are GUARD
// reads for coordinator-identity decisions — a read silently capped at the PostgREST
// 1000-row max could elect against a partial holder set. Paginate to completion; every
// call site keeps its pre-existing fail-open policy (fetchAllPaginated throws → caught).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 / FR-3+FR-4: DB-canonical election.
// Fetch ALL fresh is_coordinator sessions (not limit-1) and elect a single
// winner. Returns a session_id or null. Fail-open (GG-5): any error returns null
// so the caller falls back to the legacy file-first chain; this function never
// throws and never mutates is_coordinator (GG-6, read-only resolution).
async function electCoordinatorFromDb(supabase) {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .gte('heartbeat_at', cutoff)
      .filter('metadata->>is_coordinator', 'eq', 'true')
      .order('session_id')); // unique-key tiebreaker for stable pagination
    if (!Array.isArray(data) || data.length === 0) return null;
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

// SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (defense-in-depth, no DDL):
// True when an error means the RPC itself is ABSENT (function not found), as opposed to
// a runtime error inside an existing RPC. PostgREST surfaces a missing function as code
// PGRST202; a direct Postgres call surfaces it as SQLSTATE 42883 (undefined_function).
// Message-regex is the belt-and-suspenders fallback for clients that don't set .code.
function isFunctionNotFoundError(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === 'PGRST202' || code === '42883') return true;
  const msg = (err.message || '').toLowerCase();
  return /could not find the function/.test(msg) || /function .* does not exist/.test(msg);
}

// SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001: the read-merge-write upsert that the
// FLAG-OFF path uses, factored out so the FLAG-ON path can fall back to it when the atomic
// set_coordinator_flag RPC is absent. It lacks the RPC's in-DB jsonb-`||` atomicity (a
// concurrent sibling-key write could be clobbered in the narrow read→write window) — that is
// an ACCEPTABLE trade for a never-block-startup safety net when the migration is unapplied.
async function upsertCoordinatorMetadata(supabase, sessionId) {
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

  // UPSERT so the row is created if absent (SD-FDBK-INFRA-COORDINATOR-IDENTITY-SILENTLY-001).
  await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      metadata: merged,
      heartbeat_at: new Date().toISOString(),
      status: 'active'
    }, { onConflict: 'session_id' });
}

// SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (FR-2): loud canary for the unapplied-migration
// class. A chairman-gated additive migration (e.g. 20260614_role_handoff_atomic_coordinator_flag.sql)
// can merge-without-apply and stay invisible until a flag-ON path hits the missing RPC and fails
// open. This read-only pg_proc existence check turns that silent fail-open into a loud warning at
// startup/CI. Returns { ok: true|false|null, missing: string[], reason }. NEVER throws (fail-open).
async function assertCoordinatorRpcsExist(supabase) {
  const required = ['set_coordinator_flag', 'clear_coordinator_flag'];
  if (!supabase) return { ok: null, missing: [], reason: 'no_supabase_client' };
  try {
    // exec_sql returns [{ result: [...] }] (canonical shape, mirrors leo-create-sd.js).
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: "SELECT proname FROM pg_proc WHERE proname IN ('set_coordinator_flag','clear_coordinator_flag')"
    });
    if (error) {
      console.warn(`   ⚠️  [COORD_RPC_ASSERT_SKIPPED] could not verify coordinator RPCs (exec_sql: ${error.message}) (non-fatal)`);
      return { ok: null, missing: [], reason: error.message };
    }
    // Distinguish "RPC genuinely absent" from "couldn't parse exec_sql's response": only treat
    // a well-formed result array as authoritative. A misshapen response → ok:null (can't verify),
    // NOT a false-positive 🚨 COORD_RPC_MISSING (don't cry wolf).
    const rows = data?.[0]?.result;
    if (!Array.isArray(rows)) {
      console.warn(`   ⚠️  [COORD_RPC_ASSERT_SKIPPED] unexpected exec_sql response shape; cannot verify coordinator RPCs (non-fatal)`);
      return { ok: null, missing: [], reason: 'unexpected_exec_sql_shape' };
    }
    const present = new Set(rows.map((r) => r && r.proname));
    const missing = required.filter((name) => !present.has(name));
    if (missing.length) {
      console.warn(`   🚨 [COORD_RPC_MISSING] coordinator write-path RPC(s) absent in pg_proc: ${missing.join(', ')} — the atomic-coordinator-flag migration (20260614_role_handoff_atomic_coordinator_flag.sql) appears UNAPPLIED. Coordinator registration is running on the read-merge-write fallback (no atomicity). Apply the migration to restore the atomic path.`);
      return { ok: false, missing };
    }
    return { ok: true, missing: [] };
  } catch (e) {
    console.warn(`   ⚠️  [COORD_RPC_ASSERT_THREW] ${(e && e.message) || e} (non-fatal)`);
    return { ok: null, missing: [], reason: (e && e.message) || String(e) };
  }
}

async function setActiveCoordinator(supabase, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('setActiveCoordinator: sessionId required');
  }

  // SD-LEO-INFRA-ROLE-SESSION-NAMING-001: give this coordinator session a stable status-line NAME
  // (covers both the flag-on and flag-off paths below). Fail-soft — never block coordinator startup.
  try {
    const { writeRoleStatusIdentity } = require('../fleet/role-status-identity.cjs');
    writeRoleStatusIdentity({ sessionId, role: 'coordinator' });
  } catch { /* status-line naming is best-effort */ }

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

    // SD-FDBK-INFRA-COORDINATOR-IDENTITY-SILENTLY-001: UPSERT so row is created if absent.
    // SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001: shared read-merge-write helper.
    await upsertCoordinatorMetadata(supabase, sessionId);

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

  // Step 0 (SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 FR-2): loud startup canary — warn
  // if the coordinator write-path RPCs are absent (unapplied migration) BEFORE we hit them.
  // Read-only, fail-open; never blocks startup.
  await assertCoordinatorRpcsExist(supabase);

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
      // SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (FR-1): if the RPC is ABSENT (unapplied
      // migration), fall back to the read-merge-write upsert so startup self-registers instead of
      // silently skipping the is_coordinator write and tripping the Step 6 registration gate.
      if (isFunctionNotFoundError(setErr)) {
        console.warn(`   ⚠️  [COORD_REGISTER_FALLBACK] set_coordinator_flag RPC absent (${setErr.message}); using read-merge-write upsert (no atomicity — apply the atomic-coordinator-flag migration) (non-fatal)`);
        await upsertCoordinatorMetadata(supabase, sessionId);
      } else {
        console.warn(`   ⚠️  [COORD_REGISTER_FAILED] set_coordinator_flag(${sessionId}): ${setErr.message} (non-fatal)`);
      }
    }
  } catch (e) {
    // A THROW (not a returned error) on a missing RPC also routes to the fallback.
    if (isFunctionNotFoundError(e)) {
      console.warn(`   ⚠️  [COORD_REGISTER_FALLBACK] set_coordinator_flag RPC absent (${(e && e.message) || e}); using read-merge-write upsert (no atomicity) (non-fatal)`);
      try { await upsertCoordinatorMetadata(supabase, sessionId); } catch (e2) {
        console.warn(`   ⚠️  [COORD_REGISTER_FALLBACK_THREW] ${(e2 && e2.message) || e2} (non-fatal)`);
      }
    } else {
      console.warn(`   ⚠️  [COORD_REGISTER_THREW] set_coordinator_flag(${sessionId}): ${(e && e.message) || e} (non-fatal)`);
    }
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
    // FR-6 GUARD read for the retire loop below — paginated so a capped snapshot can never
    // elect against a partial incumbent set; on read failure retire is DEFERRED (never act
    // on a failed/partial read).
    let incumbents = null;
    try {
      incumbents = await fapPaginate(() => supabase
        .from('claude_sessions')
        .select('session_id, heartbeat_at, metadata')
        .gte('heartbeat_at', cutoff)
        .filter('metadata->>is_coordinator', 'eq', 'true')
        .order('session_id')); // unique-key tiebreaker for stable pagination
    } catch (snapErr) {
      console.warn(`   ⚠️  [COORD_RETIRE_SNAPSHOT_FAILED] GUARD_UNAVAILABLE: ${(snapErr && snapErr.message) || snapErr} (non-fatal; deferring retire)`);
    }
    if (Array.isArray(incumbents) && incumbents.length > 1) {
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
  // SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-B (additive, default-OFF) — exported for
  // both adam-advisory.cjs / solomon-advisory.cjs and tests
  isAdamSolomonTwoWayV1Enabled,
  pickCanonicalCoordinator,
  electCoordinatorFromDb,
  // SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (defense-in-depth) — exported for the
  // startup/CI canary and tests.
  isFunctionNotFoundError,
  upsertCoordinatorMetadata,
  assertCoordinatorRpcsExist
};
