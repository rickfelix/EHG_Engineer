/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D (FR-4, TS-6) — reconcileOutboundSms media_url
 * threading, end-to-end.
 *
 * TESTING sub-agent finding (PLAN-TO-EXEC): the existing fake-Supabase double in
 * tests/unit/chairman/sms-outbound-reconcile.test.js ignores the .select(cols) column
 * projection entirely (select(_cols) discards the argument), so it always returns the full
 * row regardless of what was actually selected -- a test built on that fake would FALSE-PASS
 * even if EXEC forgot to add media_url to the real load-bearing select (line ~238, the
 * claim-update RETURNING that `c` in provider.send() is destructured from). This test uses a
 * PROJECTION-HONORING fake instead: select(cols) actually strips the row down to only the
 * requested columns, so a missing media_url in either select() call surfaces as
 * c.media_url === undefined and fails the assertion below -- closing the exact gap TESTING
 * found rather than just checking the column exists somewhere.
 */
import { describe, it, expect, vi } from 'vitest';
import { reconcileOutboundSms } from '../../../lib/chairman/sms-outbound-worker.js';

function projectRow(row, cols) {
  const wanted = cols.split(',').map((c) => c.trim());
  const out = {};
  for (const c of wanted) out[c] = row[c];
  return out;
}

function makeProjectionHonoringSupabase(seedRow) {
  const table = [{ ...seedRow }];
  function from(_tableName) {
    const ctx = { filters: [], cols: null, mode: 'select', vals: null };
    const api = {
      select(cols) { ctx.cols = cols; return api; },
      update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      is(col, val) { ctx.filters.push((r) => (r[col] ?? null) === val); return api; },
      in(col, vals) { ctx.filters.push((r) => vals.includes(r[col])); return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve) {
        let rows = table.filter((r) => ctx.filters.every((f) => f(r)));
        if (ctx.mode === 'update') {
          rows.forEach((r) => Object.assign(r, ctx.vals));
        }
        const projected = ctx.cols ? rows.map((r) => projectRow(r, ctx.cols)) : rows.map((r) => ({ ...r }));
        resolve({ data: projected, error: null });
        return Promise.resolve();
      },
    };
    return api;
  }
  return { from };
}

describe('reconcileOutboundSms media_url end-to-end (FR-4, TS-6)', () => {
  it('provider.send() receives the populated mediaUrl for an owed row carrying media_url', async () => {
    const seedRow = {
      id: 'ob-1', recipient_phone: '+15551234567', kind: 'morning_review', decision_id: null,
      body: 'Gantt attached', dedupe_key: null, status: 'owed', provider_message_id: null,
      attempts: 0, not_before: null, claimed_at: null, claimed_by: null,
      created_at: new Date().toISOString(), sent_at: null, delivered_at: null, last_error: null,
      media_url: 'https://signed.example/gantt.png',
    };
    const supabase = makeProjectionHonoringSupabase(seedRow);
    const provider = { send: vi.fn(async () => ({ provider_message_id: 'SM-1', status: 'queued' })) };

    const summary = await reconcileOutboundSms(supabase, {
      provider,
      statusCallbackUrl: 'https://example.com/cb',
      // Force the liveness probe (a plain select().limit()) to resolve truthy via the fake.
    });

    expect(summary.sent).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send.mock.calls[0][0].mediaUrl).toBe('https://signed.example/gantt.png');
  });

  it('provider.send() receives mediaUrl=null for a text-only owed row (backward compatible)', async () => {
    const seedRow = {
      id: 'ob-2', recipient_phone: '+15551234567', kind: 'decision_question', decision_id: null,
      body: 'Approve?', dedupe_key: null, status: 'owed', provider_message_id: null,
      attempts: 0, not_before: null, claimed_at: null, claimed_by: null,
      created_at: new Date().toISOString(), sent_at: null, delivered_at: null, last_error: null,
      media_url: null,
    };
    const supabase = makeProjectionHonoringSupabase(seedRow);
    const provider = { send: vi.fn(async () => ({ provider_message_id: 'SM-2', status: 'queued' })) };

    await reconcileOutboundSms(supabase, { provider, statusCallbackUrl: 'https://example.com/cb' });

    expect(provider.send.mock.calls[0][0].mediaUrl).toBeNull();
  });
});

describe('static pin: media_url present in both reconcileOutboundSms select() calls (FR-4)', () => {
  it('the owed-query select and the claim-update-returning select both include media_url', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('lib/chairman/sms-outbound-worker.js', 'utf8');
    const owedSelectMatch = src.match(/select\('id, recipient_phone, body, attempts, decision_id, not_before[^']*'\)/);
    const claimSelectMatch = src.match(/select\('id, recipient_phone, body, attempts[^']*'\)/g);
    expect(owedSelectMatch?.[0]).toMatch(/media_url/);
    // claimSelectMatch[0] is the owed-query variant (superset match); the LAST match is the
    // claim-update-returning select, which is what `c` in provider.send() is sourced from.
    expect(claimSelectMatch?.at(-1)).toMatch(/media_url/);
    expect(src).toMatch(/mediaUrl:\s*c\.media_url/);
  });
});
