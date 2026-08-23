/**
 * QF-20260822-955 — standalone owed-row SMS dispatch tick, piggybacked on every worker
 * check-in. Fail-soft/bounded is the whole contract: this must NEVER throw and must
 * NEVER hang checkin beyond its own timeout, regardless of what reconcileOutboundSms does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tickSmsOutboundSweep, TICK_TIMEOUT_MS } = require('../../../lib/checkin/sms-outbound-tick.cjs');

let silent;

describe('tickSmsOutboundSweep', () => {
  beforeEach(() => {
    silent = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  });

  it('returns the reconcile summary on a normal run', async () => {
    const reconcile = vi.fn().mockResolvedValue({ ran: true, claimed: 1, sent: 1 });
    const out = await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    expect(out).toEqual({ ran: true, claimed: 1, sent: 1 });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith({}, {});
  });

  it('passes through a no-op-shaped pass when the table is absent (ran:false)', async () => {
    const reconcile = vi.fn().mockResolvedValue({ ran: false, reason: 'table_absent' });
    const out = await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    expect(out).toEqual({ ran: false, reason: 'table_absent' });
  });

  it('never throws when reconcile rejects', async () => {
    const reconcile = vi.fn().mockRejectedValue(new Error('boom'));
    const out = await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    expect(out).toBeNull();
    expect(silent.warn).toHaveBeenCalled();
  });

  it('resolves to null (not a hang) when reconcile never settles, bounded by TICK_TIMEOUT_MS', async () => {
    const reconcile = vi.fn(() => new Promise(() => {})); // never resolves
    const start = Date.now();
    const out = await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    const elapsed = Date.now() - start;
    expect(out).toBeNull();
    expect(elapsed).toBeLessThan(TICK_TIMEOUT_MS + 2000);
  }, TICK_TIMEOUT_MS + 5000);

  it('defaults logger to console without throwing', async () => {
    const reconcile = vi.fn().mockResolvedValue({ ran: false, reason: 'table_absent' });
    await expect(tickSmsOutboundSweep({ supabase: {}, reconcile })).resolves.not.toThrow();
  });

  it('does not log when ran:false (only logs on a real reconcile pass)', async () => {
    const reconcile = vi.fn().mockResolvedValue({ ran: false, reason: 'table_absent' });
    await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    expect(silent.log).not.toHaveBeenCalled();
  });

  it('logs a summary line when ran:true', async () => {
    const reconcile = vi.fn().mockResolvedValue({ ran: true, claimed: 1, sent: 1 });
    await tickSmsOutboundSweep({ supabase: {}, logger: silent, reconcile });
    expect(silent.log).toHaveBeenCalled();
  });
});
