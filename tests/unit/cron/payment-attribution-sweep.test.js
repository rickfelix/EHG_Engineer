/**
 * SD-LEO-INFRA-VENTURE-REVENUE-ATTRIBUTION-ARM-001 (FR-3) — payment-attribution sweep.
 *
 * Pins: --dry-run performs zero registration/resolve/stamp calls, a successful cycle
 * registers (only if not already registered) + resolves + stamps liveness, a resolver
 * error is NEVER masked as a fired cycle (liveness stamp is skipped, non-zero exit),
 * and a liveness-stamp failure is non-fatal (mirrors the sibling ops-actuals sweep).
 */
import { describe, it, expect, vi } from 'vitest';
import { main, parseArgs, ensureArmedRegistration, SD_KEY, ACTIVATION_TRIGGER } from '../../../scripts/cron/payment-attribution-sweep.mjs';

function makeSupabase({ alreadyRegistered = false } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    _upsert: upsert,
    from(table) {
      if (table === 'periodic_process_registry') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => (alreadyRegistered
            ? { data: { process_key: 'g3-armed-existing' }, error: null }
            : { data: null, error: null }),
          upsert,
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
  return supabase;
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('payment-attribution-sweep static wiring', () => {
  it('exports SD_KEY and ACTIVATION_TRIGGER matching the cron workflow', () => {
    expect(SD_KEY).toBe('SD-LEO-INFRA-VENTURE-REVENUE-ATTRIBUTION-ARM-001');
    expect(ACTIVATION_TRIGGER).toBe('.github/workflows/payment-attribution-cron.yml');
  });
});

describe('payment-attribution-sweep main()', () => {
  it('--dry-run performs zero registration/resolve/stamp calls', async () => {
    const resolveUnattributedEvents = vi.fn();
    const stampLastFired = vi.fn();
    const supabase = makeSupabase();

    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase, resolveUnattributedEvents, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.action).toBe('dry_run');
    expect(result.exitCode).toBe(0);
    expect(supabase._upsert).not.toHaveBeenCalled();
    expect(resolveUnattributedEvents).not.toHaveBeenCalled();
    expect(stampLastFired).not.toHaveBeenCalled();
  });

  it('a successful cycle registers (not yet registered), resolves, and stamps liveness', async () => {
    const resolveUnattributedEvents = vi.fn().mockResolvedValue({ processed: 3, resolved: 2, unattributed: 1 });
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const supabase = makeSupabase({ alreadyRegistered: false });

    const result = await main(['node', 's', '--once'], {
      supabase, resolveUnattributedEvents, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(supabase._upsert).toHaveBeenCalledTimes(1);
    expect(resolveUnattributedEvents).toHaveBeenCalledWith(supabase, { limit: 500 });
    expect(stampLastFired).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('swept');
    expect(result.summary.resolved).toBe(2);
    expect(result.summary.unattributed).toBe(1);
  });

  it('skips re-registration when a registry row already exists (never wipes last_fired_at)', async () => {
    const resolveUnattributedEvents = vi.fn().mockResolvedValue({ processed: 0, resolved: 0, unattributed: 0 });
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const supabase = makeSupabase({ alreadyRegistered: true });

    await main(['node', 's', '--once'], {
      supabase, resolveUnattributedEvents, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(supabase._upsert).not.toHaveBeenCalled();
  });

  it('a resolver error is never masked as a fired cycle — liveness stamp is skipped, exit is non-zero', async () => {
    const resolveUnattributedEvents = vi.fn().mockRejectedValue(new Error('db unreachable'));
    const stampLastFired = vi.fn();
    const supabase = makeSupabase();

    const result = await main(['node', 's', '--once'], {
      supabase, resolveUnattributedEvents, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(stampLastFired).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.action).toBe('resolver_error');
  });

  it('a liveness-stamp failure is non-fatal — the cycle still reports success', async () => {
    const resolveUnattributedEvents = vi.fn().mockResolvedValue({ processed: 0, resolved: 0, unattributed: 0 });
    const stampLastFired = vi.fn().mockRejectedValue(new Error('not registered'));
    const supabase = makeSupabase();

    const result = await main(['node', 's', '--once'], {
      supabase, resolveUnattributedEvents, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('swept');
  });
});

describe('ensureArmedRegistration', () => {
  it('registers exactly once for an unregistered process_key', async () => {
    const supabase = makeSupabase({ alreadyRegistered: false });
    const processKey = await ensureArmedRegistration(supabase, { log() {}, warn() {}, error() {} });
    expect(processKey).toBe('g3-armed-sd-leo-infra-venture-revenue-attribution-arm-001');
    expect(supabase._upsert).toHaveBeenCalledTimes(1);
  });
});
