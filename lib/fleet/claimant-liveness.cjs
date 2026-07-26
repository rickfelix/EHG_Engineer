/**
 * Claimant liveness classifier — SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-1.
 *
 * Answers ONE question: is the session about to write a claim actually alive?
 *
 * WHY THE OBVIOUS SIGNALS ARE ALL REFUSED (this is the whole design, not preamble):
 *   - `process_alive_at` is written by scripts/session-tick.cjs (:232, :284) — THE DAEMON THIS
 *     FENCE EXISTS TO EXCLUDE. Its parentAlive() (:110-119) is a bare process.kill(pid,0) with no
 *     name match that RETURNS TRUE ON EPERM (:116), and rediscoverParentPid (:161-162) adopts a
 *     replacement pid on that same unsound test. So a dead claude whose pid was recycled keeps a
 *     live ticker pinning the field at 0m forever. An instrument written by the thing it measures
 *     cannot answer the question.
 *   - `heartbeat_at` has 23+ production JS writers, 47 SQL sites across 31 migrations, a column
 *     DEFAULT NOW(), and a CROSS-SESSION writer keyed on sd_key rather than session_id
 *     (BaseExecutor.js:1121-1140) that stamps another session's heartbeat with no liveness check.
 *   - `status` is useless here: a dead seat sits at status='active', so a status gate admits
 *     corpses by construction.
 *
 * WHAT IS USED INSTEAD: ESRCH for death, a PER-PID process-name match for life, and the
 * self-declared session→pid binding in .claude/pids/tick-{SESSION_ID}.json as the tiebreak that
 * defeats PID recycling. Windows recycles PIDs and this host runs ~15 claude processes plus dozens
 * of node children, so bare existence is not evidence of anything.
 *
 * THREE VERDICTS, NOT A BOOLEAN. Collapsing INDETERMINATE into DEAD is what starves live workers,
 * and this fence is ASYMMETRIC: admitting a corpse leaves one pinned item that a sweep later
 * clears, but falsely fencing a LIVE worker silently stops real work and looks exactly like an
 * idle fleet — the more expensive error, and the harder one to notice.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const ALIVE = 'ALIVE';
const DEAD = 'DEAD';
const INDETERMINATE = 'INDETERMINATE';

/** Windows image name for a Claude Code process. */
const CLAUDE_IMAGE = 'claude.exe';

/**
 * Per-PID name check. `tasklist /FI "PID eq N" /FI "IMAGENAME eq claude.exe"`.
 *
 * The repo's only existing name-match helper (stale-session-sweep.cjs:699-709
 * anyClaudeProcessRunning) is HOST-WIDE existence — it can tell you *some* claude is running, never
 * that THIS pid is claude, which is exactly what recycling defeats. Hence a new one.
 *
 * Returns 'MATCH' | 'NO_MATCH' | 'PROBE_FAILED'. PROBE_FAILED is NOT death: a shell-out that
 * errored tells us nothing about the process, and treating it as death would let a broken probe
 * wedge claiming fleet-wide.
 */
function pidIsClaude(pid, execCmd) {
  if (!Number.isInteger(pid) || pid <= 0) return 'NO_MATCH';
  let out;
  try {
    out = String(
      execCmd(`tasklist /FI "PID eq ${pid}" /FI "IMAGENAME eq ${CLAUDE_IMAGE}" /NH /FO CSV`),
    );
  } catch {
    return 'PROBE_FAILED';
  }
  // tasklist prints an INFO line ("No tasks are running which match...") rather than failing when
  // nothing matches, so absence of the image name is the negative signal — not a non-zero exit.
  if (!out.toLowerCase().includes(CLAUDE_IMAGE)) return 'NO_MATCH';
  // Guard against a filter being ignored: require the pid to appear alongside the image name.
  return out.includes(String(pid)) ? 'MATCH' : 'NO_MATCH';
}

/** Read the self-declared session→pid binding. Absence is a weak signal — see classify(). */
function readTickPidfile(sessionId, repoRoot) {
  const file = path.join(repoRoot, '.claude', 'pids', `tick-${sessionId}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null; // missing OR unreadable OR malformed — all "no usable binding", never "dead"
  }
}

/**
 * Classify a claiming session.
 *
 * @param {object}   args
 * @param {string}   args.sessionId      session whose claim write is being fenced
 * @param {number?}  args.recordedPid    claude_sessions.pid — a SNAPSHOT, not a liveness signal
 * @param {string?}  args.repoRoot       where .claude/pids lives
 * @param {Function} [args.execCmd]      seam: (cmd) => stdout. Injected so tests never touch the host.
 * @param {Function} [args.readPidfile]  seam: (sessionId, repoRoot) => object|null
 * @returns {{verdict: string, reason: string, recordedPid: number|null, pidfilePid: number|null, decidingSignal: string}}
 */
function classifyClaimantLiveness({
  sessionId,
  recordedPid = null,
  repoRoot = process.cwd(),
  execCmd = defaultExec,
  readPidfile = readTickPidfile,
} = {}) {
  const base = { recordedPid: normalizePid(recordedPid), pidfilePid: null };

  if (!sessionId) {
    return { ...base, verdict: INDETERMINATE, reason: 'no session id supplied', decidingSignal: 'none' };
  }

  const marker = readPidfile(sessionId, repoRoot);
  const pidfilePid = normalizePid(marker && marker.cc_parent_pid);
  base.pidfilePid = pidfilePid;

  // 1. The pidfile pid is the STRONGEST signal: it is the only artifact that ties a pid back to the
  //    session that owns it, so it is the one immune to recycling.
  if (pidfilePid !== null) {
    const probe = pidIsClaude(pidfilePid, execCmd);
    if (probe === 'MATCH') {
      return { ...base, verdict: ALIVE, reason: `tick pidfile pid ${pidfilePid} is a live ${CLAUDE_IMAGE}`, decidingSignal: 'tick_pidfile_name_match' };
    }
    if (probe === 'PROBE_FAILED') {
      return { ...base, verdict: INDETERMINATE, reason: `probe failed for tick pidfile pid ${pidfilePid}`, decidingSignal: 'probe_failure' };
    }
    // The session declared this pid as its own and that pid is gone (or is no longer claude).
    // That is the strongest death evidence available, so it is the ONLY path to DEAD.
    return { ...base, verdict: DEAD, reason: `tick pidfile pid ${pidfilePid} is not a live ${CLAUDE_IMAGE}`, decidingSignal: 'tick_pidfile_esrch_or_recycled' };
  }

  // 2. No usable binding. Fall back to the recorded pid — but ONLY to establish LIFE, never death.
  if (base.recordedPid !== null) {
    const probe = pidIsClaude(base.recordedPid, execCmd);
    if (probe === 'MATCH') {
      return { ...base, verdict: ALIVE, reason: `recorded pid ${base.recordedPid} is a live ${CLAUDE_IMAGE}`, decidingSignal: 'recorded_pid_name_match' };
    }
  }

  /*
   * 3. FAIL-DIRECTION, STATED AND JUSTIFIED (FR-4 / AC-N2).
   *
   * No pidfile, and the recorded pid does not name-match. It is tempting to call this DEAD. WE DO
   * NOT, and the reason is measured rather than theoretical: claude_sessions.pid is captured ONCE
   * and does not survive a restart, resume or compaction, so the longest-lived, hardest-working
   * session is exactly the one whose recorded pid goes stale. Session 24ca166f is the live proof —
   * recorded pid 21864 probes NOT FOUND while that same session's real process (7440) was serving
   * traffic and shipped a chairman-priority item that day.
   *
   * The failure mode is INVERTED WITH USEFULNESS, so a DEAD verdict here would preferentially fence
   * out the fleet's most productive sessions. Absence of a marker is also weak on its own: the
   * marker is written once at spawn (session-tick.cjs:484) with best-effort cleanup, and
   * .claude/pids/ already holds ~66 files against ~20 live sessions.
   *
   * COST OF THIS CHOICE, stated honestly: sessions with no pidfile are NOT fenced, so the fence's
   * reach is bounded by tick-marker coverage. That is the deliberate trade — it bounds the damage
   * to "some corpses still get through", never to "live workers cannot claim".
   */
  return {
    ...base,
    verdict: INDETERMINATE,
    reason: base.recordedPid === null
      ? 'no tick pidfile and no recorded pid — nothing to classify'
      : `no tick pidfile; recorded pid ${base.recordedPid} did not name-match, which is NOT death (a recorded pid goes stale on restart/resume/compaction)`,
    decidingSignal: 'no_binding_fail_open',
  };
}

function normalizePid(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function defaultExec(cmd) {
  // Required lazily so the module can be unit-tested with an injected seam and no child_process.
  return require('node:child_process').execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** True only for a verdict that must BLOCK a claim write. INDETERMINATE never blocks. */
function shouldRefuseClaim(verdict) {
  return verdict === DEAD;
}

module.exports = {
  ALIVE,
  DEAD,
  INDETERMINATE,
  CLAUDE_IMAGE,
  classifyClaimantLiveness,
  shouldRefuseClaim,
  pidIsClaude,
  readTickPidfile,
};
