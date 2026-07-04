/**
 * SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001 FR-5/FR-6.
 */
import { describe, it, expect, vi } from 'vitest';
import { runCanary, checkFreshnessAndAlert } from '../../../scripts/chairman-email-canary.mjs';

function makeFakeHealthDb(initialRow = {}) {
  let row = { ...initialRow };
  const updates = [];
  return {
    getRow: () => row,
    updates,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: (patch) => { updates.push(patch); row = { ...row, ...patch }; return Promise.resolve({ error: null }); },
    }),
  };
}

describe('runCanary (FR-5): verified delivery stamps last_canary_verified_at', () => {
  it('a real provider-accepted send stamps last_canary_verified_at', async () => {
    const now = new Date('2026-07-04T14:00:00Z');
    const supabase = makeFakeHealthDb();
    const send = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'canary-msg-1' });

    const { verified } = await runCanary({ supabase, send, now });

    expect(verified).toBe(true);
    expect(supabase.getRow().last_canary_verified_at).toBe(now.toISOString());
  });

  it('a suppressed canary (quiet-window edge) is NOT verified -- never stamps', async () => {
    const supabase = makeFakeHealthDb();
    const send = vi.fn().mockResolvedValue({ success: true, suppressed: true, errorCode: 'SUPPRESSED_QUIET_WINDOW' });

    const { verified } = await runCanary({ supabase, send, now: new Date() });

    expect(verified).toBe(false);
    expect(supabase.getRow().last_canary_verified_at).toBeUndefined();
  });

  it('a failed canary send is not verified (the general recorder hook handles the failure signal separately)', async () => {
    const supabase = makeFakeHealthDb();
    const send = vi.fn().mockResolvedValue({ success: false, errorCode: 'HTTP_500' });

    const { verified } = await runCanary({ supabase, send, now: new Date() });

    expect(verified).toBe(false);
  });
});

describe('checkFreshnessAndAlert (FR-6): missed-run absence detection reuses the real alarm path', () => {
  it('a stale (never-verified) canary raises the alarm via the same path as a real send failure', async () => {
    const now = new Date('2026-07-04T14:00:00Z');
    const supabase = makeFakeHealthDb({ consecutive_failures: 1, alarm_state: 'clear' });
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });

    const { stale, alarmResult } = await checkFreshnessAndAlert({ supabase, notifyChairman, now });

    expect(stale).toBe(true);
    expect(alarmResult.notified).toBe(true); // 2nd consecutive "failure" (1 real + this synthetic one) raises
    expect(supabase.getRow().last_error_class).toBe('CANARY_STALE');
  });

  it('a fresh canary does not touch the alarm path at all', async () => {
    const now = new Date('2026-07-04T14:00:00Z');
    const supabase = makeFakeHealthDb({ last_canary_verified_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString() });
    const notifyChairman = vi.fn();

    const { stale, alarmResult } = await checkFreshnessAndAlert({ supabase, notifyChairman, now });

    expect(stale).toBe(false);
    expect(alarmResult).toBeNull();
    expect(notifyChairman).not.toHaveBeenCalled();
  });
});
