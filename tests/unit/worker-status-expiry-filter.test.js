/**
 * SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-1) — getMessagesForSession's opt-in
 * excludeExpired filter. RCA: a TTL'd WORK_ASSIGNMENT (session_coordination.expires_at
 * in the past) stayed selectable for the rest of the 24h ASSIGNMENT_RECENCY_WINDOW_MS
 * because getMessagesForSession never read expires_at at all. excludeExpired is
 * opt-in (default OFF) so the 13+ other callers of this helper are unaffected — only
 * lib/checkin/steps/directed-assignment.cjs's WORK_ASSIGNMENT pull opts in.
 */
import { describe, it, expect, vi } from 'vitest';

const ws = require('../../lib/fleet/worker-status.cjs');

function stubWithRows(rows) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return { from: vi.fn(() => chain) };
}

describe('FR-1: getMessagesForSession excludeExpired', () => {
  const now = Date.now();
  const past = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
  const future = new Date(now + 60 * 60 * 1000).toISOString(); // +1h
  const rows = [
    { id: 'expired', message_type: 'WORK_ASSIGNMENT', expires_at: past },
    { id: 'future', message_type: 'WORK_ASSIGNMENT', expires_at: future },
    { id: 'no-ttl', message_type: 'WORK_ASSIGNMENT', expires_at: null },
  ];

  it('default (excludeExpired omitted) returns every row — existing callers unaffected', async () => {
    const sb = stubWithRows(rows);
    const out = await ws.getMessagesForSession(sb, 'worker-1');
    expect(out.map((r) => r.id)).toEqual(['expired', 'future', 'no-ttl']);
  });

  it('excludeExpired:true drops rows whose expires_at has passed the grace buffer', async () => {
    const sb = stubWithRows(rows);
    const out = await ws.getMessagesForSession(sb, 'worker-1', { excludeExpired: true });
    expect(out.map((r) => r.id).sort()).toEqual(['future', 'no-ttl']);
  });

  it('a row expiring within the grace buffer is NOT dropped (clock-skew tolerance)', async () => {
    const justExpired = new Date(now - 30 * 1000).toISOString(); // 30s ago, within 60s default grace
    const sb = stubWithRows([{ id: 'grace', message_type: 'WORK_ASSIGNMENT', expires_at: justExpired }]);
    const out = await ws.getMessagesForSession(sb, 'worker-1', { excludeExpired: true });
    expect(out.map((r) => r.id)).toEqual(['grace']);
  });

  it('a custom expiryGraceMs narrows the tolerance window', async () => {
    const twoMinAgo = new Date(now - 120 * 1000).toISOString();
    const sb = stubWithRows([{ id: 'old', message_type: 'WORK_ASSIGNMENT', expires_at: twoMinAgo }]);
    const out = await ws.getMessagesForSession(sb, 'worker-1', { excludeExpired: true, expiryGraceMs: 1000 });
    expect(out).toEqual([]);
  });
});
