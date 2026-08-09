/**
 * QF-20260804-087 — the worktree claim guard queried strategic_directives_v2 ONLY, so a QF claim
 * (which lives in quick_fixes) was invisible to it. A worker holding ANY SD claim was blocked from
 * its own assigned QF worktree with NO action available to it.
 *
 * These are BEHAVIOURAL tests against the extracted predicate, deliberately not the source-pin
 * style used elsewhere for this hook (pre-tool-enforce-column-scope.test.js): a pin passes whether
 * or not the decision is right, and the defect here was a wrong decision, not a missing string.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { shouldBlockWorktreeEdit, isQuickFixWorktree } = require_('../../scripts/hooks/worktree-claim-decision.cjs');

const QF = 'QF-20260804-048';
const MY_SD = 'SD-MINE-001';
const OTHER_SD = 'SD-THEIRS-002';

describe('QF-20260804-087: the guard can finally see a QF claim', () => {
  // THE REPORTED DEFECT, verbatim: assigned a QF, also holding an SD claim, blocked with no remedy.
  it('permits editing my OWN QF worktree while I also hold an unrelated SD claim', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: QF, claimedSdKey: MY_SD, qfHeld: true })).toBe(false);
  });

  // The other half of the QF's stated acceptance: the SD invariant must survive the fix.
  it('still blocks a FOREIGN SD worktree for that same session — no wholesale weakening', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: OTHER_SD, claimedSdKey: MY_SD, qfHeld: false })).toBe(true);
  });

  it('still blocks a QF worktree I do NOT hold — this is not a blanket QF exemption', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: QF, claimedSdKey: MY_SD, qfHeld: false })).toBe(true);
  });

  // The tri-state is the whole point: null must not collapse into false.
  it('permits on an UNREADABLE QF lookup (null) — a transient blip must not rebuild the bug', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: QF, claimedSdKey: MY_SD, qfHeld: null })).toBe(false);
  });

  it('a null qfHeld is NOT equivalent to false — the two answers must diverge', () => {
    const onNull = shouldBlockWorktreeEdit({ worktreeKey: QF, claimedSdKey: MY_SD, qfHeld: null });
    const onFalse = shouldBlockWorktreeEdit({ worktreeKey: QF, claimedSdKey: MY_SD, qfHeld: false });
    expect(onNull).not.toBe(onFalse);
  });
});

describe('QF-20260804-087: pre-existing SD-vs-SD behaviour is byte-for-byte preserved', () => {
  it('permits my own SD worktree', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: MY_SD, claimedSdKey: MY_SD, qfHeld: false })).toBe(false);
  });

  it('fails OPEN when this session holds no claim at all (null claimedSdKey)', () => {
    expect(shouldBlockWorktreeEdit({ worktreeKey: OTHER_SD, claimedSdKey: null, qfHeld: false })).toBe(false);
  });
});

describe('QF-20260804-087: QF worktree detection', () => {
  it('recognises a QF id and does not mistake an SD key for one', () => {
    expect(isQuickFixWorktree(QF)).toBe(true);
    expect(isQuickFixWorktree(MY_SD)).toBe(false);
  });

  it('survives absent/garbage segments without throwing', () => {
    expect(isQuickFixWorktree(null)).toBe(false);
    expect(isQuickFixWorktree(undefined)).toBe(false);
    expect(isQuickFixWorktree('')).toBe(false);
  });
});
