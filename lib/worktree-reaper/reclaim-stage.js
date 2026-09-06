/**
 * RECLAIM stage (SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001, FR-1b).
 *
 * Decides whether a hard_keep tree that PRESERVE has already made safe may actually be
 * REMOVED. Narrow and destructive, unlike PRESERVE: every signal below must
 * independently agree, and this is only PART of the removal gate — the caller still
 * routes an eligible record through the SAME liveClaimBlocksRemoval +
 * treeResidencyBlocksRemoval composition every other removal stage goes through
 * (scripts/worktree-reaper.mjs's shared removal loop), so "not active_claim_protected
 * on a fresh pair-read" (FR-1b condition 4) is enforced there, not duplicated here.
 */
import { createRequire } from 'node:module';
import { isKnownWedged, FREEZE_CUT_MINUTES } from '../fleet/genuine-worker.mjs';

const require = createRequire(import.meta.url);
const { markerDirs, getMarkerSessionIds } = require('../fleet/cc-pid-liveness.cjs');

export const RECLAIM_VERDICT = Object.freeze({ REMOVED: 'reclaim_removed' });

/**
 * Is the holder's PID resident, checked across the marker-dir UNION (both the local
 * checkout's and the main worktree's marker dirs) rather than the single-dir default —
 * a live process with cwd inside a removed tree resolves its next git command to the
 * shared root (lib/worktree-reapability.js's walk-up behavior), so checking only one
 * marker dir would miss it.
 * @param {object|null} holder - a claude_sessions row, or null
 * @param {{markerDirsFn?: Function, getMarkerSessionIdsFn?: Function}} [opts]
 */
export function isHolderPidResident(holder, opts = {}) {
  const { markerDirsFn = markerDirs, getMarkerSessionIdsFn = getMarkerSessionIds } = opts;
  if (!holder?.session_id) return false; // no holder record — nothing to find alive
  for (const dir of markerDirsFn()) {
    if (getMarkerSessionIdsFn(dir)[holder.session_id]?.alive) return true;
  }
  return false;
}

/**
 * The RECLAIM predicate (FR-1b conditions 1, 2, 3, 5 — condition 4 is enforced by the
 * caller's shared removal-loop guards, see module header). ALL must hold.
 * @param {object} input
 * @param {boolean} input.contentSafe - condition (1): a fresh preserve push succeeded
 *   THIS tick, or the tree was already clean (no dirty files) and fully pushed (no
 *   unpushed commits).
 * @param {object|null} input.holder - the tree's holder session row, or null.
 * @param {boolean} input.auditAccepted - condition (5): the audit sink accepted this
 *   tree's classification row this tick (FR-3 dependency).
 * @param {number} [input.nowMs]
 * @param {number} [input.freezeCutMinutes] - defaults to the live FREEZE_CUT_MINUTES
 *   (lib/fleet/genuine-worker.mjs) rather than a hardcoded figure, so this always tracks
 *   whatever that constant currently is.
 * @param {{markerDirsFn?: Function, getMarkerSessionIdsFn?: Function, isKnownWedgedFn?: Function}} [opts]
 * @returns {{eligible: boolean, reason: string}}
 */
export function evaluateReclaimEligibility(input, opts = {}) {
  const { auditAccepted } = input;
  if (!auditAccepted) return { eligible: false, reason: 'audit_not_accepted' };
  return evaluateReclaimEligibilityPreAudit(input, opts);
}

/**
 * QF-20260904-508: conditions 1, 2, 3 ONLY (content-safe, holder-PID-not-resident,
 * holder-staleness) — condition 5 (audit acceptance, input.auditAccepted) is not
 * evaluated here and need not even be present on `input`. The audit sink writes ONCE per
 * tick, after every tree has already been classified, so per-tree acceptance cannot be
 * known at classification time; callers use this to compute a pre-audit candidate signal,
 * then re-gate the whole batch afterwards against the real write outcome (see
 * gateReclaimCandidatesByAudit / scripts/worktree-reaper.mjs). Previously,
 * evaluateReclaimEligibility() was called at classification time with a hardcoded
 * `auditAccepted: false` placeholder, which made condition 5 fail unconditionally and so
 * masked conditions 1/2/3 as well — RECLAIM could never fire, for any tree, ever.
 * @param {object} input
 * @param {boolean} input.contentSafe - condition (1): see evaluateReclaimEligibility.
 * @param {object|null} input.holder - the tree's holder session row, or null.
 * @param {number} [input.nowMs]
 * @param {number} [input.freezeCutMinutes]
 * @param {{markerDirsFn?: Function, getMarkerSessionIdsFn?: Function, isKnownWedgedFn?: Function}} [opts]
 * @returns {{eligible: boolean, reason: string}}
 */
export function evaluateReclaimEligibilityPreAudit(input, opts = {}) {
  const { contentSafe, holder, nowMs = Date.now(), freezeCutMinutes = FREEZE_CUT_MINUTES } = input;
  const { isKnownWedgedFn = isKnownWedged } = opts;

  if (!contentSafe) return { eligible: false, reason: 'content_not_safe' };
  if (isHolderPidResident(holder, opts)) return { eligible: false, reason: 'holder_pid_resident' };

  const staleEnough = holder
    ? Boolean(holder.released_at) || isKnownWedgedFn(holder, nowMs, freezeCutMinutes)
    : true; // no holder record at all — nothing to be stale against
  if (!staleEnough) return { eligible: false, reason: 'holder_not_stale' };

  return { eligible: true, reason: 'reclaim_eligible' };
}

/**
 * QF-20260904-508: the FR-1b condition (5) re-gate, extracted so it is independently
 * testable — a rejected audit write is fatal for the WHOLE batch's reclaim path
 * (writeAuditSink is a single batch insert; ok:false means none of this tick's rows
 * landed), so only pre-audit candidates from an ACCEPTED batch ever reclaim.
 * @param {Array<{_reclaimCandidate?: boolean}>} records
 * @param {{ok: boolean}} auditResult
 */
export function gateReclaimCandidatesByAudit(records, auditResult) {
  return auditResult?.ok ? records.filter((r) => r._reclaimCandidate) : [];
}

export default {
  isHolderPidResident, evaluateReclaimEligibility, evaluateReclaimEligibilityPreAudit,
  gateReclaimCandidatesByAudit, RECLAIM_VERDICT,
};
