/**
 * QF-20260903-936 — releasing a claim leaks the worktree.
 *
 * lib/fleet/record-orphaned-worktree.mjs is the shared chokepoint both
 * lib/claim/release-claim-both-surfaces.mjs and lib/fleet/best-effort-release.mjs route
 * through so a released claim's provisioned worktree is RECORDED (never removed inline --
 * see the module's own doc comment for why) instead of silently leaking with nothing in the
 * DB pointing back at it.
 *
 * record-orphaned-worktree.mjs loads sweep-findings-sink.cjs via createRequire, which
 * bypasses vi.mock's ESM interception -- so this test monkeypatches the SAME cached CJS
 * module.exports object the production code requires (Node's require cache guarantees both
 * requires resolve to the identical object), rather than mocking the import graph.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sink = require('../../../lib/fleet/sweep-findings-sink.cjs');
const originalRecordFinding = sink.recordFinding;

const { recordOrphanedWorktree } = await import('../../../lib/fleet/record-orphaned-worktree.mjs');

describe('recordOrphanedWorktree (QF-20260903-936)', () => {
  let recordFindingMock;

  beforeEach(() => {
    recordFindingMock = vi.fn().mockResolvedValue({ ok: true });
    sink.recordFinding = recordFindingMock;
  });

  // vitest auto-cleans vi.mock()/vi.fn() between files, not this manual CJS-object
  // monkeypatch (see file doc comment) -- restore explicitly.
  afterEach(() => { sink.recordFinding = originalRecordFinding; });

  it('is a no-op when no worktree was provisioned', () => {
    recordOrphanedWorktree({}, { sdKey: 'SD-X', holder: 'H1', worktreePath: null, worktreeBranch: null, reason: 'manual' });
    expect(recordFindingMock).not.toHaveBeenCalled();
  });

  it('records a low-severity finding keyed on the worktree path when one was provisioned', () => {
    const sb = {};
    recordOrphanedWorktree(sb, {
      sdKey: 'SD-X', holder: 'H1',
      worktreePath: '.worktrees/SD-X', worktreeBranch: 'feat/SD-X', reason: 'manual',
    });
    expect(recordFindingMock).toHaveBeenCalledTimes(1);
    const [passedSb, finding] = recordFindingMock.mock.calls[0];
    expect(passedSb).toBe(sb);
    expect(finding.findingClass).toBe('released_claim_worktree_orphan');
    expect(finding.subject).toBe('.worktrees/SD-X'); // dedup key IS the path
    expect(finding.severity).toBe('low');
    expect(finding.summary).toContain('SD-X');
    expect(finding.summary).toContain('.worktrees/SD-X');
    expect(finding.summary).toContain('feat/SD-X');
  });

  it('never throws even if recordFinding rejects (fail-soft, never blocks the caller)', async () => {
    recordFindingMock.mockRejectedValueOnce(new Error('boom'));
    expect(() => recordOrphanedWorktree({}, {
      sdKey: 'SD-X', holder: 'H1', worktreePath: '.worktrees/SD-X', worktreeBranch: 'feat/SD-X', reason: 'manual',
    })).not.toThrow();
    // let the rejected promise's .catch() settle before the test ends
    await new Promise((r) => setTimeout(r, 0));
  });
});
