/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-2 — durable receipt ledger writer.
 *
 * The ledger exists because the answered-rate cannot be computed from session_coordination: its
 * cleanup deletes ACKED rows at created+24h while UNACKED rows persist, so the denominator is
 * curated by the exact state being measured. A receipt therefore has to be captured AT the
 * transition — it cannot be reconstructed afterwards.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildReceipt, recordReceipt, LANES, STATES, DISPOSITIONS } = require('../../lib/coordination/receipt-ledger.cjs');

const NOW = 1_750_000_000_000;
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();

describe('buildReceipt', () => {
  it('captures time-to-answer at transition time, because it is unrecoverable later', () => {
    const r = buildReceipt({
      coordinationId: 'c-1', lane: LANES.SIGNAL, state: STATES.DISPOSED,
      disposition: DISPOSITIONS.ACTIONED, sourceCreatedAt: minsAgo(45), nowMs: NOW,
    });
    expect(r.source_age_ms).toBe(45 * 60_000);
  });

  it('handles a naive (no-timezone) timestamp as UTC rather than silently producing null', () => {
    // PostgREST returns naive strings; treating them as local would skew age by the TZ offset —
    // the same class of defect SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001 reports, which skews "in the
    // direction that suppresses alerts".
    const naive = new Date(NOW - 30 * 60_000).toISOString().replace('Z', '');
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, sourceCreatedAt: naive, nowMs: NOW }).source_age_ms)
      .toBe(30 * 60_000);
  });

  it('leaves age null (never 0) when the source timestamp is absent — unknown is not instant', () => {
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, nowMs: NOW }).source_age_ms).toBe(null);
  });

  it('rejects incoherent input rather than writing a misleading row', () => {
    expect(buildReceipt({})).toBe(null);
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: 'invented' })).toBe(null);
    expect(buildReceipt({ coordinationId: 'c', lane: 'invented', state: STATES.SEEN })).toBe(null);
    // a disposition only means something on DISPOSED
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, disposition: DISPOSITIONS.ACTIONED })).toBe(null);
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.DISPOSED, disposition: 'invented' })).toBe(null);
  });

  it('keeps the three states distinct — delivery is not disposition', () => {
    const delivered = buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.DELIVERED, nowMs: NOW });
    expect(delivered.state).toBe('delivered');
    expect(delivered.disposition).toBe(null);
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, nowMs: NOW }).state).toBe('seen');
  });

  it('defaults is_retention to false and only accepts an exact true', () => {
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, nowMs: NOW }).is_retention).toBe(false);
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, isRetention: 'yes', nowMs: NOW }).is_retention).toBe(false);
    expect(buildReceipt({ coordinationId: 'c', lane: LANES.SIGNAL, state: STATES.SEEN, isRetention: true, nowMs: NOW }).is_retention).toBe(true);
  });

  it('covers every lane with a mechanism, so no lane is left to invent its own contract', () => {
    for (const lane of Object.values(LANES)) {
      expect(buildReceipt({ coordinationId: 'c', lane, state: STATES.SEEN, nowMs: NOW }).lane).toBe(lane);
    }
  });
});

describe('recordReceipt is fail-open — measurement must never break the act it measures', () => {
  const valid = { coordinationId: 'c-1', lane: LANES.SIGNAL, state: STATES.DISPOSED, disposition: DISPOSITIONS.ACTIONED, nowMs: NOW };

  it('writes the row on the happy path', async () => {
    const seen = [];
    const client = { from: () => ({ insert: async (row) => { seen.push(row); return { error: null }; } }) };
    expect(await recordReceipt(client, valid)).toEqual({ ok: true });
    expect(seen[0].lane).toBe('signal');
    expect(seen[0].state).toBe('disposed');
  });

  it('a DB error is reported, not thrown — the caller proceeds', async () => {
    const client = { from: () => ({ insert: async () => ({ error: { message: 'db down' } }) }) };
    expect(await recordReceipt(client, valid)).toEqual({ ok: false, error: 'db down' });
  });

  it('a THROWING client is swallowed — the ack it describes has already happened', async () => {
    const client = { from: () => { throw new Error('boom'); } };
    expect(await recordReceipt(client, valid)).toEqual({ ok: false, error: 'boom' });
  });

  it('missing client or invalid input skips without throwing', async () => {
    expect(await recordReceipt(null, valid)).toEqual({ ok: false, skipped: 'no_client' });
    expect(await recordReceipt({}, {})).toEqual({ ok: false, skipped: 'invalid_input' });
  });
});
