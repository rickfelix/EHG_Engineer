/**
 * Unit tests for scripts/solomon-ledger-pending-resurface.cjs — QF-20260704-598.
 * Pending Solomon-ledger rows can decay silently past their SLA; this mirrors
 * feedback-sla-gauge.cjs's dedup-before-insert discipline into Adam's inbox instead.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  dedupKeyFor,
  planStalePending,
  resurfaceStalePending,
  digestDedupKey,
  buildDigest,
  DIGEST_KIND,
  RESURFACE_KIND,
} = require('../../scripts/solomon-ledger-pending-resurface.cjs');

const ADAM_ID = 'adam-session-1';

/**
 * Mutable in-memory mock for the 2 tables this module touches.
 *
 * SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001: session_coordination now serves TWO distinct
 * reads — the digest dedup lookup (.eq target_session → .eq payload->>dedup_key → .limit) and
 * the one-day legacy transition guard (.eq target_session → .eq payload->>kind → .gte
 * created_at). The builder below dispatches on the second .eq's COLUMN so the two cannot be
 * silently conflated. Matching is driven by the column name the code actually passes, not by
 * call order, so a query-shape change surfaces as a failure rather than a wrong-but-green
 * result.
 */
function createMockSupabase({ ledgerRows = [], inboxRows = [] } = {}) {
  const ledger = [...ledgerRows];
  const inbox = [...inboxRows];
  return {
    from(table) {
      if (table === 'solomon_advice_outcome_ledger') {
        return {
          select: () => ({
            eq: (col, val) => ({
              lte: (col2, val2) => ({
                order: () => ({
                  range: async (from, to) => {
                    const filtered = ledger
                      .filter((r) => r[col] === val && r[col2] <= val2)
                      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
                    return { data: filtered.slice(from, to + 1), error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'session_coordination') {
        return {
          select: () => ({
            eq: (col1, val1) => {
              const scoped = inbox.filter((r) => r[col1] === val1);
              return {
                eq: (col2, val2) => {
                  if (col2 === 'payload->>dedup_key') {
                    return {
                      limit: async () => ({
                        data: scoped.filter((r) => (r.payload || {}).dedup_key === val2),
                        error: null,
                      }),
                    };
                  }
                  if (col2 === 'payload->>kind') {
                    // legacy transition guard: .gte('created_at', startOfDay)
                    return {
                      gte: async (col3, since) => ({
                        data: scoped.filter((r) => (r.payload || {}).kind === val2
                          && (r.created_at === undefined || r.created_at >= since)),
                        error: null,
                      }),
                    };
                  }
                  throw new Error(`unexpected filter column ${col2}`);
                },
              };
            },
          }),
          insert: async (row) => { inbox.push(row); return { error: null }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _inbox: inbox,
    // Exposed so a test can mutate the ledger BETWEEN runs (the constructor copies its input,
    // so pushing to the caller's array would not reach this mock).
    _ledger: ledger,
  };
}

/** Builds N stale pending ledger rows, oldest first. */
function stalePending(n, nowMs, { hoursOld = 48 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i + 1}`,
    decision: 'pending',
    correlation_id: `corr-${i + 1}`,
    sd_key: `SD-X-${i + 1}`,
    proposal_summary: `pending item ${i + 1}`,
    created_at: new Date(nowMs - (hoursOld + n - i) * 60 * 60 * 1000).toISOString(),
  }));
}

describe('dedupKeyFor()', () => {
  it('is stable for the same ledger row + day, and changes across days', () => {
    const day1 = new Date('2026-07-04T10:00:00Z').getTime();
    const day2 = new Date('2026-07-05T10:00:00Z').getTime();
    expect(dedupKeyFor('ledger-1', day1)).toBe(dedupKeyFor('ledger-1', day1));
    expect(dedupKeyFor('ledger-1', day1)).not.toBe(dedupKeyFor('ledger-1', day2));
  });
});

describe('planStalePending()', () => {
  it('surfaces only pending rows older than the threshold', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [
        { id: 'l1', decision: 'pending', created_at: '2026-07-04T00:00:00Z' }, // 36h old — stale
        { id: 'l2', decision: 'pending', created_at: '2026-07-05T11:00:00Z' }, // 1h old — fresh
        { id: 'l3', decision: 'accepted', created_at: '2026-07-01T00:00:00Z' }, // decided — excluded
      ],
    });
    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs });
    expect(rows.map((r) => r.id)).toEqual(['l1']);
  });

  // QF-20260710-743: the original .limit(50) query starved every row past the oldest 50
  // whenever the head of the queue never resolved. Pins the fix with a small pageSize so
  // the fixture doesn't need 51+ rows to prove pagination past a single page.
  it('pages past a single-page window so rows beyond it are not starved (QF-20260710-743)', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const ledgerRows = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i + 1}`,
      decision: 'pending',
      created_at: new Date(nowMs - (5 - i) * 48 * 60 * 60 * 1000).toISOString(), // all stale, oldest first
    }));
    const supabase = createMockSupabase({ ledgerRows });

    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs, pageSize: 2, maxPages: 5 });
    expect(rows.map((r) => r.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });

  it('respects maxPages as a bounded safety cap rather than looping forever', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const ledgerRows = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i + 1}`,
      decision: 'pending',
      created_at: new Date(nowMs - (10 - i) * 48 * 60 * 60 * 1000).toISOString(),
    }));
    const supabase = createMockSupabase({ ledgerRows });

    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs, pageSize: 2, maxPages: 3 });
    expect(rows).toHaveLength(6); // 3 pages * 2 per page, not the full 10
  });
});

describe('digestDedupKey() — content hash, never date-keyed (FR-3)', () => {
  it('is order-insensitive and de-duplicates the member set', () => {
    expect(digestDedupKey(['l2', 'l1'])).toBe(digestDedupKey(['l1', 'l2']));
    expect(digestDedupKey(['l1', 'l1', 'l2'])).toBe(digestDedupKey(['l1', 'l2']));
  });

  it('changes when a member is added or removed', () => {
    const base = digestDedupKey(['l1', 'l2']);
    expect(digestDedupKey(['l1', 'l2', 'l3'])).not.toBe(base);
    expect(digestDedupKey(['l1'])).not.toBe(base);
  });

  it('contains NO date component, so a changed member set is never suppressed for the rest of the day', () => {
    // The regression this guards: a date-keyed digest re-introduces the head-of-queue
    // starvation class QF-20260710-743 — a newly-crossed item would wait until tomorrow.
    const key = digestDedupKey(['l1', 'l2']);
    expect(key).toMatch(/^solomon_ledger_digest:[0-9a-f]{16}$/);
    expect(key).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('buildDigest() — actionable membership + truncation disclosure (FR-2, FR-6)', () => {
  const nowMs = new Date('2026-07-05T12:00:00Z').getTime();

  it('carries ledger_id, correlation_id, sd_key, age_hours and summary per member', () => {
    const d = buildDigest(stalePending(3, nowMs), { nowMs });
    expect(d.items).toHaveLength(3);
    for (const item of d.items) {
      expect(item).toHaveProperty('ledger_id');
      expect(item).toHaveProperty('correlation_id');
      expect(item).toHaveProperty('sd_key');
      expect(item).toHaveProperty('age_hours');
      expect(item).toHaveProperty('summary');
      // correlation_id is a HARD dependency: coordinator-ack-adam.cjs upserts the ledger with
      // onConflict:'correlation_id', so a null here makes the member undispositionable.
      expect(item.correlation_id).toBeTruthy();
    }
    expect(d.truncated).toBe(false);
    expect(d.body).toContain('l1');
    expect(d.body.length).toBeGreaterThan(0); // lane-contract: never bodyless
  });

  it('caps membership and DISCLOSES truncation rather than silently dropping items', () => {
    const d = buildDigest(stalePending(120, nowMs), { nowMs, maxItems: 100 });
    expect(d.items).toHaveLength(100);
    expect(d.truncated).toBe(true);
    expect(d.totalCandidates).toBe(120);
    expect(d.body).toContain('truncated');
    expect(d.body).toContain('20 omitted');
    // oldest retained preferentially — input is oldest-first
    expect(d.ledgerIds[0]).toBe('l1');
  });
});

describe('resurfaceStalePending() — ONE digest row per run (FR-1)', () => {
  it('inserts exactly ONE row for a single stale pending item', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'do the thing', created_at: '2026-07-04T00:00:00Z' }],
    });
    const { candidates, resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(candidates).toHaveLength(1);
    expect(resurfaced).toEqual(['l1']);
    expect(supabase._inbox).toHaveLength(1);
    const row = supabase._inbox[0];
    expect(row.target_session).toBe(ADAM_ID);
    expect(row.payload.kind).toBe(DIGEST_KIND);
    expect(row.payload.ledger_ids).toEqual(['l1']);
    expect(row.payload.items[0].ledger_id).toBe('l1');
    expect(row.payload.items[0].correlation_id).toBe('corr-1');
    // lane-contract compliance (TR-3)
    expect(row.sender_type).toBe('sweep');
    expect(row.body).toBeTruthy();
  });

  it.each([29, 120])('inserts exactly ONE row for %i stale items, not one per item', async (n) => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({ ledgerRows: stalePending(n, nowMs) });
    const { candidates } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(candidates.length).toBe(n);
    expect(supabase._inbox).toHaveLength(1); // THE point of this SD
    expect(supabase._inbox[0].payload.item_count).toBe(Math.min(n, 100));
  });

  it('does not re-send an UNCHANGED member set on a second run the same day (dedup)', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'do the thing', created_at: '2026-07-04T00:00:00Z' }],
    });
    await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    const second = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs: nowMs + 60_000 });
    expect(second.resurfaced).toEqual([]);
    expect(supabase._inbox).toHaveLength(1); // no duplicate insert
  });

  it('DOES re-send in the SAME day when the member set CHANGES (FR-3 — not date-keyed)', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const ledgerRows = [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'first', created_at: '2026-07-04T00:00:00Z' }];
    const supabase = createMockSupabase({ ledgerRows });
    await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(supabase._inbox).toHaveLength(1);
    // a second item crosses the threshold later the same day
    supabase._ledger.push({ id: 'l2', decision: 'pending', correlation_id: 'corr-2', sd_key: null, proposal_summary: 'second', created_at: '2026-07-04T01:00:00Z' });
    const second = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs: nowMs + 3_600_000 });
    expect(second.resurfaced).toEqual(['l1', 'l2']);
    expect(supabase._inbox).toHaveLength(2); // re-issued immediately, not tomorrow
    // key computed INDEPENDENTLY here, never read back from the mock
    expect(supabase._inbox[1].payload.dedup_key).toBe(digestDedupKey(['l1', 'l2']));
  });

  it('FR-5: excludes items already resurfaced TODAY under the legacy per-item key', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: stalePending(3, nowMs),
      inboxRows: [{
        target_session: ADAM_ID,
        created_at: '2026-07-05T01:00:00Z',
        payload: { kind: RESURFACE_KIND, dedup_key: dedupKeyFor('l1', nowMs), ledger_id: 'l1' },
      }],
    });
    const { resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(resurfaced).not.toContain('l1');
    expect(resurfaced).toEqual(['l2', 'l3']);
  });

  it('FR-5: inserts NOTHING when every candidate was already resurfaced today under the legacy key', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: stalePending(2, nowMs),
      inboxRows: ['l1', 'l2'].map((id) => ({
        target_session: ADAM_ID,
        created_at: '2026-07-05T01:00:00Z',
        payload: { kind: RESURFACE_KIND, dedup_key: dedupKeyFor(id, nowMs), ledger_id: id },
      })),
    });
    const { resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(resurfaced).toEqual([]);
    expect(supabase._inbox).toHaveLength(2); // only the two pre-existing legacy rows
  });

  it('produces zero candidates and zero noise when no pending row is stale', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'fresh', created_at: '2026-07-05T11:00:00Z' }],
    });
    const { candidates, resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(candidates).toHaveLength(0);
    expect(resurfaced).toHaveLength(0);
    expect(supabase._inbox).toHaveLength(0);
  });
});
