/**
 * TS-10 + TS-11 — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * TS-10 exists because the OBVIOUS way to satisfy "give consecutive_refusals a consumer" is to add
 * two strings to its drain-inventory descriptor — and MEASURED, that would flip the gauge from
 * NO_CONSUMER to a NON-FAILING verdict while a live refusal streak is running. Fixing it into
 * silence. The real fix was a runtime alarm (FR-2); this test pins that the descriptor route stays
 * closed, so a future "cleanup" cannot quietly reopen it.
 *
 * IT USES A FIXTURE DESCRIPTOR, NEVER THE REAL REGISTRY. Mutating the shipped descriptor to prove a
 * point would perform the exact harm the test forbids.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

describe('TS-10: the descriptor route to a green gauge stays closed', () => {
  it('BOTH strings, no reader — the outcome is still NOT passing', async () => {
    const { classifyStructural, classifyObserved, VERDICT } =
      await import('../../../lib/governance/drain-inventory.js');

    // A FIXTURE standing in for worktree-reaper-refusals. Same source kind: a git-ignored local
    // artifact that scripts/drain-inventory.mjs has no reader branch for, so the reading is
    // undefined no matter what the descriptor claims.
    const gamed = {
      source: { kind: 'artifact', path: '.claude/worktree-reaper-state.json' },
      predicate: 'consecutive_refusals > 0',
      consumer: 'someone',        // string 1
      closingPath: 'somewhere',   // string 2
    };

    // Structurally it now looks sound — that is the whole point of the gaming vector.
    expect(classifyStructural(gamed)).toBeNull();

    // But with no reader the observation is UNAVAILABLE, which is NOT a passing verdict.
    const verdict = classifyObserved(gamed, undefined);
    expect(verdict).toBe(VERDICT.UNAVAILABLE);
    expect(verdict).not.toBe(VERDICT.PASS);
  });

  it('ONE string alone proves nothing — it only moves between two FAILING verdicts', async () => {
    // Recorded because PLAN TESTING described the vector as "one string", and the measured answer
    // is different in a way that changes the test. A one-string test would assert a transition that
    // is already harmless and would give false confidence that the route is closed.
    const { classifyStructural, isFailing, VERDICT } =
      await import('../../../lib/governance/drain-inventory.js');
    const base = { source: { kind: 'artifact' }, predicate: 'p' };

    expect(classifyStructural(base)).toBe(VERDICT.NO_CONSUMER);
    expect(classifyStructural({ ...base, consumer: 'someone' })).toBe(VERDICT.NO_CLOSING_PATH);
    // Both are failing, so the one-string edit changes the label and nothing else.
    expect(isFailing(VERDICT.NO_CONSUMER)).toBe(true);
    expect(isFailing(VERDICT.NO_CLOSING_PATH)).toBe(true);
  });

  it('the SHIPPED descriptor is untouched — still no consumer, still no closingPath', async () => {
    // The coordinator ratified LEAVING it failing: NO_CONSUMER is the honest verdict while nothing
    // drains the artifact. If a future edit adds either field, this fails and forces the question
    // "did you also add a reader, or did you just silence it?"
    const { DRAIN_DESCRIPTORS } = await import('../../../lib/governance/gauge-registry.js');
    const d = DRAIN_DESCRIPTORS['worktree-reaper-refusals'];
    expect(d).toBeTruthy();
    expect(d.consumer).toBeUndefined();
    expect(d.closingPath).toBeUndefined();
  });
});

describe('TS-11: one representation of the refresh mechanism', () => {
  it('the source-tree refresh is defined ONCE, and spawn-control delegates rather than copying', () => {
    const shared = fs.readFileSync(path.join(ROOT, 'lib', 'fleet', 'source-tree-refresh.cjs'), 'utf8');
    const spawn = fs.readFileSync(path.join(ROOT, 'lib', 'fleet', 'spawn-control.js'), 'utf8');

    // The canonical home builds the ff-only argv...
    expect(shared).toContain("'--ff-only'");
    // ...and the former owner no longer does. Before the delegation there were genuinely TWO copies
    // of this mechanism, which is the duplication this SD family exists to remove (TR-3).
    expect(spawn).not.toContain("'--ff-only'");
    expect(spawn).toContain('source-tree-refresh.cjs');
  });

  it('no THIRD definition of MAX_WORKTREE_COUNT is introduced', () => {
    // MEASURED: exactly two real assignments today — lib/worktree-quota.js:44 (canonical) and
    // scripts/fleet/worktree-reaper-tick.cjs:37 (a manually-synced copy, because the CJS tick
    // cannot require the ESM quota module). TR-3 forbids adding a third; it does not require
    // collapsing the existing two, so this asserts an upper bound rather than an exact count —
    // a future consolidation to one must not fail this test.
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (['node_modules', '.git', 'one-off'].includes(e.name)) continue;
          walk(p);
        } else if (/\.(js|cjs|mjs)$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(ROOT, 'lib'));
    walk(path.join(ROOT, 'scripts'));

    // Match the ASSIGNMENT, not any mention. scripts/one-off/ is skipped above precisely because an
    // evidence file there DISCUSSES the constant in prose — and a source assertion that matches
    // narration instead of code is a defect this SD already committed once.
    const defs = files.filter((f) => /MAX_WORKTREE_COUNT\s*=/.test(fs.readFileSync(f, 'utf8')));
    expect(defs.length).toBeLessThanOrEqual(2);
  });
});
