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
// SD-FDBK-INFRA-FLEET-SELF-CLAIM-001: reuse the SAME claim-time repo-fitness the worker self-claim path
// uses (lib/fleet/sd-executable-here.cjs), so the cross-repo-starvation verdict matches the skip exactly.
// isSdExecutableHere(sd,{currentApp}) is filesystem-free when currentApp is supplied → keeps the detector pure.
import { isSdExecutableHere } from '../fleet/sd-executable-here.cjs';

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

// QF-20260627-273: the interim co_author_pending hold is a sentinel dependency whose key contains
// CO-AUTHOR-CONVERGENCE-PENDING (it intentionally does not resolve to an SD row). It is a legitimate
// hold (non-claimable until convergence), NOT a dep-resolver staleness anomaly — so the dep-health
// detector must treat it as BLOCKED, matching claim-eligibility.draftDepsSatisfied.
export function isCoAuthorHoldKey(k) {
  return typeof k === 'string' && /CO-AUTHOR-CONVERGENCE-PENDING/i.test(k);
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
 * WORK_ASSIGNMENT + NOT PARKED, while claimable (unclaimed) work exists. The pending-assignment exclusion
 * prevents re-flagging an already-remediated worker (no duplicate-assignment spray). Fires only when
 * idle-eligible>0 AND unclaimed>0.
 *
 * SD-LEO-INFRA-CHARTER-DUTY3-PARKED-WORKER-FLAG-001 (same spirit as #4952 detectStalledLoop: parked != idle):
 * a worker between /loop ticks (loop_state='awaiting_tick') or inside an armed expected_silence_until window
 * is PARKED — it will self-claim on its next wake and the coordinator cannot remediate it (dispatch finds 0
 * reachable-free workers), so counting it idle-while-unclaimed produced a perpetual un-remediable
 * VIOLATIONS=1 + dispatch whack-a-mole. Exclude parked workers. Pass nowMs + isWithinArmedSilence (the
 * canonical lib/fleet/silence-cap.cjs predicate) to evaluate the armed-silence window; both are optional so
 * a caller that omits them simply skips the silence check (the awaiting_tick exclusion still applies).
 */
export function detectIdleWithWork({ liveSessions = [], unclaimedCount = 0, pendingAssignmentSessionIds = new Set(), nowMs, isWithinArmedSilence } = {}) {
  const isParked = (s) =>
    s.loop_state === 'awaiting_tick' ||
    !!(isWithinArmedSilence && isWithinArmedSilence(s.expected_silence_until, nowMs));
  // A never-claimed registration ghost (e.g. source:'startup', loop_state:'unknown', fresh
  // heartbeat) has sd_key=null but has never participated in the fleet — it is NOT an idle
  // worker that can be assigned work. Require evidence of prior participation (a claim, a
  // worktree, or a completed-SD counter) before counting a session as idle-with-work.
  const everParticipated = (s) =>
    !!(s.claimed_at || s.worktree_path || (s.continuous_sds_completed > 0));
  const idleEligible = liveSessions.filter((s) =>
    s && !s.sd_key && !pendingAssignmentSessionIds.has(s.session_id) && !isParked(s) && everParticipated(s));
  const violation = idleEligible.length > 0 && unclaimedCount > 0;
  return {
    violation,
    idleCount: idleEligible.length,
    unclaimedCount,
    detail: violation
      ? `${idleEligible.length} live-idle worker(s) (excl. pending-assignment + parked) while ${unclaimedCount} SD(s) unclaimed`
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
    // QF-20260627-273: a co_author_pending interim hold is encoded as a sentinel dependency
    // (key contains CO-AUTHOR-CONVERGENCE-PENDING) that intentionally does not resolve to an SD row.
    // claim-eligibility draftDepsSatisfied already treats it as BLOCKED (non-claimable); DUTY-4 must
    // agree — count it as a legitimate hold (BLOCKED), NOT a dep-resolver ANOMALY/violation.
    const realDeps = deps.filter((k) => !isCoAuthorHoldKey(k));
    const hasCoAuthorHold = realDeps.length !== deps.length;
    const unknown = realDeps.filter((k) => !Object.prototype.hasOwnProperty.call(statusByKey, k));
    if (unknown.length) { anomalies.push({ sd: s.sd_key, unknownDeps: unknown }); continue; } // ANOMALY, not BLOCKED
    const unmet = realDeps.filter((k) => !isTerminal(statusByKey[k]));
    if (hasCoAuthorHold || unmet.length) { blocked++; continue; } // co_author hold = held/blocked, not anomaly
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

/**
 * CROSS-REPO STARVATION (SD-FDBK-INFRA-FLEET-SELF-CLAIM-001): a claimable SD whose target_application NO
 * live worker checkout can execute silently starves — worker self-claim CORRECTLY skips it (a worker in the
 * EHG_Engineer checkout cannot build a target_application=ehg SD), but when no live worker is in the right
 * checkout it sits unclaimed at rank-1 indefinitely, invisible until a human/coordinator dispatches it.
 * This makes that starvation VISIBLE for explicit dispatch (the worker skip stays correct — we never claim
 * un-buildable work). An SD is STARVING when:
 *   (a) it declares a target_application,
 *   (b) NO app in liveSessionApps can execute it (isSdExecutableHere(sd,{currentApp}).fit === false for every
 *       live app — the SAME fitness the self-claim path uses, so the verdict matches the skip exactly), AND
 *   (c) it has sat unclaimed longer than minAgeMs (age from metadata.dispatch_rank_at || created_at).
 * GUARD: with zero live apps we cannot assess cross-repo fitness (that is a no-fleet problem, not starvation)
 * → never flag. Pure (currentApp keeps isSdExecutableHere filesystem-free); fail-open per SD.
 *
 * @param {{ claimableSds?: Array, liveSessionApps?: string[], nowMs?: number, minAgeMs?: number }} p
 */
export function detectCrossRepoStarvation({ claimableSds = [], liveSessionApps = [], nowMs = 0, minAgeMs = 12 * 60 * 1000 } = {}) {
  const apps = Array.from(new Set((liveSessionApps || []).filter((a) => typeof a === 'string' && a)));
  // No live fleet baseline → cannot distinguish cross-repo starvation from "no workers at all".
  if (apps.length === 0) {
    return { violation: false, starvingCount: 0, starving: [], detail: 'no live worker apps to assess cross-repo fitness', remediation: null };
  }
  const starving = [];
  for (const sd of claimableSds) {
    try {
      if (!sd || !sd.target_application) continue; // repo-agnostic SD: executable anywhere, never starves
      // Executable by ANY live app? (reuse the claim-time fitness; currentApp = filesystem-free)
      const someAppFits = apps.some((app) => {
        try { return isSdExecutableHere(sd, { currentApp: app }).fit === true; } catch { return true; /* fail-open: don't flag on a fitness fault */ }
      });
      if (someAppFits) continue;
      // Aged? age from dispatch_rank_at (when it was put on the belt) else created_at.
      const atRaw = (sd.metadata && sd.metadata.dispatch_rank_at) || sd.created_at;
      const at = atRaw ? new Date(atRaw).getTime() : NaN;
      const ageMs = Number.isFinite(at) ? (nowMs - at) : Infinity; // unknown age → treat as aged (it has clearly sat)
      if (!(ageMs >= minAgeMs)) continue;
      starving.push({ sd_key: sd.sd_key, target_application: sd.target_application, ageMs });
    } catch { /* fail-open per SD: a fault never flags */ }
  }
  const violation = starving.length > 0;
  const keys = starving.map((s) => s.sd_key).join(', ');
  const targets = Array.from(new Set(starving.map((s) => s.target_application))).join(', ');
  return {
    violation,
    starvingCount: starving.length,
    starving,
    detail: violation
      ? `${starving.length} claimable SD(s) starving cross-repo (target_application=[${targets}]) — no live worker checkout (${apps.join(', ')}) can build them: ${keys}`
      : `none (${claimableSds.length} claimable; live apps: ${apps.join(', ')})`,
    remediation: violation
      ? `ACTION: explicitly dispatch ${keys} to a [${targets}]-checkout worker (coordinator WORK_ASSIGNMENT), or spawn/route a worker in that checkout — no live worker can self-claim them.`
      : null,
  };
}

/**
 * AUTO-REFILL AWARENESS ADVISORY (SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-E): make the coordinator
 * AWARE that the staged→belt corpus HAS valid auto-promote candidates waiting, so it neither false-flags
 * "belt dry" nor hand-promotes from harness_backlog blindly (the documented anti-pattern). `promotableCount`
 * is the -B dry-run verifier's validCount (verifyStagedCandidates(...).validCount — the -A predicate applied to
 * the staged roadmap_wave_items). ADVISORY only: surfaces a remediation, never a hard exit. Suppressed once the
 * chairman-gated -C auto-refill cron is live (it drains them). Pure; conservative (no candidates → no advisory).
 *
 * @param {{ promotableCount?: number, autoRefillLive?: boolean, threshold?: number }} p
 */
export function detectAutoRefillBacklog({ promotableCount = 0, autoRefillLive = false, threshold = 1 } = {}) {
  const n = Number.isFinite(promotableCount) && promotableCount > 0 ? Math.floor(promotableCount) : 0;
  const violation = !autoRefillLive && n >= threshold;
  return {
    violation,
    promotableCount: n,
    detail: violation
      ? `${n} staged roadmap_wave_items are valid auto-promote candidates but auto-refill is not draining them (cron not live)`
      : (autoRefillLive
        ? `auto-refill live (${n} promotable staged candidate(s))`
        : (n === 0 ? 'no promotable staged candidates' : `${n} promotable (below advisory threshold ${threshold})`)),
    remediation: violation
      ? `ADVISORY: ${n} promotable staged candidate(s) waiting — preview with 'npm run sourcing:refill-verify', then enable the chairman-gated auto-refill cron to drain them (do NOT hand-promote from harness_backlog).`
      : null,
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
 * DUTY-3b (SD-REFILL-00R7REXL): in_progress SDs that are UNCLAIMED with no live worker — true orphans.
 * Refines SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001: DUTY-2 only inspects CLAIMED sessions,
 * DUTY-3/5/6 the draft/ready belt, DUTY-4 belt deps, DUTY-7/9 drafts, DUTY-8 CLAIMED-frozen — so an
 * in_progress + claiming_session_id=NULL SD with no live session is invisible to every other duty
 * (off the claimable belt AND not self-recoverable by any /checkin). This was the false 'all-clear'
 * while SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001 sat in_progress/PLAN_PRD with claiming_session_id=NULL.
 *
 * PID-liveness gate (c1df435f): a worker mid long-Task whose claim was transiently hard-cap-released
 * keeps heartbeating against its sd_key in claude_sessions — so an SD whose sd_key matches ANY live
 * session (caller passes the already heartbeat|armed-silence|PID-resolved `live` set) is NOT an orphan.
 * Orchestrator parents / fixtures / human-action SDs are legitimately unclaimed → excluded via the
 * canonical classifyIneligibility predicate. Age-gated so a just-released claim isn't flagged instantly.
 *
 * @param {object} p {sds, liveSessions, classifyIneligibility(s)->reason|null, nowMs, minAgeMs}
 */
export function detectInProgressOrphans({ sds = [], liveSessions = [], classifyIneligibility, nowMs, minAgeMs = 10 * 60 * 1000 } = {}) {
  if (!Array.isArray(sds) || !Array.isArray(liveSessions)) {
    return { violation: false, orphanCount: 0, samples: [], detail: 'in-progress-orphan not evaluable (fail-open)', remediation: null };
  }
  const liveSdKeys = new Set(liveSessions.filter((s) => s && s.sd_key).map((s) => s.sd_key));
  const orphans = sds.filter((s) => {
    if (!s || s.status !== 'in_progress') return false;        // only in_progress
    if (s.claiming_session_id) return false;                   // has a claim → DUTY-8's domain if frozen, not orphan
    if (liveSdKeys.has(s.sd_key)) return false;                // a live session still works it (transient claim release)
    if (typeof classifyIneligibility === 'function' && classifyIneligibility(s)) return false; // parent/fixture/human-action
    if (Number.isFinite(nowMs) && Number.isFinite(minAgeMs)) { // age guard — don't flag a just-released claim
      const upd = s.updated_at ? new Date(s.updated_at).getTime() : NaN;
      if (Number.isFinite(upd) && (nowMs - upd) < minAgeMs) return false;
    }
    return true;
  });
  const samples = orphans.slice(0, 10).map((s) => ({ sd_key: s.sd_key, phase: s.current_phase ?? null }));
  const matched = orphans.length > 0;
  return {
    violation: matched,
    orphanCount: orphans.length,
    samples,
    detail: matched
      ? `${orphans.length} in_progress SD(s) UNCLAIMED with no live worker (orphan — off the belt, not self-recoverable) — ${samples.slice(0, 3).map((x) => `${x.sd_key}(${x.phase || '?'})`).join(', ')}`
      : 'none (every in_progress SD is claimed or has a live worker)',
    remediation: matched
      ? 'ACTION: recover the orphaned in_progress SD(s) — reset to a claimable state (re-open to the belt) or reassign to a live worker; in_progress + claiming_session_id=NULL with no PID-heartbeating session means no /checkin will ever self-resume them'
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

/**
 * SOURCE-TO-CAPACITY handshake (SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 FR-3):
 * when the claimable belt is low AND workers are idle, the coordinator must have actually REQUESTED
 * work (pinged Adam to source) — belt-low + idle + no recent source request is a coordinator
 * sourcing-handshake failure. `sourceRequestedRecently` is an injected fact (a recent
 * coordinator_request / adam_advisory sourcing-ping row exists). Belt-low alone is NOT a violation.
 * @param {{ claimableBelt?: number|null, idleWorkers?: number|null, sourceRequestedRecently?: boolean|null, beltLowThreshold?: number }} facts
 */
export function detectSourceToCapacity({ claimableBelt, idleWorkers, sourceRequestedRecently, beltLowThreshold = 1, quiescent = false } = {}) {
  // SD-LEO-INFRA-FLEET-HIBERNATION-001 FR-3 (LINCHPIN): when the fleet is QUIESCENT (the line is
  // genuinely stopped per assessFleetActivity — no workers building, no deficit, no venture-1 decision
  // pending), a low belt + idle worker is NOT a charter violation. There is nothing to source for while
  // quiesced, so the chairman's drive-to-0 directive must not force a sourcing-handshake re-send. The
  // belt-low handshake only matters when there IS demand. (Chairman-blessed via this SD.)
  if (quiescent === true) {
    return { violation: false, detail: `fleet QUIESCENT — belt=${claimableBelt}, idle=${idleWorkers}: belt-low source-to-capacity handshake suppressed (nothing to source while the line is stopped)`, remediation: null };
  }
  // Fail-loud: an unresolved input is reported, never silently treated as healthy.
  if (claimableBelt == null || idleWorkers == null || sourceRequestedRecently == null) {
    return { violation: true, detail: 'SOURCE-TO-CAPACITY inputs unresolved (belt/idle/sourceRequested) — cannot confirm the handshake (fail-loud)', remediation: 'ACTION: resolve the belt/idle/source-request facts before trusting the handshake' };
  }
  const beltLow = Number(claimableBelt) <= beltLowThreshold;
  const idle = Number(idleWorkers) > 0;
  const violation = beltLow && idle && sourceRequestedRecently !== true;
  return {
    violation,
    detail: violation
      ? `belt low (${claimableBelt}<=${beltLowThreshold}) + ${idleWorkers} idle worker(s) but NO recent coordinator source-request — sourcing handshake not initiated`
      : `belt=${claimableBelt}, idle=${idleWorkers}, sourceRequestedRecently=${sourceRequestedRecently} — handshake ok`,
    remediation: violation ? 'ACTION: ping Adam to source gap-closing SDs (belt-low source-to-capacity handshake)' : null,
  };
}

/**
 * D3-lean (FR-3): the coordinator should not run alone — Adam is its sourcing counterpart. A live
 * coordinator session with NO live Adam session is a D3 structural gap. `coordinatorAlive` and
 * `adamAlive` are injected liveness facts (from the session-role rows the host already loads).
 * @param {{ coordinatorAlive?: boolean|null, adamAlive?: boolean|null }} facts
 */
export function detectCoordinatorWithoutAdam({ coordinatorAlive, adamAlive } = {}) {
  if (coordinatorAlive == null || adamAlive == null) {
    return { violation: true, detail: 'D3-lean inputs unresolved (coordinatorAlive/adamAlive) — cannot confirm pairing (fail-loud)', remediation: 'ACTION: resolve coordinator/Adam liveness before trusting the pairing' };
  }
  const violation = coordinatorAlive === true && adamAlive !== true;
  return {
    violation,
    detail: violation
      ? 'coordinator is live but NO live Adam session — running lean (D3 structural gap)'
      : `coordinatorAlive=${coordinatorAlive}, adamAlive=${adamAlive} — pairing ok`,
    remediation: violation ? 'ACTION: start/revive the Adam session so the coordinator has its sourcing counterpart' : null,
  };
}

/**
 * QF-20260720-497 — model-stamp gauge FAIL-LOUD: a LIVE, participating worker with NO self-reported
 * model (metadata.model absent OR metadata.effort_source !== 'worker_self_report') must be FLAGGED,
 * not silently counted 'unknown'. The silent-unknown posture let a capacity/allocation decision keyed
 * on claude_sessions.metadata.model run at a fraction of true resolution (live evidence: workers
 * switched to Sonnet-UltraCode via /model while the DB gauge stayed stale — '3 Fable invisible, DB
 * stamped 1'). PURE: injected liveSessions in, verdict out (data-in / verdict-out like its siblings).
 * A fresh startup ghost that has not yet participated (no claim / worktree / completed-SD counter) is
 * NOT a violation — it may simply not have self-reported yet.
 * @param {{ liveSessions?: Array<{session_id?:string, metadata?:object, claimed_at?:string, worktree_path?:string, continuous_sds_completed?:number}> }} facts
 */
export function detectUnstampedModel({ liveSessions = [] } = {}) {
  const selfReportsModel = (s) => {
    const m = s && s.metadata;
    return !!(m && typeof m.model === 'string' && m.model.trim() && m.effort_source === 'worker_self_report');
  };
  const everParticipated = (s) => !!(s && (s.claimed_at || s.worktree_path || (s.continuous_sds_completed > 0)));
  const participating = liveSessions.filter(everParticipated);
  const unstamped = participating.filter((s) => !selfReportsModel(s));
  const violation = unstamped.length > 0;
  return {
    violation,
    unstampedCount: unstamped.length,
    participatingCount: participating.length,
    unstampedSessions: unstamped.map((s) => s.session_id),
    detail: violation
      ? `${unstamped.length}/${participating.length} live participating worker(s) have NO worker_self_report model — the model gauge is silently blind on them (capacity decisions keyed on metadata.model run at reduced resolution)`
      : `all ${participating.length} live participating worker(s) self-report a model`,
    remediation: violation
      ? 'ACTION: have each flagged worker re-run worker-checkin.cjs --model <m> --effort <e> (writes effort_source=worker_self_report); verify /model-switch propagates to metadata.model+effort (QF-20260710-406 path must cover model+effort, not just tier) — do NOT silently count them unknown'
      : null,
  };
}

/** Collect violations (each with its remediation) from a list of detector results. */
export function summarizeViolations(results = []) {
  const violations = results.filter((r) => r && r.violation).map((r) => ({ detail: r.detail, remediation: r.remediation || null }));
  return { count: violations.length, violations };
}
