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

module.exports = { getCurrentSessionId, main, emitSessionCreated };
