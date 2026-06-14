// SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001 — PURE charter-audit detectors (data-in, verdict-out).
//
// No DB / IO inside these functions — the script's main() fetches the data and injects it. This keeps the
// gauge logic unit-testable without a database (the lib/coordinator/detectors.cjs pattern). Each detector
// returns { violation:boolean, detail:string, remediation:(string|null), ... }. The audit is READ-ONLY:
// these functions never mutate state; `remediation` is the NAMED action the coordinator agent performs.

const DAY_MS = 86400000;
const SD_KEY_RE = /^(SD-[A-Z0-9][A-Z0-9_-]*)/i;

/**
 * Extract the SD-key reference from a dependency entry, or null if it is free-text prose (not an edge).
 * The dependencies field is used inconsistently in the wild: structured {sd_id}/{sd_key}, a bare SD-key
 * string, an "SD-KEY (prose description)" string, OR pure prose ("the coordinator cron framework ..."). Only
 * a leading SD-key token is a real dependency edge — prose entries must NOT be treated as missing dep keys
 * (which would flood false dep-resolver ANOMALYs) nor as unmet blocks.
 * @returns {string|null}
 */
export function extractDepKey(dep) {
  if (!dep) return null;
  // Run BOTH branches through the same SD-key validity rule so non-SD sentinels ({sd_key:'none'}, 'N/A', prose)
  // collapse to null — the object branch must not bypass the filter the string branch applies.
  const raw = typeof dep === 'object' ? (dep.sd_id || dep.sd_key) : dep;
  if (typeof raw !== 'string') return null;
  const m = raw.match(SD_KEY_RE);
  return m ? m[1] : null;
}

/**
 * Classify a worker's liveness using AUTHORITATIVE signals, NOT heartbeat-age alone: a fresh heartbeat OR an
 * in-window armed-silence (expected_silence_until) OR a live resolved PID => ALIVE. So a long-EXEC-run /
 * armed-silence worker with a stale heartbeat is counted ALIVE, never idle/dead (no false DUTY-3 / no
 * duplicate-assignment spray).
 * @param {object} s session row {heartbeat_at, expected_silence_until, session_id, terminal_id}
 * @param {object} ctx {nowMs, staleThresholdMs, isWithinArmedSilence(until,now)->bool, isPidAlive(s)->bool}
 * @returns {{alive:boolean, reason:string}}
 */
export function classifyLiveness(s, { nowMs, staleThresholdMs, isWithinArmedSilence, isPidAlive } = {}) {
  // Lifecycle status is authoritative-DEAD FIRST: a released/stale/ended session is NOT alive even if it
  // emitted a heartbeat moments before exiting (else a phantom idle worker gets work dispatched to it).
  if (s && (s.status === 'released' || s.status === 'stale' || s.status === 'ended')) return { alive: false, reason: 'lifecycle_terminated' };
  const hbAgeMs = s && s.heartbeat_at ? Math.max(0, nowMs - new Date(s.heartbeat_at).getTime()) : Infinity;
  if (hbAgeMs < staleThresholdMs) return { alive: true, reason: 'heartbeat' };
  if (isWithinArmedSilence && isWithinArmedSilence(s && s.expected_silence_until, nowMs)) return { alive: true, reason: 'armed_silence' };
  if (isPidAlive && isPidAlive(s)) return { alive: true, reason: 'pid' };
  return { alive: false, reason: 'stale_no_signal' };
}

/**
 * DUTY-3 idle-with-work: count workers that are ALIVE + idle (no sd_key) + NOT holding a pending unread
 * WORK_ASSIGNMENT, while claimable (unclaimed) work exists. The pending-assignment exclusion prevents
 * re-flagging an already-remediated worker (no duplicate-assignment spray). Fires only when idle-eligible>0
 * AND unclaimed>0.
 */
export function detectIdleWithWork({ liveSessions = [], unclaimedCount = 0, pendingAssignmentSessionIds = new Set() } = {}) {
  const idleEligible = liveSessions.filter((s) => s && !s.sd_key && !pendingAssignmentSessionIds.has(s.session_id));
  const violation = idleEligible.length > 0 && unclaimedCount > 0;
  return {
    violation,
    idleCount: idleEligible.length,
    unclaimedCount,
    detail: violation
      ? `${idleEligible.length} live-idle worker(s) (excl. pending-assignment) while ${unclaimedCount} SD(s) unclaimed`
      : `none (${idleEligible.length} idle-eligible, ${unclaimedCount} unclaimed)`,
    remediation: violation ? 'ACTION: assign the unclaimed SD(s) to the idle worker(s) — dispatch a WORK_ASSIGNMENT or wake their loop' : null,
  };
}

/**
 * Dependency gauge with completed-dep NO-false-block (bug d683adcf class): a dep whose status is terminal is
 * SATISFIED; a dep KEY MISSING from statusByKey is a dep-resolver ANOMALY (reported, NOT counted BLOCKED);
 * only a dep with a known non-terminal status counts as BLOCKED.
 */
export function detectDependencyHealth({ sds = [], statusByKey = {}, terminalSet, nowMs } = {}) {
  const isTerminal = (st) => (terminalSet && terminalSet.has ? terminalSet.has(st) : false);
  const depOf = (s) => (Array.isArray(s.dependencies) ? s.dependencies.map(extractDepKey).filter(Boolean) : []);
  let blocked = 0, ready = 0;
  const anomalies = [], staleBlocked = [];
  for (const s of sds) {
    const deps = depOf(s);
    if (!deps.length) continue;
    const unknown = deps.filter((k) => !Object.prototype.hasOwnProperty.call(statusByKey, k));
    if (unknown.length) { anomalies.push({ sd: s.sd_key, unknownDeps: unknown }); continue; } // ANOMALY, not BLOCKED
    const unmet = deps.filter((k) => !isTerminal(statusByKey[k]));
    if (unmet.length) { blocked++; continue; }
    ready++;
    if (!s.claiming_session_id && s.updated_at && (nowMs - new Date(s.updated_at).getTime()) >= DAY_MS) staleBlocked.push(s.sd_key);
  }
  const violation = anomalies.length > 0 || staleBlocked.length > 0;
  return {
    blocked, ready, anomalies, staleBlocked, violation,
    detail: `${blocked} blocked (unmet) | ${ready} dep-satisfied | ${anomalies.length} dep-resolver ANOMALY (key not found — NOT counted blocked) | ${staleBlocked.length} stale-blocked (deps done, idle >1d)`,
    remediation: anomalies.length
      ? 'ACTION: fetch the missing dep keys separately (dep-resolver staleness — do not leave them silently uncounted)'
      : (staleBlocked.length ? 'ACTION: dispatch the dep-satisfied stale-blocked SD(s)' : null),
  };
}

/** DUTY-1 resource-pool: worktrees N/MAX. count<0 means a git error occurred (fail-loud — never treated as 0). */
export function detectWorktreePool({ count, max, threshold = 0.85 } = {}) {
  if (count == null || count < 0) {
    return { violation: true, detail: 'worktrees UNAVAILABLE (git error — fail-loud, not 0)', remediation: 'ACTION: investigate the git worktree-list failure (do NOT treat as 0/clean)' };
  }
  const pct = max > 0 ? count / max : 0;
  const violation = pct >= threshold;
  return {
    violation,
    detail: `worktrees ${count}/${max} (${Math.round(pct * 100)}%)` + (count >= max ? ' SATURATED' : violation ? ' near cap' : ''),
    remediation: violation ? 'ACTION: run the worktree reaper Stage-0 (terminal-SD reclaim) before the cap stalls dispatch' : null,
  };
}

/** DUTY-6 backlog-rank staleness: claimable SDs whose metadata.dispatch_rank_at is absent or older than ttlMs. */
export function detectBacklogRankStaleness({ claimableSds = [], nowMs, ttlMs } = {}) {
  const stale = claimableSds.filter((s) => {
    const at = s.metadata && s.metadata.dispatch_rank_at;
    if (!at) return true;
    const ageMs = nowMs - new Date(at).getTime();
    return !(ageMs >= 0 && ageMs < ttlMs);
  });
  const violation = stale.length > 0;
  return {
    violation,
    staleCount: stale.length,
    detail: violation ? `${stale.length} claimable SD(s) with no fresh dispatch_rank (>${Math.round(ttlMs / 60000)}m or absent)` : `none (${claimableSds.length} claimable, all freshly ranked)`,
    remediation: violation ? 'ACTION: run/re-arm coordinator-backlog-rank.mjs (the backlog-rank loop is stale)' : null,
  };
}

/** QUIET-TICK committed-action verification: the latest coordinator_review lacks prior_action_outcomes for the
 *  prior cycle's committed_actions (the grade->action->verify loop is broken). reviews are latest-first. */
export function detectQuietTickUnverified({ coordinatorReviews = [] } = {}) {
  if (!Array.isArray(coordinatorReviews) || coordinatorReviews.length < 2) {
    return { violation: false, detail: 'insufficient coordinator_review history (need >=2)', remediation: null };
  }
  const [latest, prior] = coordinatorReviews;
  const priorCommitted = (prior && prior.metadata && prior.metadata.committed_actions) || [];
  const latestOutcomes = (latest && latest.metadata && latest.metadata.prior_action_outcomes) || [];
  const violation = priorCommitted.length > 0 && latestOutcomes.length === 0;
  return {
    violation,
    detail: violation ? `${priorCommitted.length} committed_action(s) from the prior cycle UNVERIFIED (latest review has 0 prior_action_outcomes)` : 'prior committed_actions verified (or none)',
    remediation: violation ? 'ACTION: file prior_action_outcomes verifying the last cycle (grade->action->verify is non-optional)' : null,
  };
}

/**
 * Resolve the authoritative worktree count, detecting countActiveWorktrees's SILENT git-failure: that helper
 * swallows a git-CLI error and returns 0 (it never throws), which would read as a false-clean 0/20. If git
 * reports 0 but the filesystem shows worktree directories, git failed -> return -1 (the fail-loud sentinel
 * detectWorktreePool turns into an UNAVAILABLE violation).
 */
export function resolveWorktreeCount({ gitCount, fsDirCount }) {
  if (gitCount === 0 && fsDirCount > 0) return -1;
  return gitCount;
}

/**
 * The dispatch-eligible belt for the idle-with-work + backlog-rank gauges. Routes through the CANONICAL
 * classifyDispatchIneligibility predicate (orchestrator parents, SD-DEMO/SD-TEST fixtures, and
 * metadata.requires_human_action SDs are NOT claimable work) — so the audit is a consumer of the one source of
 * truth, not a looser re-derivation that would recommend dispatching an orchestrator PARENT onto a worker.
 * @param {object} p {sds, statusByKey, terminalSet, classifyIneligibility(s)->reason|null}
 * @returns {{unclaimed:Array, claimable:Array}}
 */
export function computeDispatchBelt({ sds = [], statusByKey = {}, terminalSet, classifyIneligibility } = {}) {
  const isTerminal = (st) => (terminalSet && terminalSet.has ? terminalSet.has(st) : false);
  const unclaimed = sds.filter((s) =>
    !s.claiming_session_id && !s.parent_sd_id && (!classifyIneligibility || classifyIneligibility(s) === null));
  const claimable = unclaimed.filter((s) =>
    (Array.isArray(s.dependencies) ? s.dependencies.map(extractDepKey).filter(Boolean) : []).every((k) => isTerminal(statusByKey[k])));
  return { unclaimed, claimable };
}

/** Foundational-query fail-loud: returns a QUERY_ERROR marker string if `error` is real, else null. */
export function foundationalQueryError(error, table) {
  if (!error) return null;
  return `[COORD-CHARTER-AUDIT] QUERY_ERROR: ${table}: ${error.message || String(error)}`;
}

/** Collect violations (each with its remediation) from a list of detector results. */
export function summarizeViolations(results = []) {
  const violations = results.filter((r) => r && r.violation).map((r) => ({ detail: r.detail, remediation: r.remediation || null }));
  return { count: violations.length, violations };
}
