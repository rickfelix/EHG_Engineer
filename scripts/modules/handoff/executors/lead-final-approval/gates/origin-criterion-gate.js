/**
 * Origin-Criterion Gate — LEAD-FINAL-APPROVAL handoff gate.
 *
 * SD-LEO-FIX-ESCALATION-COPIES-EXPECTED-001 (escalated from QF-20260906-362).
 *
 * THE DEFECT: `lib/sd-creation/source-adapters/qf.js`'s `createFromQF()` copies a QF's
 * `expected_behavior` into the escalated carrier SD's `success_criteria`
 * (`buildMeasuredSuccessCriteria()`), but nothing protects that entry from being silently
 * deleted or reworded during PLAN/EXEC — so a carrier can complete on a narrower reading of
 * its own scope than the QF originally named, and nothing at LEAD-FINAL would ever notice.
 *
 * PREMISE CORRECTION (see this SD's LEAD-TO-PLAN VALIDATION evidence for the full write-up):
 * the originating QF proposed extending `acceptance-artifact-gate.js` to evaluate this. That
 * gate is a declared-POINTER evaluator scoped to a hardcoded two-table allowlist
 * (`venture_artifacts`, `uat_test_runs`) with structured fields — it never reads
 * `success_criteria` and has no shape for arbitrary QF-authored free text. This gate is a
 * separate, narrowly-scoped module instead of an extension of that one.
 *
 * MECHANICALLY CHECKABLE ONLY: this gate never judges whether a *different* authored
 * criterion "covers" the origin criterion's meaning — that is not mechanically decidable and
 * is explicitly out of scope. It only checks two structural facts: (1) does an origin-tagged
 * entry still exist at all, and (2) does its live text still hash-match the value recorded at
 * escalation time. Any edit — narrowing, rewording, or otherwise — trips the hash check; a
 * genuinely evolved criterion with a real sign-off finds no protection here nor is any
 * implied.
 *
 * NOT applicable to any SD without `metadata.source_qf_id` / `metadata.escalated_from_qf` —
 * an SD that was never escalated from a QF is untouched (mirrors acceptance-artifact-gate.js's
 * "undeclared majority is unaffected" opt-in shape, but keyed on escalation provenance rather
 * than an explicit declaration).
 *
 * OBSERVE-ONLY BY DEFAULT (ORIGIN_CRITERION_GATE_BINDING=true to flip): mirrors this
 * directory's established rollout convention (acceptance-tier-downgrade-gate.js,
 * success-criteria-unpopulated-gate.js, acceptance-artifact-gate.js). Existing carrier SDs
 * escalated before this fix shipped have no origin entry at all and would otherwise be
 * newly, retroactively blocked on day one.
 */

import { createHash } from 'node:crypto';

const GATE_NAME = 'ORIGIN_CRITERION_GATE';

export function isBindingEnabled(env = process.env) {
  return env.ORIGIN_CRITERION_GATE_BINDING === 'true';
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

/**
 * Pure — no I/O. Finds the success_criteria entry carrying an `origin` object, if any.
 * @param {Array} successCriteria
 * @returns {object|null}
 */
export function findOriginEntry(successCriteria) {
  if (!Array.isArray(successCriteria)) return null;
  return successCriteria.find(
    (entry) => entry && typeof entry === 'object' && entry.origin && typeof entry.origin === 'object'
  ) || null;
}

function passResult(warnings = [], details = {}) {
  return { passed: true, score: 100, max_score: 100, issues: [], warnings, details };
}

function refuseResult(message, details, bound) {
  if (!bound) return passResult([message], { ...details, bound: false });
  return { passed: false, score: 0, max_score: 100, issues: [message], warnings: [], details: { ...details, bound: true } };
}

/**
 * Create the origin-criterion gate.
 * @returns {Object} Gate configuration
 */
export function createOriginCriterionGate() {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🧬 GATE: Origin Criterion (QF escalation provenance)');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || {};
      const sourceQfId = sd?.metadata?.source_qf_id || sd?.metadata?.escalated_from_qf || null;

      if (!sourceQfId) {
        console.log('   ℹ️  Not a QF-escalated carrier — gate not applicable');
        return passResult([], { applicable: false });
      }

      const bound = isBindingEnabled();
      const entry = findOriginEntry(sd.success_criteria);

      if (!entry) {
        const message = `${GATE_NAME}: carrier SD escalated from ${sourceQfId} has no origin-tagged success_criteria entry (missing or removed since escalation).`;
        console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
        return refuseResult(message, { applicable: true, source_qf_id: sourceQfId, reason_code: 'ORIGIN_CRITERION_MISSING' }, bound);
      }

      const criterionText = typeof entry.criterion === 'string' ? entry.criterion : '';
      const liveHash = sha256(criterionText);
      if (liveHash !== entry.origin.content_hash) {
        const message = `${GATE_NAME}: carrier SD's origin criterion text no longer matches its recorded content_hash — edited since escalation from ${sourceQfId}.`;
        console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
        return refuseResult(message, { applicable: true, source_qf_id: sourceQfId, reason_code: 'ORIGIN_CRITERION_HASH_MISMATCH' }, bound);
      }

      console.log(`   ✅ Origin criterion intact for carrier escalated from ${sourceQfId}.`);
      return passResult([], { applicable: true, source_qf_id: sourceQfId, bound });
    },
    required: true,
    remediation:
      'Restore the origin-tagged success_criteria entry to its escalation-time text. This gate never judges a differently-worded criterion\'s coverage — only presence and exact-text match are checked. Observe-only by default — set ORIGIN_CRITERION_GATE_BINDING=true to make this blocking.',
  };
}
