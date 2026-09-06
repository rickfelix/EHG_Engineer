/**
 * lib/priority/leverage.js — LEVERAGE component ("count of rows waiting on this item").
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C.
 *
 * buildDependentsMap/unlockScore are extracted verbatim from
 * scripts/coordinator-backlog-rank.mjs:252-271 (parity-tested, not reimplemented) so the
 * live dispatch-rank pass and this module can never silently diverge. escalatedQfCountFor
 * adds the QF-side axis: a non-terminal quick_fixes row escalated into this SD
 * (quick_fixes.escalated_to_sd_id) is a row waiting on this SD exactly like an SD-to-SD
 * dependency edge is, so it is additive to unlockScore rather than a separate score.
 *
 * QFs have no reverse signal anywhere in the schema (escalated_to_sd_id points FORWARD,
 * QF -> SD; nothing points back into a quick_fixes row), so computeQfLeverage always reads
 * UNSCORED — never a fabricated zero that would rank a QF below every scored item.
 */
import { blockerKeysFor } from '../../scripts/lib/claimable-leaves.mjs';

/** Shared sentinel: a missing input reads UNSCORED and visible, never silently zero. */
export const UNSCORED = 'UNSCORED';

/** Terminal quick_fixes statuses — a QF in one of these no longer "waits on" anything. */
const TERMINAL_QF_STATUSES = new Set(['completed', 'closed', 'cancelled']);

/** dependents[key] = [sd_key, ...] of every non-terminal SD that lists `key` as a blocker. */
export function buildDependentsMap(sds) {
  const dependents = new Map();
  for (const d of (sds || [])) {
    for (const k of blockerKeysFor(d)) {
      if (!dependents.has(k)) dependents.set(k, []);
      dependents.get(k).push(d.sd_key);
    }
  }
  return dependents;
}

/** Transitive count of non-terminal SDs downstream of `key` (cycle-safe DFS). */
export function unlockScore(key, dependentsMap) {
  const seen = new Set();
  const stack = [...(dependentsMap.get(key) || [])];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || k === key) continue;
    seen.add(k);
    stack.push(...(dependentsMap.get(k) || []));
  }
  return seen.size;
}

/** Count of non-terminal quick_fixes rows escalated into this SD (by id, not sd_key). */
export function escalatedQfCountFor(sdId, quickFixes) {
  let count = 0;
  for (const qf of (quickFixes || [])) {
    if (qf.escalated_to_sd_id === sdId && !TERMINAL_QF_STATUSES.has(qf.status)) count++;
  }
  return count;
}

/** An SD's full leverage score: dependency-graph unlock count + the QF-escalation axis. */
export function computeSdLeverage(sd, dependentsMap, quickFixes) {
  return unlockScore(sd.sd_key, dependentsMap) + escalatedQfCountFor(sd.id, quickFixes);
}

/** A QF has no structural "waiting on me" signal in the schema today. */
export function computeQfLeverage() {
  return UNSCORED;
}
