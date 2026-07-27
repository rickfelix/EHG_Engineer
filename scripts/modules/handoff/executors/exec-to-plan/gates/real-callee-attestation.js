/**
 * REAL_CALLEE_ATTESTATION — SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 (FR-1).
 *
 * Asks the author to name, for each changed call into a foreign module, the test that exercises the
 * REAL callee — or to say plainly that the integration is UNTESTED. It is the only control in this SD
 * that touches the mechanism behind the canonical incident: that suite stubbed its writer by
 * DEPENDENCY INJECTION, not vi.mock, so eslint-rules/no-mocked-sut-import.js is structurally blind to
 * it. A lint can see a mock; only the author can see an injected fake.
 *
 * *** PRESENCE, NEVER CONTENT. ***
 * The literal value "none" PASSES. That is deliberate and is the whole reason this gate is
 * acceptable: a gate that judged attestation quality would be guessing, would be argued with, and
 * would get bypassed. Its entire job is to force the question to be ANSWERED at the moment the author
 * still has the context, and to make "untested" a thing someone had to type rather than a silence.
 *
 * SELF-AWARE NOTE ON THIS GATE'S OWN FAILURE MODE, given what this SD is about: a presence-check
 * implemented as `return true` would pass every "present" case identically to a correct one. So the
 * missing-field case returns passed:false with a distinct reason code, and
 * tests/unit/gates/real-callee-attestation.test.js asserts THAT RETURN VALUE — not merely that a run
 * completed. A gate whose absence-branch is never asserted is exactly the blindness being fixed.
 *
 * NON-BLOCKING THIS INCREMENT (`required: false`), matching FR-3's warn-only rollout. It surfaces and
 * scores; it does not fail a handoff. Promote by flipping `required` once the fleet is used to it.
 *
 * @module scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation
 */

const FIELD = 'real_callee_attestation';

/**
 * Pure: classify an attestation value. Exported for direct unit testing — the classification, not the
 * DB plumbing, is where the contract lives.
 *
 * @param {unknown} value
 * @returns {{ present: boolean, declaredNone: boolean, entries: number, reason: string }}
 */
export function classifyAttestation(value) {
  if (value === null || value === undefined) {
    return { present: false, declaredNone: false, entries: 0, reason: 'ATTESTATION_MISSING' };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      // An empty string is an absent answer wearing the shape of one.
      return { present: false, declaredNone: false, entries: 0, reason: 'ATTESTATION_EMPTY' };
    }
    const declaredNone = trimmed.toLowerCase() === 'none';
    return { present: true, declaredNone, entries: declaredNone ? 0 : 1, reason: 'ATTESTATION_PRESENT' };
  }
  if (Array.isArray(value)) {
    const nonEmpty = value.filter((v) => typeof v === 'string' ? v.trim().length > 0 : v != null);
    if (nonEmpty.length === 0) {
      return { present: false, declaredNone: false, entries: 0, reason: 'ATTESTATION_EMPTY' };
    }
    return { present: true, declaredNone: false, entries: nonEmpty.length, reason: 'ATTESTATION_PRESENT' };
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return { present: false, declaredNone: false, entries: 0, reason: 'ATTESTATION_EMPTY' };
    }
    return { present: true, declaredNone: false, entries: keys.length, reason: 'ATTESTATION_PRESENT' };
  }
  return { present: false, declaredNone: false, entries: 0, reason: 'ATTESTATION_MISSING' };
}

/**
 * @param {Object} supabase - unused; kept for signature parity with sibling gate factories
 * @returns {Object} gate configuration
 */
export function createRealCalleeAttestationGate(/* supabase */) {
  return {
    name: 'REAL_CALLEE_ATTESTATION',
    validator: async (ctx) => {
      console.log('\n🧪 REAL_CALLEE_ATTESTATION: which test drives the REAL callee?');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || {};
      const value = sd?.metadata?.[FIELD];
      const verdict = classifyAttestation(value);

      if (!verdict.present) {
        console.log(`   ⚠️  ${verdict.reason}: strategic_directives_v2.metadata.${FIELD} is not set.`);
        console.log('   For each changed call into a foreign module, name the test that exercises the REAL');
        console.log('   callee — or set the field to "none" to declare the integration UNTESTED on purpose.');
        console.log('   A stub-heavy suite is green whether or not the real contract holds; this is the');
        console.log('   only place that distinction gets written down.');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`[${verdict.reason}] metadata.${FIELD} is absent — name the test that drives each real callee, or set it to "none".`],
          warnings: [],
          remediation: `Set strategic_directives_v2.metadata.${FIELD} — a string, array or object. The literal "none" is a valid answer.`,
          details: { field: FIELD, reason: verdict.reason, entries: 0, blocking: false },
        };
      }

      if (verdict.declaredNone) {
        console.log(`   ✅ ${FIELD} = "none" — integrations explicitly declared UNTESTED. Recorded, not judged.`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`${FIELD} declared "none": real-callee integrations are attested as UNTESTED for this SD.`],
          details: { field: FIELD, reason: verdict.reason, entries: 0, declared_none: true },
        };
      }

      console.log(`   ✅ ${FIELD} present (${verdict.entries} entr${verdict.entries === 1 ? 'y' : 'ies'}) — presence checked, content deliberately not judged.`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: { field: FIELD, reason: verdict.reason, entries: verdict.entries, declared_none: false },
      };
    },
    // Non-blocking this increment — see the module docstring. Flip to true to promote.
    required: false,
  };
}
