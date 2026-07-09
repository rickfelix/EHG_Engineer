/**
 * T2 metamorphic-MONOTONICITY probe backend — L1 runtime anti-stub dimension
 * (docs/design/value-authenticity-system-design.md §1-L1, criterion
 * VA-T2-metamorphic-monotonicity). SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001.
 *
 * NET-NEW deterministic probe backend (design's own mechanism note: NOT a
 * Child-B transport-interception extension — the stub emits no side effect
 * and no in-code claim, so Child B's assertion-library mechanism no-ops on
 * it; this is a distinct, template-generated perturbation-direction check).
 *
 * Rule (the core distinction this module exists to enforce):
 *   input-SENSITIVITY (output differs per input) != input-RESPONSIVENESS
 *   (output moves in the semantically-correct DIRECTION for a directed
 *   input change). A hash stub is trivially input-sensitive — any input
 *   change moves the hash — but its direction of movement is uncorrelated
 *   with the perturbation's meaning, so a series of progressively-stronger
 *   same-direction perturbations will NOT trend monotonically for a stub.
 *
 * @module lib/apa/value-authenticity-t2
 */

/**
 * Apply a directed, template-generated perturbation to baseInput and
 * check whether the value engine's output trends in expectedDirection
 * across the (cumulative) perturbation steps — direction/ordering only,
 * never absolute values, per design §1-L1.
 * @param {object} opts
 * @param {(input: *) => *} opts.valueEngineFn - the value engine under test
 * @param {*} opts.baseInput
 * @param {Array<(input: *) => *>} opts.perturbationSteps - cumulative, same-direction input transforms
 * @param {'increasing'|'decreasing'} opts.expectedDirection
 * @param {(output: *) => number} opts.extractComparable - extracts a comparable numeric value from the engine's output
 * @returns {{finding: boolean, reason: string, values: number[], violations: number}}
 */
export function checkMetamorphicMonotonicity({ valueEngineFn, baseInput, perturbationSteps, expectedDirection, extractComparable }) {
  if (!Array.isArray(perturbationSteps) || perturbationSteps.length === 0) {
    throw new Error('[value-authenticity-t2] checkMetamorphicMonotonicity requires at least one perturbation step');
  }
  if (expectedDirection !== 'increasing' && expectedDirection !== 'decreasing') {
    throw new Error(`[value-authenticity-t2] expectedDirection must be 'increasing' or 'decreasing', got "${expectedDirection}"`);
  }

  const extractNumeric = (output) => {
    const value = extractComparable(output);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`[value-authenticity-t2] extractComparable returned a non-numeric/non-finite value (${value}) — check the extractor function against the engine's actual output shape`);
    }
    return value;
  };

  const values = [extractNumeric(valueEngineFn(baseInput))];
  let currentInput = baseInput;
  for (const step of perturbationSteps) {
    currentInput = step(currentInput);
    values.push(extractNumeric(valueEngineFn(currentInput)));
  }

  const directionMultiplier = expectedDirection === 'increasing' ? 1 : -1;
  let violations = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = (values[i] - values[i - 1]) * directionMultiplier;
    if (delta < 0) violations += 1;
  }

  // A fully flat sequence has zero reversals but is the simplest possible
  // decorative stub (ignores its input entirely) — not merely "unresponsive
  // in direction" but unresponsive altogether. Distinguished from a legitimate
  // plateau (e.g. a real engine saturating at its output ceiling), which
  // still has values.length > 1 distinct values earlier in the sequence.
  const nonResponsive = values.every((v) => v === values[0]);
  const monotonic = violations === 0 && !nonResponsive;

  return {
    finding: !monotonic,
    reason: monotonic
      ? `T2 metamorphic-monotonicity: output trended ${expectedDirection} across ${perturbationSteps.length} directed perturbation(s) as expected.`
      : nonResponsive
        ? `T2 metamorphic-monotonicity: output was IDENTICAL across all ${perturbationSteps.length} directed perturbation(s) — the engine never responded to any input change. Per VA-T2-metamorphic-monotonicity.`
        : `T2 metamorphic-monotonicity: output did NOT consistently trend ${expectedDirection} across directed perturbations (${violations}/${perturbationSteps.length} direction reversal(s)) — input-sensitive but not input-responsive. Per VA-T2-metamorphic-monotonicity.`,
    values,
    violations,
  };
}

/**
 * Companion NAIVE check (test/demonstration helper, NOT a criterion in the
 * library): does the output merely differ between two inputs? This is the
 * insufficient check the design SSOT explicitly warns against — a hash
 * stub passes this trivially. Used in tests to demonstrate the exact
 * distinction T2 exists to close, never as a standalone pass/fail gate.
 * @param {object} opts
 * @param {(input: *) => *} opts.valueEngineFn
 * @param {*} opts.baseInput
 * @param {*} opts.perturbedInput
 * @param {(output: *) => number} opts.extractComparable
 * @returns {{sensitive: boolean, reason: string}}
 */
export function checkNaiveInputSensitivity({ valueEngineFn, baseInput, perturbedInput, extractComparable }) {
  const baseValue = extractComparable(valueEngineFn(baseInput));
  const perturbedValue = extractComparable(valueEngineFn(perturbedInput));
  const sensitive = baseValue !== perturbedValue;
  return {
    sensitive,
    reason: sensitive
      ? 'naive input-sensitivity: output differs per input (insufficient alone per design §1-L1 — see checkMetamorphicMonotonicity)'
      : 'naive input-sensitivity: output identical for different inputs',
  };
}

export default { checkMetamorphicMonotonicity, checkNaiveInputSensitivity };
