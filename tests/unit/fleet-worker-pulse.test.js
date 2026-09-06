/**
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-6 -- fleet-worker-pulse.mjs self-stamps
 * periodic_process_registry's host_cron:fleet-worker-pulse row so this alarm's own delivered
 * cadence is honestly gauged (previously zero stampLastFired/periodic_process_registry
 * references at all, per PLAN-phase TESTING evidence).
 */
import { describe, it, expect, vi } from 'vitest';

const mockDb = {
  from: () => ({
    select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
  }),
};
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mockDb) }));

const { main, HOST_CRON_PROCESS_KEY } = await import('../../scripts/fleet-worker-pulse.mjs');

describe('fleet-worker-pulse.mjs main() liveness stamp', () => {
  it('calls stampLastFired with HOST_CRON_PROCESS_KEY before the pulse logic', async () => {
    const stampLastFired = vi.fn(async () => ({ stamped: true }));
    process.env.FLEET_PULSE_DRYRUN = '1';
    try {
      await main({ stampLastFired });
    } finally {
      delete process.env.FLEET_PULSE_DRYRUN;
    }
    expect(stampLastFired).toHaveBeenCalledTimes(1);
    expect(stampLastFired.mock.calls[0][1]).toBe(HOST_CRON_PROCESS_KEY);
  });

  it('a stamp failure is non-fatal -- the pulse still runs to completion', async () => {
    const stampLastFired = vi.fn(async () => { throw new Error('boom'); });
    process.env.FLEET_PULSE_DRYRUN = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(main({ stampLastFired })).resolves.toBeUndefined();
    } finally {
      delete process.env.FLEET_PULSE_DRYRUN;
      warnSpy.mockRestore();
    }
    expect(stampLastFired).toHaveBeenCalledTimes(1);
  });

  it('HOST_CRON_PROCESS_KEY is the expected literal', () => {
    expect(HOST_CRON_PROCESS_KEY).toBe('host_cron:fleet-worker-pulse');
  });
});
