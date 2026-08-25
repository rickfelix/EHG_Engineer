/**
 * Session Register Hook — Ensures session appears in claude_sessions on boot
 *
 * Hook: SessionStart
 * Purpose: Upsert this session into claude_sessions with a fresh heartbeat_at
 *          so the coordinator dashboard sees workers immediately, even before
 *          they claim an SD.
 *
 * Without this, idle workers are invisible to the fleet dashboard until they
 * run sd:next and claim work.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { stampBranch } = require('../../lib/session-writer.cjs');
const { resolveSessionId } = require('../../lib/hooks/session-id.cjs');

/**
 * Detect the current repo context from CWD or CLAUDE_PROJECT_DIR.
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-H
 */
function detectCurrentRepo() {
  try {
    const cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').toLowerCase();
    const registryPath = path.resolve(__dirname, '../../applications/registry.json');
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const apps = Object.values(registry.applications || {}).filter(a => a.local_path);
      // Sort by path length descending so more specific paths match first
      apps.sort((a, b) => (b.local_path || '').length - (a.local_path || '').length);
      for (const app of apps) {
        const appPath = app.local_path.replace(/\\/g, '/').toLowerCase();
        if (cwd === appPath || cwd.startsWith(appPath + '/')) return app.name;
      }
    }
  } catch { /* fallback */ }
  return 'EHG_Engineer';
}

// SD-LEO-INFRA-FIX-SESSION-REGISTER-001: this hook previously carried its own
// getCurrentSessionId() whose marker-file fallback picked the most-recently
// -modified file under .claude/session-identity/*.json with NO hostname/pid
// scoping. When CLAUDE_SESSION_ID was unset in-process (the normal case for
// SessionStart:compact), that let one session's compact-hook read an
// UNRELATED session's marker and upsert its own hostname/tty onto that
// foreign session_id — see RCA 2026-07-12 (session de6e0bfb clobbered by an
// ac499e67 compact-hook race). resolveSessionId() (lib/hooks/session-id.cjs,
// QF-20260504-765/297/749) already solves this correctly: stdin session_id
// (authoritative per-invocation truth from Claude Code itself) first, then
// env, then a PID-scoped marker, and only a bare mtime-newest marker as a
// last resort. Delegating to it here closes the smear at its source instead
// of re-deriving a weaker local heuristic.
async function getCurrentSessionId() {
  const resolved = await resolveSessionId();
  if (resolved) return resolved;

  // Last-resort legacy fallback (pre-dates the shared resolver): scan
  // ~/.claude-sessions for a file whose recorded pid matches this process.
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid || data.session_id?.includes('win' + pid)) {
          return data.session_id;
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}

function getHostname() {
  try {
    return os.hostname();
  } catch {
    return 'unknown';
  }
}

function getTTY() {
  // Derive terminal identifier from PID (matches fleet-dashboard pattern)
  const pid = process.ppid || process.pid;
  return `win-${pid}`;
}

/**
 * QF-20260725-480 — session-creation lifecycle emission was fully decoupled from session
 * creation: across a measured 12-hour window FOUR sessions were created and ZERO emitted
 * SESSION_CREATED, while NINE SESSION_CREATED events fired for sessions created OUTSIDE it.
 *
 * Root cause: this hook is THE creation path for every real Claude Code session, and it
 * upserted claude_sessions without ever emitting a lifecycle event. The only SESSION_CREATED
 * emitter in the tree was lib/session-manager.mjs:474 (a different entry path), and the
 * claim_sd RPC also writes SESSION_CREATED rows — which is why events kept appearing for
 * ALREADY-EXISTING sessions while genuinely new ones emitted nothing. Not canary-specific:
 * a session carrying no account_profile behaved identically.
 *
 * Emission is deliberately conditional on the row having just been INSERTED. This hook also
 * runs on resume/compaction, where the upsert is a heartbeat UPDATE; emitting there would
 * turn SESSION_CREATED into "session touched" and destroy the signal we are restoring.
 *
 * HOW NEWNESS IS DETERMINED, and why it is not a timestamp comparison. The first version of
 * this fix asked "is created_at within N seconds of now?". That is a TIME heuristic for a
 * question that has nothing to do with time, and it has a window: end-to-end acceptance
 * (run the real hook twice for one session) showed the second run emitting a SECOND
 * SESSION_CREATED, because a resume landing inside the window still looked new. The unit
 * tests missed it — they seeded a months-old created_at, which clears any window.
 *
 * So newness is now settled BEFORE the write: probe whether the row already exists, and emit
 * only when it did not. No window, no clock skew, and re-running the hook for an existing
 * session is silent no matter how soon it happens.
 *
 * Fail CLOSED: if the probe itself errored we cannot show the row is new, so we stay silent
 * rather than risk relabelling a heartbeat as a creation. Telemetry must never break session
 * start, so every failure here is swallowed — matching lib/session-manager.mjs.
 */
async function sessionRowExisted(supabase, sessionId) {
  try {
    const { data, error } = await supabase
      .from('claude_sessions').select('session_id').eq('session_id', sessionId).maybeSingle();
    if (error) return { probed: false, existed: true };
    return { probed: true, existed: !!data };
  } catch {
    return { probed: false, existed: true };
  }
}

async function emitSessionCreated(supabase, { sessionId, payload, prior }) {
  try {
    // Unknown or pre-existing both mean "do not emit". Only a confirmed absence qualifies.
    if (!prior || prior.probed !== true || prior.existed !== false) return false;

    await supabase.rpc('log_session_event', {
      p_event_type: 'SESSION_CREATED',
      p_session_id: sessionId,
      p_machine_id: payload.hostname || null,
      p_terminal_id: payload.tty || null,
      p_pid: process.pid,
      p_metadata: {
        codebase: payload.codebase,
        hostname: payload.hostname,
        source: 'session-register-hook'
      }
    });
    return true;
  } catch {
    return false; // telemetry — never abort SessionStart
  }
}

/**
 * QF-20260726-514: capture WHICH ACCOUNT THIS SESSION IS ON, per session, at registration.
 *
 * The only prior instrument was .account-identity-last.json — HOST-GLOBAL and
 * LAST-WRITER-WINS, one email for the whole machine. It answers "which account did this
 * host last see", and the Sessions UI needs "which account is THIS session on". Reading it
 * per-row would render every session with the same account and would look right exactly
 * until the fleet splits across accounts, which is when it matters. So this writes the fact
 * onto the session row instead.
 *
 * `claude auth status --json` is non-interactive and RESPECTS CLAUDE_CONFIG_DIR, which is the
 * load-bearing part: the spawn path already sets childEnv.CLAUDE_CONFIG_DIR per profile
 * (build-session-launch.cjs resolveProfileDir), so each session resolves ITS OWN account.
 * Verified with a control — a nonexistent CLAUDE_CONFIG_DIR returns loggedIn:false, so a
 * positive read is a real signal rather than a constant.
 *
 * Returns null unless we positively identified a logged-in account. We never write a
 * placeholder: a null/unknown account stored as a value would be indistinguishable from a
 * real answer downstream, and this whole defect family is honest values answering the wrong
 * question. Absent is the honest representation of "not determined".
 */
/**
 * QF-20260727-013 — fallback resolver, deliberately reachable ONLY via CLAUDE_CONFIG_DIR.
 *
 * lib/fleet/account-identity.cjs getAccountIdentity() reads ~/.claude.json oauthAccount and
 * works on this host where the CLI returned nulls — which is why coordinator-quiet-tick could
 * print a real account in the same process tree where this path resolved null. Two resolvers,
 * same host, same second, opposite answers.
 *
 * BUT CALLING IT BARE IS THE TRAP, and it is the exact defect QF-20260726-514 was created to
 * fix. With no argument it uses resolveRealConfigPath() = USERPROFILE/.claude.json, which does
 * NOT respect CLAUDE_CONFIG_DIR: host-global, last-writer-wins, every seat reporting the same
 * account. That looks correct right up until the fleet splits across accounts, which is the
 * only time this field matters. So we pass the PATH SEAM explicitly and return null rather
 * than read the host-global default — an unresolved account must stay absent, never guessed.
 *
 * @returns {object|null} same shape as resolveAccountIdentity, or null
 */
function resolveAccountFromConfigDir() {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  if (!dir) return null; // no per-profile scope => refuse; see above
  try {
    const { getAccountIdentity } = require('../../lib/fleet/account-identity.cjs');
    const id = getAccountIdentity(path.join(dir, '.claude.json'));
    if (!id || !id.email) return null;
    return {
      account_email: id.email,
      account_org_name: id.orgName || null,
      account_org_id: null,              // not carried by oauthAccount — absent, not invented
      account_subscription_type: null,   // ditto
      account_auth_method: 'config_dir',
      account_captured_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function resolveAccountIdentity() {
  try {
    // execSync with a single command string, matching lib/simplifier/plugin-bridge.js — the
    // in-repo idiom for invoking this CLI. NOT execFileSync('claude', [...]): on Windows
    // `claude` is a .cmd shim, so that spawn fails ENOENT (measured), and passing an args
    // array with shell:true trips DEP0190. The command is a fixed literal with no
    // interpolation, so there is no injection surface here.
    // Env is INHERITED deliberately — CLAUDE_CONFIG_DIR is what scopes this to THIS session's
    // profile. Overriding or clearing it would silently collapse every seat onto the default
    // account, reintroducing the host-global defect through a different door.
    const { execSync } = require('child_process');
    const raw = execSync('claude auth status --json', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const j = JSON.parse(raw);
    // QF-20260727-013: the CLI can answer loggedIn:true while every identity field is null
    // (measured 2026-07-28: email/orgId/orgName/subscriptionType all null). The guard below is
    // CORRECT to reject that — absent beats a placeholder — but it left the stamp 100% dark.
    // Fall back through the per-profile seam before giving up.
    if (!j || j.loggedIn !== true || !j.email) return resolveAccountFromConfigDir();
    return {
      account_email: j.email,
      account_org_name: j.orgName || null,
      account_org_id: j.orgId || null,
      account_subscription_type: j.subscriptionType || null,
      account_auth_method: j.authMethod || null,
      account_captured_at: new Date().toISOString(),
    };
  } catch {
    // QF-20260727-013: the fallback must be reachable from HERE too, not only from the
    // null-identity branch above. A missing/failing `claude` binary throws rather than
    // returning a null-identity payload, and the original code returned null from this catch
    // without ever consulting the per-profile config — so the seat stayed dark for the one
    // failure mode where an on-disk answer was still available. Caught by its own unit test.
    return resolveAccountFromConfigDir(); // still null-safe; never aborts SessionStart
  }
}

/**
 * Merge the account identity into claude_sessions.metadata, READ-MODIFY-WRITE.
 *
 * A metadata PATCH REPLACES the whole JSONB, and the live row carries model, effort and
 * tier_rank — losing those makes the seat undispatchable. So we never write metadata we
 * could not first read: a failed read means we skip, not that we clobber. Deliberately kept
 * OUT of the upsert payload above for the same reason (that upsert also runs on every resume
 * and compaction, where it would overwrite metadata wholesale).
 *
 * Capture-if-absent: the account for a given session does not change, so re-running the CLI
 * on every resume would spend a subprocess to rewrite the same value.
 */
async function captureAccountIdentity(supabase, sessionId) {
  try {
    const { data, error } = await supabase
      .from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    if (error || !data) return;                       // could not read => do not write
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata : {};
    if (meta.account_email) return;                   // already captured — nothing to do
    const acct = resolveAccountIdentity();
    if (!acct) {
      // QF-20260727-013: RECORD THE DARKNESS. Leaving the identity keys absent is still right —
      // a null account stored as a value is indistinguishable from a real answer downstream.
      // But absent-because-unresolved and absent-because-never-asked were ALSO indistinguishable,
      // and that is why a 100%-dark instrument survived unnoticed from 2026-07-26: nothing said
      // it was dark. This key answers only "did we ask and fail", so the identity fields keep
      // their honest absence while the failure itself stops being silent.
      await supabase.from('claude_sessions')
        .update({ metadata: { ...meta, account_unresolved_at: new Date().toISOString() } })
        .eq('session_id', sessionId);
      return;
    }
    await supabase.from('claude_sessions')
      .update({ metadata: { ...meta, ...acct } })
      .eq('session_id', sessionId);
  } catch {
    // telemetry — never abort SessionStart
  }
}

/**
 * SD-LEO-INFRA-SESSION-TICK-CLEAR-001 (FR-1) — stamp this session's cc_parent_pid into its own
 * metadata, additively, at every SessionStart. This is the durable, marker-INDEPENDENT half of
 * the fix: closeRotatedOutSessions' DB-join fallback (below) reads this field directly from
 * claude_sessions, so a rotated-out session stays discoverable even after its tick marker file
 * has been deleted (by a sibling daemon's unconditional deleteMarker(), or an orphan-sweep) --
 * the exact recurrence this SD closes (Solomon advisory a58e7151).
 *
 * Read-modify-merge, matching captureAccountIdentity()'s pattern immediately above: never a bare
 * `metadata: {...}` upsert, which would clobber any other keys already on the row.
 */
async function stampCcParentPid(supabase, sessionId, parentPid) {
  try {
    if (parentPid === undefined || parentPid === null) return;
    const { data, error } = await supabase
      .from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
    if (error || !data) return;
    const meta = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata : {};
    const pidStr = String(parentPid);
    if (meta.cc_parent_pid === pidStr) return; // already stamped — no-op
    await supabase.from('claude_sessions')
      .update({ metadata: { ...meta, cc_parent_pid: pidStr } })
      .eq('session_id', sessionId);
  } catch {
    // telemetry — never abort SessionStart
  }
}

/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-1 — close the session ids this rotation replaced.
 *
 * /clear and compaction-resume mint a NEW session_id while the Claude Code process survives.
 * session-tick.cjs has exactly two exits — parent-PID death (:181, which DELIBERATELY survives
 * /clear) and the 0-row PATCH self-exit (:350) — and nothing flipped either at rotation, so the
 * outgoing session's daemon became immortal, stamping heartbeat_at AND process_alive_at every 30s
 * for a conversation that can never act again.
 *
 * status='released' is necessary and SUFFICIENT: the daemon's PATCH filters
 * `status=in.(active,idle,stale)` (session-tick.cjs:331), so releasing the row 0-rows its next
 * write and it exits itself. Verified at the consumer, not at this write.
 *
 * WHY THIS HOOK. SessionStart fires on /clear and on compaction resume (both ROTATE the id) and
 * does NOT fire when a ScheduleWakeup tick resumes an already-running session — documented in the
 * header of loop-state-resume-clear.cjs as a defect for loop_state. Read the other way it is the
 * guarantee this FR needs: we see every rotation and never see a parked worker waking up.
 *
 * A PARKED /loop WORKER IS EXCLUDED STRUCTURALLY, NOT CAREFULLY. One Claude Code process hosts one
 * conversation, so a row sharing our cc_parent_pid with a DIFFERENT session_id has necessarily
 * rotated out. There is no elapsed-time, last_tool_at or heartbeat condition anywhere below, and
 * adding one would re-open the seam session-tick.cjs:181-184 names verbatim: it "trades false-life
 * for false-death — the seam all five prior attempts at this defect fell down."
 *
 * Fire-and-forget and totally swallowed: this runs at every SessionStart on the host, so it must
 * never be able to stop a session from starting.
 */
async function closeRotatedOutSessions(supabase, currentSessionId, overrides = {}) {
  try {
    const { sessionsToClose, readTickMarkers } = require('../../lib/sessions/rotation-closure.cjs');

    // Derive the pid EXACTLY as capture-session-id.cjs:492-493 does — that process writes the
    // markers we are about to join against, so agreeing by construction is the point. Using this
    // hook's own process.ppid instead would silently match nothing (see rotation-closure.cjs
    // header): findClaudeCodePid() is primary, ppid only its logged-degraded fallback.
    //
    // `overrides` exists so tests can pin the pid and marker dir. Production passes neither: a
    // test that had to stub live PID discovery would be asserting against its own stub.
    let parentPid = overrides.parentPid;
    if (parentPid === undefined) {
      const { findClaudeCodePid } = require('./capture-session-id.cjs');
      parentPid = findClaudeCodePid() || process.ppid || process.pid;
    }

    const markers = readTickMarkers(
      overrides.pidsDir || path.resolve(__dirname, '../../.claude/pids')
    );

    // FAIL-CLOSED IDENTITY GUARD. This predicate is "everything on our pid EXCEPT us", so it is
    // only as safe as `us`. Measured on live data: with a correct currentSessionId the pid-22196
    // group closes exactly the one rotated-out id; with an id matching NO row it closes BOTH —
    // including the live session. Nothing downstream notices, because releasing our own row is a
    // perfectly ordinary-looking write.
    //
    // What made that unreachable in practice was only that our own marker usually does not exist
    // yet when this runs (the new daemon spawns concurrently), so our row is never among the
    // candidates. That is safety by coincidence, not by design, and it evaporates the moment the
    // spawn order changes. So: if we DO have a marker, it must name the pid we are about to act
    // on. Disagreement means identity resolution and the marker record contradict each other —
    // exactly the smear this file's getCurrentSessionId() comment describes — and the only safe
    // reading of a contradiction is to close nothing.
    //
    // SD-LEO-INFRA-SESSION-TICK-CLEAR-001: moved ahead of the (now-removed) marker-emptiness
    // early-return so this ONE check gates BOTH the marker-based pass below AND the DB-join
    // fallback (FR-3) — the guard must not be duplicated in two places that could drift.
    const ownMarkerPid = markers.get(String(currentSessionId));
    if (ownMarkerPid !== undefined && String(ownMarkerPid) !== String(parentPid)) {
      process.stderr.write(
        `[session-register] rotation.skipped reason=identity_pid_mismatch ` +
        `marker=${ownMarkerPid} discovered=${parentPid}\n`
      );
      return;
    }

    const toClose = new Map(); // session_id -> path that found it ('marker'|'db_join'), for logging

    // PASS 1 (SD-LEO-INFRA-SESSION-TICK-DAEMONS-001, unchanged): marker-based join. Fast, covers
    // the common case where the rotated-out session's tick marker still exists.
    const candidateIds = [...markers.keys()];
    if (candidateIds.length) {
      // .limit(999): candidateIds is bounded by how many tick markers exist on this host at once
      // (naturally small), but count-truncation-diff-lint requires a recognized bounding marker
      // on every select() site (.in() alone is not one) -- see SD-LEO-INFRA-STAGE-GATE-RETRY-001
      // for the same pattern.
      const { data, error } = await supabase
        .from('claude_sessions').select('session_id,status').in('session_id', candidateIds).limit(999);
      if (!error && data) {
        // The predicate's row shape carries cc_parent_pid, which claude_sessions does NOT have as
        // a column — the marker supplies it. Attaching it here keeps the shipped, unit-tested
        // predicate untouched and confines the file-join to the wiring.
        const rows = data.map((r) => ({ ...r, cc_parent_pid: markers.get(r.session_id) }));
        for (const id of sessionsToClose({ currentSessionId, parentPid, rows })) {
          toClose.set(id, 'marker');
        }
      }
    }

    // PASS 2 (SD-LEO-INFRA-SESSION-TICK-CLEAR-001, FR-2): DB-join fallback, marker-INDEPENDENT.
    // Runs unconditionally (not gated on candidateIds.length — that early-return is exactly what
    // made round-1 of this fix dead code in the scenario it exists for: the marker-deleted case
    // IS the normal shape of the defect, per this file's own comment above). Finds a rotated-out
    // session via the durable metadata.cc_parent_pid stamp (stampCcParentPid, above) even when its
    // tick marker is gone. Host-scoped (claude_sessions is multi-host; PIDs are only unique per
    // host) and fail-closed on the 'unknown' degenerate hostname bucket, matching the tty
    // rejection precedent in rotation-closure.cjs's own header.
    //
    // Independently try/caught: a failure here (or a Supabase double in a test that only stubs
    // the marker-path shape) must never prevent PASS 1's already-found closures from being
    // written below -- the two passes are additive coverage, not a single point of failure.
    try {
      const hostname = overrides.hostname !== undefined ? overrides.hostname : getHostname();
      if (hostname !== 'unknown') {
        // .limit(999): naturally bounded (one host, one pid, non-terminal statuses -- realistically
        // at most a handful of rows), but count-truncation-diff-lint requires an explicit marker.
        const { data: dbRows, error: dbErr } = await supabase
          .from('claude_sessions')
          .select('session_id')
          .eq('hostname', hostname)
          .eq('metadata->>cc_parent_pid', String(parentPid))
          .neq('session_id', currentSessionId)
          .in('status', ['active', 'idle', 'stale'])
          .limit(999);
        if (!dbErr && dbRows) {
          for (const r of dbRows) {
            if (!toClose.has(r.session_id)) toClose.set(r.session_id, 'db_join');
          }
        }
      }
    } catch (dbJoinErr) {
      process.stderr.write(
        `[session-register] rotation.db_join_failed reason=${(dbJoinErr?.message || String(dbJoinErr)).slice(0, 200)}\n`
      );
    }

    if (!toClose.size) return;

    const toCloseIds = [...toClose.keys()];
    const { error: relErr } = await supabase
      .from('claude_sessions').update({ status: 'released' }).in('session_id', toCloseIds);
    process.stderr.write(
      `[session-register] rotation.closed pid=${parentPid} n=${toCloseIds.length} ` +
      `ids=${toCloseIds.map((s) => `${String(s).slice(0, 8)}:${toClose.get(s)}`).join(',')}` +
      (relErr ? ` error=${relErr.message}` : '') + `\n`
    );
  } catch (err) {
    process.stderr.write(
      `[session-register] rotation.failed reason=${(err?.message || String(err)).slice(0, 200)}\n`
    );
  }
}

async function main() {
  let supabase;
  try {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  } catch {
    return; // Supabase not available
  }

  const sessionId = await getCurrentSessionId();
  if (!sessionId) return;

  const now = new Date().toISOString();

  // Upsert session — create if new, update heartbeat if existing.
  // stampBranch() resolves current_branch via `git rev-parse --abbrev-ref HEAD`
  // and leaves the column absent if we cannot resolve (e.g. not a git tree,
  // detached HEAD) rather than writing NULL. See lib/session-writer.cjs and
  // SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
  const payload = stampBranch({
    session_id: sessionId,
    hostname: getHostname(),
    tty: getTTY(),
    codebase: detectCurrentRepo(),
    status: 'active',
    heartbeat_at: now
  });

  // QF-20260725-480: settle INSERT-vs-heartbeat-UPDATE BEFORE the upsert, because the upsert
  // itself cannot report which one it did, and after it runs the row exists either way. That
  // distinction is the whole fix — emitting unconditionally would fire SESSION_CREATED on
  // every hook run, including every resume and compaction.
  const prior = await sessionRowExisted(supabase, sessionId);

  const { error } = await supabase
    .from('claude_sessions')
    .upsert(payload, {
      onConflict: 'session_id',
      ignoreDuplicates: false
    });

  if (!error) {
    console.log(`session-register: registered ${sessionId.slice(0, 12)}...`);
    await emitSessionCreated(supabase, { sessionId, payload, prior });
    // QF-20260726-514: after the row exists, stamp which account this session is on.
    await captureAccountIdentity(supabase, sessionId);
  } else {
    process.stderr.write(`[session-register] upsert.failed session=${sessionId.slice(0, 12)} error=${error.message}\n`);
  }

  // SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-1): wire reconcileAtBoot
  // into the SessionStart hook so the three identity sources (env CLAUDE_SESSION_ID,
  // .claude/session-identity/current, claude_sessions row) cannot drift apart.
  // Gated behind SESSION_IDENTITY_SOT_ENABLED (default OFF). Always exits without
  // throwing — SessionStart must never abort or new sessions cannot start.
  try {
    const sotEnabled = process.env.SESSION_IDENTITY_SOT_ENABLED === 'true'
      || process.env.SESSION_IDENTITY_SOT_ENABLED === '1';
    if (!sotEnabled) {
      process.stderr.write(`[session-register] reconcile.skipped reason=flag_off\n`);
    } else {
      const sot = await import('../../lib/session-identity-sot.js');
      const reconcile = sot.reconcileAtBoot || sot.default?.reconcileAtBoot;
      if (typeof reconcile === 'function') {
        const result = reconcile(sessionId);
        const env = process.env.CLAUDE_SESSION_ID || '';
        process.stderr.write(
          `[session-register] reconcile.applied env=${env.slice(0, 8)} ` +
          `wrote_pointer=${result?.wrotePointer ?? false} ` +
          `wrote_env_file=${result?.wroteEnvFile ?? false} ` +
          `applied=${result?.applied ?? false}` +
          (result?.reason ? ` reason=${result.reason}` : '') +
          `\n`
        );
      } else {
        process.stderr.write(`[session-register] reconcile.failed reason=function_missing\n`);
      }
    }
  } catch (reconcileErr) {
    const msg = reconcileErr?.message || String(reconcileErr);
    process.stderr.write(`[session-register] reconcile.failed reason=${msg.replace(/\n/g, ' ').slice(0, 200)}\n`);
  }

  // SD-LEO-INFRA-LOOP-STATE-SIGNAL-001: if the session was previously parked
  // in `awaiting_tick` (set by post-tool-loop-state.cjs after a ScheduleWakeup),
  // SessionStart now means the wakeup fired — flip to `active`. Conditional WHERE
  // means fresh sessions (no prior loop_state) are not touched.
  try {
    const {
      LOOP_STATE_ACTIVE,
      LOOP_STATE_AWAITING_TICK
    } = require('../lib/sessions/loop-state-tracker.cjs');
    await supabase
      .from('claude_sessions')
      .update({ loop_state: LOOP_STATE_ACTIVE })
      .eq('session_id', sessionId)
      .eq('loop_state', LOOP_STATE_AWAITING_TICK);
  } catch { /* best-effort observability; never block SessionStart */ }

  // SD-LEO-INFRA-SESSION-TICK-CLEAR-001 (FR-1). Derived once, shared with closeRotatedOutSessions
  // below so both use an identical value (agreement by construction) rather than deriving twice.
  let parentPid;
  try {
    const { findClaudeCodePid } = require('./capture-session-id.cjs');
    parentPid = findClaudeCodePid() || process.ppid || process.pid;
  } catch { /* stampCcParentPid no-ops on undefined; closeRotatedOutSessions re-derives its own */ }
  await stampCcParentPid(supabase, sessionId, parentPid);

  // SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 (FR-1). Last, and awaited only so its stderr lands
  // inside this hook's output — it cannot throw (fully wrapped) and cannot block startup.
  await closeRotatedOutSessions(supabase, sessionId, { parentPid });
}

// SD-LEO-INFRA-FIX-SESSION-REGISTER-001: only auto-invoke main() when this
// file is run directly as the SessionStart hook (`node .../session-register.cjs`).
// A test file requiring this module for getCurrentSessionId() must NOT
// trigger a live Supabase call as a require-time side effect.
if (require.main === module) {
  main().catch((err) => {
    // Never throw — SessionStart must not abort — but surface the error so it's
    // no longer invisible (was previously swallowed with no trace, hiding schema
    // drift like the started_at column removal from every session's boot).
    process.stderr.write(`[session-register] main.failed error=${err?.message || String(err)}\n`);
  });
}

/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 — FR-2 (stampSpawnCorrelation) WAS REMOVED, deliberately.
 *
 * FR-2 shipped an exported stamp for a spawner-minted correlation token. Two hours later FR-3 of the
 * SAME SD superseded the whole approach: `claude --session-id <uuid>` lets the spawner CHOOSE the id,
 * so the child registers under a value the spawner already holds and there is nothing left to
 * correlate. That is now proven live (a registered session_id byte-identical to the minted uuid).
 *
 * The function was then left exported with ZERO callers and metadata.spawn_correlation with ZERO
 * readers -- caught by the PLAN_VERIFICATION review (VAL-CANHOST-02). Deleting it is the consistent
 * call: FR-7 of this same SD deleted the pid-capture family for exactly this reason, that a dead
 * exported path beside the working one invites someone to wire up the wrong one. Keeping one and
 * deleting the other would have been the inconsistency.
 */

module.exports = {
  getCurrentSessionId, main, emitSessionCreated,
  // FR-1 — exported so the rotation closure is testable without running SessionStart.
  closeRotatedOutSessions,
  // QF-20260726-514 — exported so the account capture is testable without running SessionStart.
  resolveAccountIdentity, captureAccountIdentity,
  // SD-LEO-INFRA-SESSION-TICK-CLEAR-001 — exported so the pid stamp is testable in isolation.
  stampCcParentPid,
};
