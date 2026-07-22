/**
 * Real-build STALL alarm — SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-B
 * (Part 2 of a decomposed orchestrator; Part 1 = the divergence discriminator, a separate
 * child that shipped lib/governance/real-build-discriminator.mjs via merged PR #6398).
 *
 * WHAT THIS ADDS ON TOP OF THE DISCRIMINATOR:
 *   The discriminator (assessRealBuildDivergence) answers "is this venture's stage gauge
 *   diverging from real-build reality RIGHT NOW?" — a point-in-time boolean. It does NOT
 *   know how LONG the venture has sat in that state, so it cannot distinguish:
 *     (a) a venture that JUST crossed the boundary and is legitimately being gated /
 *         actively worked (S19_HARD_GATE doing its job — NOT a stall), from
 *     (b) a venture that has been divergent and MOTIONLESS for weeks — a real stall.
 *   This module supplies the missing TIME axis: a divergent venture only ALARMS once it has
 *   also stopped moving for longer than a tiered clock. Divergent-BUT-progressing => no alarm.
 *
 * TIERED CLOCK (a config decision, NOT code):
 *   Every venture is measured against DEFAULT_STALL_CLOCK_DAYS. The chairman can designate a
 *   flagship venture for a SHORTER (more urgent) clock purely by setting the per-venture
 *   `metadata.stall_clock_tier` convention — no code change. resolveStallClockDays fail-safes
 *   any malformed / absent / negative / longer-than-default value back to the default, so a
 *   bad config can only ever be as urgent as the baseline, never accidentally stricter and
 *   never longer than the floor of urgency every venture already gets. Mirrors the per-venture
 *   tiered-array style of ventures.metadata.kill_criteria.
 *
 * Pure (data-in / verdict-out): zero I/O, zero DB, never throws.
 */
import { assessRealBuildDivergence } from './real-build-discriminator.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * DEFAULT_STALL_CLOCK_DAYS — the baseline stall clock applied to EVERY venture.
 *
 * Chosen at 14 days (two weeks). The real build begins at Stage 19 (see
 * STAGE_SIMULATION_OK in real-build-discriminator.mjs); a venture that has advanced its
 * gauge PAST that boundary with no real-build evidence AND has shown zero forward motion for
 * two full weeks — a whole sprint — is clearly stalled rather than mid-transition or being
 * legitimately gated over a few days. Fourteen days is deliberately conservative: long enough
 * that a venture working through a hard gate (S19_HARD_GATE) or a multi-day design pass never
 * false-alarms, short enough that a genuinely-abandoned simulation-validated venture surfaces
 * within one review cycle. A flagship's shorter per-venture clock (metadata.stall_clock_tier)
 * catches the important ones sooner.
 * @type {number}
 */
export const DEFAULT_STALL_CLOCK_DAYS = 14;

/**
 * Coerce a timestamp (ISO string | epoch-ms number | Date) to epoch ms, or null if unusable.
 * @param {string|number|Date|null|undefined} t
 * @returns {number|null}
 */
function toMillis(t) {
  if (t == null) return null;
  if (t instanceof Date) { const m = t.getTime(); return Number.isNaN(m) ? null : m; }
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (typeof t === 'string') { const m = Date.parse(t); return Number.isNaN(m) ? null : m; }
  return null;
}

/**
 * Resolve the stall clock (days) AND a human tier label for one venture from the per-venture
 * `metadata.stall_clock_tier` convention. Accepts either:
 *   - a bare number           → shorter-clock days (e.g. `stall_clock_tier: 7`)
 *   - an object with clock_days→ `{ clock_days: 7 }` or `{ tier: 'flagship', clock_days: 7 }`
 * FAIL-SAFE: a candidate is honored ONLY when it is a finite number strictly > 0 and strictly
 * SHORTER than DEFAULT_STALL_CLOCK_DAYS. Anything else (absent / malformed / non-number /
 * zero / negative / >= default) collapses to the default. This guarantees a per-venture
 * override can only ever make a venture MORE urgent than the baseline, never less, and a
 * corrupt value (e.g. 0) can never be accidentally interpreted as "alarm immediately".
 * @param {{metadata?:{stall_clock_tier?:number|{clock_days?:number,tier?:string}}}} venture
 * @returns {{ clock_days:number, tier:string }}
 */
export function resolveStallClockTier(venture = {}) {
  const raw = venture && venture.metadata ? venture.metadata.stall_clock_tier : undefined;
  let candidate = null;
  let tierLabel = null;
  if (typeof raw === 'number') {
    candidate = raw;
  } else if (raw && typeof raw === 'object') {
    if (typeof raw.clock_days === 'number') candidate = raw.clock_days;
    if (typeof raw.tier === 'string') tierLabel = raw.tier;
  }
  if (Number.isFinite(candidate) && candidate > 0 && candidate < DEFAULT_STALL_CLOCK_DAYS) {
    return { clock_days: candidate, tier: tierLabel || 'flagship' };
  }
  return { clock_days: DEFAULT_STALL_CLOCK_DAYS, tier: 'default' };
}

/**
 * The clock in days for one venture — see resolveStallClockTier for the fail-safe contract.
 * @param {object} venture
 * @returns {number}
 */
export function resolveStallClockDays(venture = {}) {
  return resolveStallClockTier(venture).clock_days;
}

/**
 * Evaluate whether a venture is BOTH divergent (per the Child-A discriminator) AND stalled
 * (no forward motion for >= its tiered clock). This is the whole point of the SD: alarm ONLY
 * on the intersection, never on a divergent-but-progressing venture (a working gate) and never
 * on a real-build venture.
 *
 * @param {object} venture - the venture row (fed to assessRealBuildDivergence + tier resolver)
 * @param {{now?:number|Date|string, lastStageAdvanceAt?:number|Date|string|null}} [opts]
 *   - now: the evaluation instant (default Date.now()).
 *   - lastStageAdvanceAt: the venture's last forward-motion timestamp (latest stage_executions
 *     advance / current_lifecycle_stage change). NULL/unknown => FAIL-SAFE to no-alarm
 *     (reason 'no-stall-signal') rather than false-alarming on missing data.
 * @returns {{ alarm:boolean, tier:string, clock_days:number, reason:string, elapsed_days:number|null }}
 */
export function evaluateRealBuildStall(venture = {}, { now = Date.now(), lastStageAdvanceAt = null } = {}) {
  const { clock_days, tier } = resolveStallClockTier(venture);
  const base = { tier, clock_days, elapsed_days: null };

  let divergent = false;
  try {
    divergent = Boolean(assessRealBuildDivergence(venture).divergent);
  } catch {
    // Discriminator is pure and never throws, but honor the never-throw contract regardless.
    return { alarm: false, reason: 'real-build-or-not-divergent', ...base };
  }
  if (!divergent) {
    // Either a real build has started, or the stage gauge is still within the simulation-OK
    // boundary — nothing to alarm about.
    return { alarm: false, reason: 'real-build-or-not-divergent', ...base };
  }

  const lastMs = toMillis(lastStageAdvanceAt);
  if (lastMs == null) {
    // Divergent but we have NO motion signal — do NOT invent a stall from missing data.
    return { alarm: false, reason: 'no-stall-signal', ...base };
  }

  const nowMs = toMillis(now) ?? Date.now();
  const elapsedDays = (nowMs - lastMs) / MS_PER_DAY;
  const alarm = elapsedDays >= clock_days;
  return {
    alarm,
    reason: alarm ? 'divergent-and-stalled' : 'gated-or-progressing',
    tier,
    clock_days,
    elapsed_days: Math.round(elapsedDays * 10) / 10,
  };
}
