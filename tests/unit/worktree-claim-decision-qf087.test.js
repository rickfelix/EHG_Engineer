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
const { shouldBlockWorktreeEdit, isQuickFixWorktree, deriveWorktreeKey, deriveKeyFromBranch } = require_('../../scripts/hooks/worktree-claim-decision.cjs');

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

// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 US-001: deriveWorktreeKey/deriveKeyFromBranch are
// PURE (no git process, no filesystem, no live worktree required) so the anchored, slug-stopping
// derivation itself is unit-testable independent of the git/DB resolution ENFORCEMENT-4 performs.
describe('SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 US-001: deriveKeyFromBranch is anchored and slug-stopping', () => {
  it('stops before a lowercase slug — never returns lib/worktree-reaper/detectors.js:40\'s unanchored remainder', () => {
    expect(deriveKeyFromBranch('feat/SD-X-001-close-paths')).toBe('SD-X-001');
  });

  it('returns the FULL child key — the -B suffix is uppercase so the anchor does not stop on it', () => {
    // The live specimen from Golf's 18:40Z block: a directory named for a completed QF, reused for
    // this SD child, whose branch is the only reliable signal of what the tree currently holds.
    expect(deriveKeyFromBranch('feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B')).toBe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B');
  });

  it('resolves a QF branch on the QF pattern', () => {
    expect(deriveKeyFromBranch('qf/QF-20260903-188')).toBe('QF-20260903-188');
  });

  it('returns null for a non-key-shaped branch — never a partial capture', () => {
    expect(deriveKeyFromBranch('main')).toBeNull();
    expect(deriveKeyFromBranch('chore/cleanup')).toBeNull();
  });

  it('never throws on null/undefined/non-string input', () => {
    expect(deriveKeyFromBranch(null)).toBeNull();
    expect(deriveKeyFromBranch(undefined)).toBeNull();
    expect(deriveKeyFromBranch(42)).toBeNull();
  });
});

describe('SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 US-001/FR-3: deriveWorktreeKey precedence (branch > marker > path)', () => {
  it('branch wins over the directory-name path when both are present', () => {
    expect(deriveWorktreeKey({ branch: 'feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B', marker: null, pathKey: 'QF-20260903-188' }))
      .toEqual({ key: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B', source: 'branch' });
  });

  it('falls through to the marker when the branch is not key-shaped', () => {
    expect(deriveWorktreeKey({ branch: 'main', marker: 'SD-Z-001', pathKey: 'SD-STALE-001' }))
      .toEqual({ key: 'SD-Z-001', source: 'marker' });
  });

  it('falls through to the path when neither branch nor marker resolve', () => {
    expect(deriveWorktreeKey({ branch: 'main', marker: null, pathKey: 'SD-X-001' }))
      .toEqual({ key: 'SD-X-001', source: 'path' });
  });

  it('returns a total {key:null, source:null} shape rather than throwing when nothing resolves', () => {
    expect(deriveWorktreeKey({ branch: null, marker: null, pathKey: null })).toEqual({ key: null, source: null });
    expect(deriveWorktreeKey()).toEqual({ key: null, source: null });
  });

  it('never throws on malformed inputs (non-string marker/pathKey)', () => {
    expect(() => deriveWorktreeKey({ branch: undefined, marker: 42, pathKey: {} })).not.toThrow();
  });

  // FR-4 specimen (b), proven at the pure-function composition level rather than as a live
  // subprocess test: a genuine cross-claim block requires a real claimedSdKey, and fabricating
  // one means either mutating the live claims DB from a unit test (unsafe/flaky) or spawning
  // against a fleet session that happens to hold a claim (fleet-state-dependent, not
  // deterministic). Composing the two ALREADY-PROVEN pure functions gives the same guarantee:
  // deriveWorktreeKey resolves the branch-derived key exactly as ENFORCEMENT-4 will, and
  // shouldBlockWorktreeEdit's own tri-state test above proves that key, once mismatched
  // against a real claim, blocks. See tests/unit/claim/test-seams-fr9.test.js for specimens
  // (a) and (d), which ARE live-subprocess tests (they need no DB claim, since an unclaimed
  // session's claimedSdKey is null and fails open regardless of the derived key).
  it('composition (specimen b): a true cross-claim still blocks via the DERIVED key, not the raw path', () => {
    const stalePathKey = 'SD-X-001'; // what the directory name says (irrelevant here — both agree)
    const { key: derivedKey, source } = deriveWorktreeKey({ branch: 'feat/SD-X-001', marker: null, pathKey: stalePathKey });
    expect(source).toBe('branch');
    expect(shouldBlockWorktreeEdit({ worktreeKey: derivedKey, claimedSdKey: 'SD-Y-001', qfHeld: false })).toBe(true);
  });
});
