// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1
// Coordinator identity resolution: file-first, DB fallback.
// Workers call getActiveCoordinatorId() to find a coordinator session_id; the coordinator
// calls setActiveCoordinator() at /coordinator start and clearActiveCoordinator() at stop.

const fs = require('fs');
const path = require('path');
const os = require('os');
// QF-20260727-862: nil-UUID guard, applied at both the identity write-path and the election.
const { NIL_UUID, isNilUuid, isUsableSessionId } = require('./session-id-guard.cjs');

const STALE_THRESHOLD_MIN = 10;
// SD-LEO-FIX-ENF-TRUSTS-FILE-001: under vitest, redirect to a per-process fixture path so the
// unit suite can never read/write/delete the real coordinator pointer file. Per-PID (not a bare
// shared tmpdir file) because pool:forks runs resolve.test.js, coordinator-flag-rpc-fallback.test.js,
// and session-role-orient.test.js in separate concurrent OS processes that would otherwise race a
// shared fixture the same way they raced the real file. Truthy check (not === 'true') matches the
// dominant process.env.VITEST idiom elsewhere in this codebase.
const ACTIVE_COORDINATOR_FILE = process.env.VITEST
  ? path.join(os.tmpdir(), `leo-coord-test-${process.pid}`, 'active-coordinator.json')
  : path.resolve(__dirname, '../../.claude/active-coordinator.json');

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

/**
 * QF-20260727-391 (writer half). readPointerFile validates on the way OUT; this validates on the way
 * IN, so the malformed shape cannot be produced at all. Fixing only the reader leaves the next
 * caller free to re-create the corrupt file and repairs the symptom rather than the cause.
 *
 * The specific shape that caused the incident is a caller passing the id itself
 * (writePointerFile(sessionId)) instead of the object — that lands as a bare JSON string, which is
 * TRUTHY to every un-validating reader. THROWS rather than silently coercing: a coordinator whose
 * pointer write is wrong should fail loudly at startup, not leave a file that quietly tells the
 * whole fleet SOLO. All three production call sites already pass {session_id: <string>, …}, so this
 * is unreachable for correct callers.
 */
function writePointerFile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.session_id !== 'string' || payload.session_id.length === 0) {
    throw new TypeError(
      'writePointerFile: payload must be an object with a non-empty string session_id '
      + `(got ${Array.isArray(payload) ? 'array' : typeof payload}). `
      + 'Passing the session id directly writes a bare JSON string, which is truthy to readers and '
      + 'shadows the DB fallback — see QF-20260727-391.'
    );
  }
  fs.mkdirSync(path.dirname(ACTIVE_COORDINATOR_FILE), { recursive: true });
  fs.writeFileSync(ACTIVE_COORDINATOR_FILE, JSON.stringify(payload, null, 2));
}

async function queryDbForCoordinator(supabase) {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
  const { data, error } = await supabase
    .from('claude_sessions')
    .select(COORDINATOR_ROW_COLUMNS)
    .gte('heartbeat_at', cutoff)
    .filter('metadata->>is_coordinator', 'eq', 'true')
    .order('heartbeat_at', { ascending: false })
    // QF-20260727-259: was .limit(1). A ghost with a freshly-stamped heartbeat sorts FIRST, so
    // limit-1 would return the ghost and the guard below would leave us with nothing. Take a
    // small window instead and return the freshest row an actual process backs.
    .limit(10);

  if (error || !data || data.length === 0) return null;
  return data.find(r => !isGhostSessionRow(r)) || null;
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

// QF-20260727-259: process-backed guard on coordinator resolution.
// INCIDENT (2026-07-27T02:00:08Z): claude_sessions row 00000000-0000-0000-0000-000000000000 —
//   minted 2026-06-23, STALE_CLEANUP-released the same day, and never once backed by a process
//   (pid NULL, last_tool_at NULL) — was stamped is_coordinator=true. set_coordinator_flag also
//   bumps heartbeat_at=now() and status='active', so the ghost satisfied BOTH election
//   predicates, and its fresh coordinator_since beat the live coordinator's on the
//   coordinator_since DESC sort. It won deterministically and every worker signal routed to a
//   session no process has ever backed (worker-signal.cjs "can no longer reach you").
// Liveness was never a predicate of the election — only the flag and heartbeat freshness, and
//   the write-path RPC manufactures both. The guard therefore lives on the READ side, so it
//   holds regardless of which writer stamps the flag (incl. direct DB writes).
// NOT electable:
//   - the all-zero UUID: never a real Claude session id, so this can have no false positive;
//   - a row no process has ever backed (last_tool_at NULL and pid NULL) that is older than
//     NEVER_ALIVE_GRACE_MIN.
// The grace window preserves set_coordinator_flag's create-if-absent path: a genuinely new
//   coordinator's row is seconds old and has not yet run a tool, so it stays electable.
// FAIL-OPEN: a row that does not carry the liveness columns (narrow SELECTs, test fixtures)
//   means "cannot tell" → electable. A guard that cannot see the constraint never excludes.
const NIL_SESSION_ID = '00000000-0000-0000-0000-000000000000';
const NEVER_ALIVE_GRACE_MIN = 15;

function isGhostSessionRow(row, nowMs = Date.now()) {
  if (!row) return false;
  if (row.session_id === NIL_SESSION_ID) return true;
  // Only judge liveness when the row actually carries the liveness columns (fail-open).
  if (!('last_tool_at' in row) || !('pid' in row) || !row.created_at) return false;
  if (row.last_tool_at || row.pid !== null) return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && nowMs - created > NEVER_ALIVE_GRACE_MIN * 60_000;
}

// The column set every coordinator-resolution read must request, so isGhostSessionRow can
// actually see the liveness columns rather than fail-open on every row.
const COORDINATOR_ROW_COLUMNS = 'session_id, heartbeat_at, metadata, last_tool_at, pid, created_at';

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
    // QF-20260727-259: a process-less ghost is never a candidate. This is the shared chokepoint
    // for BOTH the election and setActiveCoordinator's retire snapshot, so a ghost can neither
    // win resolution nor make the live coordinator defer its retire as a phantom "winner".
    //
    // QF-20260727-862 (merge, Alpha-5): BOTH guards are kept because neither subsumes the other.
    // isGhostSessionRow catches a process-less row that 862 does not; isUsableSessionId rejects an
    // empty/whitespace id and is trim+lowercase tolerant on the nil UUID, whereas the ghost check
    // compares session_id EXACTLY, so a padded or upper-cased nil would slip past it. Dropping
    // either side silently reopens the bug the other one closed.
    .filter(r => r && typeof r.session_id === 'string'
      && !isGhostSessionRow(r)
      && isUsableSessionId(r.session_id))
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
      .select(COORDINATOR_ROW_COLUMNS)
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

/**
 * QF-20260727-862: single sanitizing choke-point over EVERY resolution path below — the pointer
 * file, the legacy DB scan and the self-ID handshake all return a session_id directly, bypassing
 * pickCanonicalCoordinator. Null makes callers fall back to the `broadcast-coordinator` sentinel,
 * which IS drained and IS visible; a nil UUID is neither. Degrade loudly, never silently.
 */
async function getActiveCoordinatorId(supabase) {
  const resolved = await resolveActiveCoordinatorId(supabase);
  if (isNilUuid(resolved)) {
    console.warn(`   🚨 [COORD_NIL_UUID] coordinator resolved to the nil UUID (${NIL_UUID}) — an unbacked ghost row is flagged as coordinator. Treating as NO live coordinator so this message buffers on the broadcast sentinel instead of being written somewhere invisible. See QF-20260727-862.`);
    return null;
  }
  return resolved;
}

async function resolveActiveCoordinatorId(supabase) {
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
      .select(COORDINATOR_ROW_COLUMNS)
      .eq('session_id', pointer.session_id)
      .gte('heartbeat_at', cutoff)
      .maybeSingle();
    // QF-20260727-862 (merge, Alpha-5): warn BEFORE 259's ghost guard swallows this case. The
    // guard below correctly refuses to resolve a nil pointer, but it does so silently — and a
    // pointer file naming the nil UUID means CLAUDE_SESSION_ID was unset at some writer's call
    // site, which an operator needs to SEE rather than have quietly routed around. 862's
    // requirement was to degrade LOUDLY; 259's was to not resolve. Both hold here.
    if (isNilUuid(pointer.session_id)) {
      console.warn(`   🚨 [COORD_NIL_UUID] coordinator pointer file holds the nil UUID (${NIL_UUID}) — an unbacked ghost row is flagged as coordinator. Treating as NO live coordinator so this message buffers on the broadcast sentinel instead of being written somewhere invisible. See QF-20260727-862.`);
    }
    // QF-20260727-259: the third resolution path needs the same guard as the other two — a
    // pointer file written for a ghost must not resolve just because the file says so.
    if (row && !isGhostSessionRow(row)) return pointer.session_id;
    // file is stale or points at a ghost; fall through to DB scan
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

  // QF-20260727-088: a promoted session must not keep a worker callsign. This write already
  // read-merge-writes the whole metadata object, so dropping the key here costs no extra
  // round trip and covers BOTH callers (the FLAG-OFF path and the FLAG-ON RPC fallback).
  delete merged.fleet_identity;

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

// QF-20260727-088 (belt-and-braces half of QF-20260727-205): drop a stale worker callsign when a
// session is promoted to coordinator, so the contradictory pair (metadata.fleet_identity.callsign
// + is_coordinator) cannot persist at all. The pair arises because assign-fleet-identities.cjs
// stamps any live worker-cohort session and its filterOutCoordinators() can only exclude rows
// ALREADY flagged is_coordinator — a /coordinator start whose priming outlasts one 5-min identity
// tick opens the window.
//
// The FLAG-ON path registers via the atomic set_coordinator_flag RPC (jsonb `||`), which cannot
// also DELETE a key, and adding an RPC would need a chairman-gated migration — out of scope here.
// So this is a JS read-merge-write, made safe by writing NOTHING in the common case: if there is
// no stale stamp we never issue an UPDATE, so the narrow lost-update window only exists on the
// rare promotion that actually has a callsign to clear. FAIL-OPEN — never throws, never blocks
// coordinator startup.
async function clearFleetIdentityFromSession(supabase, sessionId) {
  if (!supabase || !sessionId) return;
  try {
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();

    const metadata = row?.metadata;
    if (!metadata || metadata.fleet_identity === undefined) return; // nothing stale → no write

    const { fleet_identity: _stale, ...rest } = metadata;
    // UPDATE (not upsert): this only ever strips a key off an existing row.
    const { error } = await supabase
      .from('claude_sessions')
      .update({ metadata: rest })
      .eq('session_id', sessionId);
    if (error) {
      console.warn(`   ⚠️  [COORD_IDENTITY_CLEAR_FAILED] clearFleetIdentityFromSession(${sessionId}): ${error.message} (non-fatal; stale callsign persists)`);
    }
  } catch (e) {
    console.warn(`   ⚠️  [COORD_IDENTITY_CLEAR_THREW] clearFleetIdentityFromSession(${sessionId}): ${(e && e.message) || e} (non-fatal)`);
    /* fail-open — an identity cleanup MUST NOT interrupt coordinator registration */
  }
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

/**
 * QF-20260813-683: idempotently re-stamp THIS session's metadata.is_coordinator=true, without
 * touching drain/retire/succession/pointer-file state (unlike the full setActiveCoordinator).
 * Extracted from setActiveCoordinator's own Step 2 below (byte-identical behavior, now shared)
 * so a recurring cadence script can self-heal the flag if it silently drops mid-session —
 * observed live: an active 17h+ coordinator lost metadata.is_coordinator with no traced write
 * path, causing adam-coordinator-health.mjs's coordinator_liveness probe to false-negative as
 * no_coordinator_row even though the file-based active-coordinator.json pointer stayed intact.
 * FAIL-OPEN: never throws.
 * @param {object} supabase
 * @param {string} sessionId
 */
async function refreshCoordinatorFlag(supabase, sessionId) {
  try {
    const { error: setErr } = await supabase.rpc('set_coordinator_flag', { p_session_id: sessionId });
    if (setErr) {
      // SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (FR-1): if the RPC is ABSENT (unapplied
      // migration), fall back to the read-merge-write upsert so registration self-heals instead
      // of silently skipping the is_coordinator write.
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
}

async function setActiveCoordinator(supabase, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('setActiveCoordinator: sessionId required');
  }
  // QF-20260727-259 + QF-20260727-862: belt-and-braces on the write side. The read-side guard
  // already refuses to ELECT the nil UUID; refusing to STAMP it stops the ghost being minted at all.
  //
  // Merge note (Alpha-5): 862's isNilUuid() is kept over 259's exact `=== NIL_SESSION_ID` compare
  // because it trims and lower-cases first. The check above PASSES a padded nil (non-empty,
  // well-formed), and an absent CLAUDE_SESSION_ID is exactly how the ghost row was minted, so the
  // tolerant form strictly subsumes the exact one. NIL_SESSION_ID and NIL_UUID are the same literal.
  if (isNilUuid(sessionId)) {
    // Message deliberately names it BOTH ways ("nil session id" and "nil UUID"): 259's and 862's
    // suites each assert on their own phrasing, and the behaviour they describe is identical.
    throw new Error(`setActiveCoordinator: refusing to register the nil session id / nil UUID (${NIL_UUID}) as coordinator — no process can back it, and it wins the election tiebreak. This means CLAUDE_SESSION_ID was unset/null at the call site. See QF-20260727-862.`);
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
  // QF-20260813-683: the atomic-RPC-with-fallback stamp itself now lives in refreshCoordinatorFlag
  // (shared with the recurring cadence self-heal call in coordinator-quiet-tick.mjs) — behavior
  // here is byte-identical to before the extraction.
  await refreshCoordinatorFlag(supabase, sessionId);

  // Step 2b (QF-20260727-088): now that this session is registered as coordinator, drop any stale
  // worker callsign the identity cron stamped on it. Deliberately placed AFTER step 2 and BEFORE
  // step 3 so the FR-1 register-before-retire ordering contract is untouched; the FLAG-OFF path
  // gets the same clear for free inside upsertCoordinatorMetadata. Fail-open (never throws).
  await clearFleetIdentityFromSession(supabase, sessionId);

  // Step 3: retire OTHER incumbent coordinators (metadata-only clear, no pointer touch).
  // Finding 1 (MEDIUM mutual annihilation): a naive `!== sessionId` retire loop means two
  //   coordinators registering CONCURRENTLY each retire the other → 0 holders. Guard with the
  //   canonical election: snapshot all fresh is_coordinator sessions and ONLY retire-others when
  //   THIS session is the canonical winner. If some OTHER fresh holder is canonical, retire NOTHING
  //   (defer — the canonical winner's own call / the next sweep's FR-2 auto-resolve converges).
  //   This matches the SAFE elect-then-clear-all-except-winner pattern used by the FR-2 auto-resolve
  //   in coordination-events.cjs.
  // SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 FR-1: capture the sessions THIS
  // registration actually retires — the succession drain below consumes exactly this
  // list (never re-derives winners), so it can never steal rows from a live canonical
  // incumbent (RISK condition 1: drain strictly gated on the canonical-winner retire).
  const retiredByThisRegistration = [];
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
    // FR-6 GUARD read for the retire loop below — paginated so a capped snapshot can never
    // elect against a partial incumbent set; on read failure retire is DEFERRED (never act
    // on a failed/partial read).
    let incumbents = null;
    try {
      incumbents = await fapPaginate(() => supabase
        .from('claude_sessions')
        .select(COORDINATOR_ROW_COLUMNS)
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
            retiredByThisRegistration.push(inc.session_id);
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

  // Step 3b (SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001): succession — drain the
  // retired predecessors' UNREAD directed rows to this session (the drainAdamOutbound
  // pattern generalized; previously only the broadcast-coordinator sentinel drained, so
  // predecessor-directed rows dead-lettered — 16 in 14 days per Solomon e72dad97 C1),
  // close their tenure rows (end_cause='takeover'), open ours, run the tables canary,
  // and surface open follow-ons inherited from prior coordinators. Entirely fail-open
  // and flag-gated (COORD_SUCCESSION_V1) — registration NEVER blocks on succession.
  try {
    const succession = require('./succession.cjs');
    if (succession.isSuccessionEnabled()) {
      await succession.assertSuccessionTablesExist(supabase);
      if (retiredByThisRegistration.length) {
        const d = await succession.drainCoordinatorOutbound(supabase, { newSessionId: sessionId, oldSessionIds: retiredByThisRegistration });
        console.log(`   [COORD_SUCCESSION] drained ${d.moved} unread row(s) from retired predecessor(s) ${retiredByThisRegistration.join(', ')}${d.error ? ` (warn: ${d.error})` : ''}`);
        await succession.closeTenure(supabase, { sessionIds: retiredByThisRegistration, endCause: 'takeover', endedBy: sessionId });
      }
      await succession.openTenure(supabase, { sessionId });
      const fo = await succession.listOpenFollowOns(supabase, {});
      if (Array.isArray(fo.items) && fo.items.length) {
        console.log(`   [COORD_SUCCESSION] inherited ${fo.items.length} open follow-on(s):`);
        for (const f of fo.items.slice(0, 10)) console.log(`     • [${f.kind || 'follow-on'}] ${f.subject} (from ${String(f.created_by_session).slice(0, 8)})`);
      }
    }
  } catch (e) {
    console.warn(`   ⚠️  [COORD_SUCCESSION_THREW] ${(e && e.message) || e} (non-fatal — succession MUST NOT interrupt registration)`);
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
  // QF-20260727-862 — nil-UUID guard, re-exported so callers/tests reach it from the resolver.
  NIL_UUID,
  isNilUuid,
  isUsableSessionId,
  getActiveCoordinatorId,
  setActiveCoordinator,
  refreshCoordinatorFlag,
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
  // QF-20260727-259 (process-backed election guard) — exported for tests and for any other
  // resolver that needs the same "is this row backed by a real process?" predicate.
  isGhostSessionRow,
  NIL_SESSION_ID,
  NEVER_ALIVE_GRACE_MIN,
  COORDINATOR_ROW_COLUMNS,
  // SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 (defense-in-depth) — exported for the
  // startup/CI canary and tests.
  isFunctionNotFoundError,
  upsertCoordinatorMetadata,
  assertCoordinatorRpcsExist,
  // QF-20260727-088 (belt-and-braces stale-callsign clear) — exported for tests.
  clearFleetIdentityFromSession
};
