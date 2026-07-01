/**
 * QF Merge-Verification Witness
 * SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001
 *
 * A quick_fixes row must not reach status=completed while its change is absent
 * from origin/main. This witness mirrors the SD-side PR_MERGE_VERIFICATION
 * (scripts/modules/handoff/executors/lead-final-approval/gates.js): it requires
 * the QF's OWN qf/<QF-ID> branch to have a MERGED PR whose merge commit is
 * reachable from origin/main. It self-derives the PR from the QF's own branch —
 * it never trusts an arbitrary / most-recent merged pr_url — and fails CLOSED
 * (unverified) on any gh/git error or timeout, never fails open to completed.
 *
 * Incident: QF-20260701-989 sat status=completed for ~3h with pr_url pointing at
 * foreign merged PR #5290 while its own qf/QF-20260701-989 branch never reached
 * origin/main. The QF completion path had no witness; the SD path does.
 */
import { execSync } from 'child_process';
import { fetchPRMetadata, extractPRNumber } from './git-operations.js';
import { EXTERNAL_STEP_TIMEOUT_MS } from './constants.js';

/** Bracket-tokenized reason code surfaced when a completion is blocked. */
export const QF_MERGE_UNVERIFIED = 'QF_MERGE_UNVERIFIED';

/** The QF's own feature branch. create-quick-fix.js pushes `qf/<QF-ID>`. */
export function ownBranchFor(qfId) {
  return `qf/${qfId}`;
}

/**
 * Find the PR whose head branch is the QF's OWN branch (qf/<QF-ID>). Filters by
 * --head so a foreign / most-recent merged PR can never be mis-attributed.
 * @returns {{url:string, number:number, state:string, headRefName:string, mergeCommit:object}|null}
 */
export function deriveOwnPr(qfId, testDir) {
  const branch = ownBranchFor(qfId);
  try {
    const out = execSync(
      `gh pr list --head "${branch}" --state all --json url,number,state,headRefName,mergeCommit --limit 1`,
      { cwd: testDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: EXTERNAL_STEP_TIMEOUT_MS }
    );
    const prs = JSON.parse(out || '[]');
    const own = Array.isArray(prs) ? prs.find((p) => p && p.headRefName === branch) : null;
    return own || null;
  } catch {
    return null; // fail-closed — an unresolvable PR is unverified, not completed
  }
}

/** True iff `sha` is an ancestor of origin/main (the change actually landed). */
export function isReachableFromMain(sha, testDir) {
  if (!sha) return false;
  try {
    execSync('git fetch origin main --quiet', { cwd: testDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: EXTERNAL_STEP_TIMEOUT_MS });
  } catch {
    /* best-effort refresh; fall through to whatever origin/main we already have */
  }
  try {
    // exit 0 => ancestor (reachable); non-zero / error => not reachable (fail-closed)
    execSync(`git merge-base --is-ancestor ${sha} origin/main`, { cwd: testDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a QF's completion is backed by a MERGED-to-main PR on the QF's OWN
 * branch. A passed-in prUrl is trusted ONLY when it is the QF's own branch;
 * otherwise (absent / foreign) the PR is self-derived from qf/<QF-ID>.
 *
 * @param {{qfId:string, prUrl?:string, testDir:string}} args
 * @returns {{verified:boolean, code:string|null, reason:string, expectedBranch:string,
 *            prUrl?:string, headBranch?:string, state?:string, mergeSha?:string}}
 */
export function verifyQFMergeWitness({ qfId, prUrl, testDir }) {
  const expectedBranch = ownBranchFor(qfId);
  const fail = (reason, extra = {}) => ({ verified: false, code: QF_MERGE_UNVERIFIED, reason, expectedBranch, ...extra });

  // 1. Resolve the PR to verify — trust a supplied prUrl ONLY if it is the QF's own branch.
  let meta = null;
  let resolvedUrl = null;
  if (prUrl) {
    const n = extractPRNumber(prUrl);
    if (n) {
      try {
        const m = fetchPRMetadata(n, testDir);
        if (m && m.headRefName === expectedBranch) {
          meta = m;
          resolvedUrl = m.url || prUrl;
        }
      } catch {
        /* supplied pr_url unresolvable — fall through to self-derive from the own branch */
      }
    }
  }
  if (!meta) {
    const own = deriveOwnPr(qfId, testDir);
    if (own && own.headRefName === expectedBranch) {
      meta = own;
      resolvedUrl = own.url;
    }
  }
  if (!meta) {
    return fail(`no PR found whose head branch is ${expectedBranch} (branch not pushed / PR not opened, or the supplied pr_url points at a foreign PR — mis-attribution)`);
  }

  // 2. The PR must be MERGED.
  if (meta.state !== 'MERGED') {
    return fail(`PR ${resolvedUrl} (head ${meta.headRefName}) state=${meta.state}, not MERGED — the change has not landed`, { prUrl: resolvedUrl, headBranch: meta.headRefName, state: meta.state });
  }

  // 3. The merge commit must be reachable from origin/main.
  const mergeSha = meta.mergeCommit && meta.mergeCommit.oid ? meta.mergeCommit.oid : null;
  if (!isReachableFromMain(mergeSha, testDir)) {
    return fail(`merge commit ${mergeSha || '(none)'} for PR ${resolvedUrl} is not reachable from origin/main`, { prUrl: resolvedUrl, headBranch: meta.headRefName, state: meta.state, mergeSha });
  }

  return {
    verified: true,
    code: null,
    reason: `QF own branch ${expectedBranch} PR is MERGED and reachable from origin/main`,
    prUrl: resolvedUrl,
    headBranch: meta.headRefName,
    state: meta.state,
    mergeSha,
    expectedBranch
  };
}
