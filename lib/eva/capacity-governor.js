/**
 * SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001: data-calibrated fleet cycle-down
 * governor. Reuses existing telemetry (session_coordination row counts -- the
 * same "sends-first" signal lib/fleet/claim-boundary-probe.cjs already trusts --
 * and claude_sessions.metadata.model for seat tier) rather than adding new
 * tracking infrastructure. Coordinator-behavioral: this module computes a
 * verdict, it never claims/blocks/parks a session itself.
 */

const DEFAULT_BUDGET_SESSION_HOURS = 32 * 0.7; // 22.4 -- used only when the ledger is empty
const REFERENCE_BURN_PER_SESSION_PER_HOUR = 8; // initial estimate: ~8 session_coordination sends/session/hour under typical LEO cadence
const MIN_CONFIDENT_EVENT_COUNT = 5;

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

/**
 * Budget (session-hours a window can sustain) learned from the ledger's
 * session_window_exhausted rows. Falls back to the documented default when the
 * ledger is empty -- never throws.
 */
export async function getCalibratedBudget(supabase) {
  try {
    const { data, error } = await supabase
      .from('capacity_limit_events')
      .select('session_hours_burned')
      .eq('event_type', 'session_window_exhausted')
      .not('session_hours_burned', 'is', null);

    if (error || !data || data.length === 0) {
      return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
    }
    const values = data.map(r => Number(r.session_hours_burned)).filter(v => Number.isFinite(v));
    if (values.length === 0) {
      return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
    }
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return { budgetSessionHours: avg, source: 'ledger_average', eventCount: values.length };
  } catch {
    return { budgetSessionHours: DEFAULT_BUDGET_SESSION_HOURS, source: 'default', eventCount: 0 };
  }
}

/**
 * Fleet-wide sends-per-session-per-hour over the trailing window, computed from
 * session_coordination row counts (the existing "sends-first" signal) divided by
 * the count of distinct active fleet sessions. Never throws; 0 on any failure or
 * empty input, never NaN.
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
 * Live fleet roster: active, fleet (non-Solomon/non-Adam) sessions, tagged with
 * a coarse seat tier derived from the self-reported model. Never throws --
 * empty array on failure.
 */
export async function getFleetRoster(supabase) {
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, metadata')
      .eq('status', 'active');

    if (error || !data) return [];

    return data
      .filter(row => !row.metadata?.non_fleet && row.metadata?.role !== 'solomon' && row.metadata?.role !== 'adam')
      .map(row => ({
        sessionId: row.session_id,
        callsign: row.metadata?.fleet_identity?.callsign || row.session_id,
        model: row.metadata?.model || 'unknown',
        seatTier: isBurstTierModel(row.metadata?.model) ? 'burst' : 'standard',
      }));
  } catch {
    return [];
  }
}

function isBurstTierModel(model) {
  if (!model) return false;
  return /fable/i.test(model);
}

/**
 * Combines projection + live roster into the single queryable verdict the SD's
 * own success criteria names: { core_size, park_list, park_at, resume_at, confidence }.
 * Burst/premium-tier seats park first, per the SD's explicit park-order requirement
 * ("a frozen Fable seat loses more than a parked one").
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
  const windowEntry = windowEntryIso ? new Date(windowEntryIso) : defaultWindowEntry();
  const roster = [...fleetRoster];
  // Burst-tier first, so it is parked before any standard-tier seat.
  roster.sort((a, b) => (a.seatTier === 'burst' ? -1 : 0) - (b.seatTier === 'burst' ? -1 : 0));

  const parkList = [];
  let coreSize = roster.length;

  // If the fleet's current size can't survive the whole unattended window at the
  // projected burn, shrink from the burst end until it (roughly) can.
  for (let candidateSize = roster.length; candidateSize >= 1; candidateSize--) {
    const { hoursToWall } = projectTimeToWall({
      budgetSessionHours: (projectedHoursToWall || 0) * candidateSize,
      fleetSize: candidateSize,
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
    park_list: parkList.map(s => ({ sessionId: s.sessionId, callsign: s.callsign, seatTier: s.seatTier })),
    park_at: parkAt,
    resume_at: resumeAt,
    confidence: eventCount >= MIN_CONFIDENT_EVENT_COUNT ? 'medium' : 'low',
  };
}

/** Default unattended-window entry: today (or tomorrow, if already past) at 23:00 local. */
function defaultWindowEntry() {
  const d = new Date();
  d.setHours(23, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export const CONSTANTS = {
  DEFAULT_BUDGET_SESSION_HOURS,
  REFERENCE_BURN_PER_SESSION_PER_HOUR,
  MIN_CONFIDENT_EVENT_COUNT,
};
