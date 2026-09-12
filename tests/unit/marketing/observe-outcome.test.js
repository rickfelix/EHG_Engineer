/**
 * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-1/FR-7: observeOutcome's join +
 * classification. Real two-attempt approval-gated join proof lives in
 * tests/unit/marketing/publisher.test.js (FR-1 root cause, in publisher/index.js
 * itself) — these tests exercise observeOutcome's own classification logic once a
 * ledger/campaign_content row pair already exists.
 */
import { describe, it, expect, vi } from 'vitest';
import { observeOutcome } from '../../../lib/marketing/observer/observe-outcome.js';

function makeSupabase({ ledgerRow, contentRow, ledgerError = null, contentError = null }) {
  return {
    from: vi.fn((table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          if (table === 'venture_channel_publish_ledger') {
            return Promise.resolve({ data: ledgerRow ?? null, error: ledgerError });
          }
          if (table === 'campaign_content') {
            return Promise.resolve({ data: contentRow ?? null, error: contentError });
          }
          return Promise.resolve({ data: null, error: null });
        })
      };
      return chain;
    })
  };
}

const LEDGER_ROW = { id: 'ledger-1', venture_id: 'v-1', channel_type: 'x', correlation_id: 'corr-1' };

describe('observeOutcome', () => {
  it('classifies unmeasurable when no ledger row exists for the correlationId', async () => {
    const supabase = makeSupabase({ ledgerRow: null, contentRow: null });
    const result = await observeOutcome({ supabase, correlationId: 'corr-missing' });
    expect(result.outcome).toBe('unmeasurable');
  });

  it('classifies unmeasurable when no campaign_content row joins (FR-1 join-miss case)', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: null });
    const result = await observeOutcome({ supabase, correlationId: 'corr-1' });
    expect(result.outcome).toBe('unmeasurable');
  });

  it('classifies unmeasurable when external_post_id is null (dry-run, no credentials)', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: null } });
    const result = await observeOutcome({ supabase, correlationId: 'corr-1' });
    expect(result.outcome).toBe('unmeasurable');
  });

  it('classifies unmeasurable on a dry-run-* sentinel external_post_id, never as a real post (TS-5)', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: 'dry-run-1700000000' } });
    const result = await observeOutcome({ supabase, correlationId: 'corr-1' });
    expect(result.outcome).toBe('unmeasurable');
  });

  const resolveCredentialsOk = vi.fn(() => Promise.resolve({ apiKey: 'test-key' }));

  it('classifies shipped_clean when the adapter confirms the post exists (TS-1/TS-4 unmeasurable-count-0 companion)', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: '123' } });
    const adapters = { x: vi.fn(function () { this.getTweet = vi.fn(() => Promise.resolve({ exists: true, transient: false })); }) };
    const result = await observeOutcome({ supabase, correlationId: 'corr-1', adapters, resolveCredentials: resolveCredentialsOk });
    expect(result.outcome).toBe('shipped_clean');
    expect(result.outcomeRef).toBe('123');
  });

  it('classifies reverted when the adapter confirms the post is confirmed absent', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: '123' } });
    const adapters = { x: vi.fn(function () { this.getTweet = vi.fn(() => Promise.resolve({ exists: false, transient: false })); }) };
    const result = await observeOutcome({ supabase, correlationId: 'corr-1', adapters, resolveCredentials: resolveCredentialsOk });
    expect(result.outcome).toBe('reverted');
  });

  // FR-7 (TS-8): the transient branch — the third leg of the "never guess" guarantee.
  it('leaves the outcome unknown (never guesses) on a transient adapter lookup failure', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: '123' } });
    const adapters = { x: vi.fn(function () { this.getTweet = vi.fn(() => Promise.resolve({ exists: null, transient: true })); }) };
    const result = await observeOutcome({ supabase, correlationId: 'corr-1', adapters, resolveCredentials: resolveCredentialsOk });
    expect(result.outcome).toBe('unknown');
  });

  // SECURITY finding SEC-3: the observer must resolve THIS venture's own per-venture
  // credential, never fall through to an adapter's shared/environment-wide fallback —
  // the exact cross-venture identity leak publish() is hardened against.
  it('resolves per-venture credentials via the venture_id on the ledger row, never a shared/global credential', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: '123' } });
    const resolveCredentials = vi.fn(() => Promise.resolve({ apiKey: 'test-key' }));
    const adapters = { x: vi.fn(function () { this.getTweet = vi.fn(() => Promise.resolve({ exists: true, transient: false })); }) };
    await observeOutcome({ supabase, correlationId: 'corr-1', adapters, resolveCredentials });
    expect(resolveCredentials).toHaveBeenCalledWith(expect.objectContaining({ ventureId: 'v-1', channelType: 'x' }));
  });

  it('leaves the outcome unknown (never falls back to a shared identity) when no per-venture credential resolves', async () => {
    const supabase = makeSupabase({ ledgerRow: LEDGER_ROW, contentRow: { platform: 'x', external_post_id: '123' } });
    const resolveCredentials = vi.fn(() => Promise.resolve(null));
    const adapters = { x: vi.fn(() => { throw new Error('adapter must never be constructed without a resolved credential'); }) };
    const result = await observeOutcome({ supabase, correlationId: 'corr-1', adapters, resolveCredentials });
    expect(result.outcome).toBe('unknown');
  });

  it('classifies unmeasurable for a platform with no adapter (FR-9 out-of-scope channel)', async () => {
    const supabase = makeSupabase({ ledgerRow: { ...LEDGER_ROW, channel_type: 'reddit' }, contentRow: { platform: 'reddit', external_post_id: 'abc' } });
    const result = await observeOutcome({ supabase, correlationId: 'corr-1' });
    expect(result.outcome).toBe('unmeasurable');
  });

  it('leaves the outcome unknown on a ledger read error, never guesses', async () => {
    const supabase = makeSupabase({ ledgerError: { message: 'connection failure' } });
    const result = await observeOutcome({ supabase, correlationId: 'corr-1' });
    expect(result.outcome).toBe('unknown');
  });
});
