/**
 * Unit tests for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C's fix to lib/quality/snooze-manager.js.
 *
 * Prior behavior threw on every call: snoozeFeedback wrote snoozed_at/snoozed_by/snooze_reason
 * (columns that do not exist on public.feedback) and status='snoozed'; unsnoozeFeedback()/
 * wakeExpiredSnoozes() wrote status='open' — neither value is in feedback_status_check's allowed
 * enum. Fix: snoozing is now a pure, orthogonal add-on using only snoozed_until (existing column)
 * and metadata.snooze (existing JSONB column) — status is never read or written by this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows = new Map();

function makeQueryBuilder(table) {
  const state = { op: null, payload: null, filters: [] };
  const builder = {
    select: () => builder,
    update: (payload) => { state.op = 'update'; state.payload = payload; return builder; },
    eq: (col, val) => { state.filters.push(['eq', col, val]); return builder; },
    lt: (col, val) => { state.filters.push(['lt', col, val]); return builder; },
    in: (col, vals) => { state.filters.push(['in', col, vals]); return builder; },
    order: () => builder,
    single: () => finish().then((r) => ({ ...r, data: (r.data && r.data[0]) || null })),
    then: (res, rej) => finish().then(res, rej),
  };
  function matches(row) {
    return state.filters.every(([kind, col, val]) => {
      if (kind === 'eq') {
        if (col === 'metadata->snooze->>active') return String((row.metadata?.snooze?.active) ?? '') === val;
        if (col === 'metadata->snooze->>snoozed_by') return (row.metadata?.snooze?.snoozed_by ?? null) === val;
        return row[col] === val;
      }
      if (kind === 'lt') return row[col] != null && row[col] < val;
      if (kind === 'in') return vals_includes(col, val, row);
      return true;
    });
  }
  function vals_includes(col, vals, row) { return vals.includes(row[col]); }
  async function finish() {
    const all = [...rows.values()].filter((r) => r._table === table);
    if (state.op === 'update') {
      const targets = all.filter(matches);
      for (const t of targets) Object.assign(t, state.payload);
      return { data: targets.map((t) => ({ ...t })), error: null };
    }
    return { data: all.filter(matches).map((r) => ({ ...r })), error: null };
  }
  return builder;
}

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: (table) => makeQueryBuilder(table) }),
}));

vi.mock('../../../lib/db/fetch-all-paginated.mjs', () => ({
  fetchAllPaginated: async (buildQuery) => {
    const { data, error } = await buildQuery();
    if (error) throw new Error(error.message);
    return data;
  },
}));

const {
  snoozeFeedback, unsnoozeFeedback, resnooze, wakeExpiredSnoozes, getSnoozedItems,
} = await import('../../../lib/quality/snooze-manager.js');

function seed(id, extra = {}) {
  const row = { _table: 'feedback', id, status: 'new', snoozed_until: null, metadata: {}, ...extra };
  rows.set(id, row);
  return row;
}

beforeEach(() => { rows.clear(); });

describe('snoozeFeedback', () => {
  it('sets snoozed_until + metadata.snooze marker, never touches status', async () => {
    seed('r1', { status: 'triaged', metadata: { unrelated: 'keep-me' } });
    const result = await snoozeFeedback('r1', '1d', { userId: 'u1', reason: 'busy week' });
    const stored = rows.get('r1');

    expect(stored.status).toBe('triaged'); // UNCHANGED
    expect(stored.snoozed_until).not.toBeNull();
    expect(stored.metadata.snooze.active).toBe(true);
    expect(stored.metadata.snooze.snoozed_by).toBe('u1');
    expect(stored.metadata.snooze.snooze_reason).toBe('busy week');
    expect(stored.metadata.unrelated).toBe('keep-me'); // TR-2: survives the merge

    expect(result.snoozeInfo.snoozedUntil).toBeInstanceOf(Date); // FR-3
    expect(result.snoozed_by).toBe('u1'); // FR-3 back-compat projection
    expect(result.snooze_reason).toBe('busy week');
  });
});

describe('unsnoozeFeedback', () => {
  it('clears snoozed_until, marks inactive, status stays untouched throughout', async () => {
    seed('r2', { status: 'in_progress', snoozed_until: new Date(Date.now() + 60_000).toISOString(), metadata: { snooze: { active: true, snoozed_by: 'u2' }, unrelated: 'x' } });
    const result = await unsnoozeFeedback('r2');
    const stored = rows.get('r2');

    expect(stored.status).toBe('in_progress'); // never was 'open'
    expect(stored.snoozed_until).toBeNull();
    expect(stored.metadata.snooze.active).toBe(false);
    expect(stored.metadata.unrelated).toBe('x');
    expect(result.snoozed_by).toBe('u2'); // historical record of who last snoozed it survives unsnooze
  });
});

describe('resnooze', () => {
  it('extends an active snooze without any clobber risk (status was never touched to begin with)', async () => {
    seed('r3', { status: 'backlog', snoozed_until: new Date(Date.now() + 1000).toISOString(), metadata: { snooze: { active: true, snoozed_by: 'u3' } } });
    await resnooze('r3', '1w', { userId: 'u3' });
    const stored = rows.get('r3');
    expect(stored.status).toBe('backlog');
    expect(stored.metadata.snooze.active).toBe(true);
  });
});

describe('wakeExpiredSnoozes', () => {
  it('bulk-clears snoozed_until for expired snooze-manager rows in one batched call, ignoring an assist-engine-shaped row', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    seed('expired1', { status: 'new', snoozed_until: past, metadata: { snooze: { active: true } } });
    seed('expired2', { status: 'triaged', snoozed_until: past, metadata: { snooze: { active: true } } });
    // assist-engine.js's independent this_week/next_week shape: status=backlog+snoozed_until, NO metadata.snooze marker.
    seed('assist1', { status: 'backlog', snoozed_until: past, metadata: {} });

    const result = await wakeExpiredSnoozes();

    expect(result.woken).toBe(2);
    expect(rows.get('expired1').snoozed_until).toBeNull();
    expect(rows.get('expired2').snoozed_until).toBeNull();
    expect(rows.get('expired1').status).toBe('new'); // untouched, nothing to restore
    expect(rows.get('expired2').status).toBe('triaged');
    // The assist-engine row is NEVER touched by this mechanism.
    expect(rows.get('assist1').snoozed_until).toBe(past);
  });

  it('returns woken=0 when nothing is expired', async () => {
    seed('future1', { snoozed_until: new Date(Date.now() + 60_000).toISOString(), metadata: { snooze: { active: true } } });
    const result = await wakeExpiredSnoozes();
    expect(result.woken).toBe(0);
  });
});

describe('getSnoozedItems', () => {
  it('returns only actively-snoozed snooze-manager rows, excluding an assist-engine-shaped row', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    seed('active1', { status: 'new', snoozed_until: future, metadata: { snooze: { active: true, snoozed_by: 'u1', snooze_reason: 'r1' } } });
    seed('assist1', { status: 'backlog', snoozed_until: future, metadata: {} });
    seed('inactive1', { status: 'new', snoozed_until: null, metadata: { snooze: { active: false } } });

    const items = await getSnoozedItems();
    expect(items.map((i) => i.id)).toEqual(['active1']);
    expect(items[0].snoozed_by).toBe('u1'); // back-compat projection (FR-3)
    expect(items[0].snooze_reason).toBe('r1');
    expect(items[0].isExpired).toBe(false);
  });

  it('filters by userId via the metadata path, not a real snoozed_by column', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    seed('mine', { snoozed_until: future, metadata: { snooze: { active: true, snoozed_by: 'u1' } } });
    seed('theirs', { snoozed_until: future, metadata: { snooze: { active: true, snoozed_by: 'u2' } } });

    const items = await getSnoozedItems({ userId: 'u1' });
    expect(items.map((i) => i.id)).toEqual(['mine']);
  });
});
