// SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001 — PURE charter-audit detectors (data-in, verdict-out).
//
// No DB / IO inside these functions — the script's main() fetches the data and injects it. This keeps the
// gauge logic unit-testable without a database (the lib/coordinator/detectors.cjs pattern). Each detector
// returns { violation:boolean, detail:string, remediation:(string|null), ... }. The audit is READ-ONLY:
// these functions never mutate state; `remediation` is the NAMED action the coordinator agent performs.

// DUTY-6 belt parity: reuse the CANONICAL in-flight predicate (current_phase set AND != LEAD) so the audit's
// claimable belt EXACTLY mirrors coordinator-backlog-rank.mjs's isStartedSd skip — a started/mid-build SD (even
// momentarily unclaimed after a reap) is RESUMED via worker-checkin's resume_orphan path, never fresh-ranked, so
// counting it claimable-needing-rank is a false DUTY-6 the named remediation (run backlog-rank) can never clear.
import { isStartedSd } from './sd-exclusion.mjs';

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
 * DUTY-8 PROGRESS-STALL (SD-LEO-INFRA-PROGRESS-STALL-DETECTION-001) — surface claim-holders that are
 * heartbeat-ALIVE but whose claimed SD is FROZEN (no progress). PURE; the canonical staleness predicate
 * (detectStuckWorker from lib/coordinator/detectors.cjs) and the armed-silence check are INJECTED.
 *
 * Why not feed detectStuckWorker the real heartbeat: its progress proxy is MAX(heartbeat_at, sd_updated_at),
 * so a FRESH heartbeat masks the stall — it would never fire on a live worker (the very class we want). So the
 * claim-builder here establishes liveness itself (ACTIVELY heartbeating within `freshMs` AND not inside an
 * armed-silence window) and then passes heartbeat_at:null into the canonical predicate so it keys PURELY on SD
 * progress (sd_updated_at staleness). This reuses the canonical staleness math (no re-derivation / no drift
 * with the sweep) while correctly capturing the alive-but-frozen class.
 *
 * FALSE-POSITIVE GUARD — the THRESHOLD is primary, not armed-silence: strategic_directives_v2.updated_at only
 * advances on an actual SD-row UPDATE (handoffs / phase writes / progress-tick), NOT during ordinary EXEC work,
 * and an expected_silence_until window is hard-capped at ~30min (well below a sane threshold). So the conservative
 * caller threshold (default 4h — far longer than any normal phase) is what keeps this a rare high-signal advisory;
 * the armed-silence exclusion below is only a secondary early-out for a worker that is explicitly parked RIGHT NOW.
 *
 * @param {object} p
 * @param {Array<object>} p.liveSessions - charter-audit live sessions {session_id, sd_key, heartbeat_at, expected_silence_until}
 * @param {Array<object>} p.sds - non-terminal SDs {sd_key, updated_at, current_phase}
 * @param {number} p.nowMs - injected clock
 * @param {number} [p.thresholdMs] - SD-progress staleness threshold passed to the canonical predicate
 * @param {number} [p.freshMs=5m] - heartbeat-freshness window that defines "actively alive"
 * @param {(until:any, now:number)=>boolean} [p.isWithinArmedSilence] - canonical armed-silence check (excludes parked workers)
 * @param {(data:object)=>{matched:boolean,reason:string,evidence:object}} p.detectStuck - canonical detectStuckWorker
 * @returns {{violation:boolean, stalledCount:number, samples:Array, detail:string, remediation:(string|null)}}
 */
export function detectProgressStall({ liveSessions = [], sds = [], nowMs, thresholdMs, freshMs, isWithinArmedSilence, detectStuck } = {}) {
  if (typeof detectStuck !== 'function' || !Array.isArray(liveSessions) || !Array.isArray(sds) || !Number.isFinite(nowMs)) {
    return { violation: false, stalledCount: 0, samples: [], detail: 'progress-stall not evaluable (fail-open)', remediation: null };
  }
  const fresh = Number.isFinite(freshMs) ? freshMs : 5 * 60 * 1000;
  const sdByKey = new Map(sds.filter((s) => s && s.sd_key).map((s) => [s.sd_key, s]));
  const claims = [];
  for (const s of liveSessions) {
    if (!s || !s.sd_key) continue;                                  // no claim → not this detector's class
    const sd = sdByKey.get(s.sd_key);
    if (!sd) continue;                                              // claimed SD terminal/absent → excluded
    const hb = s.heartbeat_at ? new Date(s.heartbeat_at).getTime() : NaN;
    if (!Number.isFinite(hb) || (nowMs - hb) >= fresh) continue;    // require ACTIVELY heartbeating (alive)
    if (isWithinArmedSilence && isWithinArmedSilence(s.expected_silence_until, nowMs)) continue; // legit parked
    // Liveness established above → pass heartbeat_at:null so the canonical predicate keys PURELY on SD progress.
    claims.push({ sd_key: s.sd_key, session_id: s.session_id, heartbeat_at: null, sd_updated_at: sd.updated_at, current_phase: sd.current_phase });
  }
  let res;
  try { res = detectStuck({ claims, now: nowMs, thresholdMs }); }
  catch { return { violation: false, stalledCount: 0, samples: [], detail: 'progress-stall predicate threw (fail-open)', remediation: null }; }
  const matched = !!(res && res.matched);
  const ev = (res && res.evidence) || {};
  const samples = Array.isArray(ev.samples)
    ? ev.samples.slice(0, 10).map((x) => ({ sd_key: x.sd_key, phase: x.phase ?? null, ageHours: Number.isFinite(x.age_ms) ? Math.round(x.age_ms / 3600000) : null }))
    : [];
  return {
    violation: matched,
    stalledCount: matched ? (ev.stuck_count ?? samples.length) : 0,
    samples,
    detail: matched
      ? `${ev.stuck_count ?? samples.length} worker(s) heartbeat-alive but claimed SD frozen (no SD update past threshold; not in armed-silence) — ${samples.slice(0, 3).map((x) => `${x.sd_key}(${x.phase || '?'},${x.ageHours}h)`).join(', ')}`
      : 'none (claimed SDs progressing, or live workers parked in armed-silence)',
    remediation: matched
      ? 'ACTION: checkpoint the heartbeat-alive worker(s) on the named SD(s) — actively heartbeating but the claimed SD has not advanced and not in an armed-silence window (possible mid-phase loop / phase-reset / silent block); wake/prompt or verify progress'
      : null,
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
    // in-flight (started, past LEAD) SDs are RESUMED, not fresh-ranked — mirror backlog-rank's isStartedSd skip so
    // an unclaimed in_progress orphan is NOT a false DUTY-6 rank-staleness violation (it has no fresh rank by design).
    !isStartedSd(s) &&
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
