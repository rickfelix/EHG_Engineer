/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-7 — a retention stamp must never be mistaken for an
 * answer.
 *
 * Two paths stamp acknowledged_at with nobody answering: convergeAckTTL (which already marks
 * payload.auto_acked) and the STUCK-signal drain in stale-session-sweep.cjs (which marked nothing,
 * so its stamps were permanently indistinguishable from a genuine coordinator ack). Since
 * acknowledged_at is the substrate of this SD's answered-rate metric, an unmarked stamp inflates
 * the exact number used to judge whether the escalation lane is healthy.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  buildRetentionAckPayload,
  isRetentionAck,
  isGenuinelyAcknowledged,
  RETENTION_ACK_SOURCE,
} = require('../../lib/retention/retention-ack-marker.cjs');
const { detectReplyStarvation } = require('../../lib/coordinator/detectors.cjs');

const NOW = 1_750_000_000_000;
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();

describe('buildRetentionAckPayload', () => {
  it('PRESERVES existing payload keys — they are load-bearing downstream', () => {
    const p = buildRetentionAckPayload({ signal_type: 'stuck', severity: 'high', sender_callsign: 'Delta' }, 'aged_out');
    expect(p.signal_type).toBe('stuck');
    expect(p.severity).toBe('high');
    expect(p.sender_callsign).toBe('Delta');
  });

  it('records the marker and WHY the row drained', () => {
    expect(buildRetentionAckPayload({}, 'dead_sender')).toMatchObject({
      auto_acked: true, auto_ack_source: RETENTION_ACK_SOURCE, auto_ack_reason: 'dead_sender',
    });
    expect(buildRetentionAckPayload({}, 'aged_out').auto_ack_reason).toBe('aged_out');
  });

  it('is TOTAL on a null/garbage payload', () => {
    expect(buildRetentionAckPayload(null, 'aged_out').auto_acked).toBe(true);
    expect(buildRetentionAckPayload('nonsense', 'aged_out').auto_acked).toBe(true);
  });
});

describe('isGenuinelyAcknowledged', () => {
  it('a real coordinator ack counts', () => {
    expect(isGenuinelyAcknowledged({ acknowledged_at: minsAgo(5), payload: { signal_type: 'stuck' } })).toBe(true);
  });

  it('a RETENTION stamp does NOT count as an answer', () => {
    const row = { acknowledged_at: minsAgo(5), payload: buildRetentionAckPayload({ signal_type: 'stuck' }, 'aged_out') };
    expect(isRetentionAck(row)).toBe(true);
    expect(isGenuinelyAcknowledged(row)).toBe(false);
  });

  it('an unacked row is not acknowledged, and junk defaults to genuine (never discard a real answer)', () => {
    expect(isGenuinelyAcknowledged({ acknowledged_at: null, payload: {} })).toBe(false);
    expect(isGenuinelyAcknowledged(null)).toBe(false);
    // auto_acked must be exactly true — a truthy string must not silently retire a real ack
    expect(isGenuinelyAcknowledged({ acknowledged_at: minsAgo(5), payload: { auto_acked: 'yes' } })).toBe(true);
  });
});

describe('FR-7 consumer coupling — the marker is READ, not merely written', () => {
  // A marker no consumer reads would be an inert mechanism: the metric would stay exactly as wrong
  // as before. This test fails if detectReplyStarvation ever reverts to a bare !!acknowledged_at.
  const base = {
    id: 'sig-1', sender_type: 'worker', sender_session: 'w1',
    created_at: minsAgo(45), read_at: null, payload: { signal_type: 'stuck' },
  };

  it('a signal retired by the retention drain is STILL counted as starved', () => {
    const drained = {
      ...base,
      acknowledged_at: minsAgo(5),
      payload: buildRetentionAckPayload({ signal_type: 'stuck' }, 'aged_out'),
    };
    const r = detectReplyStarvation({ signals: [drained], now: NOW, thresholdMs: 30 * 60_000 });
    expect(r.matched).toBe(true);
    expect(r.evidence.starved_count).toBe(1);
  });

  it('a signal answered by a real ack is NOT counted as starved (genuine case preserved)', () => {
    const answered = { ...base, acknowledged_at: minsAgo(5) };
    expect(detectReplyStarvation({ signals: [answered], now: NOW, thresholdMs: 30 * 60_000 }).matched).toBe(false);
  });
});
