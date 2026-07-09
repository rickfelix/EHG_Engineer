/**
 * APA Assertion Library (SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-B).
 *
 * Declarative, venture-agnostic registry of assertion primitives that run
 * deterministically (T0, zero model cost) against evidence captured by Child A's
 * sandbox instrumentation. Each primitive is shaped {id, category, probe, predicate}
 * per FR-1: probe(evidence) extracts the relevant slice, predicate(probeResult)
 * returns {pass, reason}.
 *
 * Evidence convention: every primitive's `evidence` argument carries a `claim`
 * field (what is being asserted) plus primitive-specific observed-state fields
 * (what the sandbox actually captured). This lets `probe`/`predicate` be
 * independently unit-tested with a synthetic evidence object — no live sandbox
 * required (FR-1 AC2).
 *
 * @module lib/apa/assertion-library
 */

export const PRIMITIVE_CATEGORIES = Object.freeze({
  SIDE_EFFECT_HONESTY: 'side-effect-honesty',
  RECOVERY_PATH: 'recovery-path',
  PERSISTENCE: 'persistence',
  NO_DEAD_END: 'no-dead-end',
  INTEGRITY: 'integrity',
  PROVENANCE_EXISTS: 'provenance-exists',
});

// FR-2: absence of a matching real-transport sink event IS the failing signal
// (design §1.1 "absence is the signal"). A mocked/synthetic event must never
// satisfy this — only Child A's real-transport capture format counts.
const sideEffectHonestyPrimitive = {
  id: 'side-effect-honesty',
  category: PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY,
  probe(evidence) {
    const claim = evidence?.claim || {};
    const matchingEvents = (evidence?.sinkEvents || []).filter(
      (event) => event?.type === claim.sinkType && event?.source === 'real-transport'
    );
    return { claim, matchingEvents };
  },
  predicate(probeResult) {
    const pass = probeResult.matchingEvents.length > 0;
    return {
      pass,
      reason: pass
        ? `matching real-transport sink event found for claimed side effect "${probeResult.claim.label}"`
        : `no real-transport sink event found for claimed side effect "${probeResult.claim.label}"`,
    };
  },
};

// FR-3: a declared flow must be BOTH reachable (route/element exists) AND
// functional (completes without 404/dead-end/error).
const recoveryPathPrimitive = {
  id: 'recovery-path',
  category: PRIMITIVE_CATEGORIES.RECOVERY_PATH,
  probe(evidence) {
    const claim = evidence?.claim || {};
    return { claim, flowState: evidence?.flowState || {} };
  },
  predicate(probeResult) {
    const { reachable, completed, error } = probeResult.flowState;
    if (!reachable) {
      return { pass: false, reason: `declared flow "${probeResult.claim.label}" has no reachable route/element` };
    }
    if (error || !completed) {
      return { pass: false, reason: `declared flow "${probeResult.claim.label}" did not complete (dead-end/error)` };
    }
    return { pass: true, reason: `declared flow "${probeResult.claim.label}" is reachable and completes` };
  },
};

const persistencePrimitive = {
  id: 'persistence',
  category: PRIMITIVE_CATEGORIES.PERSISTENCE,
  probe(evidence) {
    const claim = evidence?.claim || {};
    return { claim, before: evidence?.beforeState, after: evidence?.afterReloadState };
  },
  predicate(probeResult) {
    const pass = JSON.stringify(probeResult.before) === JSON.stringify(probeResult.after)
      && probeResult.after !== undefined;
    return {
      pass,
      reason: pass
        ? `entity "${probeResult.claim.label}" persisted across reload`
        : `entity "${probeResult.claim.label}" did not persist — state diverged after reload`,
    };
  },
};

const noDeadEndPrimitive = {
  id: 'no-dead-end',
  category: PRIMITIVE_CATEGORIES.NO_DEAD_END,
  probe(evidence) {
    const claim = evidence?.claim || {};
    return { claim, result: evidence?.resultState || {} };
  },
  predicate(probeResult) {
    const { httpStatus, isBlank, hasError } = probeResult.result;
    const deadEnd = (typeof httpStatus === 'number' && httpStatus >= 400) || isBlank === true || hasError === true;
    return {
      pass: !deadEnd,
      reason: deadEnd
        ? `action "${probeResult.claim.label}" resulted in a dead end (status=${httpStatus}, blank=${isBlank}, error=${hasError})`
        : `action "${probeResult.claim.label}" did not dead-end`,
    };
  },
};

const integrityPrimitive = {
  id: 'integrity',
  category: PRIMITIVE_CATEGORIES.INTEGRITY,
  probe(evidence) {
    const claim = evidence?.claim || {};
    return { claim, expected: evidence?.expected, actual: evidence?.actual };
  },
  predicate(probeResult) {
    const pass = JSON.stringify(probeResult.expected) === JSON.stringify(probeResult.actual);
    return {
      pass,
      reason: pass
        ? `"${probeResult.claim.label}" is internally consistent`
        : `"${probeResult.claim.label}" mismatch: expected ${JSON.stringify(probeResult.expected)}, got ${JSON.stringify(probeResult.actual)}`,
    };
  },
};

// FR-5 / 10.2a: every displayed metric must trace to a real DB row or a real
// computation. Semantic correctness of the value (10.2b) is explicitly out of
// scope — this primitive only asserts that SOME traceable source exists.
const PROVENANCE_TRACEABLE_TYPES = new Set(['db-row', 'computation']);

const provenanceExistsPrimitive = {
  id: 'provenance-exists',
  category: PRIMITIVE_CATEGORIES.PROVENANCE_EXISTS,
  probe(evidence) {
    const claim = evidence?.claim || {};
    return { claim, source: evidence?.source ?? null };
  },
  predicate(probeResult) {
    const pass = !!probeResult.source && PROVENANCE_TRACEABLE_TYPES.has(probeResult.source.type);
    return {
      pass,
      reason: pass
        ? `metric "${probeResult.claim.label}" traces to a real ${probeResult.source.type}`
        : `metric "${probeResult.claim.label}" has no traceable source (hardcoded literal or null-derived value)`,
    };
  },
};

/** @type {Object<string, {id: string, category: string, probe: Function, predicate: Function}>} */
export const PRIMITIVES_BY_CATEGORY = Object.freeze({
  [PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY]: sideEffectHonestyPrimitive,
  [PRIMITIVE_CATEGORIES.RECOVERY_PATH]: recoveryPathPrimitive,
  [PRIMITIVE_CATEGORIES.PERSISTENCE]: persistencePrimitive,
  [PRIMITIVE_CATEGORIES.NO_DEAD_END]: noDeadEndPrimitive,
  [PRIMITIVE_CATEGORIES.INTEGRITY]: integrityPrimitive,
  [PRIMITIVE_CATEGORIES.PROVENANCE_EXISTS]: provenanceExistsPrimitive,
});

export const ASSERTION_PRIMITIVES = Object.freeze(Object.values(PRIMITIVES_BY_CATEGORY));

/**
 * Run one assertion instance (as produced by deriveAssertions*) against an
 * evidence bundle. Merges the instance's claim into the evidence object so
 * each primitive's probe(evidence) sees the same shape it would in a direct
 * unit test.
 * @param {{id: string, category: string, claim: object, source?: string}} assertionInstance
 * @param {object} evidenceBundle primitive-specific observed-state fields (sinkEvents, flowState, etc.)
 * @returns {{id: string, category: string, source?: string, pass: boolean, reason: string}}
 */
export function evaluateAssertion(assertionInstance, evidenceBundle = {}) {
  const primitive = PRIMITIVES_BY_CATEGORY[assertionInstance.category];
  if (!primitive) {
    return {
      id: assertionInstance.id,
      category: assertionInstance.category,
      pass: false,
      reason: `no primitive registered for category "${assertionInstance.category}"`,
    };
  }
  const evidence = { ...evidenceBundle, claim: assertionInstance.claim };
  const probeResult = primitive.probe(evidence);
  const verdict = primitive.predicate(probeResult);
  return {
    id: assertionInstance.id,
    category: assertionInstance.category,
    source: assertionInstance.source,
    ...verdict,
  };
}

// FR-4: claim source #1 — the unified registry's behaviorally-testable
// claims/contracts. Purely data-driven off claim.type so a NEW registry claim
// produces a NEW assertion instance without any code change here.
const REGISTRY_CLAIM_TYPE_TO_CATEGORY = Object.freeze({
  'side-effect': PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY,
  'recovery-flow': PRIMITIVE_CATEGORIES.RECOVERY_PATH,
  persistence: PRIMITIVE_CATEGORIES.PERSISTENCE,
  'no-dead-end': PRIMITIVE_CATEGORIES.NO_DEAD_END,
  integrity: PRIMITIVE_CATEGORIES.INTEGRITY,
  'metric-provenance': PRIMITIVE_CATEGORIES.PROVENANCE_EXISTS,
});

/**
 * Derive assertion instances from the unified registry's behaviorally-testable
 * claims (FR-4, claim source #1). Claims with `behaviorallyTestable: false` are
 * skipped (not every registry entry is assertable). Unrecognized claim types
 * fall back to `integrity` rather than being silently dropped.
 * @param {Array<{id: string, type: string, label: string}>} registryClaims
 * @returns {Array<{id: string, category: string, claim: object, source: string}>}
 */
export function deriveAssertionsFromRegistryClaims(registryClaims = []) {
  return (registryClaims || [])
    .filter((claim) => claim && claim.behaviorallyTestable !== false)
    .map((claim) => ({
      id: `assertion-registry-${claim.id}`,
      category: REGISTRY_CLAIM_TYPE_TO_CATEGORY[claim.type] || PRIMITIVE_CATEGORIES.INTEGRITY,
      claim,
      source: 'registry',
    }));
}

// FR-4: claim source #2 — a scan of the app's own emergent UI copy for
// side-effect language. Curated phrase list, not a hand-maintained assertion
// catalog: any phrase match auto-produces a side-effect-honesty assertion.
const SIDE_EFFECT_PHRASES = Object.freeze([
  { phrase: 'we emailed you', sinkType: 'email' },
  { phrase: 'we sent you an email', sinkType: 'email' },
  { phrase: 'confirmation email', sinkType: 'email' },
  { phrase: 'receipt sent', sinkType: 'email' },
  { phrase: 'payment processed', sinkType: 'payment' },
  { phrase: 'we notified the team', sinkType: 'notification' },
  { phrase: 'we have notified', sinkType: 'notification' },
]);

/**
 * Derive assertion instances from a scan of the app's rendered copy for
 * side-effect language (FR-4, claim source #2).
 * @param {string} appCopy
 * @returns {Array<{id: string, category: string, claim: object, source: string}>}
 */
export function deriveAssertionsFromAppCopy(appCopy = '') {
  const text = String(appCopy || '').toLowerCase();
  return SIDE_EFFECT_PHRASES
    .filter(({ phrase }) => text.includes(phrase))
    .map(({ phrase, sinkType }) => ({
      id: `assertion-copy-${sinkType}-${phrase.replace(/\s+/g, '-')}`,
      category: PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY,
      claim: { label: phrase, sinkType },
      source: 'ui-copy-scan',
    }));
}

/**
 * Derive the full set of assertion instances for a venture's sandbox run,
 * combining both FR-4 claim sources.
 * @param {{registryClaims?: Array<object>, appCopy?: string}} input
 * @returns {Array<{id: string, category: string, claim: object, source: string}>}
 */
export function deriveAssertions({ registryClaims = [], appCopy = '' } = {}) {
  return [
    ...deriveAssertionsFromRegistryClaims(registryClaims),
    ...deriveAssertionsFromAppCopy(appCopy),
  ];
}
