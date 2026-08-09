/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-2) -- unit coverage for
 * lib/periodic-liveness/stamp-last-fired.js's stampFromGithubActionsRun(), the sibling function
 * added to fix TESTING sub-agent pre-EXEC FINDING-A (stampLastFired() hard-filters
 * liveness_source='self_stamped' and would silently no-op against gha_cron:* rows).
 */
import { describe, it, expect, vi } from 'vitest';
import { stampLastFired, stampFromGithubActionsRun } from '../../../lib/periodic-liveness/stamp-last-fired.js';

function fakeSupabase({ matchedRows, filterSpy }) {
  return {
    from: () => ({
      update: (payload) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            select: () => {
              filterSpy?.({ payload, col1, val1, col2, val2 });
              return Promise.resolve({ data: val2 === 'github_actions_api' || val2 === 'self_stamped' ? matchedRows : [], error: null });
            },
          }),
        }),
      }),
    }),
  };
}

describe('stampFromGithubActionsRun', () => {
  it('filters on liveness_source=github_actions_api, NOT self_stamped (FINDING-A fix)', async () => {
    const calls = [];
    const supabase = fakeSupabase({ matchedRows: [{ process_key: 'gha_cron:foo.yml' }], filterSpy: (c) => calls.push(c) });
    const result = await stampFromGithubActionsRun(supabase, 'gha_cron:foo.yml', '2026-07-10T00:00:00Z');
    expect(result).toEqual({ stamped: true });
    expect(calls[0].col2).toBe('liveness_source');
    expect(calls[0].val2).toBe('github_actions_api');
    expect(calls[0].payload.last_fired_at).toBe('2026-07-10T00:00:00Z');
  });

  it('is a no-op with a reason when the process_key is not registered as github_actions_api', async () => {
    const supabase = fakeSupabase({ matchedRows: [] });
    const result = await stampFromGithubActionsRun(supabase, 'gha_cron:unregistered.yml', '2026-07-10T00:00:00Z');
    expect(result).toEqual({ stamped: false, reason: 'not_registered_as_github_actions_api' });
  });

  it('requires both processKey and ranAtIso', async () => {
    const supabase = fakeSupabase({ matchedRows: [] });
    await expect(stampFromGithubActionsRun(supabase, '', '2026-07-10T00:00:00Z')).rejects.toThrow(/requires a processKey/);
    await expect(stampFromGithubActionsRun(supabase, 'gha_cron:foo.yml', '')).rejects.toThrow(/requires ranAtIso/);
  });

  it('stampLastFired (existing self_stamped helper) is unaffected by the new sibling function', async () => {
    const calls = [];
    const supabase = fakeSupabase({ matchedRows: [{ process_key: 'standard_loop:sweep' }], filterSpy: (c) => calls.push(c) });
    const result = await stampLastFired(supabase, 'standard_loop:sweep');
    expect(result).toEqual({ stamped: true });
    expect(calls[0].val2).toBe('self_stamped');
  });
});

// ── QF-20260727-131: the stamp clears its own stale OVERDUE ──────────────────────────────
//
// last_state has ONE writer (periodic-liveness-watcher.mjs) on a GHA cron declared */15 that
// GitHub delivers at a MEASURED median of 83m. The thresholds it renders are 6/15/30/45m, so the
// refresh is coarser than the thresholds and a recovered process keeps displaying OVERDUE for
// longer than the outage lasted — measured live at 4h50m on standard_loop:inbox while the
// watcher's own evaluateRow() returned OK for that same row. The recovery is already observed
// synchronously by the stamp; these tests pin that we now USE it.
//
// The assertions are on the FILTERS, not on a returned flag alone: the whole point of the design
// is that each guard is declarative so the write cannot disagree with evaluateRow. A test that
// only checked "did it clear?" would pass against a version that cleared unconditionally, which
// is the false-OK this must never introduce.
// The two UPDATEs must be answerable INDEPENDENTLY. My first version of this mock returned one
// canned result for both, so configuring "the clear finds nothing" also made the STAMP find
// nothing — three tests failed for a reason that had nothing to do with the code under test. A
// harness that cannot distinguish the call it is describing tests the wrong thing.
function chainableSupabase({ stampRegistered = true, rows = [], failWith = null, throwOn = false } = {}) {
  const filters = [];
  const calls = [];
  const builder = {
    eq: (col, val) => { filters.push(['eq', col, val]); return builder; },
    gt: (col, val) => { filters.push(['gt', col, val]); return builder; },
    select: () => {
      const isStamp = calls.length === 1; // the stamp is the first update; the clear is the second
      if (isStamp) {
        return Promise.resolve({ data: stampRegistered ? [{ process_key: 'stamped' }] : [], error: null });
      }
      if (throwOn) throw new Error('boom');
      return Promise.resolve(failWith ? { data: null, error: { message: failWith } } : { data: rows, error: null });
    },
  };
  return {
    calls,
    filters,
    from: () => ({
      update: (payload) => { calls.push(payload); return builder; },
    }),
  };
}

describe('QF-20260727-131 — stampLastFired clears a stale OVERDUE at the moment of proof-of-life', () => {
  it('clears OVERDUE and reports it, applying every guard as a filter', async () => {
    const sb = chainableSupabase({ rows: [{ process_key: 'standard_loop:identity' }] });
    const r = await stampLastFired(sb, 'standard_loop:identity');

    expect(r.stamped).toBe(true);
    expect(r.cleared_overdue).toBe(true);

    // The clear is the SECOND update; the first is the stamp itself.
    expect(sb.calls).toHaveLength(2);
    expect(sb.calls[1]).toMatchObject({ last_state: 'OK' });
    expect(sb.calls[1].last_state_changed_at).toBeTruthy();

    const f = sb.filters;
    // TRANSITION-ONLY — without this a row already OK is rewritten every stamp, destroying the
    // per-episode dedup that last_state_changed_at exists to enforce.
    expect(f).toContainEqual(['eq', 'last_state', 'OVERDUE']);
    // AGREES WITH evaluateRow AT THE BOUNDARY. Measured false otherwise: interval=0 or a NULL
    // grace_multiplier yields threshold 0 and a FRESH stamp still evaluates OVERDUE; an inactive
    // row evaluates INTENTIONALLY_DOWN, not OK.
    expect(f).toContainEqual(['eq', 'currently_expected_active', true]);
    expect(f).toContainEqual(['gt', 'expected_interval_seconds', 0]);
    expect(f).toContainEqual(['gt', 'grace_multiplier', 0]);
    // Never widens beyond the class this helper owns.
    expect(f).toContainEqual(['eq', 'liveness_source', 'self_stamped']);
  });

  it('reports NO clear when the row was not OVERDUE — silence is the correct answer', async () => {
    // The filtered UPDATE matches zero rows. That is not an error and must not read as one, and
    // it must not read as a repair either.
    const sb = chainableSupabase({ rows: [] });
    const r = await stampLastFired(sb, 'standard_loop:identity');
    expect(r.stamped).toBe(true);
    expect(r.cleared_overdue).toBeUndefined();
  });

  it('FAIL-SOFT: a failed clear never costs the caller its stamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sb = chainableSupabase({ failWith: 'permission denied' });
    const r = await stampLastFired(sb, 'standard_loop:identity');
    // The stamp is the durable signal; a process that cannot clear its banner must still be
    // recorded as having run.
    expect(r.stamped).toBe(true);
    expect(r.cleared_overdue).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('clearing its stale OVERDUE failed'))).toBe(true);
    warn.mockRestore();
  });

  it('FAIL-SOFT: a THROWN clear also never costs the stamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sb = chainableSupabase({ throwOn: true });
    const r = await stampLastFired(sb, 'standard_loop:identity');
    expect(r.stamped).toBe(true);
    warn.mockRestore();
  });

  it('an UNREGISTERED key never reaches the clear at all', async () => {
    // No stamp, no proof of life, so nothing to clear — the early return must short-circuit.
    const sb = chainableSupabase({ stampRegistered: false });
    // stampLastFired's own no-op path returns before the clear; only ONE update is attempted.
    const r = await stampLastFired(sb, 'not-registered');
    expect(r.stamped).toBe(false);
    expect(sb.calls).toHaveLength(1);
  });
});
