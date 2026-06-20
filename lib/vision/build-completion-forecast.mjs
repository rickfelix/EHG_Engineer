/**
 * build-completion-forecast.mjs — self-correcting infra-build completion forecaster
 * (SD-LEO-INFRA-BUILD-COMPLETION-FORECAST-001).
 *
 * Estimates the 100%-completion date for the BUILDABLE infra scope (operational caps excluded —
 * they need live ventures) from the VDR build gauge + completion velocity + the SOURCING RATE,
 * and is honest about the sourcing-bound case: if nothing is queued and nothing is being sourced,
 * it reports a PLATEAU at the current %, never a false date.
 *
 * Pure compute is separated from all IO (DB reads, the dormant forecast-log) so the model + its
 * self-correction are unit-testable without a database. The dominant, noisiest variable is the
 * sourcing rate — FR-3 learns it with an EWMA against observed reality.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// FR-3 safety: the learned caps-per-completion MUST stay in a sane band. The EWMA nudge
// (×1.1/×0.9 per run) has no fixed point, so an un-clamped value drifts geometrically over many
// runs (→ hundreds or →0), which would collapse every ETA. Clamp on read AND on adjust.
export const CAPS_PER_COMPLETION_MIN = 0.2;
export const CAPS_PER_COMPLETION_MAX = 5;
function clampCapsPerCompletion(v) { return Math.max(CAPS_PER_COMPLETION_MIN, Math.min(CAPS_PER_COMPLETION_MAX, v)); }

/**
 * FR-1 — compute the completion forecast.
 * @param {object} i
 * @param {number} i.buildPct            current VDR build_pct (0-100)
 * @param {number} i.buildableRemaining  count of buildable caps not yet built (status!=='built')
 * @param {number} i.velocityPerDay      completed SDs/day (recent window)
 * @param {number} i.sourcingPerDay      new claimable buildable SDs/day (recent window)
 * @param {number} i.queueDepth          claimable buildable SDs available now (draft+in_progress, deps met)
 * @param {number} [i.capsPerCompletion] LEARNED: buildable caps advanced per completed SD (FR-3; default 1)
 * @param {number} i.nowMs              REQUIRED current time (inject — deterministic)
 * @returns {{
 *   buildPct:number, buildableRemaining:number, plateau:boolean,
 *   bindingConstraint:'none'|'velocity'|'sourcing'|'plateau',
 *   etaDays:number|null, etaDateIso:string|null, confidence:'high'|'medium'|'low'|'none',
 *   note:string, assumptions:object
 * }}
 */
export function computeForecast(i = {}) {
  const buildPct = clampPct(i.buildPct);
  const buildableRemaining = nonNegInt(i.buildableRemaining);
  const velocityPerDay = nonNeg(i.velocityPerDay);
  const sourcingPerDay = nonNeg(i.sourcingPerDay);
  const queueDepth = nonNegInt(i.queueDepth);
  const capsPerCompletion = clampCapsPerCompletion(Number.isFinite(i.capsPerCompletion) && i.capsPerCompletion > 0 ? i.capsPerCompletion : 1);
  if (!Number.isFinite(i.nowMs)) throw new Error('computeForecast: nowMs (number) required');

  const assumptions = { buildPct, buildableRemaining, velocityPerDay, sourcingPerDay, queueDepth, capsPerCompletion, velocityWindowDays: i.velocityWindowDays ?? null, sourcingWindowDays: i.sourcingWindowDays ?? null };

  // Already complete.
  if (buildPct != null && buildPct >= 100) {
    return mk({ buildPct, buildableRemaining, plateau: false, bindingConstraint: 'none', etaDays: 0, etaDateIso: new Date(i.nowMs).toISOString(), confidence: 'high', note: 'buildable scope is 100% built', assumptions });
  }
  if (buildableRemaining === 0) {
    return mk({ buildPct, buildableRemaining, plateau: false, bindingConstraint: 'none', etaDays: 0, etaDateIso: new Date(i.nowMs).toISOString(), confidence: 'medium', note: '0 buildable caps remaining (gauge may lag)', assumptions });
  }

  // Throughput in caps/day from completion velocity.
  const velocityCapsPerDay = velocityPerDay * capsPerCompletion;

  // PLATEAU: nothing queued AND ~no sourcing → cannot progress; report the honest plateau, not a date.
  const SOURCING_EPS = 0.05; // SDs/day below which sourcing is "effectively zero"
  if (queueDepth === 0 && sourcingPerDay < SOURCING_EPS) {
    return mk({ buildPct, buildableRemaining, plateau: true, bindingConstraint: 'plateau', etaDays: null, etaDateIso: null, confidence: 'high', note: `plateau at ${buildPct == null ? '?' : buildPct}% until sourced — ${buildableRemaining} buildable cap(s) remain, queue empty, sourcing ~0`, assumptions });
  }

  // Velocity stalled but work exists.
  if (velocityCapsPerDay < 1e-6) {
    return mk({ buildPct, buildableRemaining, plateau: false, bindingConstraint: 'velocity', etaDays: null, etaDateIso: null, confidence: 'low', note: `no completion velocity in window — ${buildableRemaining} buildable cap(s) remain`, assumptions });
  }

  // Caps the current queue can cover vs caps that must still be SOURCED.
  const capsCoveredByQueue = Math.min(buildableRemaining, queueDepth * capsPerCompletion);
  const capsNeedingSourcing = Math.max(0, buildableRemaining - capsCoveredByQueue);

  // Phase 1: burn down the queued caps at completion velocity.
  const daysQueuePhase = capsCoveredByQueue / velocityCapsPerDay;

  let etaDays, bindingConstraint;
  if (capsNeedingSourcing <= 0) {
    etaDays = daysQueuePhase;
    bindingConstraint = 'velocity';
  } else {
    // Phase 2: the rest is gated by how fast new buildable work is sourced.
    const sourcingCapsPerDay = sourcingPerDay * capsPerCompletion;
    if (sourcingCapsPerDay < 1e-6) {
      // Some queue exists but not enough, and sourcing ~0 → partial then plateau.
      return mk({ buildPct, buildableRemaining, plateau: true, bindingConstraint: 'sourcing', etaDays: null, etaDateIso: null, confidence: 'medium', note: `queue covers ${Math.floor(capsCoveredByQueue)}/${buildableRemaining} caps then plateaus — sourcing ~0 for the remaining ${Math.ceil(capsNeedingSourcing)}`, assumptions });
    }
    // The slower of "complete what's sourced" vs "source the rest" governs the tail.
    const daysSourcingPhase = capsNeedingSourcing / Math.min(velocityCapsPerDay, sourcingCapsPerDay);
    etaDays = daysQueuePhase + daysSourcingPhase;
    bindingConstraint = sourcingCapsPerDay < velocityCapsPerDay ? 'sourcing' : 'velocity';
  }

  const etaDateIso = new Date(i.nowMs + etaDays * DAY_MS).toISOString();
  // Confidence is a function of the binding-constraint mix AND the horizon: a far-out ETA (even a
  // mathematically-correct linear extrapolation) is inherently less trustworthy, so cap it by horizon.
  const confidence = downgradeForHorizon(forecastConfidence({ velocityPerDay, sourcingPerDay, capsNeedingSourcing, buildableRemaining }), etaDays);
  const note = `~${Math.ceil(etaDays)}d to 100% buildable (${bindingConstraint}-bound; ${buildableRemaining} cap(s), queue ${queueDepth}, vel ${round2(velocityPerDay)}/d, src ${round2(sourcingPerDay)}/d)`;
  return mk({ buildPct, buildableRemaining, plateau: false, bindingConstraint, etaDays: round2(etaDays), etaDateIso, confidence, note, assumptions });
}

function forecastConfidence({ velocityPerDay, sourcingPerDay, capsNeedingSourcing, buildableRemaining }) {
  // Sourcing-bound forecasts are inherently noisier (sourcing is the volatile variable).
  if (velocityPerDay <= 0) return 'low';
  const sourcingShare = buildableRemaining > 0 ? capsNeedingSourcing / buildableRemaining : 0;
  if (sourcingShare > 0.5) return 'low';      // mostly gated by the volatile sourcing variable
  if (sourcingShare > 0) return 'medium';     // partly sourcing-dependent
  return 'high';                               // fully queue-covered (sourcing rate irrelevant), healthy velocity
}

// A long horizon caps confidence regardless of the constraint mix — a 168-day linear projection
// should never read 'high' to the chairman even when the queue covers the work.
function downgradeForHorizon(confidence, etaDays) {
  if (!Number.isFinite(etaDays)) return confidence;
  const order = ['none', 'low', 'medium', 'high'];
  let cap = 'high';
  if (etaDays > 365) cap = 'low';
  else if (etaDays > 120) cap = 'medium';
  return order.indexOf(confidence) <= order.indexOf(cap) ? confidence : cap;
}

/**
 * FR-3 — score a prior forecast against what actually happened, for the error trend.
 * @returns {{ priorEtaDays:number|null, actualDaysElapsed:number, buildPctDelta:number,
 *            absErrorDays:number|null, signedErrorDays:number|null, kind:string }}
 */
export function scoreForecastError(prior, actual) {
  if (!prior || !Number.isFinite(actual?.nowMs) || !Number.isFinite(prior?.measuredAtMs)) {
    return { priorEtaDays: prior?.etaDays ?? null, actualDaysElapsed: 0, buildPctDelta: 0, absErrorDays: null, signedErrorDays: null, kind: 'no_prior' };
  }
  const elapsed = (actual.nowMs - prior.measuredAtMs) / DAY_MS;
  const buildPctDelta = clampPct(actual.buildPct) - clampPct(prior.buildPct);
  // If the prior predicted a date, error = how far off the implied remaining-time trajectory is.
  if (prior.etaDays == null) {
    // prior said plateau/unknown; "error" is whether progress unexpectedly happened.
    return { priorEtaDays: null, actualDaysElapsed: round2(elapsed), buildPctDelta: round2(buildPctDelta), absErrorDays: null, signedErrorDays: null, kind: buildPctDelta > 0 ? 'plateau_broke' : 'plateau_held' };
  }
  // Expected build_pct rise over elapsed (linear): elapsed/etaDays of the remaining gap.
  const priorGap = 100 - clampPct(prior.buildPct);
  const expectedDelta = prior.etaDays > 0 ? priorGap * Math.min(1, elapsed / prior.etaDays) : 0;
  const deltaError = buildPctDelta - expectedDelta; // + = faster than forecast
  return { priorEtaDays: prior.etaDays, actualDaysElapsed: round2(elapsed), buildPctDelta: round2(buildPctDelta), expectedDelta: round2(expectedDelta), absErrorDays: round2(Math.abs(deltaError)), signedErrorDays: round2(deltaError), kind: 'scored' };
}

/**
 * FR-3 — EWMA-adjust a learned parameter (esp. capsPerCompletion / sourcing rate) toward the
 * observed value. alpha in (0,1]; higher = trust recent reality more.
 */
export function adjustLearnedRate(prior, observed, alpha = 0.3) {
  const a = Number.isFinite(alpha) && alpha > 0 && alpha <= 1 ? alpha : 0.3;
  if (!Number.isFinite(observed)) return Number.isFinite(prior) ? clampCapsPerCompletion(prior) : null;
  if (!Number.isFinite(prior)) return clampCapsPerCompletion(observed);
  // Clamp the EWMA result so the ×1.1/×0.9 nudge can't drift the learned rate unbounded over runs.
  return clampCapsPerCompletion(round3(a * observed + (1 - a) * prior));
}

/** FR-4 — the single exec-summary line. */
export function formatForecastLine(f, prevF) {
  if (!f) return 'Estimated completion (infra-build scope): (forecast unavailable)';
  let head;
  if (f.plateau) head = `Estimated completion (infra-build scope): PLATEAU at ${f.buildPct == null ? '?' : f.buildPct}% until sourced`;
  else if (f.etaDateIso) head = `Estimated completion (infra-build scope): ${f.etaDateIso.slice(0, 10)} (~${Math.ceil(f.etaDays)}d, ${f.bindingConstraint}-bound)`;
  else head = `Estimated completion (infra-build scope): unknown — ${f.note}`;
  let delta = '';
  if (prevF) {
    if (prevF.plateau && !f.plateau) delta = ' [Δ broke plateau]';
    else if (!prevF.plateau && f.plateau) delta = ' [Δ now plateaued]';
    else if (Number.isFinite(prevF.etaDays) && Number.isFinite(f.etaDays)) {
      const d = Math.round(f.etaDays - prevF.etaDays);
      delta = d === 0 ? ' [Δ ±0d]' : ` [Δ ${d > 0 ? '+' : ''}${d}d vs last]`;
    }
  }
  return `${head} (${f.confidence}${delta})`;
}

// ── helpers ──
function mk(o) { return o; }
function clampPct(v) { if (v == null || !Number.isFinite(v)) return null; return Math.max(0, Math.min(100, v)); }
function nonNeg(v) { return Number.isFinite(v) && v > 0 ? v : 0; }
function nonNegInt(v) { return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; }
function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function round3(v) { return v == null ? null : Math.round(v * 1000) / 1000; }
