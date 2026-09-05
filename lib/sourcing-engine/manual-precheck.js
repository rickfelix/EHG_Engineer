/**
 * lib/sourcing-engine/manual-precheck.js
 *
 * SD-LEO-INFRA-KILL-DUPLICATE-WORK-001 (LEG B) — the STEP-0 "was-this-built" predicate,
 * made mechanical and callable.
 *
 * ROOT CAUSE (this session, witnessed twice): STEP-0 (CLAUDE_ADAM.md section 5f, "Hand-mining
 * the VDR gauge is LAST-RESORT") is an LLM-executed manual sourcing pass that never called the
 * ALREADY-BUILT, ALREADY-CORRECT dedup machinery in router.js/dedup-autostamp.js — that machinery
 * only runs against `conversion_ledger` rows via the automated `autostampLedgerCandidates()`
 * pipeline, which a hand-fed mint (the two 2026-08-30 re-mints of SD-EHG-COCKPIT-DTB-BUILD-001
 * and SD-EHG-COCKPIT-VENTPERF-BUILD-001) never passes through. This is NOT a missing predicate —
 * `stampCandidate()`/`routeCandidate()` already correctly match against ALL existing SDs
 * (completed or not) and already carry the outcome-realized/re-emit distinction. The gap was
 * purely that a manual mint never consulted it.
 *
 * REUSE, don't reinvent (the exact anti-pattern this SD exists to kill): this module adds ZERO
 * new matching logic. It composes the two already-shipped, already-tested primitives --
 * loadDedupContext() (existing/shippedInfraKeys/outcomeRealizedKeys) and stampCandidate()
 * (routeCandidate() under the hood) -- into a single call shaped for STEP-0's
 * predicate-publication rule: one call, one publishable result, both predicates named.
 */
import { loadDedupContext, loadQfDedupContext, stampCandidate } from './dedup-autostamp.js';
import { findDedupMatch, DEFAULT_JACCARD_THRESHOLD } from './router.js';

/**
 * Run BOTH STEP-0 dedup predicates against a sourcing candidate and return a result shaped for
 * direct inclusion in a STEP-0 sourcing message.
 *
 * Predicate 1 (non-terminal, "is-anyone-working"): a title/semantic match against an existing SD
 * whose status is not itself checked here -- callers already publish this via the standing
 * claim/belt tooling. Predicate 2 (completed, "was-this-built") is what this function adds: does
 * the match resolve to a COMPLETED SD, and if so, is its capability's VDR outcome already
 * realized (not just infra-shipped)?
 *
 * QF-20260903-254: predicate 2 also reads the QUICK-FIX lane. STEP-0 previously matched
 * strategic_directives_v2 ONLY, so a candidate whose work had already shipped as a completed
 * quick_fixes row returned NOT-FOUND with full confidence (measured: SD-LEO-ORCH-CAPA-RECORD-
 * TRUTH-001-B was authored naming two claim detectors QF-20260902-724 had already repaired 8.5h
 * earlier). The QF lane is checked whenever the SD lane does not itself resolve to ALREADY-BUILT
 * (a completed SD match still wins, unchanged); a completed-QF match returns ALREADY-BUILT citing
 * that QF via `citedQfKey`. Both lane reads are FAIL-LOUD (loadDedupContext/loadQfDedupContext
 * both throw on a read error) rather than silently returning a clean NOT-FOUND -- a lane that
 * cannot be searched must never look identical to a lane that was searched and found nothing.
 *
 * @param {object} params
 * @param {object} params.supabase - service-role client
 * @param {object} [params.io] - injected I/O for computeBuildGauge (test seam)
 * @param {string} params.title - candidate title (the mint's own proposed title)
 * @param {string} [params.description] - candidate description, for the semantic-problem-key match
 * @returns {Promise<{
 *   predicate: 'was-this-built',
 *   result: 'ALREADY-BUILT'|'NOT-FOUND',
 *   citedSdKey: (string|null),
 *   citedQfKey: (string|null),
 *   reason: (string|null),
 *   re_emit: boolean
 * }>}
 */
export async function checkAlreadyBuilt({ supabase, io, title, description } = {}) {
  const { existing, shippedInfraKeys, outcomeRealizedKeys } = await loadDedupContext({ supabase, io });
  const stamp = stampCandidate({ title, description }, { existing, shippedInfraKeys, outcomeRealizedKeys });

  // The SD lane's own non-terminal signal (re-emit, or nothing) -- null when it found nothing at
  // all OR only matched a non-terminal (in-flight) SD.
  let sdResult = null;
  if (stamp.dedup_match_sd_key) {
    const isShipped = shippedInfraKeys.has(stamp.dedup_match_sd_key);
    const isRealized = outcomeRealizedKeys.has(stamp.dedup_match_sd_key);
    if (isShipped && isRealized) {
      sdResult = { result: 'ALREADY-BUILT', citedSdKey: stamp.dedup_match_sd_key, reason: 'completed and VDR-realized', re_emit: false };
    } else if (isShipped) {
      // Infra shipped, outcome not yet realized (the anti-inflation-cap trap this SD's LEG A
      // fixes probe-by-probe): NOT a hard ALREADY-BUILT, but the candidate should re-emit as
      // outcome work against the existing SD, never mint a fresh duplicate.
      sdResult = { result: 'NOT-FOUND', citedSdKey: stamp.dedup_match_sd_key, reason: 'completed but VDR-unrealized (re-emit as outcome work, do not mint new)', re_emit: true };
    }
    // else: matched a non-terminal (in-flight) SD -- predicate 2 stays silent (predicate 1,
    // is-anyone-working, published separately by the caller, is the relevant signal).
  }

  if (sdResult && sdResult.result === 'ALREADY-BUILT') {
    return { predicate: 'was-this-built', citedQfKey: null, ...sdResult };
  }

  const { existingQfs, completedQfKeys } = await loadQfDedupContext({ supabase });
  const qfMatch = findDedupMatch({ title, description }, existingQfs, DEFAULT_JACCARD_THRESHOLD);
  if (qfMatch && completedQfKeys.has(qfMatch.sd_key)) {
    return {
      predicate: 'was-this-built',
      result: 'ALREADY-BUILT',
      citedSdKey: null,
      citedQfKey: qfMatch.sd_key,
      reason: 'completed as a quick fix',
      re_emit: false,
    };
  }
  // Neither lane resolved to ALREADY-BUILT -- surface the SD lane's own re-emit signal if it had
  // one, else a clean NOT-FOUND (a matched-but-in-flight QF is likewise silent here, symmetric
  // with the in-flight-SD case above; predicate 1 is the relevant signal for that).
  return sdResult
    ? { predicate: 'was-this-built', citedQfKey: null, ...sdResult }
    : { predicate: 'was-this-built', result: 'NOT-FOUND', citedSdKey: null, citedQfKey: null, reason: null, re_emit: false };
}
