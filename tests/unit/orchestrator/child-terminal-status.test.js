/**
 * QF-20260710-491 — shared terminal-status predicate for orchestrator children.
 */
import { describe, it, expect } from 'vitest';
import { isTerminalChildStatus, TERMINAL_CHILD_STATUSES } from '../../../lib/orchestrator/child-terminal-status.js';

describe('isTerminalChildStatus', () => {
  it('treats completed and cancelled as terminal', () => {
    expect(isTerminalChildStatus('completed')).toBe(true);
    expect(isTerminalChildStatus('cancelled')).toBe(true);
  });

  it('treats draft/active/blocked/in_progress as non-terminal', () => {
    expect(isTerminalChildStatus('draft')).toBe(false);
    expect(isTerminalChildStatus('active')).toBe(false);
    expect(isTerminalChildStatus('blocked')).toBe(false);
    expect(isTerminalChildStatus('in_progress')).toBe(false);
    expect(isTerminalChildStatus(undefined)).toBe(false);
  });

  it('TERMINAL_CHILD_STATUSES matches the plan-to-lead prerequisite-check reference implementation', () => {
    expect(TERMINAL_CHILD_STATUSES).toEqual(['completed', 'cancelled']);
  });
});
