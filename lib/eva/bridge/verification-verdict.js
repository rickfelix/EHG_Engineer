/**
 * Verify layer — adversarial verification + conflict resolution
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 3 (FR-005)
 *
 * After the panel GENERATES a leaf's sections, the Verify stage tries to REFUTE
 * them (not just accept them) and reconciles disagreements. This is the safety
 * counterweight to a panel of generators that can be confidently wrong in unison
 * (how DataDistill became a "CLI" from one bad brainstorm).
 *
 * Lib owns the bounded loop + verdict aggregation (headlessly testable); the live
 * session injects the refuter/judge drivers (LLM agents), mirroring the panel
 * driver seam. FAIL-CLOSED: a refuter that errors or returns null counts as a
 * refutation (a section must be positively defended, not merely un-refuted).
 *
 * @module lib/eva/bridge/verification-verdict
 */

const DEFAULT_REFUTER_COUNT = 3;
const DEFAULT_REFUTE_THRESHOLD = 0.5; // fraction of refuters that must refute to fail the section

/**
 * Aggregate refuter verdicts into a survival decision.
 * A verdict is { refuted: boolean, reason?: string }. Null/missing verdicts count
 * as refuted (fail-closed). Empty input does NOT survive (nothing defended it).
 *
 * @param {Array<{refuted:boolean, reason?:string}|null>} verdicts
 * @param {object} [opts] - { threshold }
 * @returns {{survives:boolean, refutedCount:number, total:number, reasons:string[], reason:string}}
 */
export function aggregateRefutations(verdicts = [], { threshold = DEFAULT_REFUTE_THRESHOLD } = {}) {
  const total = verdicts.length;
  if (total === 0) return { survives: false, refutedCount: 0, total: 0, reasons: [], reason: 'no_verifiers' };
  const refutedCount = verdicts.filter((v) => !v || v.refuted).length;
  const survives = refutedCount / total < threshold; // strictly fewer than threshold refute => survives
  return {
    survives,
    refutedCount,
    total,
    reasons: verdicts.filter((v) => v && v.refuted && v.reason).map((v) => v.reason),
    reason: survives ? 'survived' : 'refuted_by_majority',
  };
}

/**
 * Run N independent refuters over a section via an injected driver and aggregate.
 * driver.refute({ section, attempt }) => Promise<{ refuted, reason }>.
 *
 * @param {object} params - { section, refuteDriver, refuterCount?, threshold? }
 * @returns {Promise<{survives:boolean, refutedCount:number, total:number, reasons:string[], reason:string}>}
 */
export async function verifySection({ section, refuteDriver, refuterCount = DEFAULT_REFUTER_COUNT, threshold } = {}) {
  if (!section) throw new Error('verifySection: `section` is required');
  if (!refuteDriver || typeof refuteDriver.refute !== 'function') throw new Error('verifySection: `refuteDriver.refute` is required');
  const verdicts = [];
  for (let i = 0; i < refuterCount; i++) {
    let v;
    try {
      v = await refuteDriver.refute({ section, attempt: i + 1 });
    } catch (err) {
      v = { refuted: true, reason: `refuter error: ${err?.message}` };
    }
    verdicts.push(v || { refuted: true, reason: 'null verdict' });
  }
  return aggregateRefutations(verdicts, { threshold });
}

/**
 * Route a detected disagreement between two panel sections to the injected JUDGE
 * (the existing [JUDGE] Constitutional Judge sub-agent). Thin wrapper so the
 * conflict-resolution policy stays in one place.
 *
 * @param {object} params - { a, b, context?, judgeDriver }
 * @returns {Promise<object>} the judge verdict ({ winner:'a'|'b'|'merge', rationale })
 */
export async function resolveConflict({ a, b, context, judgeDriver } = {}) {
  if (!judgeDriver || typeof judgeDriver.adjudicate !== 'function') throw new Error('resolveConflict: `judgeDriver.adjudicate` is required');
  return judgeDriver.adjudicate({ a, b, context });
}
