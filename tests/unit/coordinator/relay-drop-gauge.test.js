/**
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-3
 *
 * lib/coordinator/relay-drop-gauge.cjs -- the unactioned relay/decision/review
 * drop gauge. decideRelayDrops() is a CORRELATION over two injected arrays
 * (unlike pending-question-timer.cjs's single-set decidePendingQuestions()).
 */
import { describe, it, expect } from 'vitest';
import { decideRelayDrops, isTrackedInbound, satisfiesCorrelation, DEFAULT_WINDOW_MS } from '../../../lib/coordinator/relay-drop-gauge.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

const NOW = Date.parse('2026-07-02T00:00:00Z');

describe('isTrackedInbound', () => {
  it('tracks relay_request, decision_request, review_request', () => {
    expect(isTrackedInbound({ payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST } })).toBe(true);
    expect(isTrackedInbound({ payload: { kind: 'decision_request' } })).toBe(true);
    expect(isTrackedInbound({ payload: { kind: 'review_request' } })).toBe(true);
  });

  it('does not track unrelated kinds', () => {
    expect(isTrackedInbound({ payload: { kind: 'adam_advisory' } })).toBe(false);
    expect(isTrackedInbound({})).toBe(false);
  });
});

describe('satisfiesCorrelation', () => {
  it('a relay_confirm row satisfies via correlation_id', () => {
    expect(satisfiesCorrelation({ payload: { kind: PAYLOAD_KINDS.RELAY_CONFIRM, correlation_id: 'c1' } })).toBe('c1');
  });

  it('a reply row satisfies via reply_to', () => {
    expect(satisfiesCorrelation({ payload: { reply_to: 'c2' } })).toBe('c2');
  });

  it('an unrelated row satisfies nothing', () => {
    expect(satisfiesCorrelation({ payload: { kind: 'adam_advisory' } })).toBeNull();
  });
});

describe('decideRelayDrops — correlation core (TS-5/TS-6)', () => {
  it('does NOT flag an inbound row with a matching outbound confirm within the window (TS-5)', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-07-01T23:50:00Z' }];
    const outbound = [{ id: 'out1', payload: { kind: PAYLOAD_KINDS.RELAY_CONFIRM, correlation_id: 'c1' }, created_at: '2026-07-01T23:55:00Z' }];
    const decisions = decideRelayDrops(inbound, outbound, { now: NOW });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('ok');
  });

  it('FLAGS an inbound row reproducing confirmed incident #1 exact shape: no outbound, aged past window (TS-6)', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-07-01T21:00:00Z' }]; // 3h old, no confirm ever posted
    const decisions = decideRelayDrops(inbound, [], { now: NOW });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('flag');
    expect(decisions[0].reason).toMatch(/no matching outbound/);
  });

  it('does not flag a row still below the window (pending)', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-07-01T23:50:00Z' }]; // 10min old, window is 15min default
    const decisions = decideRelayDrops(inbound, [], { now: NOW });
    expect(decisions[0].action).toBe('pending');
  });

  it('ignores rows that are not tracked inbound kinds', () => {
    const inbound = [{ id: 'in1', payload: { kind: 'adam_advisory' }, created_at: '2026-07-01T00:00:00Z' }];
    const decisions = decideRelayDrops(inbound, [], { now: NOW });
    expect(decisions).toHaveLength(0);
  });

  it('does not misread board/traffic churn: a fresh unrelated outbound row does not satisfy an unrelated inbound row', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-07-01T21:00:00Z' }];
    const outbound = [{ id: 'out1', payload: { kind: PAYLOAD_KINDS.RELAY_CONFIRM, correlation_id: 'c2' }, created_at: '2026-07-01T23:55:00Z' }]; // different correlation
    const decisions = decideRelayDrops(inbound, outbound, { now: NOW });
    expect(decisions[0].action).toBe('flag');
  });

  it('respects a custom windowMs', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-07-01T23:59:00Z' }]; // 1min old
    const decisions = decideRelayDrops(inbound, [], { now: NOW, windowMs: 30_000 }); // 30s window
    expect(decisions[0].action).toBe('flag');
  });

  it('DEFAULT_WINDOW_MS is ~15 minutes', () => {
    expect(DEFAULT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});
