// Golden reference — stage-gate check (REFERENCE ONLY, never wired to a stage).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-C
//
// The five gate doctrines this module teaches:
//  1. PURE PREDICATE: the decision reads ONLY its explicit inputs — no I/O,
//     no clock, no randomness, no side effects. Same inputs, same verdict.
//  2. FAIL-CLOSED: input presence is validated FIRST; missing inputs BLOCK
//     with the missing names in the reason — never default-pass by truthiness.
//  3. SEPARATED EMISSION: evidence emission takes the verdict; it never
//     influences it. The emitter may do I/O — the predicate may not.
//  4. ONE PREDICATE SOURCE: exactly one authoritative predicate function per
//     decision. (Single FUNCTION, not single data source — a predicate that
//     consults an RPC result with a disclosed fallback is fine; two different
//     predicates deciding the same question at different call sites is the
//     schism class.)
//  5. TOTAL, EXCEPTION-SAFE VERDICT: any exception during evaluation resolves
//     to BLOCK. But a code-bug BLOCK must be DISTINGUISHABLE from a policy
//     BLOCK — the catch path sets `internal_error: true` so a consumer can
//     alert on it instead of mistaking a TypeError for a legitimate gate
//     decision. Throw is never pass; a swallowed error is never SILENT
//     (the flag is the alarm).
//
// Verdict shape: {allowed: boolean, reason: string, evidence: array,
// internal_error?: true}. This is a DELIBERATELY BINARY gate verdict. The
// estate's decision engines are NON-binary on purpose:
//   - lib/eva/decision-filter-engine.js: {auto_proceed, triggers, recommendation}
//     where recommendation is an action enum (AUTO_PROCEED / PRESENT_TO_CHAIRMAN
//     / AUTO_PROCEED_WITH_MITIGATIONS)
//   - lib/governance/decision-filter-engine.js: {decision: GO|ESCALATE|BLOCK, reasoning}
// If your gate needs an ESCALATE / present-to-chairman state, DO NOT collapse
// to this boolean — adopt the tri-state. Use this binary shape only when the
// decision is genuinely allow-or-block. `reason` is present on EVERY path.

const REQUIRED_INPUTS = Object.freeze(['venture_id', 'stage_number', 'artifact_count', 'blocking_issues']);

/**
 * The ONE authoritative predicate for this decision (doctrine 4).
 * Pure (doctrine 1), fail-closed (doctrine 2), total (doctrine 5).
 * @param {{venture_id: string, stage_number: number, artifact_count: number, blocking_issues: number}} inputs
 * @returns {{allowed: boolean, reason: string, evidence: Array<object>}}
 */
export function evaluateGate(inputs) {
  try {
    // Doctrine 2: presence validation FIRST — missing inputs BLOCK by name.
    // (`== null` catches undefined AND null; 0 is a present, legal value —
    // truthiness would wrongly treat it as missing.)
    const missing = REQUIRED_INPUTS.filter((k) => inputs == null || inputs[k] == null);
    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `missing inputs: ${missing.join(', ')}`,
        evidence: [{ check: 'input_presence', missing }],
      };
    }

    // Doctrine 1: the decision itself — pure reads of explicit inputs only.
    const evidence = [
      { check: 'artifacts_present', value: inputs.artifact_count, threshold: 1 },
      { check: 'no_blocking_issues', value: inputs.blocking_issues, threshold: 0 },
    ];
    if (inputs.artifact_count < 1) {
      return { allowed: false, reason: `stage ${inputs.stage_number}: no artifacts captured (need >= 1)`, evidence };
    }
    if (inputs.blocking_issues > 0) {
      return { allowed: false, reason: `stage ${inputs.stage_number}: ${inputs.blocking_issues} blocking issue(s) open`, evidence };
    }
    return { allowed: true, reason: `stage ${inputs.stage_number}: all checks passed`, evidence };
  } catch (err) {
    // Doctrine 5: totality — an exception is a BLOCK, never a pass and never a
    // throw-through. `internal_error: true` makes a code-bug BLOCK top-level
    // distinguishable from a policy BLOCK so a consumer ALERTS rather than
    // treating a TypeError as a legitimate gate decision. (Estate defect
    // classes this corrects: a gauge family reading throw as advisory-pass; a
    // forward-gate swallowing throws open — both make bugs look like passes.)
    return {
      allowed: false,
      internal_error: true,
      reason: `evaluation error: ${err && err.message ? err.message : String(err)}`,
      evidence: [{ check: 'evaluation_totality', error: String(err && err.message || err) }],
    };
  }
}

/**
 * Doctrine 3: evidence emission is SEPARATED — it takes the verdict and a
 * sink, and never influences the decision. The sink boundary is where I/O
 * lives (DB row, log line); inject it, don't import it here.
 * @param {{allowed: boolean, reason: string, evidence: Array<object>}} verdict
 * @param {{write: (record: object) => void}} sink
 */
export function emitEvidence(verdict, sink) {
  sink.write({
    emitted_at_note: 'sink stamps its own clock — the predicate never reads one',
    allowed: verdict.allowed,
    reason: verdict.reason,
    evidence: verdict.evidence,
  });
}
