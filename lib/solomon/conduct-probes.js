/**
 * Solomon CONDUCT probes — the half its self-adherence review never had.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-3.
 *
 * WHAT WAS WRONG. solomon-self-adherence-review.mjs buildSelfAdherenceVerdict reads CLAUDE_SOLOMON.md
 * and calls missingDurableDuties() — pure set-membership of duty SLUGS against SOLOMON_LOOPS, with
 * zero behaviour inputs. It is structurally incapable of observing conduct, which is why it returned
 * CLEAN on the night of a self-reported execution breach. Its green was honest and irrelevant.
 *
 * THE SHAPE, and why it is split this way. Probes are PURE fact-consumers; resolvers do the IO.
 * That mirrors Adam's substrate deliberately rather than inventing a second framework. But note the
 * hole in the Adam precedent, documented in its own integration test — "current resolvers leave most
 * facts null => unknown => no fail" — meaning Adam's RESOLVERS have never been exercised by a test.
 * Cloning that would reproduce the blindness. So the resolver here is exported and injectable, and
 * its three outcomes (breach / clean / unavailable) are each pinned: a probe that can only be shown
 * to FAIL proves nothing, because a hardcoded fail would satisfy it. The pass/fail DELTA through the
 * resolver is what demonstrates the check can see its subject.
 */
'use strict';

import { CHECK_CLASS, assertCheckClass } from '../governance/check-class.js';

export const VERDICT = Object.freeze({ PASS: 'pass', FAIL: 'fail', UNKNOWN: 'unknown' });

/** Advice left open this long is a closure failure, not work in progress. */
export const DEFAULT_STALE_DAYS = 7;

function verdictBar(probe, duty, verdict, detail) {
  assertCheckClass(probe, CHECK_CLASS.CONDUCT);
  return { probe, duty, verdict, detail, check_class: CHECK_CLASS.CONDUCT };
}

/**
 * PROBE: Solomon closes the loop on its own advice.
 *
 * Solomon proposes; the ledger records what was decided and what came of it. A row still sitting at
 * decision='pending' long after it was raised means Solomon advised and never followed through —
 * observable behaviour, not a wiring question. `unresolvedCount` is deliberately the ONLY input:
 * a null means the resolver could not answer, which must never read as compliance.
 *
 * @param {{staleOpenAdviceCount?: number|null, staleDays?: number}} facts
 */
export function probeAdviceClosure(facts = {}) {
  const duty = 'advice-closure: Solomon closes the loop on its own advice — a proposal it never '
    + 'records a decision or outcome for is advice that was not actually given (CONST-002 / D1)';
  const n = facts.staleOpenAdviceCount;
  const days = facts.staleDays ?? DEFAULT_STALE_DAYS;

  // FAIL-LOUD: an unresolved fact is 'unknown', never 'pass'. A check that cannot see its subject
  // must not report health — that is the exact defect this SD exists to remove.
  if (n === null || n === undefined) {
    return verdictBar('advice_closure', duty, VERDICT.UNKNOWN,
      'could not read solomon_advice_outcome_ledger — closure NOT verified (this is not a pass)');
  }
  if (typeof n !== 'number' || Number.isNaN(n)) {
    return verdictBar('advice_closure', duty, VERDICT.UNKNOWN,
      `unusable closure count ${JSON.stringify(n)} — closure NOT verified`);
  }
  return n > 0
    ? verdictBar('advice_closure', duty, VERDICT.FAIL,
      `${n} advisory row(s) still undecided after ${days}d — Solomon advised and did not close the loop`)
    : verdictBar('advice_closure', duty, VERDICT.PASS,
      `no advisory older than ${days}d left undecided`);
}

export const SOLOMON_CONDUCT_PROBES = Object.freeze([probeAdviceClosure]);

/**
 * RESOLVER: read the live behaviour signal the probe consumes.
 *
 * Returns null on ANY failure rather than 0. The distinction is load-bearing: 0 means "we looked
 * and found none" (a genuine pass) while null means "we could not look" (an unknown). Collapsing
 * them would let a broken query render as perfect compliance — a check that cannot see its subject
 * returning the permissive answer, which is this SD's thesis in one line.
 *
 * @param {object} supabase injected; no ambient client is constructed here
 * @returns {Promise<{staleOpenAdviceCount: number|null, staleDays: number}>}
 */
export async function resolveSolomonConductFacts(supabase, { staleDays = DEFAULT_STALE_DAYS, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  if (!supabase || typeof supabase.from !== 'function') {
    return { staleOpenAdviceCount: null, staleDays };
  }
  try {
    const { data, error } = await supabase
      .from('solomon_advice_outcome_ledger')
      .select('id')
      .eq('decision', 'pending')
      .lt('created_at', cutoff);
    if (error || !Array.isArray(data)) return { staleOpenAdviceCount: null, staleDays };
    return { staleOpenAdviceCount: data.length, staleDays };
  } catch {
    return { staleOpenAdviceCount: null, staleDays };
  }
}

/** Run every Solomon conduct probe against resolved facts. */
export function runSolomonConductProbes(facts = {}) {
  return SOLOMON_CONDUCT_PROBES.map((p) => p(facts));
}
