/**
 * QF-20260720-287 — reconcileOutboundSms's claim+send pass (Pass 2) references
 * prior_provider_message_ids in three places: the owed-row select, the atomic claim
 * UPDATE's own RETURNING select, and the terminal 'sent' UPDATE payload. That column is
 * chairman-gated STAGED (database/migrations/20260718_sms_outbound_obligations_STAGED.sql,
 * Solomon Pin #2) and was never actually applied live, though the base table + every other
 * column WAS. A missing column fails the WHOLE query it appears in (Postgres error 42703),
 * not per-column — live-verified: claimed:0/sent:0 on every real owed row, fleet-wide,
 * masked only by the direct-Twilio workaround. This models that exact failure mode with a
 * minimal fake Supabase (no live DB, no live Twilio) and asserts the retry-without-column
 * path restores claim+send end to end.
 */
import { describe, it, expect } from 'vitest';
import { reconcileOutboundSms } from '../../../lib/chairman/sms-outbound-worker.js';

function makeFakeSupabaseMissingPriorSidColumn(seedRow) {
  const table = { rows: [seedRow] };

  function columnsRequested(cols) {
    return String(cols || '').split(',').map((c) => c.trim());
  }

  function from(name) {
    if (name !== 'sms_outbound_obligations') {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; },
        order() { return this; }, limit() { return this; },
        then(resolve) { resolve({ data: [], error: null }); },
      };
    }
    const ctx = { mode: 'select', filters: [], selectCols: null, vals: null };
    const api = {
      select(cols) { ctx.selectCols = cols; return api; },
      update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      is(col, val) { ctx.filters.push((r) => (r[col] ?? null) === val); return api; },
      in(col, vals) { ctx.filters.push((r) => vals.includes(r[col])); return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve) {
        const requestsMissingColumn = ctx.selectCols && columnsRequested(ctx.selectCols).includes('prior_provider_message_ids');
        if (ctx.mode === 'update') {
          // The terminal 'sent' write has no trailing .select() (ctx.selectCols stays null) —
          // its own missing-column exposure is via ctx.vals carrying the key directly.
          const writesMissingColumn = ctx.vals && Object.prototype.hasOwnProperty.call(ctx.vals, 'prior_provider_message_ids');
          if (requestsMissingColumn || writesMissingColumn) {
            resolve({ data: null, error: { code: '42703', message: 'column sms_outbound_obligations.prior_provider_message_ids does not exist' } });
            return;
          }
          const matched = table.rows.filter((r) => ctx.filters.every((f) => f(r)));
          matched.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: ctx.selectCols ? matched.map((r) => ({ ...r })) : null, error: null });
          return;
        }
        if (requestsMissingColumn) {
          resolve({ data: null, error: { code: '42703', message: 'column sms_outbound_obligations.prior_provider_message_ids does not exist' } });
          return;
        }
        resolve({ data: table.rows.filter((r) => ctx.filters.every((f) => f(r))).map((r) => ({ ...r })), error: null });
      },
    };
    return api;
  }

  return { from };
}

describe('reconcileOutboundSms — retries without prior_provider_message_ids on 42703 (QF-20260720-287)', () => {
  it('claims and sends a genuinely eligible owed row despite the missing column throughout', async () => {
    const seedRow = {
      id: 'ob-repro', recipient_phone: '+15550001234', body: 'test', kind: 'heartbeat',
      decision_id: null, dedupe_key: 'qf-287-test', status: 'owed', provider_message_id: null,
      attempts: 0, not_before: null, claimed_at: null, claimed_by: null,
      created_at: new Date().toISOString(), sent_at: null, delivered_at: null, last_error: null, media_url: null,
    };
    const supabase = makeFakeSupabaseMissingPriorSidColumn(seedRow);

    let sendCalled = false;
    const stubProvider = {
      send: async () => { sendCalled = true; return { provider_message_id: 'STUB-SID', status: 'queued' }; },
      checkMessageStatus: async () => ({ status: 'queued' }),
    };

    const summary = await reconcileOutboundSms(supabase, { provider: stubProvider });

    expect(sendCalled).toBe(true);
    expect(summary.claimed).toBe(1);
    expect(summary.sent).toBe(1);
    expect(seedRow.status).toBe('sent');
    expect(seedRow.provider_message_id).toBe('STUB-SID');
  });
});
