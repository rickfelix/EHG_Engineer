/**
 * tests/unit/protocol-policies/worktree-failure-classification.test.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-003 acceptance criteria)
 */

import { describe, it, expect } from 'vitest';
import {
  classify,
  EXTENDED_PATTERNS,
} from '../../../lib/protocol-policies/worktree-failure-classification.js';

describe('classify — extended patterns', () => {
  describe('outside_repo', () => {
    it.each([
      'Worktree path rejected (outside repo): /some/path',
      'INVALID_WORKTREE_PATH',
      'event: worktree.db_path_rejected',
    ])('matches "%s"', (msg) => {
      const result = classify(msg);
      expect(result.code).toBe('outside_repo');
      expect(result.severity).toBe('error');
      expect(result.transient).toBe(false);
      expect(result.hint).toMatch(/validateWorktreePath/);
      expect(result.message).toBe(msg);
    });
  });

  describe('false_success', () => {
    it.each([
      'worktree creation success but path not in list',
      'outcome=success but missing from git worktree list',
      'zombie worktree detected',
    ])('matches "%s"', (msg) => {
      const result = classify(msg);
      expect(result.code).toBe('false_success');
      expect(result.severity).toBe('error');
      expect(result.hint).toMatch(/prune/);
    });
  });

  describe('target_changed_after_claim', () => {
    it('matches only when context.targetChanged is true', () => {
      const result = classify('some arbitrary error', { targetChanged: true });
      expect(result.code).toBe('target_changed_after_claim');
      expect(result.severity).toBe('warn');
      expect(result.hint).toMatch(/Reconcile/);
    });

    it('does not match when context.targetChanged is false', () => {
      const result = classify('some arbitrary error', { targetChanged: false });
      expect(result.code).not.toBe('target_changed_after_claim');
    });

    it('does not match when context is absent', () => {
      const result = classify('some arbitrary error');
      expect(result.code).not.toBe('target_changed_after_claim');
    });

    it('extended pattern beats fall-through: outside_repo wins over targetChanged', () => {
      // outside_repo is checked before target_changed_after_claim in EXTENDED_PATTERNS
      // BUT the current order places false_success and outside_repo first for specificity.
      // Verify priority by checking outside_repo wins when both could match.
      const result = classify('INVALID_WORKTREE_PATH', { targetChanged: true });
      expect(result.code).toBe('outside_repo');
    });
  });
});

describe('classify — fall-through to base classifier', () => {
  it('preserves transient hint from base classifier', () => {
    const result = classify('fatal: unable to create .git/index.lock');
    expect(result.code).toBe('transient');
    expect(result.severity).toBe('warn');
    expect(result.transient).toBe(true);
    expect(result.hint).toMatch(/lock contention/i);
  });

  it('maps "already checked out" to stable code', () => {
    const result = classify('fatal: branch foo is already checked out at /path');
    expect(result.code).toBe('already_checked_out');
    expect(result.severity).toBe('error');
    expect(result.transient).toBe(false);
  });

  it('maps "stale worktree" to stable code', () => {
    const result = classify('fatal: /path/to/wt already exists but is not a valid path');
    expect(result.code).toBe('stale_reference');
    expect(result.severity).toBe('error');
    expect(result.hint).toMatch(/prune/i);
  });

  it('maps disk-full to stable code', () => {
    const result = classify('fatal: ENOSPC no space left on device');
    expect(result.code).toBe('disk_full');
    expect(result.severity).toBe('error');
  });

  it('returns unknown for unrecognized errors', () => {
    const result = classify('something unusual happened');
    expect(result.code).toBe('unknown');
    expect(result.severity).toBe('error');
    expect(result.transient).toBe(false);
  });
});

describe('classify — input normalization', () => {
  it('accepts a bare string', () => {
    expect(classify('INVALID_WORKTREE_PATH').code).toBe('outside_repo');
  });

  it('accepts an Error object', () => {
    const err = new Error('INVALID_WORKTREE_PATH');
    expect(classify(err).code).toBe('outside_repo');
  });

  it('accepts an object with .stderr string', () => {
    expect(classify({ stderr: 'INVALID_WORKTREE_PATH' }).code).toBe('outside_repo');
  });

  it('accepts an object with .stderr Buffer-like (toString)', () => {
    const buf = { toString: () => 'INVALID_WORKTREE_PATH' };
    expect(classify({ stderr: buf }).code).toBe('outside_repo');
  });

  it('returns unknown for null / undefined', () => {
    expect(classify(null).code).toBe('unknown');
    expect(classify(undefined).code).toBe('unknown');
    expect(classify(null).message).toBe('');
  });

  it('returns unknown for empty string', () => {
    expect(classify('').code).toBe('unknown');
  });

  it('handles non-string non-object (number)', () => {
    expect(classify(42).code).toBe('unknown');
  });
});

describe('EXTENDED_PATTERNS contract', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(EXTENDED_PATTERNS)).toBe(true);
  });

  it('contains exactly three extended codes', () => {
    const codes = EXTENDED_PATTERNS.map((p) => p.code);
    expect(codes).toEqual(['outside_repo', 'false_success', 'target_changed_after_claim']);
  });

  it('each pattern has the required shape', () => {
    for (const p of EXTENDED_PATTERNS) {
      expect(typeof p.code).toBe('string');
      expect(['warn', 'error']).toContain(p.severity);
      expect(typeof p.test).toBe('function');
      expect(typeof p.hint).toBe('string');
      expect(p.hint.length).toBeGreaterThan(10);
    }
  });
});
