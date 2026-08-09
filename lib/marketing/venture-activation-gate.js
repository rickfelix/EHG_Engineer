/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-2 — the per-venture demand-validation verdict.
 *
 * WHY THIS PATH AND NOT lib/governance/demand-gate.js: that module ALREADY EXISTS and means
 * something entirely different — it gates internal SD-sourcing against belt depth, and exports
 * decideDemand / measureDemand / resolveDemandFloor / mayProduce. Nothing to do with whether a
 * VENTURE has real market demand. Two modules called "demand gate" meaning different things is a
 * permanent confusion, so this one is named for what it gates: venture ACTIVATION.
 *
 * WHY THIS EXTENDS RATHER THAN REBUILDS: SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A already
 * shipped the ladder in lib/telemetry/funnel-gauge.mjs — visitors -> signups -> activated -> paid,
 * a declared writer with an expected cadence, STALE on a missed cadence, no_writer_yet before
 * instrumentation, never a fabricated number, and paid read from the Stripe ledger with dedup by
 * payment identity and a livemode filter. That IS this ladder in different words. Building a
 * second gauge would be a single-representation violation, so this module CONSUMES that one and
 * adds exactly one thing it lacks: a MEASURABILITY layer and a verdict.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS LAYER EXISTS TO PREVENT, found by RUNNING the gauge rather than reading it:
 * computePaidGaugeState returns { state: 'live', paid_amount_cents: 0 } for a venture with ZERO
 * payments. Its readiness probe is FLEET-WIDE (`attribution_status IS NOT NULL`) and is satisfied
 * by a single ops_payment_events row that is livemode=false, unattributed, venture_id=null — test
 * money that could not even be attributed. So `state: 'live'` is a claim about THE FLEET (the
 * attribution machinery has run somewhere), NOT about THE VENTURE (this one is measured).
 * A verdict layer that folded 'live' into MEASURED would report a measured zero for every venture
 * in the fleet on the strength of one test row. It happens to block today — 0 is below any floor —
 * which is the right answer for the wrong reason, and it would flip the instant a floor were 0 or
 * a polarity inverted. A FIELD NAME IS A CLAIM; read what it CONTAINS.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * @module lib/marketing/venture-activation-gate
 */

import { computeGaugeState, computePaidGaugeState } from '../telemetry/funnel-gauge.mjs';

/** The verdict vocabulary. Mirrors the CHECK in 20260809_venture_demand_verdicts.sql. */
export const ACTIVATION_VERDICT = Object.freeze({
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
  NO_DATA: 'NO_DATA',
});

/** A rung either carries a real measurement or explicitly cannot be judged. Never a third thing. */
export const RUNG_STATE = Object.freeze({
  MEASURED: 'MEASURED',
  UNMEASURABLE: 'UNMEASURABLE',
});

/** Ladder order, weakest (cheapest to fake) to strongest (near-unfakeable). */
export const ACTIVATION_RUNGS = Object.freeze(['visitors', 'signups', 'activated', 'paid']);

/**
 * NO BOT FILTERING EXISTS ANYWHERE IN THIS REPOSITORY — grep for bot/isBot/crawler/recaptcha/
 * hcaptcha/turnstile/honeypot returns only false positives (a lucide Bot icon, github-actions[bot]
 * as a git actor, one outbound scraper user-agent). And it is not merely absent, it is
 * structurally unavailable at the bottom of the ladder: Cloudflare Web Analytics visitor counts
 * are AGGREGATE AND PRIVACY-PRESERVING BY DESIGN, so there is no per-request signal to filter
 * downstream; and signups arrive from the venture's own endpoint, making them a SELF-REPORT.
 *
 * So these rungs are DECLARED UNFILTERED and can NEVER on their own produce a PASS. Describing an
 * unfiltered count as bot-filtered would be precisely the camouflage this SD exists to abolish.
 */
export const DECLARED_UNFILTERED_RUNGS = Object.freeze(['visitors', 'signups']);

/**
 * SHIPS EMPTY, AND THAT IS THE DESIGN.
 *
 * The "300 visitors / 30 touches" floor that circulates in planning prose is NOT codified anywhere
 * (repo-wide grep: zero) and it CONTRADICTS the one venture's own stored metadata (Image Alt Text
 * Generator declares 100 visitors / 5% / 10 qualified signups, and that block self-declares
 * derived:true — auto-generated, not authored). Picking either number here would be inventing the
 * threshold this gate is missing, and an invented threshold is indistinguishable from a ratified
 * one once it is in code.
 *
 * A rung with no ratified floor is therefore UNMEASURABLE and FAILS CLOSED — it never falls back
 * to a default. That makes the missing decision VISIBLE (it shows up as an unmeasurable rung with
 * a named reason in every verdict) instead of silently resolved. Each entry, when added, must cite
 * the decision that ratified it. Allowlist/threshold governance:
 * docs/03_protocols_and_standards/venture-metrics-standard.md:75.
 *
 * Shape: { <rung>: { minimum: <number>, ratified_by: '<decision id + date>' } }
 */
export const RATIFIED_FLOORS = Object.freeze({});

function unmeasurable(rung, reason, citation) {
  return {
    rung,
    state: RUNG_STATE.UNMEASURABLE,
    value: null,
    reason,
    citation,
    declared_unfiltered: DECLARED_UNFILTERED_RUNGS.includes(rung),
  };
}

function measured(rung, value, citation) {
  return {
    rung,
    state: RUNG_STATE.MEASURED,
    value,
    reason: null,
    citation,
    declared_unfiltered: DECLARED_UNFILTERED_RUNGS.includes(rung),
  };
}

/**
 * Resolve the three telemetry-backed rungs from a venture_telemetry row.
 *
 * Delegates liveness entirely to computeGaugeState and QUOTES ITS REASON VERBATIM rather than
 * writing a substitute message — if the gauge's semantics change, this text changes with it
 * instead of drifting into a second, quietly-stale explanation.
 */
export function resolveTelemetryRungs({ telemetryRow, now = new Date() }) {
  const gauge = computeGaugeState({ telemetryRow, now });
  const KPI_BY_RUNG = { visitors: 'visitors', signups: 'signups', activated: 'active_users' };

  return Object.entries(KPI_BY_RUNG).map(([rung, kpiKey]) => {
    if (gauge.state !== 'live') {
      // no_writer_yet or stale. Either way the number cannot be trusted as current, and a stale
      // number presented as current is a fabricated measurement.
      return unmeasurable(
        rung,
        `venture_telemetry gauge is '${gauge.state}': ${gauge.reason}`,
        'lib/telemetry/funnel-gauge.mjs computeGaugeState'
      );
    }
    const value = telemetryRow?.kpis?.[kpiKey];
    if (!Number.isInteger(value) || value < 0) {
      return unmeasurable(
        rung,
        `gauge is live but KPI '${kpiKey}' is absent or not a non-negative integer (got ${JSON.stringify(value)}). It is dropped by the venture-metrics allowlist rather than coerced.`,
        'scripts/venture-telemetry-pull.mjs KPI_ALLOWLIST'
      );
    }
    return measured(rung, value, `venture_telemetry.kpis.${kpiKey}, pulled_at=${telemetryRow.pulled_at}`);
  });
}

/**
 * Resolve the paid rung — the near-unfakeable end of the ladder, and the one with the trap.
 *
 * computePaidGaugeState's `state:'live'` is NOT sufficient evidence that THIS venture is measured
 * (see the module header). So measurability is decided by a per-venture probe for at least one
 * attribution_status='resolved', livemode=true event. Only then is the gauge's amount trusted, and
 * the amount itself still comes from the gauge (which dedups by payment identity) rather than
 * being recomputed here.
 */
export async function resolvePaidRung({ supabase, ventureId }) {
  const { data: resolvedForVenture, error } = await supabase
    .from('ops_payment_events')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('attribution_status', 'resolved')
    .eq('livemode', true)
    .limit(1);

  // Fail CLOSED on a query error: "I could not look" is not "there is nothing there".
  if (error) {
    return unmeasurable('paid', `per-venture payment probe failed: ${error.message}`, 'ops_payment_events');
  }

  if (!resolvedForVenture || resolvedForVenture.length === 0) {
    return unmeasurable(
      'paid',
      'no attribution_status=resolved, livemode=true payment event exists FOR THIS VENTURE. computePaidGaugeState may still report state=live because its readiness probe is fleet-wide (attribution_status IS NOT NULL) — that is a claim about the machinery having run somewhere, not about this venture being measured, so it is deliberately not treated as a measurement here.',
      'ops_payment_events filtered by venture_id + resolved + livemode'
    );
  }

  const paid = await computePaidGaugeState({ supabase, ventureId });
  if (paid.state !== 'live') {
    return unmeasurable('paid', `funnel gauge paid state is '${paid.state}': ${paid.reason || 'no reason given'}`, 'lib/telemetry/funnel-gauge.mjs computePaidGaugeState');
  }
  return measured(
    'paid',
    paid.paid_amount_cents,
    `computePaidGaugeState: ${paid.paid_amount_cents} cents ${paid.currency || ''} (deduped by payment identity, livemode only); fleet unattributed=${paid.unattributed_count_fleet_wide}`.trim()
  );
}

/**
 * Fold resolved rungs into the three-value verdict.
 *
 * NO_DATA IS FIRST-CLASS AND IS NEVER FOLDED. Folded into PASS it fabricates demand nobody
 * measured; folded into BLOCKED it becomes indistinguishable from a venture that WAS measured and
 * failed, hiding the fact that nobody is measuring at all. A venture nobody can measure is not a
 * venture with no demand. Precedent: lib/governance/demand-gate.js:47-50.
 */
export function decideActivationVerdict(rungs, floors = RATIFIED_FLOORS) {
  const qualifying = rungs.filter(
    (r) => r.state === RUNG_STATE.MEASURED && !r.declared_unfiltered
  );

  // A rung can be measured and still unjudgeable: without a ratified floor there is no answer to
  // "is this number enough". That is a missing DECISION, not a missing measurement, and it fails
  // closed rather than defaulting to a number nobody approved.
  const judgeable = qualifying.filter((r) => Number.isFinite(floors?.[r.rung]?.minimum));
  const unfloored = qualifying.filter((r) => !Number.isFinite(floors?.[r.rung]?.minimum));

  if (judgeable.length === 0) {
    const measuredButUnfiltered = rungs.filter((r) => r.state === RUNG_STATE.MEASURED && r.declared_unfiltered);
    const why = [];
    if (unfloored.length > 0) {
      why.push(`no ratified floor for: ${unfloored.map((r) => r.rung).join(', ')}`);
    }
    if (measuredButUnfiltered.length > 0) {
      why.push(`only DECLARED_UNFILTERED rungs carry a measurement (${measuredButUnfiltered.map((r) => r.rung).join(', ')}), and an unfiltered count cannot establish that demand is human`);
    }
    if (why.length === 0) {
      why.push('no rung carries a measurement');
    }
    return { verdict: ACTIVATION_VERDICT.NO_DATA, why: why.join('; ') };
  }

  const met = judgeable.filter((r) => r.value >= floors[r.rung].minimum);
  if (met.length > 0) {
    return {
      verdict: ACTIVATION_VERDICT.PASS,
      why: met.map((r) => `${r.rung}=${r.value} >= ratified floor ${floors[r.rung].minimum} (${floors[r.rung].ratified_by})`).join('; '),
    };
  }
  return {
    verdict: ACTIVATION_VERDICT.BLOCKED,
    why: judgeable.map((r) => `${r.rung}=${r.value} < ratified floor ${floors[r.rung].minimum}`).join('; '),
  };
}

/**
 * Build the NAMED PATH TO PASS. FR-6, ruled by the coordinator as acceptance (b): a verdict that
 * says only NO_DATA is not good enough — a blocked venture must be told what is missing and what
 * would produce it, or the refusal is opaque and nobody can act on it.
 */
export function buildPathToPass(rungs, floors = RATIFIED_FLOORS) {
  const steps = [];
  for (const r of rungs) {
    if (r.state === RUNG_STATE.UNMEASURABLE) {
      steps.push(`${r.rung}: UNMEASURABLE — ${r.reason}`);
    } else if (!r.declared_unfiltered && !Number.isFinite(floors?.[r.rung]?.minimum)) {
      steps.push(`${r.rung}: measured at ${r.value} but there is NO RATIFIED FLOOR to judge it against — needs a named chairman/Adam decision (the circulating 300-visitor figure is not codified anywhere and conflicts with this venture's own stored 100/5%/10 metadata, so it is not usable as one)`);
    } else if (r.declared_unfiltered) {
      steps.push(`${r.rung}: DECLARED_UNFILTERED — no bot filtering exists in this repository and the source is aggregate-by-design or self-reported, so this rung can never on its own produce a PASS`);
    }
  }
  if (steps.length === 0) steps.push('all rungs are measured and judgeable against ratified floors');
  return steps.join(' | ');
}

/**
 * Full verdict for one venture. Read-only — computing a verdict never writes one.
 * @returns {Promise<{venture_id: string, verdict: string, rungs: object, citation: string, path_to_pass: string}>}
 */
export async function computeActivationVerdict({ supabase, ventureId, floors = RATIFIED_FLOORS, now = new Date() }) {
  const { data: telemetryRow, error: telErr } = await supabase
    .from('venture_telemetry')
    .select('*')
    .eq('venture_id', ventureId)
    .maybeSingle();

  // maybeSingle() returns {data:null,error:null} when absent — that is a legitimate
  // no_writer_yet, which computeGaugeState already models. A genuine ERROR is different and must
  // not be laundered into "no writer": fail closed and say we could not look.
  if (telErr) {
    const blind = ACTIVATION_RUNGS.map((rung) =>
      unmeasurable(rung, `venture_telemetry read failed: ${telErr.message}`, 'venture_telemetry')
    );
    return {
      venture_id: ventureId,
      verdict: ACTIVATION_VERDICT.NO_DATA,
      rungs: Object.fromEntries(blind.map((r) => [r.rung, r])),
      citation: 'venture_telemetry read error — the gate could not observe this venture',
      path_to_pass: buildPathToPass(blind, floors),
    };
  }

  const rungs = [
    ...resolveTelemetryRungs({ telemetryRow, now }),
    await resolvePaidRung({ supabase, ventureId }),
  ];

  const { verdict, why } = decideActivationVerdict(rungs, floors);
  return {
    venture_id: ventureId,
    verdict,
    rungs: Object.fromEntries(rungs.map((r) => [r.rung, r])),
    citation: why,
    path_to_pass: buildPathToPass(rungs, floors),
  };
}

export default {
  ACTIVATION_VERDICT,
  RUNG_STATE,
  ACTIVATION_RUNGS,
  DECLARED_UNFILTERED_RUNGS,
  RATIFIED_FLOORS,
  resolveTelemetryRungs,
  resolvePaidRung,
  decideActivationVerdict,
  buildPathToPass,
  computeActivationVerdict,
};
