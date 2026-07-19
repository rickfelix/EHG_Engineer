import { describe, it, expect } from 'vitest';
import { SLA_CATEGORIES, computeBreaches, slaKeyFor, planSlaBreaches, remindSlaBreaches } from '../../../lib/coordinator/feedback-sla-gauge.cjs';

// QF-20260704-493: feedback-consumption SLA gauge. computeBreaches/slaKeyFor are pure
// (no DB); planSlaBreaches/remindSlaBreaches are tested here with an injected fake
// supabase client (network-free), mirroring the coordinator-cold-recovery.test.js
// injectable-dependency convention.

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00:00Z

describe('computeBreaches (pure)', () => {
  it('flags rows older than the category SLA, ignores fresh ones', () => {
    const rows = [
      { category: 'coordinator_review', severity: 'low', created_at: new Date(NOW - 10 * DAY_MS).toISOString() }, // stale (>7d)
      { category: 'coordinator_review', severity: 'low', created_at: new Date(NOW - 1 * DAY_MS).toISOString() },  // fresh
    ];
    const breaches = computeBreaches(rows, NOW);
    expect(breaches).toEqual([{ category: 'coordinator_review', count: 1, oldestAgeDays: 10 }]);
  });

  it('harness_backlog only counts high/critical severity (escalations)', () => {
    const rows = [
      { category: 'harness_backlog', severity: 'medium', created_at: new Date(NOW - 30 * DAY_MS).toISOString() }, // stale but not escalation-severity
      { category: 'harness_backlog', severity: 'high', created_at: new Date(NOW - 8 * DAY_MS).toISOString() },
    ];
    const breaches = computeBreaches(rows, NOW);
    expect(breaches).toEqual([{ category: 'harness_backlog', count: 1, oldestAgeDays: 8 }]);
  });

  it('reports the oldest age and full count across multiple stale rows in one category', () => {
    const rows = [
      { category: 'adam_adherence_drift', severity: 'high', created_at: new Date(NOW - 8 * DAY_MS).toISOString() },
      { category: 'adam_adherence_drift', severity: 'high', created_at: new Date(NOW - 25 * DAY_MS).toISOString() },
    ];
    const breaches = computeBreaches(rows, NOW);
    expect(breaches).toEqual([{ category: 'adam_adherence_drift', count: 2, oldestAgeDays: 25 }]);
  });

  it('returns an empty array when every category is within SLA (zero orphans -> no noise)', () => {
    const rows = Object.keys(SLA_CATEGORIES).map((category) => ({
      category, severity: 'high', created_at: new Date(NOW - 1 * DAY_MS).toISOString(),
    }));
    expect(computeBreaches(rows, NOW)).toEqual([]);
  });
});

describe('slaKeyFor (pure)', () => {
  it('is stable within the same UTC day and differs across days', () => {
    const a = slaKeyFor('coordinator_review', NOW);
    const b = slaKeyFor('coordinator_review', NOW + 60_000);
    const c = slaKeyFor('coordinator_review', NOW + DAY_MS);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe('coordinator_review:2026-07-04');
  });
});

// planSlaBreaches's fetch now paginates via fetchAllPaginated (FR-6 count-truncation
// discipline), so its chain ends in .order(...).range(from, to); the reminder-existence
// check ends on .limit(). The two paths are distinguished by whether
// .eq('category','feedback_sla_breach') was called.
function fakeSupabase({ feedbackRows = [], existingReminderIds = [] } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      expect(table).toBe('feedback');
      let checkingReminder = false;
      const chain = {
        select: () => chain,
        in: () => chain,
        order: () => chain,
        eq(col, val) {
          if (col === 'category' && val === 'feedback_sla_breach') checkingReminder = true;
          return chain;
        },
        limit: () => Promise.resolve(
          checkingReminder ? { data: existingReminderIds.map((id) => ({ id })) } : { data: feedbackRows, error: null }
        ),
        range: (from, to) => Promise.resolve({ data: feedbackRows.slice(from, to + 1), error: null }),
        then: (resolve, reject) => Promise.resolve({ data: feedbackRows, error: null }).then(resolve, reject),
        insert: (row) => { inserted.push(row); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  };
}

describe('planSlaBreaches (injected fake supabase, no mocking the gate logic itself)', () => {
  it('recomputes fresh from live-shaped rows (primary-state check)', async () => {
    const supabase = fakeSupabase({
      feedbackRows: [{ category: 'coordinator_review', severity: 'low', created_at: new Date(NOW - 10 * DAY_MS).toISOString() }],
    });
    const breaches = await planSlaBreaches(supabase, { nowMs: NOW });
    expect(breaches).toEqual([{ category: 'coordinator_review', count: 1, oldestAgeDays: 10 }]);
  });
});

describe('remindSlaBreaches (rate limit: one reminder per category per day)', () => {
  it('inserts exactly one reminder on the first call for a breaching category', async () => {
    const supabase = fakeSupabase({
      feedbackRows: [{ category: 'coordinator_review', severity: 'low', created_at: new Date(NOW - 10 * DAY_MS).toISOString() }],
      existingReminderIds: [],
    });
    const { breaches, sent } = await remindSlaBreaches(supabase, { nowMs: NOW });
    expect(breaches).toHaveLength(1);
    expect(sent).toEqual(['coordinator_review']);
    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0].metadata.sla_key).toBe('coordinator_review:2026-07-04');
  });

  it('dedup proven on second run: an already-reminded-today category sends nothing more', async () => {
    const supabase = fakeSupabase({
      feedbackRows: [{ category: 'coordinator_review', severity: 'low', created_at: new Date(NOW - 10 * DAY_MS).toISOString() }],
      existingReminderIds: ['existing-reminder-row'],
    });
    const { breaches, sent } = await remindSlaBreaches(supabase, { nowMs: NOW });
    expect(breaches).toHaveLength(1); // dashboard visibility still reports the live breach...
    expect(sent).toEqual([]); // ...but no new reminder row is inserted (rate limit).
    expect(supabase.inserted).toHaveLength(0);
  });
});
