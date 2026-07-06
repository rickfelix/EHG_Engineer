/**
 * Observe-only design-fidelity would-reject recorder + dormant-scorer dispatch.
 * SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001 (GATE HALF of the MarketLens landing-seam fix).
 *
 * OBSERVE-ONLY-FIRST: these functions RECORD a would-reject observation (durably, countably)
 * so the observe->bind criterion (>=25 evals / >=48h / zero false-rejects / named flipper) is
 * measurable — they NEVER block. Blocking is gated on DESIGN_FIDELITY_GATE_MODE === 'bind',
 * which this SD does not set. Every write is SWALLOW-ALL (mirrors lib/eva/observe-gate-witness.js
 * observeGateWitness): a witness-recording failure must never affect the caller's real behavior.
 *
 * Sink: the existing gate_witness_events table via recordWitnessEvent (NO new DDL). Would-rejects
 * are recorded with verdict='rejected' under a fixed 'gate-harness' witness identity.
 */
import { isCustomerFacingLanding, hasDesignPass, resolveDesignFidelityGateMode } from './customer-facing-design-detector.js';

export const DESIGN_FIDELITY_GATE_ID = 'DESIGN_FIDELITY_LANDING';
const WITNESS_SESSION_ID = 'gate-harness'; // fixed, code-controlled observer identity (same as observe-gate-witness.js)
const DEFAULT_SCORE_THRESHOLD = 50;

async function resolveDeps(deps) {
  const d = deps || {};
  const recordWitnessEvent = d.recordWitnessEvent
    || (await import('../record-witness-event.js')).recordWitnessEvent;
  let supabase = d.supabase;
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return { recordWitnessEvent, supabase };
}

/**
 * Record a design_fidelity_would_reject observation. OBSERVE-ONLY + SWALLOW-ALL: never throws,
 * never blocks. Skips (does not record) when there is no judged session or the judged session
 * IS the witness identity (a session cannot witness its own work — recordWitnessEvent would
 * throw on that, so we guard first, exactly like observeGateWitness).
 *
 * @param {{ judgedSessionId?: string, reason: string, gateId?: string }} params
 * @param {object} [deps] - { recordWitnessEvent, supabase } injectable for tests
 * @returns {Promise<{recorded: boolean, skipped: boolean, reason?: string}>}
 */
export async function observeDesignFidelityWouldReject({ judgedSessionId, reason, gateId } = {}, deps) {
  try {
    if (!judgedSessionId || judgedSessionId === WITNESS_SESSION_ID) {
      return { recorded: false, skipped: true, reason: 'no judged session (or self-witness)' };
    }
    const { recordWitnessEvent, supabase } = await resolveDeps(deps);
    await recordWitnessEvent(supabase, {
      gateId: gateId || DESIGN_FIDELITY_GATE_ID,
      witnessSessionId: WITNESS_SESSION_ID,
      judgedSessionId,
      verdict: 'rejected',
      notes: `design-fidelity observe-only would-reject (SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001) -- not yet blocking: ${reason || 'customer-facing landing with no design pass'}`,
    });
    return { recorded: true, skipped: false };
  } catch {
    // OBSERVE-ONLY: a witness-recording failure must NEVER affect the caller (swallow-all).
    return { recorded: false, skipped: false, reason: 'witness write failed (swallowed)' };
  }
}

/**
 * FR-1/FR-2 — the dormant design-fidelity scorer's FIRST live dispatch, fenced behind
 * isCustomerFacingLanding. Runs scoreDesignFidelity(); a null result (no stitchData / no design
 * data) OR a below-threshold score on a customer-facing landing is a WOULD-REJECT (observed),
 * NOT a silent pass. NEVER throws, NEVER blocks (observe-only). Non-customer-facing SDs are a
 * no-op (near-zero fleet cost). Returns the observation for the caller/tests.
 *
 * @param {{target_application?: string, title?: string}} sd
 * @param {{ stitchData?: object, repoAnalysis?: object, scopeText?: string, titleText?: string, judgedSessionId?: string, threshold?: number }} ctx
 * @param {object} [deps] - { scoreDesignFidelity, recordWitnessEvent, supabase } injectable for tests/spies
 * @returns {Promise<{dispatched: boolean, wouldReject: boolean, score: number|null, mode: string}>}
 */
export async function dispatchDesignFidelityScorer(sd, ctx = {}, deps) {
  const mode = resolveDesignFidelityGateMode((deps && deps.env) || process.env);
  if (!isCustomerFacingLanding(sd, ctx.scopeText ?? '', ctx.titleText ?? sd?.title ?? '')) {
    return { dispatched: false, wouldReject: false, score: null, mode }; // fenced: not a customer-facing landing
  }
  let result = null;
  try {
    const scoreFn = (deps && deps.scoreDesignFidelity)
      || (await import('./design-fidelity-scorer.js')).scoreDesignFidelity;
    result = scoreFn(ctx.stitchData ?? null, ctx.repoAnalysis ?? null); // <-- the live dispatch (was dormant)
  } catch {
    result = null; // a scorer error is treated as "no design signal" -> would-reject, never a throw
  }
  const threshold = Number.isFinite(ctx.threshold) ? ctx.threshold : DEFAULT_SCORE_THRESHOLD;
  const score = result && Number.isFinite(result.score) ? result.score : null;
  const wouldReject = score === null || score < threshold; // FR-2: null (no stitchData) is NOT a silent pass
  // deps.observe === false -> dispatch the (formerly dormant) scorer for its LIVE call site only,
  // WITHOUT recording (the caller owns recording, e.g. gated on hasDesignPass to avoid false-rejects).
  const shouldObserve = !(deps && deps.observe === false);
  if (wouldReject && shouldObserve) {
    await observeDesignFidelityWouldReject({
      judgedSessionId: ctx.judgedSessionId,
      reason: score === null
        ? 'customer-facing landing scored with NO design data (null) -- not a silent pass'
        : `customer-facing landing design fidelity ${score} < ${threshold}`,
    }, deps);
  }
  return { dispatched: true, wouldReject, score, mode };
}

/**
 * FR-4 — venture-completion exit check for a customer-facing landing. If the landing has NO
 * design pass by any path (no Stitch/S17 artifact AND no completed design/page-quality child),
 * record a would-reject (observe-only). PURE inputs (injected artifacts + child SDs). NEVER
 * throws, NEVER blocks.
 *
 * @param {{target_application?: string, title?: string}} sd
 * @param {{ designArtifacts?: Array, childSds?: Array, scopeText?: string, titleText?: string, judgedSessionId?: string }} ctx
 * @param {object} [deps]
 * @returns {Promise<{applicable: boolean, wouldReject: boolean}>}
 */
export async function observeVentureCompletionDesignPass(sd, ctx = {}, deps) {
  if (!isCustomerFacingLanding(sd, ctx.scopeText ?? '', ctx.titleText ?? sd?.title ?? '')) {
    return { applicable: false, wouldReject: false }; // fenced: not a customer-facing landing
  }
  const passed = hasDesignPass({ designArtifacts: ctx.designArtifacts, childSds: ctx.childSds });
  if (!passed) {
    await observeDesignFidelityWouldReject({
      judgedSessionId: ctx.judgedSessionId,
      reason: 'venture completed a customer-facing landing with NO design pass (no Stitch/S17 artifact, no completed design child)',
    }, deps);
  }
  return { applicable: true, wouldReject: !passed };
}
