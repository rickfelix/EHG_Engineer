/**
 * SD-FDBK-FIX-WORKTREE-REAPER-LIVE-001 — regression pins for the
 * "reaper ate live worktree" class (3rd recurrence, 2026-06-12 pid 12704).
 * Pure-unit: exercises keyFromWorktree + decideShippedStaleAction only.
 */
import { describe, it, expect } from 'vitest';
import { keyFromWorktree, decideShippedStaleAction } from '../../scripts/worktree-reaper.mjs';

const shippedNoPr = { matched: true, evidence: { merged_pr_count: 0 } };
const shippedWithPr = { matched: true, evidence: { merged_pr_count: 2 } };

function ctxWith(over = {}) {
  return {
    claimedKeySet: new Set(),
    sdMap: new Set(),
    terminalSdSet: new Set(),
    qfMap: new Set(),
    terminalQfSet: new Set(),
    activeSdSet: new Set(),
    activeQfSet: new Set(),
    ...over,
  };
}

describe('keyFromWorktree (path-shape-agnostic key resolution)', () => {
  it('resolves the SD key from the branch for custom-path worktrees (Bravo incident shape)', () => {
    expect(keyFromWorktree({ path: 'C:/x/wt-writer-consumer', branch: 'feat/SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001' }))
      .toBe('SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001');
  });

  it('resolves QF keys from qf/ branches', () => {
    expect(keyFromWorktree({ path: '/tmp/anything', branch: 'qf/QF-20260612-416' })).toBe('QF-20260612-416');
  });

  it('falls back to path basename when no branch (never less protected than before)', () => {
    expect(keyFromWorktree({ path: 'C:/r/.worktrees/SD-FOO-001' })).toBe('SD-FOO-001');
  });
});

describe('decideShippedStaleAction (stage1 authority)', () => {
  it('Alpha incident shape: pending_approval SD (non-terminal, not in the old active allowlist) is protected', () => {
    // pending_approval SDs are in sdMap but in NEITHER activeSdSet (old
    // draft/active/in_progress allowlist) NOR terminalSdSet.
    const ctx = ctxWith({ sdMap: new Set(['SD-UAT-FIX-TEST-E2E-1781186358703-001']) });
    const wt = { path: 'C:/r/.worktrees/SD-UAT-FIX-TEST-E2E-1781186358703-001', branch: 'feat/SD-UAT-FIX-TEST-E2E-1781186358703-001' };
    const a = decideShippedStaleAction(wt, shippedWithPr, ctx);
    expect(a.protect).toBe(true);
    expect(a.reason).toBe('non-terminal-status');
  });

  it('Bravo incident shape: custom-path worktree, SD claim-held via claiming_session_id, is protected', () => {
    const ctx = ctxWith({ claimedKeySet: new Set(['SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001']) });
    const wt = { path: 'C:/x/wt-writer-consumer', branch: 'feat/SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001' };
    const a = decideShippedStaleAction(wt, shippedNoPr, ctx);
    expect(a.protect).toBe(true);
    expect(a.reason).toBe('claim-held');
  });

  it('absorbed_no_pr alone is ADVISORY, never stage1 (unknown key, no protection)', () => {
    const wt = { path: 'C:/r/.worktrees/SD-GONE-001', branch: 'feat/SD-GONE-001' };
    const a = decideShippedStaleAction(wt, shippedNoPr, ctxWith());
    expect(a.protect).toBe(false);
    expect(a.advisory).toBe(true);
  });

  it('terminal SD with merged-PR-backed equivalence still reaps (no over-protection)', () => {
    const ctx = ctxWith({ sdMap: new Set(['SD-DONE-001']), terminalSdSet: new Set(['SD-DONE-001']) });
    const wt = { path: 'C:/r/.worktrees/SD-DONE-001', branch: 'feat/SD-DONE-001' };
    const a = decideShippedStaleAction(wt, shippedWithPr, ctx);
    expect(a.protect).toBe(false);
    expect(a.advisory).toBe(false);
    expect(a.reason).toBe('merged-pr-backed');
  });

  it('non-terminal QF worktree is protected via qfMap/terminalQfSet', () => {
    const ctx = ctxWith({ qfMap: new Set(['QF-20260612-999']) });
    const wt = { path: 'C:/r/.worktrees/qf/QF-20260612-999', branch: 'qf/QF-20260612-999' };
    expect(decideShippedStaleAction(wt, shippedWithPr, ctx).protect).toBe(true);
  });

  // SD-REFILL-00RMNAS7: a TERMINAL-status SD under SQUASH merge (absorbed_no_pr, merged_pr_count=0)
  // is now an AUTHORITATIVE stage1 reclaim (DB status overrides the unreliable cherry heuristic),
  // instead of being kept advisory-only and accumulating toward the DUTY-1 pool stall.
  it('terminal SD with absorbed_no_pr (squash merge) is now stage1, NOT advisory', () => {
    const ctx = ctxWith({ sdMap: new Set(['SD-DONE-001']), terminalSdSet: new Set(['SD-DONE-001']) });
    const wt = { path: 'C:/r/.worktrees/SD-DONE-001', branch: 'feat/SD-DONE-001' };
    const a = decideShippedStaleAction(wt, shippedNoPr, ctx);
    expect(a.protect).toBe(false);
    expect(a.advisory).toBe(false);
    expect(a.reason).toMatch(/terminal-status authoritative/);
  });

  it('terminal QF with absorbed_no_pr (squash merge) is also stage1', () => {
    const ctx = ctxWith({ qfMap: new Set(['QF-20260612-777']), terminalQfSet: new Set(['QF-20260612-777']) });
    const wt = { path: 'C:/r/.worktrees/qf/QF-20260612-777', branch: 'qf/QF-20260612-777' };
    const a = decideShippedStaleAction(wt, shippedNoPr, ctx);
    expect(a.protect).toBe(false);
    expect(a.advisory).toBe(false);
    expect(a.reason).toMatch(/terminal-status authoritative/);
  });

  it('SAFETY: a claim-held terminal SD is STILL protected (claim guard wins over terminal reclaim)', () => {
    const ctx = ctxWith({
      claimedKeySet: new Set(['SD-DONE-002']),
      sdMap: new Set(['SD-DONE-002']),
      terminalSdSet: new Set(['SD-DONE-002']),
    });
    const wt = { path: 'C:/r/.worktrees/SD-DONE-002', branch: 'feat/SD-DONE-002' };
    const a = decideShippedStaleAction(wt, shippedNoPr, ctx);
    expect(a.protect).toBe(true);
    expect(a.reason).toBe('claim-held');
  });
});
