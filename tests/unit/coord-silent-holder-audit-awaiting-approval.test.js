/**
 * QF-20260901-987 — permission-prompt-blocked worker reads as alive-idle on every instrument.
 * isAwaitingApprovalStale() and isLoopDead() give the silent-holder audit two new hard-alert
 * axes so a worker stuck at an unanswered permission dialog, or one whose /loop wakeup-arm
 * chain died silently, is no longer indistinguishable from a healthy idle seat.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isAwaitingApprovalStale, isLoopDead } = require('../../scripts/one-off/_coord-silent-holder-audit.cjs');

const NOW = Date.parse('2026-09-01T12:00:00Z');

describe('isAwaitingApprovalStale() (QF-20260901-987)', () => {
  it('fires when awaiting_approval_since is stale (>10min) — the fixture the QF itself specifies', () => {
    const session = { metadata: { awaiting_approval_since: new Date(NOW - 15 * 60000).toISOString() } };
    expect(isAwaitingApprovalStale(session, NOW)).toBe(true);
  });

  it('does NOT fire without awaiting_approval_since set, even with a fresh heartbeat', () => {
    const session = { metadata: {}, heartbeat_at: new Date(NOW).toISOString() };
    expect(isAwaitingApprovalStale(session, NOW)).toBe(false);
  });

  it('does NOT fire when the stamp is fresh (a normal in-flight tool call)', () => {
    const session = { metadata: { awaiting_approval_since: new Date(NOW - 5000).toISOString() } };
    expect(isAwaitingApprovalStale(session, NOW)).toBe(false);
  });

  it('fails safe on missing metadata / malformed timestamp', () => {
    expect(isAwaitingApprovalStale({}, NOW)).toBe(false);
    expect(isAwaitingApprovalStale({ metadata: { awaiting_approval_since: 'not-a-date' } }, NOW)).toBe(false);
    expect(isAwaitingApprovalStale(undefined, NOW)).toBe(false);
  });
});

describe('isLoopDead() (QF-20260901-987)', () => {
  it('fires when loop_state is stuck non-terminal, heartbeat fresh, last_tool_at stale', () => {
    const session = {
      loop_state: 'active',
      heartbeat_at: new Date(NOW - 60000).toISOString(),
      last_tool_at: new Date(NOW - 20 * 60000).toISOString(),
    };
    expect(isLoopDead(session, NOW)).toBe(true);
  });

  it('does NOT fire when loop_state=awaiting_tick (a wakeup IS armed)', () => {
    const session = {
      loop_state: 'awaiting_tick',
      heartbeat_at: new Date(NOW - 60000).toISOString(),
      last_tool_at: new Date(NOW - 20 * 60000).toISOString(),
    };
    expect(isLoopDead(session, NOW)).toBe(false);
  });

  it('does NOT fire when loop_state=exited (a deliberate, correct stop)', () => {
    const session = {
      loop_state: 'exited',
      heartbeat_at: new Date(NOW - 60000).toISOString(),
      last_tool_at: new Date(NOW - 20 * 60000).toISOString(),
    };
    expect(isLoopDead(session, NOW)).toBe(false);
  });

  it('does NOT fire when last_tool_at is recent (an actively working seat)', () => {
    const session = {
      loop_state: 'active',
      heartbeat_at: new Date(NOW - 60000).toISOString(),
      last_tool_at: new Date(NOW - 60000).toISOString(),
    };
    expect(isLoopDead(session, NOW)).toBe(false);
  });

  it('does NOT fire when the heartbeat itself is stale (a different, already-covered failure mode)', () => {
    const session = {
      loop_state: 'active',
      heartbeat_at: new Date(NOW - 20 * 60000).toISOString(),
      last_tool_at: new Date(NOW - 20 * 60000).toISOString(),
    };
    expect(isLoopDead(session, NOW)).toBe(false);
  });

  it('fails safe on missing fields', () => {
    expect(isLoopDead({}, NOW)).toBe(false);
    expect(isLoopDead(undefined, NOW)).toBe(false);
  });
});
