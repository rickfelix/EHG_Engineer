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
  if (!rows.length) return 0; // guard: empty rows must never produce NaN (Math.round(0/0))
  return Math.round(rows.reduce((a, p) => a + (Number(pick(p)) || 0), 0) / rows.length);
}

// idle_count when present, else total_count - active_count. Clamped non-negative for
// BOTH paths so bad data (e.g. a negative idle_count) can never render a negative idle.
function idleOf(p) {
  const v = p.idle_count != null ? (Number(p.idle_count) || 0) : ((Number(p.total_count) || 0) - (Number(p.active_count) || 0));
  return Math.max(0, v);
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
  // Clamp threshold >= 1 so a 0/NaN threshold can never route an EMPTY primary window into
  // the confident "hourly avg" branch (which would render a confident NaN). Default 2 keeps
  // the SD invariant: a single pulse is never a confident hourly average.
  const thr = Math.max(1, Number(threshold) || SPARSE_THRESHOLD);

  // (a) Enough samples in the primary window -> confident hourly average.
  if (primary.length >= thr && primary.length > 0) {
    return { active: avgOf(primary, (p) => p.active_count), idle: avgOf(primary, idleOf), source: 'hourly avg', sparse: false, label: 'hourly avg' };
  }

  // (b) Sparse primary -> PREFER the live instantaneous count: it is the freshest signal,
  // whereas a wider-window average can be dominated by stale 2-3h-old samples and badly
  // misrepresent current fleet state (adversarial review: 1 fresh pulse=8 + live=8 must not
  // be reported as a 3h mean of 3). Live wins over the wide average when available.
  if (liveOk) {
    const n = primary.length;
    const label = n > 0 ? `live (sparse: ${n} pulse${n === 1 ? '' : 's'} in 1h)` : 'live';
    return { active: Number(live.active), idle: Number.isFinite(Number(live.idle)) ? Number(live.idle) : 0, source: 'live', sparse: true, label };
  }

  // (c) Sparse primary AND no live -> fall back to the wider window if IT has enough samples
  // (a stale-ish average still beats nothing when the live read is unavailable).
  if (wide.length >= thr) {
    return { active: avgOf(wide, (p) => p.active_count), idle: avgOf(wide, idleOf), source: 'wide avg', sparse: true, label: `${wideHours}h avg, sparse` };
  }

  // (d) No live, but we have a few primary samples -> report them, labeled honestly as sparse.
  if (primary.length > 0) {
    const n = primary.length;
    return { active: avgOf(primary, (p) => p.active_count), idle: avgOf(primary, idleOf), source: 'hourly avg', sparse: true, label: `hourly avg, sparse: ${n} sample${n === 1 ? '' : 's'}` };
  }

  // (e) Nothing at all.
  return { active: null, idle: 0, source: 'unavailable', sparse: true, label: 'unavailable' };
}
