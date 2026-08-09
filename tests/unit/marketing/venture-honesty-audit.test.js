/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-8 — the honesty audit.
 *
 * The two properties worth testing are the two that are easy to get wrong:
 *   1. NO_DATA and BLOCKED must never render the same. One is a product problem, the other an
 *      instrumentation problem, and they call for opposite responses.
 *   2. An UNREADABLE store must not render as "nothing wrong". A clean audit and a blind one
 *      produce the same silence, and only one of them is safe.
 */
import { describe, it, expect } from 'vitest';
import { AUDIT_STATUS, buildHonestyAudit, renderHonestyAudit } from '../../../lib/marketing/venture-honesty-audit.js';

const VENTURE = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

function fakeSupabase({ verdicts = [], verdictError = null, consents = [], consentError = null, ledger = [], ledgerError = null }) {
  const table = (rows, error, ordered = true) => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: async () => ({ data: error ? null : rows, error }),
      then: (res, rej) => Promise.resolve({ data: error ? null : rows, error }).then(res, rej),
    };
    void ordered;
    return b;
  };
  return {
    from(t) {
      if (t === 'venture_demand_verdicts') return table(verdicts, verdictError);
      if (t === 'venture_consent_events') return table(consents, consentError);
      if (t === 'venture_channel_publish_ledger') return table(ledger, ledgerError);
      throw new Error(`unexpected table ${t}`);
    },
  };
}

const verdictRow = (verdict, over = {}) => ({
  verdict,
  citation: `stored citation for ${verdict}`,
  path_to_pass: `stored path for ${verdict}`,
  rungs: { paid: { rung: 'paid', state: 'UNMEASURABLE', reason: 'no resolved livemode payment for this venture' } },
  computed_at: '2026-08-09T00:00:00Z',
  ...over,
});

describe('FR-8: NO_DATA and BLOCKED are never merged', () => {
  it('reports BLOCKED as a measured shortfall', async () => {
    const a = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('BLOCKED')] }), ventureId: VENTURE });
    expect(a.activation.status).toBe(AUDIT_STATUS.BLOCKED);
    expect(a.activation.meaning).toMatch(/product problem/);
  });

  it('reports NO_DATA as an instrumentation problem, with different words', async () => {
    const a = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('NO_DATA')] }), ventureId: VENTURE });
    expect(a.activation.status).toBe(AUDIT_STATUS.NO_DATA);
    expect(a.activation.meaning).toMatch(/instrumentation problem/);
  });

  it('renders the two statuses with DIFFERENT text — the anti-red-light control', async () => {
    const blocked = renderHonestyAudit(await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('BLOCKED')] }), ventureId: VENTURE }));
    const noData = renderHonestyAudit(await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('NO_DATA')] }), ventureId: VENTURE }));
    expect(blocked).not.toBe(noData);
    expect(blocked).toContain('ACTIVATION: BLOCKED');
    expect(noData).toContain('ACTIVATION: NO_DATA');
  });

  it('reports PASS distinctly too — the accept case', async () => {
    const a = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('PASS')] }), ventureId: VENTURE });
    expect(a.activation.status).toBe(AUDIT_STATUS.PASS);
  });
});

describe('FR-8: the reason is READ, not recomputed', () => {
  it('surfaces the STORED citation and path_to_pass verbatim', async () => {
    const a = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('NO_DATA')] }), ventureId: VENTURE });
    expect(a.activation.reason).toBe('stored citation for NO_DATA');
    expect(a.activation.path_to_pass).toBe('stored path for NO_DATA');
  });

  it('surfaces per-rung unmeasurable reasons from the stored rungs payload', async () => {
    const a = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [verdictRow('NO_DATA')] }), ventureId: VENTURE });
    expect(a.activation.unmeasurable_rungs).toHaveLength(1);
    expect(a.activation.unmeasurable_rungs[0].reason).toMatch(/no resolved livemode payment/);
  });
});

describe('FR-8: blindness is reported, never rendered as health', () => {
  it('an unreadable verdict store is VERDICT_UNREADABLE and lands in gaps', async () => {
    const a = await buildHonestyAudit({
      supabase: fakeSupabase({ verdictError: { message: "Could not find the table 'public.venture_demand_verdicts'" } }),
      ventureId: VENTURE,
    });
    expect(a.activation.status).toBe(AUDIT_STATUS.VERDICT_UNREADABLE);
    expect(a.gaps.join(' ')).toMatch(/verdict store unreadable/);
    // and it must NOT be mistaken for a clean result
    expect(a.activation.status).not.toBe(AUDIT_STATUS.PASS);
    expect(a.activation.status).not.toBe(AUDIT_STATUS.NO_DATA);
  });

  it('a venture with no verdict ever recorded is distinguished from one measured as NO_DATA', async () => {
    const never = await buildHonestyAudit({ supabase: fakeSupabase({ verdicts: [] }), ventureId: VENTURE });
    expect(never.activation.status).toBe(AUDIT_STATUS.NO_VERDICT_RECORDED);
    expect(never.activation.status).not.toBe(AUDIT_STATUS.NO_DATA);
  });

  it('ALWAYS declares the un-persisted blocked-send gap, even on a fully healthy read', async () => {
    const a = await buildHonestyAudit({
      supabase: fakeSupabase({ verdicts: [verdictRow('PASS')], consents: [], ledger: [] }),
      ventureId: VENTURE,
    });
    expect(a.gaps.join(' ')).toMatch(/blocked-send records are NOT persisted/);
    expect(renderHonestyAudit(a)).toMatch(/GAPS THIS AUDIT CANNOT CLOSE/);
  });
});

describe('FR-8: consent counts use latest-event-wins, the same rule the send path uses', () => {
  it('counts a recipient as suppressed when their newest event is an opt_out', async () => {
    const a = await buildHonestyAudit({
      supabase: fakeSupabase({
        verdicts: [verdictRow('NO_DATA')],
        // newest-first, as the real .order('occurred_at', {ascending:false}) returns
        consents: [
          { recipient_email: 'a@x.co', event_type: 'opt_out', occurred_at: '2026-08-05T00:00:00Z' },
          { recipient_email: 'a@x.co', event_type: 'opt_in', occurred_at: '2026-08-01T00:00:00Z' },
          { recipient_email: 'b@x.co', event_type: 'opt_in', occurred_at: '2026-08-02T00:00:00Z' },
        ],
      }),
      ventureId: VENTURE,
    });
    expect(a.consent.recipients_known).toBe(2);
    expect(a.consent.currently_suppressed).toBe(1);
    expect(a.consent.currently_permitted).toBe(1);
    expect(a.consent.total_events).toBe(3);
  });
});
