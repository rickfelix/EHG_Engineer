/**
 * EXEC SECURITY (low, correct) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * MY CLAIM WAS OVERSTATED. The S1 commit said the source tree was protected by "TWO layers, both
 * mutation-proved INDEPENDENTLY". Measured: layer 2 (NON_SD_PREFIXES) has exactly ONE call site,
 * inside hasOrphanSD. `idle` is ALSO a stage-2 removal category and never consulted it, so the
 * idle route was protected by the marker alone — one layer, not two. The marker gate does sit
 * before all classification, so the tree was not unprotected; the "two independent layers" claim
 * was simply false for this route.
 *
 * WHY THIS ROUTE IS THE DANGEROUS ONE: a source tree is long-lived and rarely committed to, which
 * is precisely the shape isIdle exists to match. It was the classification most likely to catch it.
 *
 * SCOPE, asserted below because it is the part most likely to be "simplified" later: the guard is
 * keyed on SOURCE_TREE_DIRNAMES, NOT on all of NON_SD_PREFIXES. Those lists mean different things.
 * qf-/adhoc-/session-/_archive worktrees are legitimately reapable when idle; blanket-applying that
 * list here would make them immortal — a larger regression than the one being fixed.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isIdle, hasOrphanSD, SOURCE_TREE_DIRNAMES } from '../../../lib/worktree-reaper/detectors.js';

const POOL = path.join('C:', 'pool', '.worktrees');
const wtAt = (name) => ({ path: path.join(POOL, name), branch: 'whatever' });

// Old enough to be idle by any threshold, with no claim: the worst case for a source tree.
const idleCtx = {
  now: Date.parse('2026-08-08T12:00:00Z'),
  thresholdMs: 24 * 3600 * 1000,
  claimMap: new Map(),
  runGit: () => ({ code: 0, stdout: '1000000000' }), // last commit in 2001
};

describe('the idle route cannot reap a source tree either — layer 2 now covers BOTH routes', () => {
  for (const dirname of SOURCE_TREE_DIRNAMES) {
    it(`isIdle REFUSES to match ${dirname}`, () => {
      const r = isIdle(wtAt(dirname), idleCtx);
      expect(r.matched).toBe(false);
      expect(r.reason).toBe('source_tree_protected');
    });
  }

  it('POSITIVE CONTROL — an ordinary stale worktree IS still idle', () => {
    // Load-bearing. Without it, an isIdle that returned matched:false unconditionally would pass
    // every assertion above while disabling idle reaping entirely.
    const r = isIdle(wtAt('SD-SOME-REAL-WORK-001'), idleCtx);
    expect(r.matched).toBe(true);
  });

  it('SCOPE — qf-/adhoc-/session-/_archive stay REAPABLE via the idle route', () => {
    // The regression this fix must NOT introduce. These are in NON_SD_PREFIXES because their
    // basenames are not SD keys — a statement about orphan-SD detection, not about reapability.
    for (const name of ['qf-20260101-001', 'adhoc-thing', 'session-abc', '_archive-old']) {
      const r = isIdle(wtAt(name), idleCtx);
      expect(r.matched, `${name} must remain reapable when idle`).toBe(true);
    }
  });

  it('the orphan-sd route still refuses them too — the original layer 2 is intact', () => {
    for (const dirname of SOURCE_TREE_DIRNAMES) {
      const r = hasOrphanSD({ ...wtAt(dirname), key: dirname }, { activeSdSet: new Set(), claimMap: new Map() });
      expect(r.matched).toBe(false);
    }
  });

  it('the two lists are kept distinct, and the source trees are in both', () => {
    // Single representation (TR-3): NON_SD_PREFIXES spreads SOURCE_TREE_DIRNAMES rather than
    // repeating the strings, so the two can never drift apart.
    expect(SOURCE_TREE_DIRNAMES).toEqual(['.reaper-source', '.spawn-source']);
  });
});
