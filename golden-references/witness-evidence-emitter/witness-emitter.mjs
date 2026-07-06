// Golden reference — witness-evidence emitter (REFERENCE ONLY, never wired).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D
//
// A witness proves an action happened by letting the truth be RE-DERIVED from
// the primary state the action changed — NOT from the action's own self-report.
// The distinction is the whole point: an action can LIE (return "success"
// without doing the work); a witness that only re-checks the self-report greens
// on the lie (the mocked-gate-green class). This reference defeats that by
// separating THREE things a naive emitter conflates:
//   - the action's CLAIM (what it returned),
//   - the primary GOVERNED STATE the action mutated (the ground truth),
//   - the WITNESS record (the claim + a hash, checkable against the truth).
//
// Five doctrines:
//  1. ATOMIC: the action runs INSIDE the transaction and the witness is written
//     in the SAME boundary — so a crash rolls back BOTH (real atomicity, not a
//     copy of the return written after the action already committed).
//  2. NEVER PRE-DECLARE: the claim comes from running the action, after it runs.
//  3. VERIFY-BY-READ: verifyWitness re-derives the ACTUAL outcome by READING
//     the governed state, then compares — it never trusts the witness's claim.
//  4. TAMPER-EVIDENT: the witness carries the claim AND a CANONICAL crypto hash
//     (sorted keys — a re-read from a real store won't reproduce JS insertion
//     order); verify re-hashes the re-derived truth and compares.
//  5. INDEPENDENT RE-DERIVATION SOURCE: verify re-derives from the PRIMARY
//     governed state via an injected `deriveTruth(store)`, a source separate
//     from BOTH the witness object AND the action's self-report. A verify that
//     re-reads the action's own returned value (or the witness's claim) is the
//     forbidden tautology — it can only prove self-consistency, never truth,
//     and greens on a lying action. (The estate's witness-adoption.mjs does
//     this right: it cross-checks telemetry against `gh pr list` of actually-
//     merged PRs, an independent ground truth — not against the witness's copy.)
//
// Witness shape: { action, claimed_result, evidence_hash, verified }.
// `verified` starts null and is set ONLY by verifyWitness re-deriving the truth.
import { createHash } from 'node:crypto';

/** Canonical JSON (sorted keys) so a re-read from any store re-hashes stably. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
/** Content hash of the outcome (tamper-evidence half of D4; canonical D4 fix). */
function hashContent(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/**
 * Emit a witness for `action`. Runs the action INSIDE the transaction so its
 * governed effect and the witness commit together (D1 atomic); the witness
 * records the action's CLAIM plus a hash of it (D2 never pre-declare). The
 * action MUTATES the governed store — its real effect is what verify later
 * re-derives, independent of this claim.
 *
 * @param {(store: Map) => any} action - performs the governed mutation on the
 *        store and RETURNS its claimed outcome.
 * @param {{ transaction: (fn: (store: Map) => void) => void, key?: string }} opts
 *        `transaction(fn)` runs fn against the durable store atomically (map to
 *        a real BEGIN/COMMIT / single RPC / outbox in an application).
 * @returns {{ action: string, claimed_result: any, evidence_hash: string, verified: null }}
 */
export function emitWitness(action, opts) {
  const key = opts && opts.key ? opts.key : 'witness';
  let witness = null;
  // D1: action + witness inside ONE boundary. The action mutates the store
  // (its real durable effect); the witness records the claim it returned. A
  // crash inside the callback rolls back both — the action can never exist
  // without its witness, nor the witness without the effect.
  opts.transaction((store) => {
    const claimed_result = action(store);        // D2: claim from running the action
    witness = {
      action: String(action.name || key),
      claimed_result,
      evidence_hash: hashContent(claimed_result),
      verified: null,                            // D3: emitter never self-asserts
    };
    store.set(key + ':witness', witness);
  });
  return witness;
}

/**
 * Verify a witness by RE-DERIVING the ACTUAL outcome from the PRIMARY governed
 * state (via the injected `deriveTruth`), re-hashing it CANONICALLY (D4), and
 * comparing to the witness's hash of the claim. If the action LIED — recorded a
 * claim it did not actually produce in the store — the re-derived truth won't
 * match and `verified` is false (D3 + D5). NEVER reads `witness.claimed_result`
 * to decide — that would re-check the self-report and green on the lie.
 *
 * @param {{ evidence_hash: string }} witness
 * @param {{ store: Map, deriveTruth: (store: Map) => any }} opts - deriveTruth
 *        re-derives the actual outcome from the governed state (the independent
 *        source, separate from the witness and the action's return).
 * @returns {{ ...witness, verified: boolean }}
 */
export function verifyWitness(witness, opts) {
  // D5: re-derive the ACTUAL outcome from the primary governed state — not from
  // the witness's claim, not from the action's returned value.
  const actual = opts.deriveTruth(opts.store);
  // D4: re-hash the independently re-derived truth and compare to the witness.
  const verified = hashContent(actual) === witness.evidence_hash;
  return { ...witness, verified };
}
