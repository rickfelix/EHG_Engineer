/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-1b — the composition.
 *
 * The load-bearing pair is the first two tests: unresolvable+resident must BLOCK, and
 * unresolvable+cleared must REMOVE. Only the first would pass against the shipped FR-1
 * (which vetoes unconditionally); only the second would pass against the original
 * fail-open. A change that satisfies one and not the other is one of the two defects
 * this FR sits between.
 */
import { describe, test, expect } from 'vitest';
import {
  decideRemoval,
  WORK_KEY_UNRESOLVABLE,
  UNRESOLVABLE_KEY_RESIDENCY_CLEARED,
} from '../../../lib/worktree-reaper/removal-decision.js';

const clear = { blocked: false, reason: null };
const unresolvable = { blocked: true, reason: WORK_KEY_UNRESOLVABLE };
const resident = { blocked: true, reason: 'REAP_BLOCKED_TREE_RESIDENT' };

describe('decideRemoval — the demand semantics', () => {
  test('unresolvable key + RESIDENT => blocked (the ceremony trees survive)', () => {
    const d = decideRemoval({ claimGuard: unresolvable, treeResidency: resident, heartbeatResidency: clear });
    expect(d.remove).toBe(false);
    expect(d.source).toBe('tree_residency');
  });

  test('unresolvable key + residency CLEARED => removed (the pool still drains)', () => {
    // Against the shipped FR-1 this is false — an unresolvable basename would never be
    // reaped again, which is permanent pool backlog rather than a fix.
    const d = decideRemoval({ claimGuard: unresolvable, treeResidency: clear, heartbeatResidency: clear });
    expect(d.remove).toBe(true);
    expect(d.reason).toBe(UNRESOLVABLE_KEY_RESIDENCY_CLEARED);
  });

  test('unresolvable key + heartbeat residency blocking also blocks', () => {
    const hb = { blocked: true, reason: 'REAP_BLOCKED_RESIDENT' };
    const d = decideRemoval({ claimGuard: unresolvable, treeResidency: clear, heartbeatResidency: hb });
    expect(d.remove).toBe(false);
    expect(d.source).toBe('heartbeat_residency');
  });
});

describe('decideRemoval — the demand does NOT leak to other reasons', () => {
  // If it leaked, a real claim or a DB outage would become overridable by an idle tree —
  // which would be a far worse fail-open than the one FR-1 closed.
  test.each([
    'live_claimed',
    'unverifiable_no_supabase',
    'unverifiable_claim_lookup_error',
    'unverifiable_session_lookup_error',
    'unverifiable_session_scan_error',
    'unverifiable_guard_exception',
    'claimed_claimant_not_verifiably_alive',
    'live_session_pointing',
  ])('%s stays an ABSOLUTE veto even with residency fully cleared', (reason) => {
    const d = decideRemoval({
      claimGuard: { blocked: true, reason },
      treeResidency: clear,
      heartbeatResidency: clear,
    });
    expect(d.remove).toBe(false);
    expect(d.reason).toBe(reason);
    expect(d.source).toBe('claim');
  });
});

describe('decideRemoval — the ordinary paths are unchanged', () => {
  test('all clear => removed', () => {
    expect(decideRemoval({ claimGuard: clear, treeResidency: clear, heartbeatResidency: clear }))
      .toEqual({ remove: true, reason: null, source: null });
  });

  test('claim clear but resident => blocked (residency was always a veto and stays one)', () => {
    const d = decideRemoval({ claimGuard: clear, treeResidency: resident, heartbeatResidency: clear });
    expect(d.remove).toBe(false);
    expect(d.source).toBe('tree_residency');
  });

  test('a verified no_live_claim clear is not confused with an unresolvable key', () => {
    const d = decideRemoval({
      claimGuard: { blocked: false, reason: 'no_live_claim' },
      treeResidency: clear,
      heartbeatResidency: clear,
    });
    expect(d.remove).toBe(true);
    expect(d.reason).toBeNull(); // NOT the unresolvable-key reason
  });
});

describe('decideRemoval — a forgotten guard refuses rather than deletes', () => {
  test.each(['claimGuard', 'treeResidency', 'heartbeatResidency'])('omitting %s fails CLOSED', (missing) => {
    const input = { claimGuard: clear, treeResidency: clear, heartbeatResidency: clear };
    delete input[missing];
    const d = decideRemoval(input);
    expect(d.remove).toBe(false);
    expect(d.reason).toMatch(/^guard_result_missing:/);
  });

  test('a malformed guard result (no boolean blocked) also fails closed', () => {
    const d = decideRemoval({
      claimGuard: { reason: 'looks plausible but has no verdict' },
      treeResidency: clear,
      heartbeatResidency: clear,
    });
    expect(d.remove).toBe(false);
    expect(d.reason).toBe('guard_result_missing:claim');
  });

  test('called with no arguments at all, it refuses', () => {
    expect(decideRemoval().remove).toBe(false);
  });
});
