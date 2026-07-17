/**
 * shadow-run.mjs — the shadow-run core (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C).
 *
 * PURE module — no DB, no fs, no network. Replays a proposed governed-change
 * variant against a class's sealed eval cases (child B's loadEvalSet output) and
 * emits per-case rows in EXACTLY the shape child A's composePrecheckPacket
 * consumes: [{ case_id, current_verdict, proposed_verdict, delta, regression }].
 *
 * Evaluators are INJECTED (capability-runner runPipeline precedent) so isolation
 * is provable structurally: this module imports only the pure closure engine and
 * the class registry; the static isolation witness (shadow-run-isolation.test.js)
 * fails the build if a write-capable import ever appears here.
 *
 * VERDICT SEMANTICS (PRD plan decision, refined):
 *   - current_verdict = the case's ADJUDICATED TRUTH (of-record baseline), never
 *     the naive engine output — a naive baseline would flag known-bad cases under
 *     an identity replay (the engine already disagrees with truth there by design).
 *   - engineCurrent/engineProposed = the engine's verdicts under the current vs
 *     proposed artifact, evidence and pinned `now` held constant from the seal.
 *   - If the proposal does NOT change the engine's behavior on a case
 *     (engineProposed === engineCurrent), the case is untouched: proposed_verdict
 *     anchors to the adjudicated truth and regression=false. A pre-existing
 *     known-bad the proposal neither fixes nor worsens is the CORPUS's documented
 *     defect, not the proposal's regression.
 *   - If the proposal CHANGES the engine's behavior, proposed_verdict is the raw
 *     engineProposed and regression = (engineProposed !== adjudicated truth):
 *     breaking a correct case (CP-003 open->closed) or re-breaking a known-bad in
 *     a new way flags true; FIXING a known-bad (engine newly agrees with truth)
 *     flags false.
 *
 * FAIL-CLOSED-TO-PLAIN-REVIEW: unknown artifact_class (or an unloadable corpus)
 * yields NO verdict — { fall_through: true, results: [] }. An empty results array
 * composes to recommendation='insufficient_evidence' in the packet; a proposal is
 * never blocked and never granted a fabricated verdict.
 */

import { evaluateLoopClosure } from '../../loop-governance/closure-engine.js';
import { EVAL_SET_CLASSES } from '../../eval/eval-set-fixtures.mjs';

/**
 * closure_predicates evaluator — mechanical replay through the pure closure engine
 * with the proposal's predicate swapped in; evidence and pinned now held constant.
 * @param {Object} evalCase - sealed case (whitelist projection from loadEvalSet)
 * @param {Object|null} proposedPredicate - proposal's closure_predicate variant, or null for identity
 * @returns {{engineCurrent: string, engineProposed: string}}
 */
export function closurePredicateEvaluator(evalCase, proposedPredicate) {
  const now = new Date(evalCase.now);
  const engineCurrent = evaluateLoopClosure(evalCase.loop, evalCase.evidence, now).status;
  const engineProposed = proposedPredicate == null
    ? engineCurrent
    : evaluateLoopClosure(
        { ...evalCase.loop, closure_predicate: proposedPredicate },
        evalCase.evidence,
        now
      ).status;
  return { engineCurrent, engineProposed };
}

/**
 * leo_protocol_sections evaluator — no engine exists for prose, so verdicts are
 * about THE PROPOSAL per case: does it match a sealed known-bad change class
 * (target/description overlap)? Returns FINAL row semantics directly (the
 * truth-anchored engine formula does not apply: a known-bad case's label
 * describes the CASE, not the desired outcome). Synthetic cases never flag
 * (pipeline exercise only). Class is EXPERIMENTAL per child B's GT floor.
 */
export function protocolSectionsEvaluator(evalCase, proposal) {
  if (!proposal || evalCase.synthetic === true || evalCase.known_bad !== true) {
    return { current_verdict: 'pass', proposed_verdict: 'pass', regression: false };
  }
  const target = String(proposal.target_ref || '').toLowerCase();
  const diff = String(proposal.proposed_diff || '').toLowerCase();
  const caseRef = String(evalCase.section_change?.section_ref || '').toLowerCase();
  const matchesKnownBad = caseRef.length > 0
    && (target.includes(caseRef) || caseRef.includes(target) || diff.includes(caseRef));
  return matchesKnownBad
    ? { current_verdict: 'pass', proposed_verdict: 'matches_known_bad', regression: true }
    : { current_verdict: 'pass', proposed_verdict: 'pass', regression: false };
}

/** Default per-class evaluators; injectable for tests (runPipeline precedent). */
export const DEFAULT_EVALUATORS = Object.freeze({
  closure_predicates: (evalCase, proposal) =>
    closurePredicateEvaluator(evalCase, proposal ? proposal.proposed_predicate ?? null : null),
  leo_protocol_sections: protocolSectionsEvaluator,
});

/** Adjudicated truth of record for a case, class-agnostic. */
function adjudicatedTruth(evalCase) {
  return evalCase.adjudicated_status ?? evalCase.adjudicated_label ?? null;
}

/**
 * Run the shadow replay.
 * @param {Object} args
 * @param {Object} args.proposal - child A REQUIRED_FIELDS shape (artifact_class, target_ref,
 *   proposed_diff, ... plus proposed_predicate for closure_predicates)
 * @param {Object} args.corpus - child B loadEvalSet result ({artifact_class, cases, bookkeeping})
 * @param {Object} [args.evaluators] - injected per-class evaluators
 * @returns {{artifact_class: string|null, fall_through: boolean, reason?: string,
 *            results: Array, bookkeeping?: Object}}
 */
export function shadowRun({ proposal, corpus, evaluators = DEFAULT_EVALUATORS } = {}) {
  const artifactClass = proposal?.artifact_class ?? null;
  if (!artifactClass || !EVAL_SET_CLASSES[artifactClass] || !evaluators[artifactClass]) {
    return {
      artifact_class: artifactClass,
      fall_through: true,
      reason: `unknown artifact class "${artifactClass}" — no shadow verdict; proposal proceeds to plain chairman review`,
      results: [],
    };
  }
  if (!corpus || corpus.artifact_class !== artifactClass || !Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    return {
      artifact_class: artifactClass,
      fall_through: true,
      reason: 'sealed corpus unavailable or empty — no shadow verdict; proposal proceeds to plain chairman review',
      results: [],
    };
  }

  const evaluator = evaluators[artifactClass];
  const results = corpus.cases.map((evalCase) => {
    const out = evaluator(evalCase, proposal);
    // An evaluator may return FINAL row semantics ({current_verdict, proposed_verdict,
    // regression}) when the truth-anchored engine formula does not apply (sections);
    // otherwise it returns the engine pair and the generic formula runs.
    if (typeof out.regression === 'boolean') {
      return {
        case_id: evalCase.case_id,
        current_verdict: out.current_verdict,
        proposed_verdict: out.proposed_verdict,
        delta: out.proposed_verdict === out.current_verdict ? null : `${out.current_verdict}->${out.proposed_verdict}`,
        regression: out.regression,
      };
    }
    const truth = adjudicatedTruth(evalCase);
    const { engineCurrent, engineProposed } = out;
    const behaviorChanged = engineProposed !== engineCurrent;
    const proposed_verdict = behaviorChanged ? engineProposed : truth;
    return {
      case_id: evalCase.case_id,
      current_verdict: truth,
      proposed_verdict,
      delta: proposed_verdict === truth ? null : `${truth}->${proposed_verdict}`,
      regression: behaviorChanged && engineProposed !== truth,
    };
  });

  return { artifact_class: artifactClass, fall_through: false, results, bookkeeping: corpus.bookkeeping };
}
