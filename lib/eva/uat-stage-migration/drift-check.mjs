/**
 * Pre-DDL drift check (FR-1, FR-9 AC-3) for the UAT-stage renumber migration.
 *
 * This SD's own originally-stated hard EXEC blocker (a 4-step chairman-gated writer-choke
 * chain) had already shipped to production before the SD was even created -- proof that this
 * class of mechanism can drift silently between phases. This module re-verifies, at apply time,
 * that ventures_canonical_writer_policy(), advance_venture_stage(), and fn_advance_venture_stage()
 * (including the p_to_stage upper-bound literal both RPCs hardcode) still match the shape this
 * PRD was authored against.
 */
'use strict';

import crypto from 'node:crypto';

/** Baseline sha256 fingerprints of the 3 functions' pg_get_functiondef() output, taken 2026-08-25. */
export const BASELINE_FINGERPRINT = Object.freeze({
  ventures_canonical_writer_policy: '0bdfff9e488c1ec8326a4f874236ff3ee5dadfb1ff928427f715efb9ac90cf0b',
  advance_venture_stage: '577849b00e462bd35f91c8af91bf5b712571e87c2211d10df81d5503af341e64',
  fn_advance_venture_stage: 'f972faba8902b63f2f491fa8102c1c377291c72adff7214ebdb97fcbf29ced34',
});

/** The p_to_stage upper-bound literal both RPCs enforce today (pre-renumber). */
export const BASELINE_UPPER_BOUND = 26;

// Bracket-class-only (this repo's regex-hazard mandate): [ \t]*, never \s.
const UPPER_BOUND_RE = /p_to_stage[ \t]*>[ \t]*([0-9]+)/;

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Extract the p_to_stage upper-bound literal from a function's live source text. */
export function extractUpperBound(functionDef) {
  const m = UPPER_BOUND_RE.exec(functionDef || '');
  return m ? Number(m[1]) : null;
}

/**
 * PURE: compare a live fingerprint snapshot against the committed baseline.
 * @param {{ventures_canonical_writer_policy?:string, advance_venture_stage?:string,
 *           fn_advance_venture_stage?:string}} liveHashes - sha256 hex digests keyed by function name
 * @param {{advance_venture_stage_bound?:number|null, fn_advance_venture_stage_bound?:number|null}} liveBounds
 */
export function compareFingerprint(liveHashes = {}, liveBounds = {}) {
  const mismatches = [];

  for (const [name, baselineHash] of Object.entries(BASELINE_FINGERPRINT)) {
    const liveHash = liveHashes[name];
    if (liveHash == null) {
      mismatches.push({ name, reason: 'not_found', detail: `${name} not found in live pg_proc` });
    } else if (liveHash !== baselineHash) {
      mismatches.push({ name, reason: 'hash_mismatch', detail: `live=${liveHash} baseline=${baselineHash}` });
    }
  }

  for (const [boundKey, fnName] of [
    ['advance_venture_stage_bound', 'advance_venture_stage'],
    ['fn_advance_venture_stage_bound', 'fn_advance_venture_stage'],
  ]) {
    const liveBound = liveBounds[boundKey];
    if (liveBound !== BASELINE_UPPER_BOUND) {
      mismatches.push({
        name: fnName,
        reason: 'upper_bound_drift',
        detail: `${fnName}'s p_to_stage upper bound is ${liveBound ?? 'unknown'}, expected baseline ${BASELINE_UPPER_BOUND}`,
      });
    }
  }

  return { drifted: mismatches.length > 0, mismatches };
}

/** IO: fetch live function defs and derive hashes/bounds for the 3 fingerprinted functions. */
export async function fetchLiveFingerprint(client) {
  const names = Object.keys(BASELINE_FINGERPRINT);
  const { rows } = await client.query(
    `SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = ANY($1::text[])`,
    [names]
  );
  const byName = new Map(rows.map((r) => [r.proname, r.def]));

  const liveHashes = {};
  for (const name of names) {
    const def = byName.get(name);
    if (def) liveHashes[name] = sha256(def);
  }
  const liveBounds = {
    advance_venture_stage_bound: extractUpperBound(byName.get('advance_venture_stage')),
    fn_advance_venture_stage_bound: extractUpperBound(byName.get('fn_advance_venture_stage')),
  };
  return { liveHashes, liveBounds };
}

/** Compose fetch + compare. The apply-time CLI calls this and exits non-zero on drift (FR-1 AC-2). */
export async function runDriftCheck(client) {
  const { liveHashes, liveBounds } = await fetchLiveFingerprint(client);
  return compareFingerprint(liveHashes, liveBounds);
}
