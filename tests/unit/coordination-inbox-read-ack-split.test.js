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

  // SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 FR-4: an ADAM session must NOT skip a
  // coordinator_reply — it surfaces UNREAD (read_at left NULL) so adam-advisory.cjs's
  // durable `replies` reader recovers a reply that arrived after a sync await timed out.
  // Workers (non-Adam) are unchanged — their own awaitCoordinatorReply consumes it.
  it('FR-4: ADAM does NOT skip coordinator_reply (surfaces UNREAD for the durable reader); workers still skip', () => {
    const reply = { message_type: 'INFO', payload: { kind: 'coordinator_reply' }, sender_type: 'coordinator' };
    expect(classifyInboxMessage(reply, { twoWayOn: true, amAdam: false })).toEqual({ skip: true });
    expect(classifyInboxMessage(reply, { twoWayOn: true, amAdam: true })).toEqual({ skip: false, markRead: false, markAck: false });
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

  // QF-20260610-623: a NON-INFO coordinator->Adam directive (COACHING is a live type) must NOT be
  // auto-drained by the poll. Before the fix the Adam carve-out was isInfo-gated, so a COACHING
  // directive fell through to the default drain (markRead/markAck:true) and was acked before Adam
  // read it. After the fix it stays UNREAD (read_at NULL) like the INFO case.
  it('QF-623: a COACHING (non-INFO) coordinator->Adam directive stays UNREAD for Adam', () => {
    const coaching = { message_type: 'COACHING', payload: { kind: 'comms_check' }, sender_type: 'coordinator' };
    expect(classifyInboxMessage(coaching, { amAdam: true })).toEqual({ skip: false, markRead: false, markAck: false });
    // orchestrator sender, same protection
    const orchDirective = { message_type: 'COACHING', payload: {}, sender_type: 'orchestrator' };
    expect(classifyInboxMessage(orchDirective, { amAdam: true })).toEqual({ skip: false, markRead: false, markAck: false });
    // a NON-Adam session still drains the same COACHING row on display (byte-identical legacy behavior)
    expect(classifyInboxMessage(coaching, { amAdam: false })).toEqual({ skip: false, markRead: true, markAck: true });
  });

  // QF-20260610-545: residual after QF-623 — the carve-out kept a sender_type ALLOWLIST
  // (orchestrator|coordinator), so sender_type=chairman directives fell through to the default
  // drain and 5 chairman messages were auto-acked unseen (harness-bug 43c2dee2). The fix replaces
  // the allowlist with unconditional surface-not-drain for ALL amAdam non-skip rows.
  it('QF-545: a chairman INFO coordinator_request to Adam stays UNREAD (no sender_type allowlist)', () => {
    const chairmanReq = { message_type: 'INFO', payload: { kind: 'coordinator_request' }, sender_type: 'chairman' };
    expect(classifyInboxMessage(chairmanReq, { amAdam: true })).toEqual({ skip: false, markRead: false, markAck: false });
    // expects_reply variant, same protection
    const expectsReply = { message_type: 'INFO', payload: { expects_reply: true }, sender_type: 'chairman' };
    expect(classifyInboxMessage(expectsReply, { amAdam: true })).toEqual({ skip: false, markRead: false, markAck: false });
  });

  it('QF-545: NO amAdam row ever returns markAck:true from the poll path (exhaustive sweep)', () => {
    const senders = ['chairman', 'coordinator', 'orchestrator', 'worker', 'system', undefined];
    const types = ['INFO', 'COACHING', 'WORK_ASSIGNMENT', 'PRIORITY_CHANGE', 'TASK'];
    const payloads = [{}, { kind: 'coordinator_request' }, { expects_reply: true }, { kind: 'coordinator_reply' }];
    for (const sender_type of senders) {
      for (const message_type of types) {
        for (const payload of payloads) {
          for (const isIdle of [true, false]) {
            for (const twoWayOn of [true, false]) {
              const v = classifyInboxMessage({ message_type, payload, sender_type }, { isIdle, twoWayOn, amAdam: true });
              // skip rows are fine (coordinator-exclusive); any surfaced row must not be stamped
              if (!v.skip) {
                expect(v.markAck, `sender=${sender_type} type=${message_type} payload=${JSON.stringify(payload)}`).toBe(false);
                expect(v.markRead).toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it('QF-545: non-Adam (worker) drain behavior is byte-identical — plain INFO and busy non-actionable still drain', () => {
    expect(classifyInboxMessage({ message_type: 'INFO', payload: {}, sender_type: 'chairman' }, { amAdam: false }))
      .toEqual({ skip: false, markRead: true, markAck: true });
    expect(classifyInboxMessage({ message_type: 'PRIORITY_CHANGE', payload: {}, sender_type: 'chairman' }, { isIdle: false, amAdam: false }))
      .toEqual({ skip: false, markRead: true, markAck: true });
  });
});
