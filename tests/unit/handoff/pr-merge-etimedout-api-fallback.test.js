/**
 * QF-20260904-533: PR_MERGE_VERIFICATION's per-branch rev-list check runs in the shared root
 * working tree; a concurrent session's index lock or a slow fetch produces ETIMEDOUT with zero
 * relation to whether the PR actually merged. Before this fix, ANY error there (timeout or a
 * genuinely broken branch) was treated identically as "unverified — block completion", turning
 * transient local git contention into a failed gate on a PR GitHub already reads as merged.
 *
 * Fix: before concluding unverified, ask the GitHub API directly (gh pr list --head ... --state
 * merged, no local git dependency) the same question the happy path already asks a few lines
 * above. API-confirmed-merged now short-circuits to the SAME skip path the happy case uses
 * (mergeEvidence); only when the API ALSO fails to confirm does the branch still block.
 *
 * Same source-text-guard convention as the sibling
 * tests/unit/handoff/pr-merge-squash-detection.test.js (this file dynamically imports
 * child_process inside the validator closure, so mocking execFileSync would require rebuilding
 * a large surrounding fixture — a source-text guard proportionate to this QF's scope pins the
 * fix's presence and shape without that risk).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const gatesPath = resolve(import.meta.dirname, '../../../scripts/modules/handoff/executors/lead-final-approval/gates.js');
const gatesSource = readFileSync(gatesPath, 'utf-8');

describe('PR_MERGE_VERIFICATION ETIMEDOUT API fallback (QF-20260904-533)', () => {
  it('the rev-list failure catch attempts a GitHub API confirmation before concluding unverified', () => {
    // Isolate the catch block this fix lives in, so these assertions can't accidentally match
    // the unrelated happy-path merged-PR check a few lines above it.
    const catchStart = gatesSource.indexOf('} catch (e) {');
    expect(catchStart).toBeGreaterThan(-1);
    const catchBlock = gatesSource.slice(catchStart, catchStart + 3200);

    expect(catchBlock).toContain('QF-20260904-533');
    expect(catchBlock).toContain('apiConfirmedMerged');
    expect(catchBlock).toContain("'pr', 'list', '--head', cleanBranch, '--state', 'merged'");
  });

  it('API confirmation reuses the SAME positive-evidence path as the happy-case squash-merge check', () => {
    const catchStart = gatesSource.indexOf('} catch (e) {');
    const catchBlock = gatesSource.slice(catchStart, catchStart + 3200);
    expect(catchBlock).toContain('mergeEvidence.push({ branch: cleanBranch, repo, prNumber: mergedPrs[0].number })');
  });

  it('only falls through to the blocking unverified push when the API confirmation ALSO fails', () => {
    const catchStart = gatesSource.indexOf('} catch (e) {');
    const catchBlock = gatesSource.slice(catchStart, catchStart + 3200);
    expect(catchBlock).toContain('if (!apiConfirmedMerged) {');
    expect(catchBlock).toContain('unmergedBranches.push({');
  });

  it('a genuinely-unmerged branch (API also fails/finds nothing) is still reported as unverified — no false PASS', () => {
    const catchStart = gatesSource.indexOf('} catch (e) {');
    const catchBlock = gatesSource.slice(catchStart, catchStart + 3200);
    expect(catchBlock).toContain('unverified: true');
    expect(catchBlock).toContain('reason: e?.message || String(e)');
  });
});
