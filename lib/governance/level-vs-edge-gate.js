/**
 * Level-vs-edge metrics gate — QF-20260831-127.
 *
 * CLASS ROW (Solomon third-instance evidence + coordinator gate text): three tables, three
 * emitters, one shape — a LEVEL (a standing condition) re-asserted every evaluation cycle as if
 * it were an EDGE (a new event). Measured: (1) WAVE_LINKAGE_STARVATION (feedback table) — 164
 * re-assertion rows since 07-11, firing every 5-6h for seven weeks, itself poisoning the
 * sourcing queue (d1d47ecc, 07-25); (2) eva_scheduler_metrics's per-venture-per-poll suppression
 * condition; (3) Hotel-3's bypass_detection re-log.
 *
 * THE GATE RULE (coordinator, folded as the fix contract): an emitter may write a row ONLY on a
 * TRANSITION (condition newly true / newly false) or for a discrete UNIT OF WORK — never per
 * evaluation of a standing level. A standing level lives as a CURRENT-STATE row updated in
 * place; history lives in one audit stream, populated only by transitions.
 *
 * SCOPE: this QF ships the shared gate rule + the retire-check census (see
 * scripts/audit/level-vs-edge-top1-share.mjs). Converting the three named emitters to consume
 * it, and sweeping/archiving the 164 existing WAVE_LINKAGE_STARVATION re-assertions into one
 * current-state row, are explicitly BACKLOG — named in the QF's own text, not this row's scope.
 */

/**
 * Should this evaluation of a standing condition emit a new (edge) row?
 *
 * Pure: the caller owns reading the prior persisted level (from a current-state row) and
 * writing the new one — this function only decides whether the evaluation is a TRANSITION.
 *
 * The first-ever observation of a condition (no prior state recorded) is itself treated as a
 * transition — from "unknown" to a defined level — so the initial current-state row gets
 * established. Every following call with an UNCHANGED level returns false, closing off the
 * per-evaluation re-assertion this QF exists to stop.
 *
 * CALLER CONTRACT (adversarial-review finding on this same PR): levels MUST be primitives
 * (boolean/string/number/null) that are STABLE for an unchanged condition, never a freshly
 * constructed object/array — `!==` is reference equality, so a caller that rebuilds
 * `{starved: true}` on every evaluation would re-emit every time even though the condition
 * never changed, reproducing the exact defect this function exists to stop. Serialize a
 * composite condition to a stable string/number before calling. Uses Object.is (not `!==`
 * directly) so a NaN level compares equal to itself — a naive `!==` would treat every NaN
 * evaluation as a fresh transition forever, another way to silently defeat this gate.
 *
 * @param {{previousLevel: any, currentLevel: any}} args
 *   previousLevel: the level recorded on the prior evaluation (null/undefined = never recorded)
 *   currentLevel: the level just computed this evaluation
 * @returns {boolean} true iff this is a transition (or the first observation) and should emit
 */
export function shouldEmitLevelRow({ previousLevel, currentLevel }) {
  return !Object.is(previousLevel, currentLevel);
}
