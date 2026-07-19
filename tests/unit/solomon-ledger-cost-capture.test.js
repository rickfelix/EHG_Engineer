/**
 * SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W3, FR-6/TR-4) — cost_tokens + cost_wall_ms capture at
 * ledger write time, from authoritative session telemetry, with a fail-soft cost_captured marker.
 * Injected-stub coverage (no real DB, no real telemetry log).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readSessionCostTelemetry } = require('../../lib/telemetry/session-cost.cjs');
const { captureLedgerRow } = require('../../scripts/solomon-advisory.cjs');

// A supabase stub whose upsert records the row it was asked to write.
function stubSupabase() {
  const calls = { upsertRow: null, upsertOpts: null, count: 0 };
  const sb = {
    from: () => ({
      upsert: (row, opts) => {
        calls.upsertRow = row;
        calls.upsertOpts = opts;
        calls.count += 1;
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { sb, calls };
}

describe('W3 FR-6: readSessionCostTelemetry — authoritative per-session telemetry', () => {
  it('captures cost_tokens (latest snapshot) + wall_ms (elapsed since first snapshot) when telemetry is present', () => {
    const logContent = [
      JSON.stringify({ ts: '2026-07-19T10:00:00.000Z', session: 'S1', context_used: 50000, input: 40000, output: 10000 }),
      JSON.stringify({ ts: '2026-07-19T10:05:00.000Z', session: 'OTHER', context_used: 999999 }), // different session — ignored
      JSON.stringify({ ts: '2026-07-19T10:10:00.000Z', session: 'S1', context_used: 123456, input: 100000, output: 23456 }),
    ].join('\n');
    const nowMs = Date.parse('2026-07-19T10:20:00.000Z');
    const t = readSessionCostTelemetry({ sessionId: 'S1', logContent, nowMs });
    expect(t.captured).toBe(true);
    expect(t.costTokens).toBe(123456);              // latest S1 snapshot's context_used
    expect(t.wallMs).toBe(20 * 60 * 1000);          // 10:20 now − 10:00 first S1 snapshot = 20 min
    expect(t.source).toBe('context-usage.jsonl');
  });

  it('falls back to summing token fields when context_used is absent', () => {
    const logContent = JSON.stringify({ ts: '2026-07-19T10:00:00.000Z', session: 'S2', input: 30000, output: 5000, cache_read: 1000 });
    const t = readSessionCostTelemetry({ sessionId: 'S2', logContent, nowMs: Date.parse('2026-07-19T10:00:01.000Z') });
    expect(t.captured).toBe(true);
    expect(t.costTokens).toBe(36000); // 30000 + 5000 + 1000
  });

  it('is fail-soft (captured:false) when there is no snapshot for this session', () => {
    const logContent = JSON.stringify({ ts: '2026-07-19T10:00:00.000Z', session: 'SOMEONE_ELSE', context_used: 42 });
    const t = readSessionCostTelemetry({ sessionId: 'S1', logContent });
    expect(t.captured).toBe(false);
    expect(t.reason).toMatch(/no telemetry snapshot/);
  });

  it('is fail-soft (captured:false, no throw) when the log file is missing', () => {
    const t = readSessionCostTelemetry({ sessionId: 'S1', logPath: '/no/such/telemetry/log/context-usage.jsonl' });
    expect(t.captured).toBe(false);
    expect(t.reason).toMatch(/no telemetry log/);
  });

  it('is fail-soft (captured:false) when no sessionId is available', () => {
    const t = readSessionCostTelemetry({ logContent: '{}' });
    expect(t.captured).toBe(false);
    expect(t.reason).toMatch(/sessionId/);
  });
});

describe('W3 FR-6/TR-4: captureLedgerRow — cost capture at write time', () => {
  it('(a) telemetry present → row carries non-null cost_tokens + cost_wall_ms + cost_captured=true', async () => {
    const { sb, calls } = stubSupabase();
    const readTelemetry = () => ({ captured: true, costTokens: 123456, wallMs: 6789 });
    const result = await captureLedgerRow(
      sb,
      { advisoryId: 'adv-1', correlationId: 'corr-1', sdKey: 'SD-1', body: 'hello', sessionId: 'S1' },
      { readTelemetry }
    );
    expect(result.captured).toBe(true);       // ledger write succeeded
    expect(result.costCaptured).toBe(true);
    expect(calls.upsertRow.cost_tokens).toBe(123456);
    expect(calls.upsertRow.cost_wall_ms).toBe(6789);
    expect(calls.upsertRow.cost_captured).toBe(true);
  });

  it('(b) telemetry absent → row STILL written with cost_tokens null + cost_wall_ms null + cost_captured=false', async () => {
    const { sb, calls } = stubSupabase();
    const readTelemetry = () => ({ captured: false, reason: 'no telemetry snapshot for session S1' });
    const result = await captureLedgerRow(
      sb,
      { advisoryId: 'adv-2', correlationId: 'corr-2', sdKey: 'SD-1', body: 'hi', sessionId: 'S1' },
      { readTelemetry }
    );
    expect(result.captured).toBe(true);        // TR-4: write still succeeds
    expect(result.costCaptured).toBe(false);
    expect(calls.count).toBe(1);               // the row WAS written
    expect(calls.upsertRow.cost_tokens).toBeNull();
    expect(calls.upsertRow.cost_wall_ms).toBeNull();
    expect(calls.upsertRow.cost_captured).toBe(false);
    // core ledger fields are unaffected by the telemetry miss
    expect(calls.upsertRow.correlation_id).toBe('corr-2');
    expect(calls.upsertRow.proposal_summary).toBe('hi');
  });

  it('default telemetry reader is fail-soft: no sessionId / no log → cost_captured=false, write still succeeds', async () => {
    const { sb, calls } = stubSupabase();
    // No readTelemetry override and no sessionId — exercises the real readSessionCostTelemetry default,
    // which returns captured:false for a missing sessionId (never throws, never blocks the write).
    const result = await captureLedgerRow(sb, { correlationId: 'corr-3', body: 'x' });
    expect(result.captured).toBe(true);
    expect(result.costCaptured).toBe(false);
    expect(calls.upsertRow.cost_captured).toBe(false);
    expect(calls.upsertRow.cost_tokens).toBeNull();
  });
});
