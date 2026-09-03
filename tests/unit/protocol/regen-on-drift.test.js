// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-1/FR-2/FR-3).
//
// Regeneration of the rendered CLAUDE_*.md contracts was 100% manual, so a write to
// leo_protocol_sections could sit unrendered while every seat read a stale contract as current.
//
// THE SD'S OWN FR-1 WORDING WAS CORRECTED BEFORE BUILDING. It asked for "a write ... causes the
// rendered contracts to be regenerated". Measured: 25+ files write that table, almost all ad-hoc
// scripts/one-off/*.mjs, with no canonical writer to wrap and new ones appearing continuously. A
// write-path hook would have covered a minority of writes while READING as if it covered all of
// them. The drift check sees the RESULT of any write regardless of author, so remediation is
// attached to the detector instead. Detecting the consequence is complete where hooking the cause
// cannot be.
//
// Every side effect is injected, so these run without git, network or a database.

import { describe, it, expect } from 'vitest';
import { regenerateOnDrift, REGEN_OUTCOME } from '../../../lib/protocol/regen-on-drift.js';

const silent = { warn: () => {}, log: () => {} };

/** A worktree that records whether it was released. */
function fakeWorktree() {
  const state = { acquired: 0, released: 0, path: '/tmp/.worktrees/regen' };
  return {
    state,
    acquire: async () => {
      state.acquired += 1;
      return { path: state.path, release: async () => { state.released += 1; } };
    },
  };
}

const deps = (over = {}) => {
  const wt = over._wt || fakeWorktree();
  return {
    driftProbe: async () => ({ drift: true, staleFiles: ['CLAUDE_CORE.md'] }),
    acquireWorktree: wt.acquire,
    runGenerator: async () => ({ changedFiles: ['CLAUDE_CORE.md'] }),
    verifyInWorktree: async () => ({ drift: false }),
    openPullRequest: async () => ({ url: 'https://example/pr/1' }),
    isSharedRoot: () => false,
    logger: silent,
    ...over,
    _wt: wt,
  };
};

describe('regenerateOnDrift — the happy path', () => {
  it('regenerates and opens a PR when drift is detected', async () => {
    const d = deps();
    const r = await regenerateOnDrift(d);
    expect(r.outcome).toBe(REGEN_OUTCOME.REGENERATED);
    expect(r.detail.pr).toBe('https://example/pr/1');
    expect(r.detail.changedFiles).toEqual(['CLAUDE_CORE.md']);
  });

  it('verifies zero drift IN THE WORKTREE before opening the PR (FR-3 second invocation site)', async () => {
    const seen = [];
    const d = deps({ verifyInWorktree: async (p) => { seen.push(p); return { drift: false }; } });
    await regenerateOnDrift(d);
    // Checking the root instead of the worktree would report on files this run never touched.
    expect(seen).toEqual(['/tmp/.worktrees/regen']);
  });
});

describe('regenerateOnDrift — refuses the shared root, before anything else', () => {
  it('refuses when it would operate on the shared checkout', async () => {
    const r = await regenerateOnDrift(deps({ isSharedRoot: () => true }));
    expect(r.outcome).toBe(REGEN_OUTCOME.REFUSED_SHARED_ROOT);
  });

  it('refuses WITHOUT even reading drift or taking a worktree', async () => {
    // The shared-root condition is unsafe regardless of whether there is drift to fix, so the
    // most dangerous check runs first and costs nothing.
    let probed = 0;
    const wt = fakeWorktree();
    await regenerateOnDrift(deps({ _wt: wt, isSharedRoot: () => true, driftProbe: async () => { probed += 1; return { drift: true }; } }));
    expect(probed).toBe(0);
    expect(wt.state.acquired).toBe(0);
  });
});

describe('regenerateOnDrift — a quiet tree costs nothing', () => {
  it('takes no worktree and opens no PR when there is no drift', async () => {
    const wt = fakeWorktree();
    let prs = 0;
    const r = await regenerateOnDrift(deps({
      _wt: wt,
      driftProbe: async () => ({ drift: false }),
      openPullRequest: async () => { prs += 1; return { url: 'x' }; },
    }));
    expect(r.outcome).toBe(REGEN_OUTCOME.CLEAN);
    expect(wt.state.acquired).toBe(0);
    expect(prs).toBe(0);
  });

  it('opens NO PR when the generator produces no byte change — a detector must not become a churn generator', async () => {
    // The generator is skip-on-unchanged for the files AND the manifest, so drift that resolves
    // to nothing must not create a PR on every invocation.
    let prs = 0;
    const r = await regenerateOnDrift(deps({
      runGenerator: async () => ({ changedFiles: [] }),
      openPullRequest: async () => { prs += 1; return { url: 'x' }; },
    }));
    expect(r.outcome).toBe(REGEN_OUTCOME.NO_CHANGE);
    expect(prs).toBe(0);
  });
});

describe('regenerateOnDrift — refuses to ship a non-convergent regen', () => {
  it('opens no PR when drift PERSISTS after regenerating', async () => {
    // Shipping here would claim to fix drift while leaving it in place.
    let prs = 0;
    const r = await regenerateOnDrift(deps({
      verifyInWorktree: async () => ({ drift: true, staleFiles: ['CLAUDE_CORE.md'] }),
      openPullRequest: async () => { prs += 1; return { url: 'x' }; },
    }));
    expect(r.outcome).toBe(REGEN_OUTCOME.REFUSED_STILL_DRIFTED);
    expect(r.detail.staleFiles).toEqual(['CLAUDE_CORE.md']);
    expect(prs).toBe(0);
  });
});

describe('regenerateOnDrift — does not regenerate blind when the detector is down', () => {
  it('reports probe_unavailable rather than regenerating', async () => {
    // Regenerating without knowing whether anything drifted could open an empty PR every run.
    let generated = 0;
    const r = await regenerateOnDrift(deps({
      driftProbe: async () => { throw new Error('supabase unreachable'); },
      runGenerator: async () => { generated += 1; return { changedFiles: [] }; },
    }));
    expect(r.outcome).toBe(REGEN_OUTCOME.PROBE_UNAVAILABLE);
    expect(generated).toBe(0);
  });
});

describe('regenerateOnDrift — worktree discipline (the binding constraint)', () => {
  it('takes at most ONE worktree', async () => {
    const wt = fakeWorktree();
    await regenerateOnDrift(deps({ _wt: wt }));
    expect(wt.state.acquired).toBe(1);
  });

  it('RELEASES the worktree on the happy path', async () => {
    const wt = fakeWorktree();
    await regenerateOnDrift(deps({ _wt: wt }));
    expect(wt.state.released).toBe(1);
  });

  it('RELEASES the worktree even when the generator throws', async () => {
    // The pool cap is what makes this design safe at all; a leaked worktree degrades every other
    // seat, not just this trigger. Observed saturated at 40/40 for a full session.
    const wt = fakeWorktree();
    await expect(regenerateOnDrift(deps({ _wt: wt, runGenerator: async () => { throw new Error('generator boom'); } })))
      .rejects.toThrow(/generator boom/);
    expect(wt.state.released).toBe(1);
  });

  it('RELEASES the worktree when the PR step throws', async () => {
    const wt = fakeWorktree();
    await expect(regenerateOnDrift(deps({ _wt: wt, openPullRequest: async () => { throw new Error('gh down'); } })))
      .rejects.toThrow(/gh down/);
    expect(wt.state.released).toBe(1);
  });

  it('RELEASES the worktree on the still-drifted refusal path', async () => {
    const wt = fakeWorktree();
    await regenerateOnDrift(deps({ _wt: wt, verifyInWorktree: async () => ({ drift: true }) }));
    expect(wt.state.released).toBe(1);
  });

  it('does not throw when release itself fails — a release failure must not mask the outcome', async () => {
    const r = await regenerateOnDrift(deps({
      acquireWorktree: async () => ({ path: '/tmp/wt', release: async () => { throw new Error('rm failed'); } }),
    }));
    expect(r.outcome).toBe(REGEN_OUTCOME.REGENERATED);
  });
});
