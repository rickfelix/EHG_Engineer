/**
 * SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 — reply-correlation primitive.
 *
 * Closure map class C6: `acknowledged_at IS NULL` is not a reliable "unreplied"
 * signal — a reply routinely arrives as a fresh row carrying payload.reply_to /
 * payload.correlation_id, never as an update to the original row's acknowledged_at.
 */
import { describe, it, expect } from 'vitest';
import { hasCorrelatedReply } from '../../../lib/coordinator/reply-correlation.cjs';

describe('hasCorrelatedReply', () => {
  it('returns true when another row targets this row via payload.reply_to', () => {
    const original = { id: 'req-1', payload: {} };
    const reply = { id: 'reply-1', payload: { reply_to: 'req-1' } };
    expect(hasCorrelatedReply(original, [original, reply])).toBe(true);
  });

  it('returns true when another row shares the same payload.correlation_id', () => {
    const original = { id: 'req-2', payload: { correlation_id: 'corr-x' } };
    const reply = { id: 'reply-2', payload: { correlation_id: 'corr-x' } };
    expect(hasCorrelatedReply(original, [original, reply])).toBe(true);
  });

  it('returns false when no other row references this row', () => {
    const original = { id: 'req-3', payload: {} };
    const unrelated = { id: 'other', payload: { reply_to: 'someone-else' } };
    expect(hasCorrelatedReply(original, [original, unrelated])).toBe(false);
  });

  it('returns false for a null/undefined row, no throw', () => {
    expect(hasCorrelatedReply(null, [])).toBe(false);
    expect(hasCorrelatedReply(undefined, [{ id: 'x', payload: {} }])).toBe(false);
  });

  it('returns false when allRows is not an array, no throw', () => {
    expect(hasCorrelatedReply({ id: 'req-4', payload: {} }, null)).toBe(false);
    expect(hasCorrelatedReply({ id: 'req-4', payload: {} }, undefined)).toBe(false);
  });

  it('does not match a row against itself', () => {
    const row = { id: 'req-5', payload: { correlation_id: 'req-5' } };
    expect(hasCorrelatedReply(row, [row])).toBe(false);
  });

  it('ignores rows with no payload', () => {
    const original = { id: 'req-6', payload: {} };
    const bare = { id: 'other-2' };
    expect(hasCorrelatedReply(original, [original, bare])).toBe(false);
  });
});

// SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-4 (instance 3): opts.excludeKinds —
// a mechanical courtesy-ACK echoing a consult correlation_id must never suppress the eventual
// genuine oracle-verdict/reply row.
describe('hasCorrelatedReply — opts.excludeKinds (FR-4)', () => {
  it('WITHOUT excludeKinds (default, byte-identical to pre-FR-4): a courtesy-ACK still counts as a correlated reply', () => {
    const consult = { id: 'consult-1', payload: { correlation_id: 'corr-x' } };
    const courtesyAck = { id: 'ack-1', payload: { correlation_id: 'corr-x', kind: 'ack' } };
    expect(hasCorrelatedReply(consult, [consult, courtesyAck])).toBe(true);
  });

  it('WITH excludeKinds: a courtesy-ACK matching an excluded kind is ignored — the directive is NOT suppressed', () => {
    const consult = { id: 'consult-2', payload: { correlation_id: 'corr-y' } };
    const courtesyAck = { id: 'ack-2', payload: { correlation_id: 'corr-y', kind: 'ack' } };
    expect(hasCorrelatedReply(consult, [consult, courtesyAck], { excludeKinds: ['ack', 'coordinator_ack'] })).toBe(false);
  });

  it('WITH excludeKinds: the genuine oracle-verdict reply (a non-excluded kind) still correlates', () => {
    const consult = { id: 'consult-3', payload: { correlation_id: 'corr-z' } };
    const courtesyAck = { id: 'ack-3', payload: { correlation_id: 'corr-z', kind: 'ack' } };
    const verdict = { id: 'verdict-3', payload: { correlation_id: 'corr-z', kind: 'adam_advisory' } };
    // Both a mechanical ack AND the real verdict exist — excludeKinds filters the ack out but
    // the verdict still satisfies the correlation.
    expect(hasCorrelatedReply(consult, [consult, courtesyAck, verdict], { excludeKinds: ['ack'] })).toBe(true);
  });

  it('excludeKinds only filters by kind, not by which field matched (reply_to path also respects it)', () => {
    const req = { id: 'req-7', payload: {} };
    const courtesyAck = { id: 'ack-4', payload: { reply_to: 'req-7', kind: 'coordinator_ack' } };
    expect(hasCorrelatedReply(req, [req, courtesyAck], { excludeKinds: ['coordinator_ack'] })).toBe(false);
  });
});
