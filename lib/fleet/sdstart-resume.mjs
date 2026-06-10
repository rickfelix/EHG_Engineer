/**
 * FR-4 pure decision for sd-start.js: when a re-routed SD's claim-bound branch
 * already carries commits ahead of origin/main (an abandoned park's pushed WIP),
 * resume from it rather than appearing to start blank — and fast-forward only
 * when it is safe (remote strictly ahead, no local-only commits to lose).
 *
 * SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-4). ESM because its only consumer
 * (scripts/sd-start.js) is ESM. Pure + side-effect-free for unit testing.
 */

const PROTECTED = new Set(['main', 'master', 'HEAD', '']);

/**
 * @param {object} o
 * @param {number} o.aheadOfMain  commits on the branch not on origin/main
 * @param {string} o.branch       the claim-bound branch name
 * @param {number} [o.remoteAhead] commits on origin/<branch> not local (resume target)
 * @param {number} [o.localAhead]  commits local not on origin/<branch> (divergence guard)
 * @returns {{ resume: boolean, fastForward: boolean, diverged: boolean, notice: string|null }}
 */
export function decideResumeFromBranch({ aheadOfMain, branch, remoteAhead = 0, localAhead = 0 }) {
  if (PROTECTED.has(branch) || !(Number.isFinite(aheadOfMain) && aheadOfMain > 0)) {
    return { resume: false, fastForward: false, diverged: false, notice: null };
  }
  const rAhead = Number.isFinite(remoteAhead) && remoteAhead > 0 ? remoteAhead : 0;
  const lAhead = Number.isFinite(localAhead) && localAhead > 0 ? localAhead : 0;
  // Fast-forward only when the remote is strictly ahead AND we have no unique local commits to lose.
  const fastForward = rAhead > 0 && lAhead === 0;
  const diverged = rAhead > 0 && lAhead > 0;
  const plural = aheadOfMain === 1 ? '' : 's';
  let notice = `↻ RESUMING claim-bound branch ${branch} — ${aheadOfMain} commit${plural} ahead of origin/main already present (not a blank start)`;
  if (fastForward) notice += ' — fast-forwarding to the pushed origin tip';
  else if (diverged) notice += ` — WARNING: local and origin/${branch} have diverged (${lAhead} local / ${rAhead} remote); reconcile manually, not auto-merged`;
  return { resume: true, fastForward, diverged, notice };
}

export default { decideResumeFromBranch };
