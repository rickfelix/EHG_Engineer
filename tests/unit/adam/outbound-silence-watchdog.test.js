/**
 * SD-LEO-FIX-ADAM-OUTBOUND-SILENCE-001 — outbound-silence watchdog coverage.
 *
 * TS-1..TS-5 per the PRD's test_scenarios, plus a probe-INSERT vs prior-probe-SELECT
 * filter-parity check (risk-agent C1: a divergence there is the real storm vector —
 * the mocked dedup test alone can't catch a filter/column mismatch).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isReplyExpected, isBreaching, classifyBreaches, laneHealthAggregate,
  runOutboundSilenceWatchdog, PROBE_KIND, PROBE_DEDUP_MS, PROBE_EXPIRES_MS,
  UNREAD_BREACH_MS, UNACKED_BREACH_MS, MAX_PROBES_PER_TICK,
} from '../../../lib/adam/outbound-silence-watchdog.js';

vi.mock('../../../lib/governance/emit-feedback.js', () => ({ emitFeedback: vi.fn(async () => ({ id: 'fb-1', deduped: false })) }));
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

beforeEach(() => { emitFeedback.mockClear(); });

const NOW = Date.parse('2026-07-04T12:00:00Z');
const LIVE = 'target-live-1';

/** Stub supabase: dispatches by table; session_coordination select() branches by whether
 *  .eq('payload->>kind', ...) is chained (prior-probe lookup) vs not (outbound fetch). */
function makeStub({ outboundRows = [], sessionRows = [{ session_id: LIVE, heartbeat_at: new Date(NOW).toISOString() }], priorProbeRows = [] } = {}) {
  const inserts = [];
  const priorProbeFilters = [];
  return {
    inserts,
    priorProbeFilters,
    from(table) {
      if (table === 'claude_sessions') {
        return { select: () => ({ gte: () => ({ limit: async () => ({ data: sessionRows }) }) }) };
      }
      if (table === 'session_coordination') {
        return {
          select: () => ({
            eq: (col1, val1) => ({
              gte: () => ({ limit: async () => ({ data: outboundRows }) }), // outbound fetch: .eq(sender_type).gte(created_at).limit
              eq: (col2, val2) => ({
                eq: (col3, val3) => {
                  priorProbeFilters.push({ [col1]: val1, [col2]: val2, [col3]: val3 });
                  return { order: () => ({ limit: async () => ({ data: priorProbeRows }) }) };
                },
              }),
            }),
          }),
          insert: async (row) => { inserts.push(row); return { data: null, error: null }; },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('outbound-silence-watchdog: pure classification (TS-1)', () => {
  it('isReplyExpected: kind-based and expects_reply-based', () => {
    expect(isReplyExpected({ payload: { kind: 'coordinator_request' } })).toBe(true);
    expect(isReplyExpected({ payload: { kind: 'solomon_consult' } })).toBe(true);
    expect(isReplyExpected({ payload: { expects_reply: true } })).toBe(true);
    expect(isReplyExpected({ payload: { kind: 'adam_advisory' } })).toBe(false);
  });

  it('isBreaching: unread >=30m, read-unacked >=60m, acked never breaches, probe rows never breach', () => {
    const created30 = new Date(NOW - UNREAD_BREACH_MS).toISOString();
    const created29 = new Date(NOW - UNREAD_BREACH_MS + 60_000).toISOString();
    expect(isBreaching({ created_at: created30, read_at: null }, NOW)).toBe(true);
    expect(isBreaching({ created_at: created29, read_at: null }, NOW)).toBe(false);

    const read60 = new Date(NOW - UNACKED_BREACH_MS).toISOString();
    expect(isBreaching({ created_at: created30, read_at: read60 }, NOW)).toBe(true);
    expect(isBreaching({ created_at: created30, read_at: read60, acknowledged_at: read60 }, NOW)).toBe(false);
    expect(isBreaching({ created_at: created30, read_at: null, payload: { kind: PROBE_KIND } }, NOW)).toBe(false);
  });

  it('classifyBreaches: live-target-only, oldest-per-target', () => {
    const older = { id: 'r1', target_session: LIVE, payload: { kind: 'coordinator_request' }, created_at: new Date(NOW - 40 * 60_000).toISOString(), read_at: null };
    const newer = { id: 'r2', target_session: LIVE, payload: { kind: 'coordinator_request' }, created_at: new Date(NOW - 35 * 60_000).toISOString(), read_at: null };
    const deadTarget = { id: 'r3', target_session: 'dead-1', payload: { kind: 'coordinator_request' }, created_at: new Date(NOW - 40 * 60_000).toISOString(), read_at: null };
    const breaches = classifyBreaches([older, newer, deadTarget], new Set([LIVE]), NOW);
    expect(breaches.size).toBe(1);
    expect(breaches.get(LIVE).id).toBe('r1');
  });

  it('laneHealthAggregate: counts unread fire-and-forget at live targets, excludes probes', () => {
    const ff = { target_session: LIVE, payload: { kind: 'adam_advisory' }, created_at: new Date(NOW - 10 * 60_000).toISOString(), read_at: null };
    const probe = { target_session: LIVE, payload: { kind: PROBE_KIND }, created_at: new Date(NOW - 10 * 60_000).toISOString(), read_at: null };
    const agg = laneHealthAggregate([ff, probe], new Set([LIVE]), NOW);
    expect(agg.unactionedCount).toBe(1);
  });
});

describe('outbound-silence-watchdog: tick wiring (TS-2..TS-5)', () => {
  const breachingRow = {
    id: 'row-1', target_session: LIVE, payload: { kind: 'coordinator_request' },
    created_at: new Date(NOW - 45 * 60_000).toISOString(), read_at: null,
  };

  it('TS-2: first breach, no prior probe -> one probe row, zero feedback', async () => {
    const sb = makeStub({ outboundRows: [breachingRow], priorProbeRows: [] });
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.probed).toHaveLength(1);
    expect(result.escalated).toHaveLength(0);
    expect(sb.inserts).toHaveLength(1);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('TS-3: prior probe <2h old -> deduped, zero new rows', async () => {
    const recentProbe = { id: 'probe-1', created_at: new Date(NOW - 30 * 60_000).toISOString() };
    const sb = makeStub({ outboundRows: [breachingRow], priorProbeRows: [recentProbe] });
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.probed).toHaveLength(0);
    expect(result.escalated).toHaveLength(0);
    expect(sb.inserts).toHaveLength(0);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('TS-4: prior probe >=2h old, still breaching -> one feedback row + fresh probe', async () => {
    const oldProbe = { id: 'probe-1', created_at: new Date(NOW - PROBE_DEDUP_MS - 60_000).toISOString() };
    const sb = makeStub({ outboundRows: [breachingRow], priorProbeRows: [oldProbe] });
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.escalated).toHaveLength(1);
    expect(result.probed).toHaveLength(1);
    expect(sb.inserts).toHaveLength(1);
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback.mock.calls[0][0].dedup_key).toBe(`outbound-silence:${LIVE}:2026-07-04`);
  });

  it('TS-5: healthy lane (acked, or no reply-expected rows) -> zero noise', async () => {
    const healthy = { ...breachingRow, id: 'row-2', read_at: new Date(NOW - 5 * 60_000).toISOString(), acknowledged_at: new Date(NOW - 4 * 60_000).toISOString() };
    const sb = makeStub({ outboundRows: [healthy], priorProbeRows: [] });
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.probed).toHaveLength(0);
    expect(result.escalated).toHaveLength(0);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('probe-INSERT vs prior-probe-SELECT filter/column parity (risk-agent C1)', async () => {
    const sb = makeStub({ outboundRows: [breachingRow], priorProbeRows: [] });
    await runOutboundSilenceWatchdog(sb, { now: NOW });
    const insertedRow = sb.inserts[0];
    const selectFilter = sb.priorProbeFilters[0];
    // The SELECT filter that looks up "a prior probe for this target" must match exactly
    // the fields the INSERT actually writes -- a divergence here is the real storm vector.
    expect(insertedRow.sender_type).toBe(selectFilter.sender_type);
    expect(insertedRow.target_session).toBe(selectFilter.target_session);
    expect(insertedRow.payload.kind).toBe(selectFilter['payload->>kind']);
  });

  it('fail-open: a thrown query error never propagates', async () => {
    const sb = { from() { throw new Error('boom'); } };
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.error).toBe('boom');
    expect(result.probed).toEqual([]);
  });

  it('probe INSERT carries the load-bearing safety fields (reply_class, expires_at, no correlation_id/request_ack)', async () => {
    const sb = makeStub({ outboundRows: [breachingRow], priorProbeRows: [] });
    await runOutboundSilenceWatchdog(sb, { now: NOW });
    const inserted = sb.inserts[0];
    expect(inserted.payload.reply_class).toBe('fire-and-forget');
    expect(inserted.payload.correlation_id).toBeUndefined();
    expect(inserted.payload.request_ack).toBeUndefined();
    expect(Date.parse(inserted.expires_at) - NOW).toBe(PROBE_EXPIRES_MS);
  });

  it('MAX_PROBES_PER_TICK: more breaching live targets than the cap -> only the cap is probed', async () => {
    const targets = Array.from({ length: MAX_PROBES_PER_TICK + 2 }, (_, i) => `target-${i}`);
    const sessionRows = targets.map((t) => ({ session_id: t, heartbeat_at: new Date(NOW).toISOString() }));
    const outboundRows = targets.map((t, i) => ({
      id: `row-${i}`, target_session: t, payload: { kind: 'coordinator_request' },
      created_at: new Date(NOW - 45 * 60_000).toISOString(), read_at: null,
    }));
    const sb = makeStub({ outboundRows, sessionRows, priorProbeRows: [] });
    const result = await runOutboundSilenceWatchdog(sb, { now: NOW });
    expect(result.probed).toHaveLength(MAX_PROBES_PER_TICK);
    expect(sb.inserts).toHaveLength(MAX_PROBES_PER_TICK);
  });
});
