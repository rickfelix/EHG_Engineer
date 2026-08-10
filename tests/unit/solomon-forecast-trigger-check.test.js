/**
 * QF-20260720-111 — account-aware weekly budget-line epoch.
 *
 * The Monday-anchored cron (solomon-duty-triggers-cron.yml) misaligned with the real
 * per-account weekly resets (DeepSoul Thu ~3:59AM ET, rickfelix2000 Fri ~6:59AM ET).
 * runWeeklyReminder() now resolves the currently-active account and names it in the
 * reminder, so a rotation away from the cron's assumed account (Thursday) surfaces as
 * a visible mismatch instead of silent drift.
 *
 * insertCoordinationRow (lib/coordinator/dispatch.cjs) runs several real-DB assertion
 * helpers before inserting — injected via the sendRow seam so these tests exercise only
 * runWeeklyReminder's own logic (account resolution + reminder shaping), not dispatch's
 * validation chain.
 */
import { describe, it, expect, vi } from 'vitest';
import { runWeeklyReminder, runDailyTriggers, scopeExclusionsFromSeriesQuery, KNOWN_RESET_DAYS } from '../../scripts/solomon-forecast-trigger-check.mjs';

function makeMockSupabase({ existingUnread = false } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              limit: async () => ({ data: existingUnread ? [{ id: 'prior' }] : [] }),
            }),
          }),
        }),
      }),
    }),
  };
}

const NOW = Date.parse('2026-07-23T08:20:00Z'); // a Thursday

describe('runWeeklyReminder — account-aware epoch naming', () => {
  it('names a KNOWN account + its reset day in the subject/body', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const resolveIdentity = () => ({ email: 'deepsoulsessionslabel@gmail.com', orgName: 'x', accountUuid8: 'ca1de6e4' });
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('deepsoulsessionslabel@gmail.com');
    expect(row.subject).toContain(KNOWN_RESET_DAYS['deepsoulsessionslabel@gmail.com']);
    expect(row.payload.body).toContain('deepsoulsessionslabel@gmail.com');
  });

  it('flags an UNKNOWN account (e.g. codestreetlabs) rather than silently asserting a reset day', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const resolveIdentity = () => ({ email: 'codestreetlabs@example.com', orgName: 'x', accountUuid8: 'deadbeef' });
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('codestreetlabs@example.com');
    expect(row.subject).toContain('NOT in KNOWN_RESET_DAYS');
  });

  it('never throws when account identity is unresolved (null) — labels it explicitly instead', async () => {
    const sb = makeMockSupabase();
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity: () => null, sendRow });
    expect(res.status).toBe('SENT');
    const row = sendRow.mock.calls[0][1];
    expect(row.subject).toContain('identity unresolved');
  });

  it('dedupes per ISO week regardless of which day it actually fires on (no send on an unread pending reminder)', async () => {
    const sb = makeMockSupabase({ existingUnread: true });
    const sendRow = vi.fn(async () => ({ id: 'row-1' }));
    const res = await runWeeklyReminder(sb, { nowMs: NOW, resolveIdentity: () => null, sendRow });
    expect(res.status).toBe('pending-reminder');
    expect(sendRow).not.toHaveBeenCalled();
  });
});

/**
 * QF-20260809-138 — same-series-by-construction scope counting.
 *
 * The live open-scope count must derive from the basis row's OWN metadata.scope_series_query
 * (canonical: status NOT IN (completed,cancelled)), never the hardcoded narrow OPEN_STATUSES —
 * comparing a narrow numerator (35 on 2026-08-09) to a canonical baseline (59) false-fired daily.
 * The mock RECORDS which filter method the code chose (.not vs .in) so these tests observe the
 * series-selection predicate itself, not a pre-filtered fixture.
 */
function makeDailyMock({ basisMeta, completed7d = 0, openCount = 0 }) {
  const calls = { scopeFilter: null, scopeArgs: null };
  return {
    calls,
    from: (table) => {
      if (table === 'feedback') {
        return { select: () => ({ eq: () => ({ order: () => ({
          limit: async () => ({ data: [{ created_at: '2026-08-10T12:16:15Z', metadata: basisMeta }] }),
        }) }) }) };
      }
      // strategic_directives_v2: completed7d awaits at .gte; openScope awaits at .in or .not
      return {
        select: () => ({
          eq: () => ({ gte: async () => ({ count: completed7d }) }),
          in: async (col, list) => { calls.scopeFilter = 'in'; calls.scopeArgs = list; return { count: openCount }; },
          not: async (col, op, val) => { calls.scopeFilter = 'not'; calls.scopeArgs = val; return { count: openCount }; },
        }),
      };
    },
  };
}

describe('scopeExclusionsFromSeriesQuery — basis series parsing', () => {
  it('parses the canonical v17+ query into an exclusion list', () => {
    expect(scopeExclusionsFromSeriesQuery('strategic_directives_v2 count where status NOT IN (completed,cancelled)'))
      .toEqual(['completed', 'cancelled']);
  });

  it('handles quoting/spacing/case drift', () => {
    expect(scopeExclusionsFromSeriesQuery("... status not in ( 'completed' , \"cancelled\" )"))
      .toEqual(['completed', 'cancelled']);
  });

  it('returns null for an absent field (pre-v17 basis -> narrow fallback)', () => {
    expect(scopeExclusionsFromSeriesQuery(undefined)).toBeNull();
    expect(scopeExclusionsFromSeriesQuery('')).toBeNull();
  });

  it('returns undefined for a present-but-unparseable query (-> scope comparison skipped)', () => {
    expect(scopeExclusionsFromSeriesQuery('count everything open, trust me')).toBeUndefined();
    expect(scopeExclusionsFromSeriesQuery('status NOT IN ()')).toBeUndefined();
  });
});

describe('runDailyTriggers — same-series scope counting (QF-20260809-138)', () => {
  const BASIS = { velocity_per_day: 12, open_scope_count: 49 };

  it('counts the live scope via the basis-embedded NOT IN series when the query is present', async () => {
    const sb = makeDailyMock({
      basisMeta: { ...BASIS, scope_series_query: 'strategic_directives_v2 count where status NOT IN (completed,cancelled)' },
      completed7d: 84, // 12/day: velocity clean
      openCount: 50,   // within 10% of 49: scope clean
    });
    const res = await runDailyTriggers(sb, { nowMs: Date.parse('2026-08-10T13:00:00Z') });
    expect(res.status).toBe('clean');
    expect(res.scopeSeries).toBe('basis_canonical');
    expect(sb.calls.scopeFilter).toBe('not');
    expect(sb.calls.scopeArgs).toBe('(completed,cancelled)');
  });

  it('def-site repro 2026-08-09: a canonical 59 vs basis 49 fires on the SAME series (no narrow 35 false read)', async () => {
    const sb = makeDailyMock({
      basisMeta: { ...BASIS, scope_series_query: 'strategic_directives_v2 count where status NOT IN (completed,cancelled)' },
      completed7d: 84,
      openCount: 59, // +20.4% canonical — the REAL fire the narrow series nearly ate
    });
    // sendOnce will consult session_coordination; give the mock that lane too
    sb.from = ((orig) => (table) => table === 'session_coordination'
      ? { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ limit: async () => ({ data: [{ id: 'unread' }] }) }) }) }) }) }
      : orig(table))(sb.from);
    const res = await runDailyTriggers(sb, { nowMs: Date.parse('2026-08-10T13:00:00Z') });
    expect(res.status).toBe('FIRED');
    expect(res.fired.join(' ')).toContain('scope 49 -> 59 (basis_canonical)');
  });

  it('falls back to the narrow OPEN_STATUSES only for a pre-v17 basis lacking the query', async () => {
    const sb = makeDailyMock({ basisMeta: { ...BASIS }, completed7d: 84, openCount: 49 });
    const res = await runDailyTriggers(sb, { nowMs: Date.parse('2026-08-10T13:00:00Z') });
    expect(res.status).toBe('clean');
    expect(res.scopeSeries).toBe('narrow_fallback_pre_v17');
    expect(sb.calls.scopeFilter).toBe('in');
    expect(sb.calls.scopeArgs).toEqual(['draft', 'in_progress', 'active', 'pending_approval']);
  });

  it('SKIPS the scope comparison (never cross-series-compares) when the query is present but unparseable', async () => {
    const sb = makeDailyMock({
      basisMeta: { ...BASIS, scope_series_query: 'a prose sentence with no exclusion clause' },
      completed7d: 84,
    });
    const res = await runDailyTriggers(sb, { nowMs: Date.parse('2026-08-10T13:00:00Z') });
    expect(res.status).toBe('clean');
    expect(res.scopeSeries).toBe('unparseable_query_scope_skipped');
    expect(res.openScope).toBeNull();
    expect(sb.calls.scopeFilter).toBeNull(); // neither series was counted
  });
});
