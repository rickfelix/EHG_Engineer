/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 — the defect I shipped at 4fea5909927, pinned.
 *
 * THIS SUITE IS GREEN AND DOCUMENTS A BUG. It does not assert desired behaviour; it asserts the
 * CURRENT behaviour, so that the incompatibility is a fact the suite states rather than a claim in
 * a handoff note. Delete these tests when the siting is fixed — do not "make them pass".
 *
 * WHAT IS WRONG. FR-1 creates the spawn-source worktree with `git worktree add --detach` (see
 * buildSpawnSourceWorktreeArgs). FR-2's flag-ON path then points enforceTreeCurrency at that tree.
 * But assessTreeCurrency resolves the branch with `rev-parse --abbrev-ref HEAD`, which answers the
 * literal string 'HEAD' for a detached worktree (verified against a real throwaway repo, not
 * assumed), and treats that as `detached_head` → not current, not self-healable → enforce THROWS.
 *
 * So the tree would be PRISTINE — zero dirt, sitting exactly on origin/main, everything the guard
 * demands — and be refused anyway, because the guard asks "which branch are you on?" and the tree
 * was deliberately built not to answer. Flipping FLEET_SPAWN_SOURCE_TREE on would refuse EVERY
 * spawn in the fleet. It is safe today only because the flag defaults OFF.
 *
 * WHY THE OBVIOUS FIXES ALSO FAIL, which is why this needs a design decision and not a one-liner:
 *   - attach it to `main`: impossible, the shared root already has main checked out and git
 *     refuses a second checkout of the same branch (without --force).
 *   - attach it to any OTHER branch name: fine while behind=0, but self-heal requires
 *     `branch === SELF_HEALABLE_BRANCH` ('main'), so the first time origin/main moves the tree is
 *     behind, unhealable, and refuses. Same outcome, just delayed until the next merge.
 * The third case is pinned below precisely because it LOOKS like the fix.
 *
 * This is the SD's own defect class turned inside out. The SD exists because a check reported a
 * state nothing had earned; here a check reports failure for a tree that earned every condition it
 * names. Both come from an instrument measuring something other than what it claims to decide.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { assessTreeCurrency, SELF_HEALABLE_BRANCH } = require_('../../../lib/fleet/tree-currency.cjs');

/**
 * A git double driven by the two facts that vary between the cases: what branch the tree reports
 * and how far behind it is. Everything else is held at the spawn-source tree's real steady state —
 * perfectly clean — so no case can be dismissed as "well, it was dirty".
 */
function gitDouble({ branch, behind }) {
  return (args) => {
    const cmd = args.join(' ');
    if (cmd.startsWith('fetch')) return '';
    if (cmd === 'rev-parse --abbrev-ref HEAD') return branch;
    if (cmd === 'status --porcelain') return ''; // pristine, always
    if (cmd.startsWith('rev-list --count')) return String(behind);
    throw new Error(`unexpected git command in double: ${cmd}`);
  };
}

const assess = (opts) =>
  assessTreeCurrency({ dir: '/fake/.spawn-source', runner: gitDouble(opts) });

describe('spawn-source tree vs. the currency guard — shipped incompatibility', () => {
  it('DETACHED (what FR-1 actually creates) is refused even when pristine and exactly on origin/main', () => {
    // behind=0 and clean: the tree has literally nothing wrong with it.
    const r = assess({ branch: 'HEAD', behind: 0 });

    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false);
    expect(r.reason).toBe('detached_head');
    // enforceTreeCurrency's throw condition, stated explicitly so the consequence is not left
    // as an inference for the reader.
    expect(r.current === false && r.selfHealable === false).toBe(true);
  });

  it('DETACHED and behind is refused for the same reason — the branch check short-circuits first', () => {
    const r = assess({ branch: 'HEAD', behind: 5 });
    expect(r.reason).toBe('detached_head');
    // Note it never reports the REAL behind count — the operator gets a detached_head refusal
    // carrying behind=null, with no indication that staleness was also involved.
    expect(r.behind).toBeNull();
    expect(r.behind).not.toBe(5);
  });

  it('a NAMED non-main branch passes while current — which is exactly why this fix looks correct', () => {
    const r = assess({ branch: 'spawn-source', behind: 0 });
    expect(r.current).toBe(true);
  });

  it('...and the same named branch is refused the moment origin/main moves, because self-heal is main-only', () => {
    const r = assess({ branch: 'spawn-source', behind: 1 });
    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false); // clean, but not on SELF_HEALABLE_BRANCH
    expect(r.dirty).toBe(false); // the refusal is NOT about dirt
  });

  it('only branch main can self-heal — the one branch the shared root already occupies', () => {
    expect(SELF_HEALABLE_BRANCH).toBe('main');
    const r = assess({ branch: 'main', behind: 3 });
    expect(r.selfHealable).toBe(true);
  });
});
