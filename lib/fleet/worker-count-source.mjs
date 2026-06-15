/**
 * Worker-count source resolution — SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001.
 *
 * PURE, no I/O. Decides the fleet worker count + an HONEST source label from
 * fleet_worker_pulse rows in the primary (1h) window, an optional wider (2-3h)
 * window, and a live instantaneous count. The defect this fixes: the prior inline
 * logic in scripts/adam-exec-summary.mjs labeled a window "hourly avg" the moment
 * ANY pulse (even one) landed — so a single stale sample was presented as a
 * confident hourly average. Here a sub-threshold window is NEVER shown as a bare
 * confident "hourly avg": it widens to the wider window, prefers the live count,
 * or labels itself explicitly sparse.
 *
 * Callers pass already-fetched arrays so this stays pure + unit-testable; the
 * consumer fetches the wider window / live count LAZILY, only when the primary
 * window is sparse (no extra cost in the healthy case).
 */

/** Default: fewer than this many pulses in the primary window = "sparse". */
export const SPARSE_THRESHOLD = 2;

function avgOf(rows, pick) {
  return Math.round(rows.reduce((a, p) => a + (Number(pick(p)) || 0), 0) / rows.length);
}

// idle_count when present, else total_count - active_count (never negative).
function idleOf(p) {
  if (p.idle_count != null) return Number(p.idle_count) || 0;
  return Math.max(0, (Number(p.total_count) || 0) - (Number(p.active_count) || 0));
}

/**
 * Resolve the worker count + honest source label.
 * @param {object} args
 * @param {Array}  [args.primaryPulses=[]] pulse rows in the primary (1h) window
 * @param {Array}  [args.widePulses=[]]    pulse rows in the wider (wideHours) window (superset of primary)
 * @param {{active:number, idle?:number}|null} [args.live=null] live instantaneous count
 * @param {number} [args.threshold=SPARSE_THRESHOLD] min primary pulses for a confident hourly avg
 * @param {number} [args.wideHours=3] hours the wider window spans (label only)
 * @returns {{active:number|null, idle:number, source:string, sparse:boolean, label:string}}
 */
export function resolveWorkerCount({ primaryPulses = [], widePulses = [], live = null, threshold = SPARSE_THRESHOLD, wideHours = 3 } = {}) {
  const primary = Array.isArray(primaryPulses) ? primaryPulses : [];
  const wide = Array.isArray(widePulses) ? widePulses : [];
  const liveOk = live && Number.isFinite(Number(live.active));

  // (a) Enough samples in the primary window -> confident hourly average.
  if (primary.length >= threshold) {
    return { active: avgOf(primary, (p) => p.active_count), idle: avgOf(primary, idleOf), source: 'hourly avg', sparse: false, label: 'hourly avg' };
  }

  // (b) Sparse primary -> use the wider window if IT has enough samples.
  if (wide.length >= threshold) {
    return { active: avgOf(wide, (p) => p.active_count), idle: avgOf(wide, idleOf), source: 'wide avg', sparse: true, label: `${wideHours}h avg, sparse` };
  }

  // (c) Still sparse -> prefer the live instantaneous count when available.
  if (liveOk) {
    const n = primary.length;
    const label = n > 0 ? `live (sparse: ${n} pulse${n === 1 ? '' : 's'} in 1h)` : 'live';
    return { active: Number(live.active), idle: Number.isFinite(Number(live.idle)) ? Number(live.idle) : 0, source: 'live', sparse: true, label };
  }

  // (d) No live, but we have a few primary samples -> report them, labeled honestly as sparse.
  if (primary.length > 0) {
    const n = primary.length;
    return { active: avgOf(primary, (p) => p.active_count), idle: avgOf(primary, idleOf), source: 'hourly avg', sparse: true, label: `hourly avg, sparse: ${n} sample${n === 1 ? '' : 's'}` };
  }

  // (e) Nothing at all.
  return { active: null, idle: 0, source: 'unavailable', sparse: true, label: 'unavailable' };
}
