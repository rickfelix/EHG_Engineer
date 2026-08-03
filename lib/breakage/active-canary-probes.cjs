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
 * FR-D1 — RLS-regression, on the THREE-LEG method (SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001).
 *
 * WHY THE OLD SHAPE WAS UNSOUND. It classified from the anon insert ALONE: 42501 meant "RLS enforced",
 * full stop. But 42501 is raised BOTH by a genuine refusal AND by an insert whose RETURNING clause fails
 * the read policy — and, measured 2026-08-03, the SAME row submitted via a BARE `.insert()` (no
 * `.select()`, so no RETURNING) LANDS with `error:null`. So a table that is wide open to a real writer
 * reported `breakage:false` and no alert fired. Worse, the regression branch keys on `data.length > 0`,
 * which is ALWAYS false for a bare insert — the landed row could not be seen even in principle.
 *
 * THE VERDICT NOW NEEDS EVIDENCE, NOT A CODE. Legs, in order:
 *   1. `withReturning` — the anon `.insert().select()` result. Necessary, never sufficient.
 *   2. `readbackAfterReturning` — service-role readback for the marker.
 *   3. `bareInsert` + `readbackAfterBare` — re-attempt the IDENTICAL write with NO `.select()`, read again.
 * Leg 3 runs only when legs 1-2 look like refusal; it is the ONLY thing separating a genuinely closed
 * table from one whose door is simply not the one the probe knocked on.
 *
 * NO-FALSE-POSITIVE IS PRESERVED, and it matters here more than anywhere: the caller's alert path is
 * fail-loud (recordSystemAlert + process.exit(1)). A genuinely-enforced table returns 42501 too, so
 * "alert on 42501" would page on every healthy table. Absent leg-3 evidence this returns INCONCLUSIVE,
 * never breakage.
 *
 * @param {{
 *   withReturning?: {error?:{code?:string,message?:string}|null, data?:Array|null}|null,
 *   readbackAfterReturning?: {rows?:Array|null}|null,
 *   bareInsert?: {error?:{code?:string,message?:string}|null}|null,
 *   readbackAfterBare?: {rows?:Array|null}|null,
 * }} evidence
 * @returns {{breakage:boolean, breakClass?:string, reason:string, inconclusive?:boolean, detail?:object}}
 */
function classifyRlsProbe(evidence) {
  const e = evidence || {};
  const wr = e.withReturning || {};
  const rowsAfterReturning = (e.readbackAfterReturning && e.readbackAfterReturning.rows) || null;
  const rowsAfterBare = (e.readbackAfterBare && e.readbackAfterBare.rows) || null;
  const code = (wr.error && (wr.error.code || '')) || '';

  // A row is PRESENT after either attempt ⇒ the write got through ⇒ regression. Readback is the
  // authority; `data` from RETURNING is only a hint, and is absent by construction on a bare insert.
  const landed = (Array.isArray(rowsAfterBare) && rowsAfterBare.length > 0)
    || (Array.isArray(rowsAfterReturning) && rowsAfterReturning.length > 0)
    || (Array.isArray(wr.data) && wr.data.length > 0);
  if (landed) {
    const ids = []
      .concat(Array.isArray(rowsAfterBare) ? rowsAfterBare : [])
      .concat(Array.isArray(rowsAfterReturning) ? rowsAfterReturning : [])
      .concat(Array.isArray(wr.data) ? wr.data : [])
      .map((x) => x && x.id).filter(Boolean);
    return {
      breakage: true,
      breakClass: 'RLS-regression',
      reason: 'anon INSERT into an RLS-protected governance table LANDED (row present on service-role readback) — anon write RLS is not enforced',
      detail: { inserted_ids: Array.from(new Set(ids)), landed_via: (Array.isArray(rowsAfterBare) && rowsAfterBare.length > 0) ? 'bare-insert' : 'with-returning' },
    };
  }

  // Refusal requires BOTH readbacks to have been performed and to be empty. A 42501 with no leg-3
  // evidence is exactly the ambiguous reading this rewrite exists to stop trusting.
  const bareAttempted = Object.prototype.hasOwnProperty.call(e, 'bareInsert') && Array.isArray(rowsAfterBare);
  if (code === '42501' && Array.isArray(rowsAfterReturning) && bareAttempted) {
    return {
      breakage: false,
      reason: 'anon write REFUSED — 42501, and the row is absent after BOTH the RETURNING attempt and a bare re-attempt (three-leg confirmed)',
      detail: { legs: 3 },
    };
  }
  if (code === '42501') {
    return {
      breakage: false,
      inconclusive: true,
      reason: 'anon write returned 42501 but leg-3 evidence is missing — 42501 alone cannot distinguish refusal from a landed-but-unreadable write, no alert',
      detail: { legs: Array.isArray(rowsAfterReturning) ? 2 : 1 },
    };
  }
  // No clean deny AND no landed row (constraint error, network, empty) -> cannot conclude a regression.
  return {
    breakage: false,
    inconclusive: true,
    reason: `anon write neither landed nor cleanly denied (code=${code || 'none'}) — inconclusive, no alert`,
  };
}

/**
 * FR-D2 — gate-pipeline-down. PURE over recent handoff rows (sd_phase_handoffs-shaped: { created_at|accepted_at,
 * status, sd_id }). Flags down ONLY when there is recent ACTIVITY (>= minAttempts) with ZERO 'accepted'
 * SPREAD ACROSS >= minDistinctSds distinct SDs. Two false-positive guards: an IDLE fleet (too few attempts)
 * is NORMAL; and a SINGLE stuck SD bouncing off a REAL gate (legitimate rejections — e.g. SUBAGENT_EVIDENCE_
 * MISSING — accumulating against one sd_id) is a stuck WORKER, not a down PIPELINE (a genuine pipeline-down
 * fails MULTIPLE SDs). The distinct-SD guard was empirically validated: both 90-day windows that would have
 * fired the naive absence-of-accept rule were single-SD-dominated (adversarial-review finding).
 * @param {Array<{created_at?:string, accepted_at?:string, status?:string, sd_id?:string}>} recent
 * @param {number} nowMs
 * @param {{windowMs?:number, minAttempts?:number, minDistinctSds?:number}} [opts]
 * @returns {{breakage:boolean, breakClass?:string, reason:string, idle?:boolean, detail?:object}}
 */
function classifyGatePipelineProbe(recent, nowMs, opts = {}) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : 6 * 60 * 60 * 1000;
  const minAttempts = Number.isFinite(opts.minAttempts) ? opts.minAttempts : 3;
  const minDistinctSds = Number.isFinite(opts.minDistinctSds) ? opts.minDistinctSds : 2;
  const inWindow = (Array.isArray(recent) ? recent : []).filter((row) => {
    const t = Date.parse((row && (row.created_at || row.accepted_at)) || '');
    return Number.isFinite(t) && Number.isFinite(nowMs) && nowMs - t <= windowMs;
  });
  if (inWindow.length < minAttempts) {
    return { breakage: false, idle: true, reason: `only ${inWindow.length} handoff attempt(s) in window (<${minAttempts}) — idle/insufficient signal, NOT down` };
  }
  const accepted = inWindow.filter((row) => row && row.status === 'accepted').length;
  if (accepted === 0) {
    const distinctSds = new Set(inWindow.map((row) => row && row.sd_id).filter(Boolean)).size;
    if (distinctSds >= minDistinctSds) {
      return {
        breakage: true,
        breakClass: 'gate-pipeline-down',
        reason: `${inWindow.length} handoff attempt(s) across ${distinctSds} distinct SDs, ZERO accepted — gate pipeline failing FLEET-WIDE`,
        detail: { attempts: inWindow.length, accepted, distinctSds },
      };
    }
    return { breakage: false, reason: `${inWindow.length} attempt(s) with zero accepts but only ${distinctSds} distinct SD(s) (<${minDistinctSds}) — a stuck SD/worker, NOT a down pipeline` };
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
