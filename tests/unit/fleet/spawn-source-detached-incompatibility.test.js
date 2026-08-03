/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 — THE SEAM between the spawn-source tree and the guard
 * that judges it.
 *
 * This file began as a green suite documenting a shipped bug: FR-1 created the tree with
 * `git worktree add --detach`, FR-2 pointed enforceTreeCurrency at it, and assessTreeCurrency
 * rejects any detached worktree as `detached_head` — so the tree was pristine, exactly on
 * origin/main, every condition the guard demands, and refused anyway. Under
 * FLEET_SPAWN_SOURCE_TREE that refused EVERY spawn in the fleet.
 *
 * The siting is now fixed, so per that file's own instruction the detached cases are gone rather
 * than "made to pass". What remains is the reason the seam is now correct, plus the case that
 * still bites and is the entire justification for refreshing on reuse.
 *
 * WHY THIS FILE EXISTS AT ALL, and the lesson worth keeping: both components were individually
 * correct and individually green. The defect lived ONLY where they met, and the default-OFF flag
 * is what kept the seam from ever being traversed. Five mutants proved the gate defaults correctly;
 * the unit tests proved the pure functions compute correctly; nothing asked what the guard says
 * about the tree we point it at. That question is what this file asks.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  buildSpawnSourceWorktreeArgs,
  SPAWN_SOURCE_BRANCH,
} from '../../../lib/fleet/spawn-control.js';

const require_ = createRequire(import.meta.url);
const { assessTreeCurrency, SELF_HEALABLE_BRANCH } = require_('../../../lib/fleet/tree-currency.cjs');

/**
 * A git double driven by the two facts that vary: what branch the tree reports and how far behind
 * it is. Dirt is held at the spawn-source tree's real steady state — pristine — so no case can be
 * dismissed as "well, it was dirty".
 */
function gitDouble({ branch, behind }) {
  return (args) => {
    const cmd = args.join(' ');
    if (cmd.startsWith('fetch')) return '';
    if (cmd === 'rev-parse --abbrev-ref HEAD') return branch;
    if (cmd === 'status --porcelain') return '';
    if (cmd.startsWith('rev-list --count')) return String(behind);
    throw new Error(`unexpected git command in double: ${cmd}`);
  };
}

const assess = (opts) => assessTreeCurrency({ dir: '/fake/.spawn-source', runner: gitDouble(opts) });

/**
 * The branch the tree will actually report, derived from the argv the shipped builder produces
 * rather than hardcoded. If someone changes the creation shape, this follows them across the seam
 * instead of silently continuing to test a branch name nothing creates any more.
 */
function branchFromCreationArgs() {
  const args = buildSpawnSourceWorktreeArgs('/repo/.spawn-source', 'origin/main');
  const i = args.indexOf('-B');
  return i >= 0 ? args[i + 1] : 'HEAD'; // detached creation would make the tree report 'HEAD'
}

describe('the seam: what the guard says about the tree we actually create', () => {
  it('the tree as CREATED TODAY is accepted when current — the bug this SD shipped, closed', () => {
    const r = assess({ branch: branchFromCreationArgs(), behind: 0 });
    expect(r.current).toBe(true);
    expect(r.reason).toBe('current');
  });

  it('a DETACHED tree would still be refused — which is why the creation must not use --detach', () => {
    // Kept as the negative control. It is not asserting current behaviour of our code; it is
    // asserting the guard property that constrains our creation shape, so if anyone reintroduces
    // --detach the seam test above flips and this one explains why.
    const r = assess({ branch: 'HEAD', behind: 0 });
    expect(r.current).toBe(false);
    expect(r.reason).toBe('detached_head');
    expect(buildSpawnSourceWorktreeArgs('/d', 'origin/main')).not.toContain('--detach');
  });

  it('THE CASE THAT STILL BITES: a dedicated branch behind the base ref is refused and cannot self-heal', () => {
    // This is the entire justification for refreshing on reuse. Self-heal requires the tree be on
    // SELF_HEALABLE_BRANCH, and the spawn source deliberately is not — so if it is ever behind,
    // NOTHING will advance it and it refuses forever. It must therefore be fast-forwarded by
    // ensureSpawnSourceWorktree on every reuse, not left to the guard.
    const r = assess({ branch: SPAWN_SOURCE_BRANCH, behind: 1 });
    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false);
    expect(r.dirty).toBe(false); // the refusal is NOT about dirt
  });

  it('the spawn-source branch is deliberately not the self-healable one, because main is taken', () => {
    expect(SELF_HEALABLE_BRANCH).toBe('main');
    expect(SPAWN_SOURCE_BRANCH).not.toBe(SELF_HEALABLE_BRANCH);
    // Attaching to main is not an option: the shared root already has it checked out and git
    // refuses a second checkout of the same branch. That constraint is what forces the refresh.
  });
});
