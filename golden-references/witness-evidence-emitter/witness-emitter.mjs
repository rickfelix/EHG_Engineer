// Golden reference — witness-evidence emitter (REFERENCE ONLY, never wired).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D
//
// A witness proves an action happened by recording what was OBSERVED,
// checkable by independent read. Five doctrines against the test-masking /
// mocked-gate-green class:
//  1. ATOMIC: the action effect and its witness are written inside ONE
//     transaction boundary — never two separate awaited writes (a crash
//     between them leaves an action with no witness, or a witness with no
//     action). Here that boundary is an INJECTED `transaction(fn)` callback;
//     an application maps it to a real BEGIN/COMMIT, a single RPC, or an outbox.
//  2. NEVER PRE-DECLARE: `observed_result` is taken from the action's RETURN,
//     after it runs — never an anticipated value passed in. The mocked-gate
//     defect is a witness whose success was decided before the action ran.
//  3. VERIFY-BY-READ: `verifyWitness` re-derives the truth by READING state,
//     not by trusting the witness's own field.
//  4. TAMPER-EVIDENT: the witness carries `observed_result` AND a crypto
//     `evidence_hash` (content AND hash, never a bare boolean); verify
//     re-hashes the re-derived content and compares.
//  5. INDEPENDENT RE-DERIVATION SOURCE: verify reads a store SEPARATE from the
//     witness object and FAILS when they disagree. A rederive that reads
//     `witness.observed_result` is a tautology (it can never catch a forgery)
//     and is the gravest self-test-masking hole — forbidden.
//
// Witness shape: { action, observed_result, evidence_hash, verified }.
// `verified` starts null and is set ONLY by verifyWitness reading state —
// the emitter never asserts its own success.
import { createHash } from 'node:crypto';

/** Stable content hash of the observed result (tamper-evidence half of D4). */
function hashContent(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

/**
 * Emit a witness for `action`. Runs the action, observes the REAL result, and
 * writes both the action effect and the witness inside ONE transaction
 * boundary (D1 atomic). `observed_result` comes from the action return (D2
 * never pre-declare). `verified` starts null (D3 — only a read sets it).
 *
 * @param {() => any} action - the governed action; its RETURN is the observed result.
 * @param {{ transaction: (fn: (store: Map) => void) => void, key?: string }} opts
 *        `transaction(fn)` runs fn against the durable store atomically (the
 *        single-boundary seam; inject a real txn in an application).
 * @returns {{ action: string, observed_result: any, evidence_hash: string, verified: null }}
 */
export function emitWitness(action, opts) {
  const key = opts && opts.key ? opts.key : 'witness';
  // D2: observe the REAL result — run first, record after.
  const observed_result = action();
  const evidence_hash = hashContent(observed_result);
  const witness = { action: String(action.name || key), observed_result, evidence_hash, verified: null };
  // D1: action-effect + witness written in ONE boundary. The action already
  // ran; here the emitter persists the OBSERVED effect and the witness together
  // so neither can exist without the other.
  opts.transaction((store) => {
    store.set(key + ':effect', observed_result);
    store.set(key + ':witness', witness);
  });
  return witness;
}

/**
 * Verify a witness by RE-DERIVING the observed content from an INDEPENDENT
 * store (D3 + D5), re-hashing it (D4), and comparing. Returns the witness with
 * `verified` set true/false. NEVER reads `witness.observed_result` to decide —
 * that would be a tautology.
 *
 * @param {{ evidence_hash: string, verified: any }} witness
 * @param {{ store: Map, key?: string }} opts - the independent store to read from.
 * @returns {{ ...witness, verified: boolean }}
 */
export function verifyWitness(witness, opts) {
  const key = opts && opts.key ? opts.key : 'witness';
  // D5: re-derive from the STORE, not from the witness object.
  const rederived = opts.store.get(key + ':effect');
  const present = opts.store.has(key + ':effect');
  // D4: re-hash the re-derived content and compare to the witness hash.
  const verified = present && hashContent(rederived) === witness.evidence_hash;
  return { ...witness, verified };
}
