/**
 * QF-20260905-761: the stale-session sweep's STUCK_SIGNAL_DRAIN used to auto-ack (stamp
 * acknowledged_at) any live-sender, routine-severity STUCK signal older than 1h, with no
 * check for whether the coordinator had actually replied. Measured live on row c4312703
 * (Bravo, signal_type stuck, 17:58Z): auto_acked=true / auto_ack_reason='aged_out' was
 * stamped with NO coordinator reply row for its correlation_id, and the coordinator inbox
 * (gated on acknowledged_at IS NULL) went blind to a still-open escalation.
 *
 * splitAgeEligibleStuckSignals is the extracted, pure decision core of that fix: given the
 * age-eligible candidates and a pool of reply-shaped rows, it must put a row with NO
 * correlated reply into `unreplied` (never silently drained) and a row WITH one into
 * `replied` (safe to age-drain as before).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { splitAgeEligibleStuckSignals } = require_('../../../scripts/stale-session-sweep.cjs');

// The measured c4312703 shape: a live sender (Bravo), routine severity, aged past 1h, no reply.
const c4312703Shape = {
  id: 'c4312703-0000-4000-8000-000000000000',
  sender_session: 'sess-bravo',
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  payload: { signal_type: 'stuck', severity: 'medium', sender_callsign: 'Bravo' },
};

describe('QF-20260905-761: splitAgeEligibleStuckSignals', () => {
  it('a row with NO correlated reply (the measured c4312703 shape) lands in unreplied, never replied', () => {
    const { replied, unreplied } = splitAgeEligibleStuckSignals([c4312703Shape], []);
    expect(unreplied.map((r) => r.id)).toEqual([c4312703Shape.id]);
    expect(replied).toEqual([]);
  });

  it('a row WITH a correlated reply (payload.reply_to matches) lands in replied, never unreplied', () => {
    const reply = { id: 'reply-1', payload: { reply_to: c4312703Shape.id, kind: 'coordinator_reply' } };
    const { replied, unreplied } = splitAgeEligibleStuckSignals([c4312703Shape], [reply]);
    expect(replied.map((r) => r.id)).toEqual([c4312703Shape.id]);
    expect(unreplied).toEqual([]);
  });

  it('a row WITH a correlated reply via matching correlation_id (not reply_to) also lands in replied', () => {
    const withCorrelation = { ...c4312703Shape, id: 'sig-corr-1', payload: { ...c4312703Shape.payload, correlation_id: 'corr-abc' } };
    const reply = { id: 'reply-2', payload: { correlation_id: 'corr-abc', kind: 'coordinator_reply' } };
    const { replied, unreplied } = splitAgeEligibleStuckSignals([withCorrelation], [reply]);
    expect(replied.map((r) => r.id)).toEqual(['sig-corr-1']);
    expect(unreplied).toEqual([]);
  });

  it('a reply-shaped row targeting a DIFFERENT signal does not falsely mark this one replied', () => {
    const reply = { id: 'reply-3', payload: { reply_to: 'some-other-signal-id', kind: 'coordinator_reply' } };
    const { replied, unreplied } = splitAgeEligibleStuckSignals([c4312703Shape], [reply]);
    expect(unreplied.map((r) => r.id)).toEqual([c4312703Shape.id]);
    expect(replied).toEqual([]);
  });

  it('mixed batch: each row is classified independently by its own correlation, not by batch majority', () => {
    const unansweredOne = { ...c4312703Shape, id: 'sig-a' };
    const answeredTwo = { ...c4312703Shape, id: 'sig-b', payload: { ...c4312703Shape.payload, correlation_id: 'corr-b' } };
    const reply = { id: 'reply-4', payload: { correlation_id: 'corr-b' } };
    const { replied, unreplied } = splitAgeEligibleStuckSignals([unansweredOne, answeredTwo], [reply]);
    expect(replied.map((r) => r.id)).toEqual(['sig-b']);
    expect(unreplied.map((r) => r.id)).toEqual(['sig-a']);
  });

  it('empty ageEligible input returns empty replied/unreplied with no errors', () => {
    const { replied, unreplied } = splitAgeEligibleStuckSignals([], []);
    expect(replied).toEqual([]);
    expect(unreplied).toEqual([]);
  });
});
