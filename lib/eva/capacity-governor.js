/**
 * SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001: data-calibrated fleet cycle-down
 * governor. Reuses existing telemetry (session_coordination row counts -- the
 * same "sends-first" signal lib/fleet/claim-boundary-probe.cjs already trusts --
 * and claude_sessions.metadata.model for seat tier) rather than adding new
 * tracking infrastructure. Coordinator-behavioral: this module computes a
 * verdict, it never claims/blocks/parks a session itself.
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const DEFAULT_BUDGET_SESSION_HOURS = 32 * 0.7; // 22.4 -- used only when the ledger is empty
const REFERENCE_BURN_PER_SESSION_PER_HOUR = 8; // initial estimate: ~8 session_coordination sends/session/hour under typical LEO cadence
const MIN_CONFIDENT_EVENT_COUNT = 5;

// QF-20260706-630 (defect 3): per-model burn weight relative to a sonnet baseline (1x) --
// fable seats run heavier reasoning per tick (~2x), opus is heavier than sonnet, haiku lighter.
// Used both to weight the core-size survival math and to order parking so heavier seats stay
// up longest (the chairman fable-stays-up doctrine): a frozen Fable seat loses more than a
// parked light seat, so light seats park first.
const MODEL_WEIGHTS = { fable: 2, opus: 1.3, sonnet: 1, haiku: 0.7 };

/** Resolve a session's model to its burn weight. Unknown/unset models default to the sonnet
 *  baseline (1) -- never NaN, never throws. */
export function resolveModelWeight(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('fable')) return MODEL_WEIGHTS.fable;
  if (m.includes('opus')) return MODEL_WEIGHTS.opus;
  if (m.includes('haiku')) return MODEL_WEIGHTS.haiku;
  return MODEL_WEIGHTS.sonnet;
}

/**
 * Pure function -- no DB access. hoursToWall = adjustedBudget / fleetSize, where
 * adjustedBudget shrinks as burn rises above the reference rate (burn-reactive,
 * not schedule-only).
 */
export function projectTimeToWall({
  budgetSessionHours,
  fleetSize,
  burnRatePerSessionPerHour = REFERENCE_BURN_PER_SESSION_PER_HOUR,
  referenceBurnRatePerSessionPerHour = REFERENCE_BURN_PER_SESSION_PER_HOUR,
}) {
  if (!fleetSize || fleetSize <= 0) {
    return { hoursToWall: Infinity, adjustedBudgetSessionHours: budgetSessionHours };
  }
  const burnMultiplier = referenceBurnRatePerSessionPerHour > 0
    ? (burnRatePerSessionPerHour / referenceBurnRatePerSessionPerHour)
    : 1;
  const safeMultiplier = burnMultiplier > 0 ? burnMultiplier : 1;
  const adjustedBudgetSessionHours = budgetSessionHours / safeMultiplier;
  const hoursToWall = adjustedBudgetSessionHours / fleetSize;
  return { hoursToWall, adjustedBudgetSessionHours, burnMultiplier: safeMultiplier };
}

// QF-20260720-706: capacity_limit_events.account is a free-text label
// (scripts/eva/overnight-capacity-governor.mjs's record-event CLI, e.g. 'codestreetlabs',
// 'rickfelix2000'), populated by a human typing it at record time -- NOT auto-derived, and NOT
// the same key scheme as lib/fleet/account-capacity-gauge.cjs's accountUuid8 (QF-20260720-406,
// a SEPARATE store for chairman-pasted /usage-dashboard readings -- a different data source
// entirely, not reconciled here). Live-verified the free-text label is the account email's
// local-part (rickfelix2000@gmail.com -> 'rickfelix2000', matching the ledger's own seed data)
// -- resolveAccountLabel derives it from getAccountIdentity() so callers never hand-type it.
export function resolveAccountLabel(identity) {
  if (!identity || typeof identity.email !== 'string') return null;
  const local = identity.email.split('@')[0];
  return local ? local.toLowerCase() : null;
}

/**
 * Budget (session-hours a window can sustain) learned from the ledger's
 * session_window_exhausted rows. Falls back to the documented default when the
 * ledger is empty -- never throws.
 *
 * QF-20260720-706: an optional account filter scopes the average to the account the fleet is
 * CURRENTLY on -- unfiltered, a genuinely-exhausted account's events were diluted by a fresh
 * account's events (and vice versa), corrupting the overnight park/core-size verdict. No
 * matching events for that account (a fresh/never-exhausted account) falls back to the SAME
 * documented default as an empty ledger -- never silently widens back out to the pooled
 * cross-account average, which would defeat the fix.
 */
export async function getCalibratedBudget(supabase, { account = null } = {}) {
  try {
    // Paginated (FR-6 batch 7): the ledger grows without bound and the average must
    // see every row. Page errors throw into the catch below (default budget).
    const data = await fetchAllPaginated(() => {
      let q = supabase
        .from('capacity_limit_events')
        .select('id, session_hours_burned')
        .eq('event_type', 'session_window_exhausted')
        .not('session_hours_burned', 'is', null);
      if (account) q = q.eq('account', account);
      return q.order('id', { ascending: true });
    });

    if (!data || data.length === 0) {
      return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
    }
    const values = data.map(r => Number(r.session_hours_burned)).filter(v => Number.isFinite(v));
    if (values.length === 0) {
      return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
    }
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return { budgetSessionHours: avg, source: account ? 'ledger_average_per_account' : 'ledger_average', eventCount: values.length };
  } catch {
    return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
  }
}

/**
 * Fleet-wide sends-per-session-per-hour over the trailing window, computed from
 * session_coordination row counts (the existing "sends-first" signal) divided by
 * the count of distinct active fleet sessions. Never throws; 0 on any failure or
 * empty input, never NaN.
 *
 * QF-20260720-706: NOT given an account filter, deliberately -- session_coordination carries
 * no account column, and the fleet runs under ONE account at a time (a rotation model, not
 * concurrent multi-account operation); getFleetRoster's own freshness filter already excludes
 * any stale session left over from before the last account switch. This burn-rate snapshot is
 * inherently scoped to whichever account is live right now -- unlike getCalibratedBudget's
 * ledger average, there is no cross-account pooling to fix here.
 */
export async function getCurrentBurnRate(supabase, { windowHours = 1, fleetSize = null } = {}) {
  try {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('session_coordination')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);

    if (error || count == null) return 0;

    let activeCount = fleetSize;
    if (activeCount == null) {
      const roster = await getFleetRoster(supabase);
      activeCount = roster.length;
    }
    if (!activeCount || activeCount <= 0) return 0;

    return count / activeCount / windowHours;
  } catch {
    return 0;
  }
}

/**
 * Live fleet roster: active, fleet (non-Solomon/non-Adam/non-coordinator) sessions, tagged
 * with a per-seat burn weight derived from the self-reported model. Never throws -- empty
 * array on failure.
 *
 * QF-20260706-630 (defect 2): the coordinator's own session was never excluded (only
 * non_fleet/adam/solomon were), so it could appear in its own park_list. Reuses the shared
 * isDispatchableFleetMember predicate (lib/fleet/session-predicates.mjs) -- the same SSOT
 * fleet-rollcall.cjs uses -- rather than a hand-rolled subset of the exclusion rules.
 */
export async function getFleetRoster(supabase) {
  try {
    // Paginated (FR-6 batch 7): a capped roster read would silently park the wrong
    // seats. Page errors throw into the catch below (empty roster, prior policy).
    const data = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('status', 'active')
      .order('session_id', { ascending: true }));

    if (!data) return [];

    const { isDispatchableFleetMember } = await import('../fleet/session-predicates.mjs');
    const { getActiveCoordinatorId } = await import('../coordinator/resolve.cjs');
    const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);

    return data
      .filter(row => row.metadata?.role !== 'solomon' && isDispatchableFleetMember(row, coordinatorId))
      .map(row => ({
        sessionId: row.session_id,
        callsign: row.metadata?.fleet_identity?.callsign || row.session_id,
        model: row.metadata?.model || 'unknown',
        weight: resolveModelWeight(row.metadata?.model),
      }));
  } catch {
    return [];
  }
}

/**
 * Combines projection + live roster into the single queryable verdict the SD's
 * own success criteria names: { core_size, park_list, park_at, resume_at, confidence }.
 * Light seats park first, heaviest (fable) seats stay up longest, per the SD's explicit
 * park-order requirement ("a frozen Fable seat loses more than a parked one").
 */
export function computeVerdict({
  fleetRoster,
  projectedHoursToWall,
  unattendedWindowHours,
  eventCount = 0,
  windowEntryIso = null,
  parkLeadMinutes = 30,
  resumeAtIso = null,
}) {
  // QF-20260706-630 (defect 1): anchor to NOW when no explicit --window-entry is given, not a
  // fixed clock target -- a 6h-window ask must span the next 6h from now, not "6h starting at
  // the next 23:00 boundary" (which produced ~26h plans for a 6h ask when run mid-day/night).
  const windowEntry = windowEntryIso ? new Date(windowEntryIso) : new Date();
  const roster = [...fleetRoster];
  // QF-20260706-630 (defect 3): heaviest (fable) seats first, so they remain in the surviving
  // core longest -- the park loop below parks from the light/END of the array first, per the
  // chairman fable-stays-up doctrine (a frozen Fable seat loses more than a parked light one).
  roster.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

  const parkList = [];
  let coreSize = roster.length;
  // Sum of burn weights for the N heaviest-first seats -- the WEIGHTED effective fleet size,
  // not a raw headcount, so 1 fable + 1 sonnet (weight 3) burns like ~3 standard seats, not 2.
  const weightOf = (n) => roster.slice(0, n).reduce((sum, r) => sum + (r.weight ?? 1), 0);

  // If the fleet's current size can't survive the whole unattended window at the
  // projected burn, shrink from the light end until it (roughly) can.
  for (let candidateSize = roster.length; candidateSize >= 1; candidateSize--) {
    const effectiveSize = weightOf(candidateSize);
    const { hoursToWall } = projectTimeToWall({
      budgetSessionHours: (projectedHoursToWall || 0) * effectiveSize,
      fleetSize: effectiveSize,
      burnRatePerSessionPerHour: REFERENCE_BURN_PER_SESSION_PER_HOUR,
      referenceBurnRatePerSessionPerHour: REFERENCE_BURN_PER_SESSION_PER_HOUR,
    });
    if (hoursToWall >= unattendedWindowHours || candidateSize === roster.length) {
      coreSize = candidateSize;
      break;
    }
  }
  // Simpler, monotonic fallback: shrink core size proportionally to the deficit
  // between projected survival and the window length when the loop above can't
  // find a size that survives (projectedHoursToWall already too short even solo).
  if (projectedHoursToWall > 0 && projectedHoursToWall < unattendedWindowHours && roster.length > 0) {
    const survivableFraction = Math.max(0, Math.min(1, projectedHoursToWall / unattendedWindowHours));
    coreSize = Math.max(1, Math.min(coreSize, Math.floor(roster.length * survivableFraction) || 1));
  }

  for (let i = roster.length - 1; i >= coreSize; i--) {
    parkList.push(roster[i]);
  }

  const parkAt = new Date(windowEntry.getTime() - parkLeadMinutes * 60 * 1000).toISOString();
  const resumeAt = resumeAtIso || new Date(windowEntry.getTime() + unattendedWindowHours * 60 * 60 * 1000).toISOString();

  return {
    core_size: coreSize,
    park_list: parkList.map(s => ({ sessionId: s.sessionId, callsign: s.callsign, model: s.model, weight: s.weight })),
    park_at: parkAt,
    resume_at: resumeAt,
    confidence: eventCount >= MIN_CONFIDENT_EVENT_COUNT ? 'medium' : 'low',
  };
}

export const CONSTANTS = {
  DEFAULT_BUDGET_SESSION_HOURS,
  REFERENCE_BURN_PER_SESSION_PER_HOUR,
  MIN_CONFIDENT_EVENT_COUNT,
  MODEL_WEIGHTS,
};
