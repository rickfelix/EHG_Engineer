/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (FR-1) — canonical instrument-only outcome writer for
 * solomon_advice_outcome_ledger's correlation leg (accepted rows with no outcome_sd_key).
 *
 * @wire-check-exempt: loaded exclusively via a literal dynamic import() from
 * scripts/solomon-ledger-reconcile.cjs, which is itself manually/cron-invoked (not a
 * package.json script or wire-check-gate.js knownEntries target), so static call-graph
 * traversal has no root to reach either file from — same architectural shape as the
 * lib/sub-agents/ and lib/eva-support/ KNOWN_DYNAMIC_PATTERNS exemptions in wire-check-gate.js
 * (this module IS reachable at runtime, just not via the static entry-point graph).
 *
 * CONST-002 (proposer != approver): resolveLedgerOutcome takes NO proposal_summary/body/
 * self-report field as an input. It reads ONLY outcome_sd_key, outcome_ref, and (via
 * sdStatusLookup) the actual downstream SD's status — never Solomon's own advisory text.
 *
 * Returns EXACTLY ONE of three verdicts:
 *   RESOLVED     — a terminal outcome was derived (shipped_clean/reverted) from a real downstream
 *                  SD's status.
 *   UNMEASURABLE — no instrument will EVER be able to resolve this row (ref-shape NARRATIVE/
 *                  COMMIT_SHA/EXCLUDED_QF — bucketFor's NOT_APPLICABLE). Terminal, but distinct
 *                  from RESOLVED: nothing was measured, there is nothing more to measure.
 *   NO_CHANGE    — still on an active resolution path (a linked/derivable SD that is not yet
 *                  terminal, or no ref at all yet). The caller must NOT write anything for this
 *                  verdict — there is nothing to persist.
 *
 * classifyRef CONTRACT: lib/ledger/ref-shape.js's classifyRef returns ONLY a shape string, never
 * a normalized key — this module owns its own trivial, dependency-free normalization:
 *   ELIGIBLE    — row.outcome_ref already IS a canonical uppercase SD key (the regex guarantees
 *                 this); used verbatim.
 *   CASE_DRIFT  — classifyRef's CASE_DRIFT test (/^SD-/i, no end-anchor) is a PREFIX match,
 *                 satisfied by any string merely STARTING with an SD-key-like token (verified
 *                 live: some real rows are multi-sentence narratives that happen to open with an
 *                 SD key). Only treated as derivable when ref.toUpperCase() ALSO fully matches
 *                 the strict ELIGIBLE pattern — otherwise it falls through to NO_CHANGE, never
 *                 attempting a derivation from a garbage key.
 *   EMPTY       — bucketFor's own NOT_YET ("no ref yet; nothing decided") — NO_CHANGE, never
 *                 UNMEASURABLE. An empty ref might still be filled in later.
 *
 * PERSISTENCE CONTRACT (exact fields the caller writes per verdict — nulls/absence mean "do not
 * touch that column"):
 *   NO_CHANGE    — { verdict: 'NO_CHANGE' } only. The caller performs NO write at all.
 *   RESOLVED via outcome_sd_key already set — { verdict, outcome } only; outcome_sd_key is
 *                 already the evidence pointer, untouched.
 *   RESOLVED via a derived ref (no outcome_sd_key on the row) — { verdict, outcome,
 *                 outcome_sd_key: <derived key> }; the writer BACKFILLS outcome_sd_key with the
 *                 derived key as the durable evidence pointer. outcome_ref is left untouched.
 *   UNMEASURABLE — { verdict, outcome: 'unmeasurable' } only; outcome_ref is the evidence
 *                 pointer and is PRESERVED UNCHANGED (it already carries the narrative/
 *                 commit-sha/QF-id text that proves why this is unmeasurable) — never
 *                 overwritten or annotated with a synthetic string.
 */

import { classifyRef, SHAPE, ELIGIBLE } from './ref-shape.js';

/** Pure: map a downstream SD's terminal status to a ledger outcome value. Deliberately
 * duplicated from scripts/solomon-ledger-reconcile.cjs's mapSdStatusToOutcome (two lines,
 * intentional independence — see FR-2's computeIndependentStillActiveCount for the same
 * pattern) rather than importing a CJS script module into this pure ESM lib file. */
function mapSdStatusToOutcome(sdStatus) {
  if (sdStatus === 'completed') return 'shipped_clean';
  if (sdStatus === 'cancelled') return 'reverted';
  return null;
}

/**
 * Derive a normalized SD key from an outcome_ref, or null if the ref is not safely derivable.
 * Exported for tests and for FR-2's independent-verifier equivalence check (TS-4e) — NOTE: the
 * independent verifier (computeIndependentStillActiveCount) deliberately does NOT import this
 * function; it re-implements the same logic from scratch so a bug here cannot make the verifier
 * self-certify the writer's own mistake. TS-4e exists to catch drift between the two.
 */
export function deriveSdKeyFromRef(ref) {
  const shape = classifyRef(ref);
  if (shape === SHAPE.ELIGIBLE) return String(ref).trim();
  if (shape === SHAPE.CASE_DRIFT) {
    const upper = String(ref).trim().toUpperCase();
    if (ELIGIBLE.test(upper)) return upper;
    return null; // prefix-only match (e.g. a narrative paragraph starting with an SD key) — not safe
  }
  return null;
}

/**
 * Resolve a single ledger row's outcome using ONLY instruments. `sdStatusLookup(sdKey)` must be
 * an async function returning the SD's `status` string, or null/undefined if not found.
 * @param {{ outcome_sd_key: string|null, outcome_ref: string|null }} row
 * @param {{ sdStatusLookup: (sdKey: string) => Promise<string|null|undefined> }} instruments
 * @returns {Promise<{verdict: 'RESOLVED'|'UNMEASURABLE'|'NO_CHANGE', outcome?: string, outcome_sd_key?: string}>}
 */
export async function resolveLedgerOutcome(row, { sdStatusLookup }) {
  const existingSdKey = row && row.outcome_sd_key ? String(row.outcome_sd_key).trim() : null;
  if (existingSdKey) {
    const status = await sdStatusLookup(existingSdKey);
    const outcome = mapSdStatusToOutcome(status);
    if (!outcome) return { verdict: 'NO_CHANGE' };
    return { verdict: 'RESOLVED', outcome };
  }

  const ref = row ? row.outcome_ref : null;
  const derivedSdKey = deriveSdKeyFromRef(ref);
  if (derivedSdKey) {
    const status = await sdStatusLookup(derivedSdKey);
    const outcome = mapSdStatusToOutcome(status);
    if (!outcome) return { verdict: 'NO_CHANGE' };
    return { verdict: 'RESOLVED', outcome, outcome_sd_key: derivedSdKey };
  }

  const shape = classifyRef(ref);
  // EMPTY (no ref yet) and CASE_DRIFT-that-failed-the-full-match-guard both fall through to
  // NO_CHANGE — bucketFor's own semantics put BOTH shapes in NOT_YET, never NOT_APPLICABLE.
  // A CASE_DRIFT ref that isn't safely derivable (e.g. a narrative paragraph that merely opens
  // with an SD-key-like token) is still "not yet decided", not "provably unmeasurable".
  if (shape === SHAPE.EMPTY || shape === SHAPE.CASE_DRIFT) return { verdict: 'NO_CHANGE' };
  // NARRATIVE, COMMIT_SHA, or EXCLUDED_QF — bucketFor's own NOT_APPLICABLE domain: no instrument
  // will ever resolve this row.
  return { verdict: 'UNMEASURABLE', outcome: 'unmeasurable' };
}
