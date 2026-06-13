/**
 * Active breakage-canary PURE probe classifiers — SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-D (child D).
 *
 * The pure, unit-testable core for the net-new active canary (scripts/breakage/active-breakage-canary.mjs)
 * that probes the 4 classes child C's PASSIVE detectors do not cover: RLS-regression, gate-pipeline-down,
 * payment-webhook-fail, model-availability-cap. Each classifier maps a (read-only) probe observation to a
 * breakage verdict; the CLI does the thin IO + the fail-loud recordSystemAlert write. Every classifier is
 * conservative — its no-false-positive case (RLS inconclusive, gate idle, payment absent, llm NORMAL/
 * unknown) returns breakage:false. Consumes child-A's frozen break_class ids; never re-encodes the taxonomy.
 *
 * @module lib/breakage/active-canary-probes
 */
'use strict';

/** Rungs from scripts/continuity/llm-degradation-detector.mjs that count as a model-availability breakage. */
const DEGRADED_RUNGS = Object.freeze(['SINGLE_SESSION', 'MODEL_FALLBACK', 'PAUSE_AND_SURFACE']);

/**
 * FR-D1 — RLS-regression. PURE over the result of a READ-ONLY-INTENT anon INSERT of a uniquely-marked
 * canary row into an RLS-protected governance table. Healthy RLS DENIES the write (Postgres 42501) so NO
 * row is created; a regression lets the row through (data returned). Any other outcome is inconclusive
 * (fail-open — never a false alert).
 * @param {{error?:{code?:string,message?:string}|null, data?:Array|null}} anonInsertResult
 * @returns {{breakage:boolean, breakClass?:string, reason:string, inconclusive?:boolean, detail?:object}}
 */
function classifyRlsProbe(anonInsertResult) {
  const r = anonInsertResult || {};
  if (Array.isArray(r.data) && r.data.length > 0) {
    return {
      breakage: true,
      breakClass: 'RLS-regression',
      reason: 'anon INSERT into an RLS-protected governance table SUCCEEDED — anon write RLS is not enforced',
      detail: { inserted_ids: r.data.map((x) => x && x.id).filter(Boolean) },
    };
  }
  const code = (r.error && (r.error.code || '')) || '';
  if (code === '42501') {
    return { breakage: false, reason: 'anon write denied (42501 / RLS policy) — RLS enforced' };
  }
  // No clean deny AND no insert (constraint error, network, empty) -> we cannot conclude a regression.
  return {
    breakage: false,
    inconclusive: true,
    reason: `anon write neither succeeded nor cleanly denied (code=${code || 'none'}) — inconclusive, no alert`,
  };
}

/**
 * FR-D2 — gate-pipeline-down. PURE over recent handoff rows (sd_phase_handoffs-shaped: { created_at|accepted_at,
 * status }). Flags down ONLY when there is recent ACTIVITY (>= minAttempts in the window) AND none reached a
 * terminal success (zero 'accepted'). An IDLE fleet (too few recent attempts) is NORMAL — the key
 * false-positive guard (no work in flight is not a broken pipeline).
 * @param {Array<{created_at?:string, accepted_at?:string, status?:string}>} recent
 * @param {number} nowMs
 * @param {{windowMs?:number, minAttempts?:number}} [opts]
 * @returns {{breakage:boolean, breakClass?:string, reason:string, idle?:boolean, detail?:object}}
 */
function classifyGatePipelineProbe(recent, nowMs, opts = {}) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : 6 * 60 * 60 * 1000;
  const minAttempts = Number.isFinite(opts.minAttempts) ? opts.minAttempts : 3;
  const inWindow = (Array.isArray(recent) ? recent : []).filter((row) => {
    const t = Date.parse((row && (row.created_at || row.accepted_at)) || '');
    return Number.isFinite(t) && Number.isFinite(nowMs) && nowMs - t <= windowMs;
  });
  if (inWindow.length < minAttempts) {
    return { breakage: false, idle: true, reason: `only ${inWindow.length} handoff attempt(s) in window (<${minAttempts}) — idle/insufficient signal, NOT down` };
  }
  const accepted = inWindow.filter((row) => row && row.status === 'accepted').length;
  if (accepted === 0) {
    return {
      breakage: true,
      breakClass: 'gate-pipeline-down',
      reason: `${inWindow.length} handoff attempt(s) in window but ZERO accepted — gate pipeline producing no completions`,
      detail: { attempts: inWindow.length, accepted },
    };
  }
  return { breakage: false, reason: `${accepted}/${inWindow.length} handoff(s) accepted in window — pipeline producing completions` };
}

/**
 * FR-D3 — payment-webhook-fail. SUBSTRATE-ABSENCE-AWARE: there is no payment-webhook table today (Stripe is
 * test-mode / not live), so when the substrate is absent the probe SKIPS (no alert, forward-compatible).
 * When present (future) it flags stale processing or an error spike.
 * @param {{tablePresent?:boolean, lastProcessedAtMs?:number, errorCount?:number}} input
 * @param {number} nowMs
 * @param {{staleMs?:number, maxErrors?:number}} [opts]
 * @returns {{breakage:boolean, breakClass?:string, reason:string, skipped?:boolean, detail?:object}}
 */
function classifyPaymentWebhookProbe(input, nowMs, opts = {}) {
  const { tablePresent, lastProcessedAtMs, errorCount } = input || {};
  if (!tablePresent) {
    return { breakage: false, skipped: true, reason: 'payment-webhook substrate not present (no webhook table) — skipping (forward-compatible, zero false-positives)' };
  }
  const staleMs = Number.isFinite(opts.staleMs) ? opts.staleMs : 30 * 60 * 1000;
  const maxErrors = Number.isFinite(opts.maxErrors) ? opts.maxErrors : 5;
  if (Number.isFinite(lastProcessedAtMs) && Number.isFinite(nowMs) && nowMs - lastProcessedAtMs > staleMs) {
    return { breakage: true, breakClass: 'payment-webhook-fail', reason: `last webhook processed ${Math.round((nowMs - lastProcessedAtMs) / 60000)}min ago (> ${Math.round(staleMs / 60000)}min)`, detail: { lastProcessedAtMs } };
  }
  if (Number.isFinite(errorCount) && errorCount >= maxErrors) {
    return { breakage: true, breakClass: 'payment-webhook-fail', reason: `${errorCount} webhook processing error(s) (>= ${maxErrors})`, detail: { errorCount } };
  }
  return { breakage: false, reason: 'webhook processing healthy' };
}

/**
 * FR-D4 — model-availability-cap. PURE over the result of the EXISTING detectFromDb (scripts/continuity/
 * llm-degradation-detector.mjs) — this never re-implements the rung evaluator. A degraded rung becomes a
 * model-availability-cap breakage with a legal severity (PAUSE_AND_SURFACE -> critical, else warning).
 * @param {{rung?:string, reason?:string, signals?:object}|null} rungResult
 * @returns {{breakage:boolean, breakClass?:string, severity?:string, reason:string, detail?:object}}
 */
function classifyModelAvailabilityProbe(rungResult) {
  const rung = rungResult && rungResult.rung;
  if (!rung || rung === 'NORMAL') {
    return { breakage: false, reason: `llm degradation rung=${rung || 'unknown'} — not degraded` };
  }
  if (!DEGRADED_RUNGS.includes(rung)) {
    return { breakage: false, reason: `llm degradation rung=${rung} — unrecognized, not alerting (fail-open)` };
  }
  const severity = rung === 'PAUSE_AND_SURFACE' ? 'critical' : 'warning';
  return {
    breakage: true,
    breakClass: 'model-availability-cap',
    severity,
    reason: `llm degradation rung=${rung}${rungResult.reason ? ': ' + rungResult.reason : ''}`,
    detail: { rung, signals: rungResult.signals || null },
  };
}

module.exports = {
  DEGRADED_RUNGS,
  classifyRlsProbe,
  classifyGatePipelineProbe,
  classifyPaymentWebhookProbe,
  classifyModelAvailabilityProbe,
};
