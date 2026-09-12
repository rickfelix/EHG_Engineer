/**
 * Fleet model policy -- QF-20260911-878.
 *
 * Chairman-facing defect: worker seats inherit whatever model the terminal that spawned them last
 * had selected (measured live: all five worker seats sampled on Fable while the Fable weekly
 * bucket sat at 84%, against 46% for all-models). lib/fleet/build-session-launch.cjs's spawn
 * invocation carried no --model flag at all, so a spawned or hand-started seat silently took
 * whatever the last `/model` selection on the machine happened to be. This module is the SINGLE
 * place the per-seat-class policy lives, so a builder, a hand-start recipe, and (in a follow-up)
 * a SessionStart mismatch check can all read the SAME answer instead of re-deriving one.
 *
 * SCOPE NOTE: this QF wires the policy into the spawn path (build-session-launch.cjs) and the
 * hand-start recipe printer. Wiring a mismatch check into the live SessionStart hook
 * (scripts/hooks/capture-session-id.cjs) and a fleet-dashboard "seats off policy" count are
 * deliberately deferred to a follow-up -- capture-session-id.cjs is the SessionStart hook every
 * seat's registration depends on, and a fleet-dashboard change is a separate, reviewable surface.
 */

// Mirrors scripts/hooks/capture-session-id.cjs's MODEL_ALIAS_ORDER/coarseModelAlias exactly (that
// file does not export them) -- kept in lockstep intentionally rather than imported, so this
// policy module has zero dependency on the SessionStart hook's internals.
const MODEL_ALIAS_ORDER = ['fable', 'opus', 'sonnet', 'haiku'];

/** Coarse alias for a raw model id/string, e.g. 'claude-fable-5-1' -> 'fable'. Null if unrecognized. */
function coarseModelAlias(raw) {
  const s = String(raw ?? '').toLowerCase();
  return MODEL_ALIAS_ORDER.find((alias) => s.includes(alias)) || null;
}

// Role seats pinned to the judgment-seat model by the ratified model posture (Solomon P4 pin,
// Adam and the coordinator likewise). Everything else (undefined/null/unrecognized role) is a
// worker seat -- the class that was silently burning the scarce Fable bucket.
const ROLE_SEAT_ROLES = new Set(['adam', 'solomon', 'michael', 'coordinator']);

const POLICY = { worker: 'claude-opus-5', role: 'claude-fable-5-1' };

/** Which seat class a session belongs to, from role (undefined/null/unrecognized => 'worker'). */
function seatClassFor({ role } = {}) {
  const r = role ? String(role).toLowerCase() : null;
  return r && ROLE_SEAT_ROLES.has(r) ? 'role' : 'worker';
}

/** The policy-pinned model id for a seat class. */
function policyModelFor(seatClass) {
  return POLICY[seatClass] ?? POLICY.worker;
}

/**
 * Pure: does an observed model violate the seat-class policy? Coarse-alias compared, so a version
 * bump within the same family (e.g. a future 'claude-opus-5.1') is never a false mismatch. An
 * absent/unrecognized observed model never trips -- this cannot assert a mismatch on data it does
 * not have.
 */
function checkModelMismatch({ role, model } = {}) {
  const seatClass = seatClassFor({ role });
  const expectedModel = policyModelFor(seatClass);
  const observedAlias = coarseModelAlias(model);
  const mismatch = observedAlias !== null && observedAlias !== coarseModelAlias(expectedModel);
  return { seatClass, expectedModel, observedModel: model ?? null, mismatch };
}

/** The exact `claude --model <id>` line an operator should hand-start a seat of this class with. */
function recipeLine(seatClass) {
  return `claude --model ${policyModelFor(seatClass)}`;
}

module.exports = {
  MODEL_ALIAS_ORDER,
  coarseModelAlias,
  ROLE_SEAT_ROLES,
  POLICY,
  seatClassFor,
  policyModelFor,
  checkModelMismatch,
  recipeLine,
};
