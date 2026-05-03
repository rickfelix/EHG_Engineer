/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-003 / TS-005, TS-006)
 *
 * Verifies the new worktree_incomplete EXTENDED_PATTERNS entry in the
 * worktree-failure-classification policy.
 */

import { describe, it, expect } from 'vitest';
import { classify, EXTENDED_PATTERNS } from '../../../lib/protocol-policies/worktree-failure-classification.js';

describe('SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 — worktree_incomplete classification', () => {
  it('exposes a worktree_incomplete entry in EXTENDED_PATTERNS', () => {
    const entry = EXTENDED_PATTERNS.find((p) => p.code === 'worktree_incomplete');
    expect(entry).toBeDefined();
    expect(entry.severity).toBe('error');
    expect(entry.hint).toMatch(/substrate items are missing/i);
    expect(entry.hint).toMatch(/preserved on disk for inspection/i);
    expect(entry.hint).toMatch(/claim has been released/i);
  });

  // TS-005
  it('classify() with errCode context returns worktree_incomplete', () => {
    const err = new Error('post-creation gate failed');
    err.code = 'WORKTREE_INCOMPLETE';
    const result = classify(err, { errCode: 'WORKTREE_INCOMPLETE' });
    expect(result.code).toBe('worktree_incomplete');
    expect(result.severity).toBe('error');
    expect(result.transient).toBe(false);
    expect(result.hint).toMatch(/substrate items are missing/i);
  });

  // TS-006
  it('classify() matches WORKTREE_INCOMPLETE in message string without context', () => {
    const err = new Error('WORKTREE_INCOMPLETE: substrate items missing after creation: lib, package.json');
    const result = classify(err);
    expect(result.code).toBe('worktree_incomplete');
    expect(result.severity).toBe('error');
  });

  it('classify() also matches the natural-language fragment', () => {
    const result = classify('worktree creation reported success but substrate items missing');
    expect(result.code).toBe('worktree_incomplete');
  });

  it('classify() does NOT match worktree_incomplete on unrelated errors', () => {
    expect(classify('git: command not found').code).not.toBe('worktree_incomplete');
    expect(classify('WORKTREE_BASE_FETCH_FAILED').code).toBe('base_ref_fetch_failed');
    expect(classify('worktree already checked out at').code).toBe('already_checked_out');
  });

  it('preserves message in the classified result', () => {
    const msg = 'WORKTREE_INCOMPLETE: substrate items missing after creation: lib';
    const result = classify(msg);
    expect(result.message).toBe(msg);
  });
});
