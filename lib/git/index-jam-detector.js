/**
 * Jammed git index detector — pure core (SD-LEO-INFRA-JAMMED-GIT-INDEX-001)
 *
 * A stale .git/index.lock froze every git operation in the shared tree for ~3 hours and nothing
 * saw it. The claim sweep and drain gauge read DB state; the worktree reaper runs
 * `git worktree list --porcelain`, which never touches the index, so it keeps SUCCEEDING during
 * the outage and reports git healthy.
 *
 * WHY THIS OBSERVES RATHER THAN PROBES, all established by measurement at PLAN:
 *
 *   - `git update-index --refresh` exits 1 on a merely DIRTY tree. The shared root is chronically
 *     dirty, so a probe-based detector alarms permanently.
 *   - With a stat-clean index and an orphan lock present, that probe exits 0 in 5/5 runs while real
 *     `git add`/`git commit` fail 128 — a clean bill of health during the outage.
 *   - During a LIVE HEALTHY `git add`, the probe returns 128 too, identical to the orphan case. Five
 *     non-destructive discriminators (open r, open r+, open a, exclusive create, size) all returned
 *     identical results in both states. A single-shot probe therefore carries exactly the
 *     information of "a lock exists".
 *   - Acquiring the lock to test it (`--force-write-index`) would make the detector leave, if killed
 *     mid-write, the very orphan lock that IS the incident.
 *
 * So the only sound non-destructive discriminant is PERSISTENCE OF A STABLE LOCK IDENTITY OVER TIME.
 *
 * AND PRESENCE IS NOT PERSISTENCE. Six back-to-back healthy `git add`s left a lock present at 12 of
 * 12 ticks across FOUR DISTINCT identities. A presence-only detector calls that JAMMED. Persistence
 * must therefore accumulate only while the identity is unchanged.
 */

export const VERDICT = Object.freeze({
  HEALTHY: 'HEALTHY',
  JAMMED: 'JAMMED',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Dwell floor, DERIVED not picked:
 *   healthy ceiling — a `git add -A` of 5000 files holds the lock ~40.0s; of 12000 files ~44.2s
 *     (the curve flattens, so the 5000 figure was first-bulk-add cost, not file count)
 *   real-jam floor  — the shortest recorded genuine jam was 7 minutes
 * 90s gives ~2x headroom over the healthy ceiling and sits far under the shortest real jam.
 * Anything under 60s false-positives on healthy bulk work.
 *
 * Git HOOKS do not constrain this: an 8s sleeping pre-commit hook held no lock at any sample —
 * git runs hooks BEFORE acquiring. That matters here because .husky/pre-commit runs vitest.
 */
export const DEFAULT_DWELL_MS = 90_000;
export const DEFAULT_TICK_MS = 30_000;

/**
 * Identity token for a lock observation.
 *
 * (mtimeMs, ino) is stable across samples of one live-held lock and differs between successive
 * distinct locks. This is a SAMENESS comparison, never an age computation — lock AGE as a verdict
 * is the measurably-false predicate this detector exists to avoid.
 *
 * NEVER use birthtime: on NTFS, three files created ~1.2s apart with three different inodes all
 * reported an IDENTICAL birthtimeMs (file tunneling). It is the obvious field and it silently
 * rebuilds the false positive.
 */
export function lockIdentityOf(stat) {
  if (!stat) return null;
  return `${stat.mtimeMs}:${stat.ino}`;
}

const emptyState = () => ({ firstBlockedAtMs: null, lockIdentity: null });

/**
 * Pure verdict. State-in / state-out so it is unit-testable with plain fixtures — a cron tick is a
 * fresh process, so nothing may live in module memory, and reading the carry-over state from a
 * database inside this function would push every persistence test into the `db` vitest project,
 * which resolves to ZERO files and would be silently green.
 *
 * @param {{lockPresent:boolean, lockIdentity:string|null, error?:string}} observation
 * @param {number} nowMs
 * @param {{firstBlockedAtMs:number|null, lockIdentity:string|null}} [priorState]
 * @param {{dwellMs?:number}} [opts]
 * @returns {{verdict:string, jammedForMs:number|null, nextState:object, reason?:string}}
 */
/**
 * Reject carry-over state that would SUPPRESS an alarm.
 *
 * Measured: writing `firstBlockedAtMs` as a future timestamp, or as a non-numeric value, makes
 * `heldForMs >= dwellMs` false forever — 6 of 6 ticks reported HEALTHY against a real held lock,
 * and because the identity never changes during a genuine jam, it never self-heals. The bad value
 * was also written straight back each tick. A corrupt state file must degrade to "start counting
 * again", never to "permanently healthy".
 */
export function sanitizeState(state, nowMs) {
  if (!state || typeof state !== 'object') return emptyState();
  const t = state.firstBlockedAtMs;
  const usable = t === null || (Number.isFinite(t) && t > 0 && t <= nowMs);
  if (!usable) return { firstBlockedAtMs: null, lockIdentity: null };
  return { firstBlockedAtMs: t ?? null, lockIdentity: typeof state.lockIdentity === 'string' ? state.lockIdentity : null };
}

/**
 * A dwell floor that is NaN makes every comparison false and silently disables the detector
 * (measured: 20 ticks over 10 simulated minutes of one held lock, all HEALTHY). A floor of 0
 * rebuilds the presence-only false positive that TS-17a exists to disprove. Both fall back.
 */
export function sanitizeDwellMs(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DWELL_MS;
}

export function classifyIndexHealth(observation, nowMs, priorState, opts = {}) {
  const dwellMs = sanitizeDwellMs(opts.dwellMs ?? DEFAULT_DWELL_MS);
  const prior = sanitizeState(priorState, nowMs);

  // An observation we could not make must never read as health. It also must NOT reset the
  // counter: a transient stat failure mid-jam would otherwise restart the clock, and recurring
  // blips would mean a real jam is never reported. ENOENT is not an error here — it is a
  // successful observation that the lock is absent, handled below.
  if (observation?.error) {
    return { verdict: VERDICT.UNAVAILABLE, jammedForMs: null, nextState: prior, reason: observation.error };
  }

  // No lock: genuinely healthy, and the counter resets. This is the only reset path.
  if (!observation?.lockPresent) {
    return { verdict: VERDICT.HEALTHY, jammedForMs: null, nextState: emptyState() };
  }

  // A lock exists. Whether that is healthy work or a jam depends ENTIRELY on whether THIS SAME
  // lock has persisted — not on the lock existing, and not on its size or age.
  const identity = observation.lockIdentity ?? null;
  const sameLock = prior.lockIdentity !== null && identity !== null && identity === prior.lockIdentity;

  // A different lock means the previous one was released and git moved on: healthy churn.
  const firstBlockedAtMs = sameLock && prior.firstBlockedAtMs !== null ? prior.firstBlockedAtMs : nowMs;
  const heldForMs = Math.max(0, nowMs - firstBlockedAtMs);
  const nextState = { firstBlockedAtMs, lockIdentity: identity };

  if (heldForMs >= dwellMs) {
    return { verdict: VERDICT.JAMMED, jammedForMs: heldForMs, nextState };
  }
  return { verdict: VERDICT.HEALTHY, jammedForMs: null, nextState };
}

/** Only a confirmed jam is actionable. UNAVAILABLE is neither health nor a finding. */
export function exitCodeFor(verdict) {
  return verdict === VERDICT.JAMMED ? 1 : 0;
}

/** Human-readable line. A jam must name the TREE and the DURATION, never a raw git error string. */
export function formatVerdict(repoPath, result) {
  if (result.verdict === VERDICT.JAMMED) {
    const mins = (result.jammedForMs / 60000).toFixed(1);
    return `JAMMED GIT INDEX — ${repoPath} has been unwritable for ${mins} min. `
      + 'Every git index operation in this tree is blocked. This is a SHARED-RESOURCE condition, '
      + 'not a fault in your command.';
  }
  if (result.verdict === VERDICT.UNAVAILABLE) {
    return `UNAVAILABLE — could not observe ${repoPath}: ${result.reason}. Not a health verdict.`;
  }
  return `HEALTHY — ${repoPath} index is writable (no lock, or a lock held for less than the dwell floor).`;
}
