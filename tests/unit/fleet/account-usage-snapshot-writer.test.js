/**
 * Snapshot writer: shape contract, the security negative, and fail-soft behaviour.
 * SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-4/FR-6).
 *
 * No database is reached. persistReadings constructs no ambient client — a caller must inject one —
 * so a unit test cannot accidentally write to a real project even by omission.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { toSnapshotRow, persistReadings, ALLOWED_STATES, fetchLastKnown, withLastKnown } =
  require_(path.join(REPO, 'lib/fleet/account-usage-snapshot-writer.cjs'));
const { UNAVAILABLE_REASONS } = require_(path.join(REPO, 'lib/fleet/account-usage-reader.cjs'));

const OK_READING = {
  name: 'Some Account', state: 'ok', weeklyPct: 12.5, fiveHourPct: 40,
  weeklyResetsAt: '2026-08-01T00:00:00.000Z', fiveHourResetsAt: '2026-07-28T06:00:00.000Z',
  fetchedAt: '2026-07-28T03:00:00.000Z',
};

/** Minimal client capturing what would be written. */
function captureClient(result = { error: null }) {
  const calls = [];
  return {
    calls,
    from: () => ({ upsert: async (rows, opts) => { calls.push({ rows, opts }); return result; } }),
  };
}

describe('shape contract', () => {
  it('maps an ok reading to a full row', () => {
    const row = toSnapshotRow(OK_READING, 'uuid-abc');
    expect(row.account_name).toBe('Some Account');
    expect(row.state).toBe('ok');
    expect(row.weekly_pct).toBe(12.5);
    expect(row.account_uuid8).toBe('uuid-abc');
    expect(row.fetched_at).toBe('2026-07-28T03:00:00.000Z');
  });

  it('records the SPECIFIC reason, not a collapsed "unavailable"', () => {
    // Collapsing exhausted back to unavailable here would discard the distinction FR-3 exists to
    // create — and unlike a render bug, a lost distinction in HISTORY is unrecoverable.
    const row = toSnapshotRow({
      name: 'A', state: 'unavailable', reason: UNAVAILABLE_REASONS.EXHAUSTED,
      fetchedAt: '2026-07-28T03:00:00.000Z',
    });
    expect(row.state).toBe('exhausted');
    expect(row.state).not.toBe('unavailable');
  });

  it('every reader reason is accepted by the store', () => {
    // If the reader gains a state the CHECK constraint does not know, rows would be silently
    // skipped and the history would quietly stop covering that case.
    for (const reason of Object.values(UNAVAILABLE_REASONS)) {
      expect(ALLOWED_STATES.has(reason), `store rejects reader reason "${reason}"`).toBe(true);
    }
    expect(ALLOWED_STATES.has('ok')).toBe(true);
  });

  it('an unavailable reading stores NULL percentages, never 0', () => {
    // "unknown meters read as 0% used" is the anti-pattern the reader's own header criticises.
    const row = toSnapshotRow({
      name: 'A', state: 'unavailable', reason: 'timeout', fetchedAt: '2026-07-28T03:00:00.000Z',
    });
    expect(row.weekly_pct).toBeNull();
    expect(row.five_hour_pct).toBeNull();
  });

  it('rejects rows it cannot represent rather than writing a partial one', () => {
    expect(toSnapshotRow(null)).toBeNull();
    expect(toSnapshotRow({ name: '', state: 'ok', fetchedAt: OK_READING.fetchedAt })).toBeNull();
    expect(toSnapshotRow({ name: 'A', state: 'ok' })).toBeNull();               // no fetchedAt
    expect(toSnapshotRow({ name: 'A', state: 'unavailable', reason: 'invented', fetchedAt: OK_READING.fetchedAt })).toBeNull();
  });
});

describe('THE SECURITY NEGATIVE — no credential material may reach the row', () => {
  it('a token or email on the reading never appears in the persisted row', () => {
    const contaminated = {
      ...OK_READING,
      email: 'someone@example.invalid',
      accessToken: 'sk-not-a-real-token',
      oauthAccount: { emailAddress: 'someone@example.invalid' },
    };
    const row = toSnapshotRow(contaminated, 'uuid-abc');
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('someone@example.invalid');
    expect(serialized).not.toContain('sk-not-a-real-token');
    // Whitelist, not blacklist: assert the exact key set so a future field cannot slip in.
    expect(Object.keys(row).sort()).toEqual([
      'account_name', 'account_uuid8', 'fetched_at', 'five_hour_pct',
      'five_hour_resets_at', 'state', 'weekly_pct', 'weekly_resets_at',
    ]);
  });

  it('strips control characters from the one free-text column', () => {
    // Written as ESCAPES, never raw bytes: a literal 0x1B/0x00 in a source file makes git classify
    // the whole file as binary, which silently hides it from `git diff` and from review.
    const row = toSnapshotRow({ ...OK_READING, name: 'Bad\x1b[31mName\x00' });
    expect(row.account_name).toBe('Bad[31mName');
  });
});

describe('fail-soft — persistence never breaks the read path', () => {
  it('no injected client writes nothing and reports no error', async () => {
    const res = await persistReadings([OK_READING]);
    expect(res.error).toBeNull();
    expect(res.written).toBe(0);
  });

  it('a missing table (migration not yet applied) is flagged, not thrown', async () => {
    // The migration is chairman-gated, so this is an EXPECTED state until it lands.
    const warn = vi.fn();
    const client = captureClient({ error: { message: 'relation "account_usage_snapshots" does not exist' } });
    const res = await persistReadings([OK_READING], { supabase: client, logger: { warn } });
    expect(res.written).toBe(0);
    expect(res.error).toMatch(/does not exist/);
    expect(JSON.parse(warn.mock.calls[0][0]).pending_migration).toBe(true);
  });

  it('a thrown client error is caught, not propagated', async () => {
    const client = { from: () => ({ upsert: async () => { throw new Error('socket hang up'); } }) };
    await expect(persistReadings([OK_READING], { supabase: client, logger: { warn: vi.fn() } }))
      .resolves.toMatchObject({ written: 0 });
  });

  it('upserts on the natural key so a retried tick is a no-op', async () => {
    const client = captureClient();
    const res = await persistReadings([OK_READING], {
      supabase: client, identities: new Map([['Some Account', 'uuid-abc']]),
    });
    expect(res.written).toBe(1);
    expect(client.calls[0].opts.onConflict).toBe('account_name,fetched_at');
    expect(client.calls[0].rows[0].account_uuid8).toBe('uuid-abc');
  });

  it('unrepresentable readings are skipped without losing the representable ones', async () => {
    const client = captureClient();
    const res = await persistReadings([OK_READING, { name: '' }, null], { supabase: client });
    expect(res.written).toBe(1);
    expect(res.skipped).toBe(2);
  });
});

/**
 * Read-side client that actually HONOURS every filter it is given: eq, in, the not-null `or`,
 * the ordering, AND the row limit.
 *
 * EACH OF THOSE IS THERE BECAUSE ITS ABSENCE HID A REAL DEFECT. A canned-array mock could not see a
 * missing `or` filter (the shadowing bug). A mock whose `limit` ignored its argument could not see
 * a row budget shared across accounts (the crowding bug) — the same blind spot one layer in. A fake
 * that cannot express the failure cannot witness the fix.
 */
function readClient(result) {
  const rows = Array.isArray(result?.data) ? result.data : null;
  const state = { orArg: null, eq: null, in: null };
  const q = {
    state,
    select: () => q,
    eq: (col, val) => { if (col === 'account_name') state.eq = val; return q; },
    in: (col, vals) => { if (col === 'account_name') state.in = vals; return q; },
    or: (expr) => { state.orArg = expr; return q; },
    order: () => q,
    limit: async (n) => {
      if (!rows) return result;                       // error / null-data cases pass straight through
      let out = rows;
      if (state.eq !== null) out = out.filter((r) => r.account_name === state.eq);
      if (state.in !== null) out = out.filter((r) => state.in.includes(r.account_name));
      if (state.orArg && /weekly_pct\.not\.is\.null/.test(state.orArg)) {
        out = out.filter((r) => r.weekly_pct !== null || r.five_hour_pct !== null);
      }
      out = [...out].sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)));
      if (Number.isFinite(n)) out = out.slice(0, n);   // the budget is REAL, or crowding is invisible
      return { data: out, error: null };
    },
  };
  return { from: () => q, q };
}

const STORED = {
  account_name: 'Some Account', weekly_pct: 100, five_hour_pct: 100,
  weekly_resets_at: null, five_hour_resets_at: null,
  state: 'ok', fetched_at: '2026-07-28T02:00:00.000Z',
};

describe('fetchLastKnown — the read side, equally fail-soft', () => {
  it('keeps only the newest row per account', async () => {
    const older = { ...STORED, weekly_pct: 40, fetched_at: '2026-07-28T01:00:00.000Z' };
    const map = await fetchLastKnown(readClient({ data: [STORED, older], error: null }), ['Some Account']);
    expect(map.get('Some Account').weekly_pct).toBe(100);
  });

  it('THE SHADOWING REGRESSION — a newer NULL row must not hide the number', async () => {
    // The route persists the CURRENT reading before reading history back. For an exhausted account
    // that just-written row has NULL percentages and the newest fetched_at, so a plain "newest row
    // per account" lookup returns it and the strip shows "Quota spent" with NO number — FR-6
    // defeated end-to-end by its own write. Reordering the route does not fix it: a second
    // consecutive exhausted tick shadows it again. The filter belongs in the query.
    //
    // The original fixtures both carried percentages, so the production-realistic case was never
    // constructed and the suite passed while the feature did not work.
    const justWritten = { ...STORED, weekly_pct: null, five_hour_pct: null, state: 'exhausted', fetched_at: '2026-07-28T05:00:00.000Z' };
    const theNumber = { ...STORED, weekly_pct: 92, fetched_at: '2026-07-28T04:00:00.000Z' };
    const map = await fetchLastKnown(readClient({ data: [justWritten, theNumber], error: null }), ['Some Account']);
    expect(map.get('Some Account')?.weekly_pct).toBe(92);
  });

  it('THE CROWDING REGRESSION — busy neighbours must not push an account out of the window', async () => {
    // Exhaustion lasts HOURS (the 5-hour and weekly windows are the whole point), but the healthy
    // accounts keep writing a row a minute each. Under a row budget shared across all accounts,
    // ordered fetched_at DESC globally, the exhausted account's last number-bearing row falls out
    // of range after roughly half an hour and the number vanishes again — the original erasure,
    // merely delayed past the point anyone would notice it in a test.
    const noisy = [];
    for (let i = 0; i < 400; i++) {
      const t = new Date(Date.parse('2026-07-28T06:00:00.000Z') + i * 60_000).toISOString();
      noisy.push({ ...STORED, account_name: 'Busy One', weekly_pct: 5, fetched_at: t });
      noisy.push({ ...STORED, account_name: 'Busy Two', weekly_pct: 6, fetched_at: t });
    }
    const staleButReal = { ...STORED, account_name: 'Quiet One', weekly_pct: 97, fetched_at: '2026-07-28T05:00:00.000Z' };
    const map = await fetchLastKnown(readClient({ data: [...noisy, staleButReal], error: null }),
      ['Quiet One', 'Busy One', 'Busy Two']);
    expect(map.get('Quiet One')?.weekly_pct).toBe(97);
  });

  it('a run of consecutive NULL rows still resolves to the last real number', async () => {
    // The multi-tick case: an account stays exhausted for hours, writing a NULL row every tick.
    const nulls = ['06', '07', '08'].map((h) => ({
      ...STORED, weekly_pct: null, five_hour_pct: null, state: 'exhausted',
      fetched_at: `2026-07-28T${h}:00:00.000Z`,
    }));
    const theNumber = { ...STORED, weekly_pct: 92, fetched_at: '2026-07-28T05:00:00.000Z' };
    const map = await fetchLastKnown(readClient({ data: [...nulls, theNumber], error: null }), ['Some Account']);
    expect(map.get('Some Account')?.weekly_pct).toBe(92);
  });

  it('a missing table yields an empty map rather than an error', async () => {
    // Same chairman-gated-migration reasoning as the writer: a strip that went blank because its
    // history store was absent would be worse than the defect being fixed.
    const map = await fetchLastKnown(readClient({ data: null, error: { message: 'does not exist' } }), ['A']);
    expect(map.size).toBe(0);
  });

  it('a thrown client error is swallowed, and no client is a no-op', async () => {
    const boom = { from: () => { throw new Error('socket hang up'); } };
    await expect(fetchLastKnown(boom, ['A'])).resolves.toEqual(new Map());
    await expect(fetchLastKnown(null, ['A'])).resolves.toEqual(new Map());
  });
});

describe('withLastKnown — history is ADDED, never substituted', () => {
  const EXHAUSTED = { name: 'Some Account', state: 'unavailable', reason: 'exhausted', fetchedAt: 'x' };
  const known = new Map([['Some Account', STORED]]);

  it('attaches the retained value under separate keys', () => {
    const [r] = withLastKnown([EXHAUSTED], known);
    expect(r.lastKnownWeeklyPct).toBe(100);
    expect(r.lastKnownAt).toBe('2026-07-28T02:00:00.000Z');
  });

  it('THE LOAD-BEARING NEGATIVE — the live state is never overwritten by the stored one', () => {
    // If a stored reading replaced the live state, a stale number would be indistinguishable from a
    // current one — which is the exact failure FR-6 exists to end, not to relocate.
    const [r] = withLastKnown([EXHAUSTED], known);
    expect(r.state).toBe('unavailable');
    expect(r.reason).toBe('exhausted');
    expect(r.weeklyPct).toBeUndefined();
  });

  it('a live reading is left untouched — a current number always wins', () => {
    const live = { name: 'Some Account', state: 'ok', weeklyPct: 12, fetchedAt: 'x' };
    expect(withLastKnown([live], known)[0]).toBe(live);
  });

  it('a stored row with no percentages adds nothing', () => {
    // History that is itself an "unavailable" carries no information worth showing.
    const empty = new Map([['Some Account', { ...STORED, weekly_pct: null, five_hour_pct: null }]]);
    expect(withLastKnown([EXHAUSTED], empty)[0].lastKnownWeeklyPct).toBeUndefined();
  });

  it('an empty history map returns the readings unchanged', () => {
    const readings = [EXHAUSTED];
    expect(withLastKnown(readings, new Map())).toBe(readings);
  });
});
