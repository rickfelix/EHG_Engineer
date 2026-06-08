/**
 * Unit tests — SD-LEO-FIX-FIX-COORDINATION-INBOX-001
 * classifyInboxMessage: a poll must NOT stamp read_at on rows still needing action, and
 * coordinator-exclusive / Adam-directed rows must not be drained by a non-coordinator session.
 * Pure function — no DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyInboxMessage } = require('../../scripts/hooks/coordination-inbox.cjs');

describe('classifyInboxMessage', () => {
  it('actionable WORK_ASSIGNMENT to an idle session is surfaced but NOT marked read/ack', () => {
    const v = classifyInboxMessage({ message_type: 'WORK_ASSIGNMENT', payload: {} }, { isIdle: true });
    expect(v).toEqual({ skip: false, markRead: false, markAck: false });
  });

  it('a plain INFO notification is drained on poll (read_at + acknowledged_at) — legacy behavior', () => {
    const v = classifyInboxMessage({ message_type: 'INFO', payload: {}, sender_type: 'orchestrator' }, { isIdle: true, amAdam: false });
    expect(v).toEqual({ skip: false, markRead: true, markAck: true });
  });

  it('FR-3a worker signal (INFO + signal_type) is SKIPPED regardless of coordinator role', () => {
    expect(classifyInboxMessage({ message_type: 'INFO', payload: { signal_type: 'stuck' } }, {})).toEqual({ skip: true });
    // the bug: previously only skipped when amCoordinator — now skipped for everyone
    expect(classifyInboxMessage({ message_type: 'INFO', payload: { signal_type: 'stuck' } }, { amAdam: true })).toEqual({ skip: true });
  });

  it('adam_advisory is SKIPPED for every session (no longer coordinator-gated)', () => {
    expect(classifyInboxMessage({ message_type: 'INFO', payload: { kind: 'adam_advisory' } }, {})).toEqual({ skip: true });
  });

  it('coordinator_reply is skipped only when two-way is on (awaitCoordinatorReply consumes it)', () => {
    const msg = { message_type: 'INFO', payload: { kind: 'coordinator_reply' } };
    expect(classifyInboxMessage(msg, { twoWayOn: false })).not.toEqual({ skip: true });
    expect(classifyInboxMessage(msg, { twoWayOn: true })).toEqual({ skip: true });
  });

  it('an Adam-targeted coordinator INFO directive stays UNREAD (surfaced for the read_at-IS-NULL monitor)', () => {
    const v = classifyInboxMessage(
      { message_type: 'INFO', payload: {}, sender_type: 'coordinator' },
      { amAdam: true }
    );
    expect(v).toEqual({ skip: false, markRead: false, markAck: false });
    // a NON-Adam session draining the same plain INFO is the legacy drain (unchanged)
    const v2 = classifyInboxMessage(
      { message_type: 'INFO', payload: {}, sender_type: 'coordinator' },
      { amAdam: false }
    );
    expect(v2).toEqual({ skip: false, markRead: true, markAck: true });
  });

  it('a non-actionable type to a busy (non-idle) session drains on display', () => {
    const v = classifyInboxMessage({ message_type: 'PRIORITY_CHANGE', payload: {}, sender_type: 'orchestrator' }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: true, markAck: true });
  });
});
