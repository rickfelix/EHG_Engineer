// @wire-check-exempt: foundation shared library — consumed by SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-C (chairman-SMS gate) and -D (Adam-outbound gate); built first per the orchestrator dependency order, wired when those dependent children land.
/**
 * Independent review layer — the SECOND rubric layer, runs ONLY after the deterministic
 * lint passes. SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-A.
 *
 * The structural invariant (the F3 fix): this review is a SEPARATE evaluation of the
 * FINISHED message — it never receives, and cannot be, the composer that drafted it.
 * Same-frame blindness (an author grading their own draft) is exactly how the malformed
 * F3 decision slipped past. The reviewer is INJECTABLE (opts.reviewer): production wires a
 * real independent LLM reviewer; unit tests inject a deterministic stub and open zero live
 * calls. The default reviewer is a deterministic heuristic (NOT an LLM) so the engine is
 * functional and testable out of the box — wiring a real LLM reviewer in production is a
 * captured completion flag, not a silent gap.
 *
 * The reviewer judges (per PRD FR-3): tone, honest-reassurance, rationale quality,
 * reducibility, and classification. It returns a verdict of 'pass' or 'flag' — 'flag'
 * does not itself block (the deterministic lint is the hard gate); it is surfaced in the
 * structured verdict so the calling gate/send-log can act and the retro can learn.
 */

/**
 * Deterministic default reviewer (placeholder for a real independent LLM reviewer).
 * Judges only from the finished message + context — never the composer.
 * @param {object} message
 * @param {object} context
 * @returns {{verdict:'pass'|'flag', classification:string, reducible:boolean, reasons:string[], reviewer:'heuristic-default'}}
 */
export function heuristicReviewer(message = {}, context = {}) {
  const body = typeof message.body === 'string' ? message.body : '';
  const reasons = [];
  // Reducibility: a decision is "reducible" when it collapses to a small labeled choice set.
  const reducible = Array.isArray(message.options) && message.options.length > 0 && message.options.length <= 4;
  // Classification echo (the lint already computed effectiveType; the reviewer independently
  // re-derives from the body so a mislabeled type surfaces as a disagreement).
  const classification = /\?\s*$|\b(reply|choose|approve|which|yes\/no|y\/n)\b/i.test(body) ? 'decision' : (message.type || 'status');
  // Honest-reassurance smell: flag over-promising language on a decision.
  if (/\b(guarantee|definitely|no risk|always works|never fails)\b/i.test(body)) {
    reasons.push('over-promising language — soften to honest reassurance');
  }
  return {
    verdict: reasons.length === 0 ? 'pass' : 'flag',
    classification,
    reducible,
    reasons,
    reviewer: 'heuristic-default',
  };
}

/**
 * Run the independent review. Pure w.r.t. its inputs; the only side effect possible is
 * inside an injected async reviewer (a real LLM call), which the engine awaits.
 * @param {object} message
 * @param {object} context
 * @param {object} opts - { reviewer?: (message, context) => review|Promise<review> }
 * @returns {Promise<object>} the reviewer's structured result
 */
export async function reviewMessage(message = {}, context = {}, opts = {}) {
  const reviewer = typeof opts.reviewer === 'function' ? opts.reviewer : heuristicReviewer;
  // Defensive copy so a reviewer cannot mutate the caller's message (independence hygiene).
  const frozenMessage = Object.freeze({ ...message });
  return reviewer(frozenMessage, context);
}
