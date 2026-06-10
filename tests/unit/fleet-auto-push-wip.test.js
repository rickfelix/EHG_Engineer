// SD-FDBK-INFRA-AUTO-PUSH-WIP-001 — pure-decision unit tests.
// FR-5a: pre-park durable-WIP decision (lib/fleet/prepark-wip.cjs).
// FR-5d: re-route resume decision (lib/fleet/sdstart-resume.mjs).
// Plus the shared ahead-count parse (lib/fleet/branch-ahead.cjs) so the writer
// (FR-1) and reader (FR-4) cannot drift on the "commits ahead" signal.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { decideResumeFromBranch } from '../../lib/fleet/sdstart-resume.mjs';

const require = createRequire(import.meta.url);
const { decidePrepark, resolveNeedsPush } = require('../../lib/fleet/prepark-wip.cjs');
const { parseAheadCount } = require('../../lib/fleet/branch-ahead.cjs');

describe('FR-5a: decidePrepark (pure pre-park durable-WIP decision)', () => {
  it('dirty + remote => commit_and_push', () => {
    expect(decidePrepark({ dirty: true, aheadCount: 0, branch: 'feat/x', hasRemote: true }).action).toBe('commit_and_push');
  });
  it('clean + ahead>0 + remote => push_only (the literal orphan-commit case)', () => {
    expect(decidePrepark({ dirty: false, aheadCount: 2, branch: 'feat/x', hasRemote: true }).action).toBe('push_only');
  });
  it('dirty + ahead>0 + remote => commit_and_push (new commit + unpushed reach origin in one push)', () => {
    expect(decidePrepark({ dirty: true, aheadCount: 3, branch: 'feat/x', hasRemote: true }).action).toBe('commit_and_push');
  });
  it('clean + not-ahead => noop (zero-cost common park)', () => {
    expect(decidePrepark({ dirty: false, aheadCount: 0, branch: 'feat/x', hasRemote: true }).action).toBe('noop');
  });
  it('dirty + no remote => commit_only (durable locally; reaper protects it)', () => {
    expect(decidePrepark({ dirty: true, aheadCount: 0, branch: 'feat/x', hasRemote: false }).action).toBe('commit_only');
  });
  it('clean + ahead + no remote => noop (already durable locally)', () => {
    expect(decidePrepark({ dirty: false, aheadCount: 1, branch: 'feat/x', hasRemote: false }).action).toBe('noop');
  });
  it('main / master / detached / empty branch => noop (never auto-commit there)', () => {
    for (const branch of ['main', 'master', 'HEAD', '']) {
      expect(decidePrepark({ dirty: true, aheadCount: 5, branch, hasRemote: true }).action).toBe('noop');
    }
  });
});

describe('FR-5a: resolveNeedsPush (two independent triggers)', () => {
  it('dirty alone triggers', () => {
    expect(resolveNeedsPush({ dirty: true, aheadCount: 0 })).toMatchObject({ dirty: true, ahead: false, needsPush: true });
  });
  it('ahead alone triggers', () => {
    expect(resolveNeedsPush({ dirty: false, aheadCount: 4 })).toMatchObject({ dirty: false, ahead: true, needsPush: true });
  });
  it('neither => no push', () => {
    expect(resolveNeedsPush({ dirty: false, aheadCount: 0 }).needsPush).toBe(false);
  });
});

describe('parseAheadCount (shared writer/reader signal)', () => {
  it('parses a normal count', () => { expect(parseAheadCount('3\n')).toBe(3); });
  it('empty / null / junk => 0 (fail-closed, never fabricates work)', () => {
    expect(parseAheadCount('')).toBe(0);
    expect(parseAheadCount(null)).toBe(0);
    expect(parseAheadCount('not-a-number')).toBe(0);
    expect(parseAheadCount('-2')).toBe(0);
  });
});

describe('FR-5d: decideResumeFromBranch (re-route resume)', () => {
  it('ahead of main, remote strictly ahead, no local-unique => resume + fast-forward', () => {
    const d = decideResumeFromBranch({ aheadOfMain: 3, branch: 'feat/x', remoteAhead: 2, localAhead: 0 });
    expect(d.resume).toBe(true);
    expect(d.fastForward).toBe(true);
    expect(d.diverged).toBe(false);
    expect(d.notice).toMatch(/3 commits ahead of origin\/main/);
    expect(d.notice).toMatch(/fast-forwarding/);
  });
  it('ahead of main but divergent (both sides unique) => resume, NO fast-forward, warns', () => {
    const d = decideResumeFromBranch({ aheadOfMain: 5, branch: 'feat/x', remoteAhead: 2, localAhead: 1 });
    expect(d.resume).toBe(true);
    expect(d.fastForward).toBe(false);
    expect(d.diverged).toBe(true);
    expect(d.notice).toMatch(/diverged/i);
  });
  it('ahead of main, nothing on remote => resume + notice only (local already has the work)', () => {
    const d = decideResumeFromBranch({ aheadOfMain: 1, branch: 'feat/x', remoteAhead: 0, localAhead: 0 });
    expect(d.resume).toBe(true);
    expect(d.fastForward).toBe(false);
    expect(d.notice).toMatch(/1 commit ahead/);
  });
  it('not ahead of main => no resume, no notice (normal fresh start, zero change)', () => {
    const d = decideResumeFromBranch({ aheadOfMain: 0, branch: 'feat/x', remoteAhead: 0, localAhead: 0 });
    expect(d.resume).toBe(false);
    expect(d.notice).toBeNull();
  });
  it('protected branch => no resume even if ahead', () => {
    for (const branch of ['main', 'master', '']) {
      expect(decideResumeFromBranch({ aheadOfMain: 9, branch, remoteAhead: 1, localAhead: 0 }).resume).toBe(false);
    }
  });
});
