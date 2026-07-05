/**
 * QF-20260704-390 — the watcher's detect+revive path is proven functional, but nothing
 * durably invoked it (13 days silent, registered-verifier-never-dispatched class). This
 * covers the new self-liveness stamp: a real invocation (--once) always records that the
 * WATCHER itself fired, via periodic_process_registry's self_stamped mechanism, so a future
 * silent death of the WATCHER (not just the scheduler) is also visible.
 */
import { describe, it, expect, vi } from 'vitest';
import { main, WATCHER_SELF_PROCESS_KEY } from '../../scripts/cron/eva-scheduler-watcher.mjs';

function makeSupabase({ heartbeat = { instance_id: 'scheduler-existing', last_poll_at: new Date().toISOString(), status: 'running' } } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: heartbeat, error: null }),
    }),
  };
}

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('WATCHER_SELF_PROCESS_KEY', () => {
  it('is exported and matches the __watcher_self__ naming convention', () => {
    expect(WATCHER_SELF_PROCESS_KEY).toBe('__eva_scheduler_watcher_self__');
  });
});

describe('eva-scheduler-watcher self-liveness stamp', () => {
  it('stamps its own liveness on a real (--once) invocation, BEFORE the scheduler-liveness check', async () => {
    const supabase = makeSupabase();
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const logger = makeLogger();

    const result = await main(['node', 'eva-scheduler-watcher.mjs', '--once'], { supabase, logger, stampLastFired });

    expect(stampLastFired).toHaveBeenCalledWith(supabase, WATCHER_SELF_PROCESS_KEY);
    expect(result.action).toBe('alive'); // scheduler was healthy in this fixture
    expect(result.exitCode).toBe(0);
  });

  it('does NOT stamp on --dry-run (fully read-only contract preserved)', async () => {
    const supabase = makeSupabase();
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });

    await main(['node', 'eva-scheduler-watcher.mjs', '--dry-run'], { supabase, logger: makeLogger(), stampLastFired });

    expect(stampLastFired).not.toHaveBeenCalled();
  });

  it('a failed self-stamp is non-fatal — the watcher still proceeds to its normal liveness check', async () => {
    const supabase = makeSupabase();
    const stampLastFired = vi.fn().mockRejectedValue(new Error('registry unreachable'));
    const logger = makeLogger();

    const result = await main(['node', 'eva-scheduler-watcher.mjs', '--once'], { supabase, logger, stampLastFired });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/self-liveness stamp failed/));
    expect(result.action).toBe('alive');
    expect(result.exitCode).toBe(0);
  });

  it('EVA_SCHEDULER_ENABLED=false suppresses everything, including the self-stamp (disabled means disabled)', async () => {
    const supabase = makeSupabase();
    const stampLastFired = vi.fn();

    const result = await main(['node', 'eva-scheduler-watcher.mjs', '--once'], {
      supabase, logger: makeLogger(), stampLastFired, env: { EVA_SCHEDULER_ENABLED: 'false' },
    });

    expect(stampLastFired).not.toHaveBeenCalled();
    expect(result.action).toBe('disabled');
  });
});
