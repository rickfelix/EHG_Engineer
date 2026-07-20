/**
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 — venture ops-actuals sweep (TS-1/TS-5).
 *
 * Pins: --dry-run performs zero writes, all three jobs run per venture with a live
 * deployment, per-job error isolation (one job's failure doesn't block the others),
 * and the NC-7 zero-rows escalation log when a non-empty venture set writes nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { main, parseArgs, SD_KEY, ACTIVATION_TRIGGER } from '../../../scripts/cron/venture-ops-actuals-sweep.mjs';

const VENTURES = [
  { id: 'v1', deployment_url: 'https://marketlens.example' },
  { id: 'v2', deployment_url: 'https://crongenius.example' },
];

/** Minimal fake supabase covering the sweep's own reads (ventures, periodic_process_registry). */
function makeSupabase({ ventures = VENTURES } = {}) {
  return {
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; },
          not() { return this; },
          neq() { return this; },
          // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: production now
          // paginates via fetchAllPaginated, which appends .order()/.range() after the
          // filter chain — extend the mock with a chainable .order() and a .range() that
          // resolves the (short, loop-ending) page.
          order() { return this; },
          range: async () => ({ data: ventures, error: null }),
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
      }
      if (table === 'periodic_process_registry') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { process_key: 'existing' }, error: null }),
          upsert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('venture-ops-actuals-sweep main()', () => {
  it('static wiring: SD_KEY and ACTIVATION_TRIGGER are exported for the workflow-wiring pin', () => {
    expect(SD_KEY).toBe('SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001');
    expect(ACTIVATION_TRIGGER).toBe('.github/workflows/venture-ops-actuals-cron.yml');
  });

  it('--dry-run performs zero collector/probe/stamp calls', async () => {
    const collectProductHealth = vi.fn();
    const collectRevenueMetrics = vi.fn();
    const runVentureUptimeProbe = vi.fn();
    const stampLastFired = vi.fn();

    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.action).toBe('dry_run');
    expect(collectProductHealth).not.toHaveBeenCalled();
    expect(collectRevenueMetrics).not.toHaveBeenCalled();
    expect(runVentureUptimeProbe).not.toHaveBeenCalled();
    expect(stampLastFired).not.toHaveBeenCalled();
  });

  it('runs all three jobs once per live-deployment venture and stamps liveness for each', async () => {
    const collectProductHealth = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(collectProductHealth).toHaveBeenCalledTimes(2);
    expect(collectRevenueMetrics).toHaveBeenCalledTimes(2);
    expect(runVentureUptimeProbe).toHaveBeenCalledTimes(1);
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): a 4th whole-tick stamp
    // ('cron_script:venture-ops-actuals-sweep.mjs') was added before the per-job stamps, distinct
    // from the three per-job ARMED-machinery keys asserted below.
    expect(stampLastFired).toHaveBeenCalledTimes(4);
    expect(stampLastFired.mock.calls.some(([, key]) => key === 'cron_script:venture-ops-actuals-sweep.mjs')).toBe(true);
    expect(result.summary.jobs['ops-product-health-collector'].written).toBe(2);
    expect(result.summary.jobs['ops-revenue-metrics-collector'].written).toBe(2);
    expect(result.exitCode).toBe(0);
  });

  it('isolates a single failing venture: one collector error does not stop the others', async () => {
    const collectProductHealth = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ venture_id: 'v2' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['ops-product-health-collector'].written).toBe(1);
    expect(result.summary.jobs['ops-product-health-collector'].errors).toHaveLength(1);
    expect(result.exitCode).toBe(1); // errors present -> non-zero exit for cron visibility
    // the other two jobs still ran fully despite job 1's per-venture error
    expect(collectRevenueMetrics).toHaveBeenCalledTimes(2);
    expect(runVentureUptimeProbe).toHaveBeenCalledTimes(1);
  });

  it('logs an NC-7 escalation when a non-empty venture set writes zero rows', async () => {
    const errorLog = vi.fn();
    const collectProductHealth = vi.fn().mockResolvedValue(null); // simulates storeProductHealth's null-on-error return
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('NC-7 ESCALATION'));
  });

  it('logs an NC-7 escalation for the uptime-probe job too when it checks 0 deployments (adversarial-review fix: parity with jobs 1/2)', async () => {
    const errorLog = vi.fn();
    const collectProductHealth = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    // Simulates ensureDeploymentRows failing to seed every venture (e.g. RLS/permissions
    // drift) — pre-fix, this returned checked=0/errors=[] and passed silently.
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ ventures_seedable: 2, checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: ['v1: seed insert failed', 'v2: seed insert failed'] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/NC-7 ESCALATION.*venture-uptime-probe/));
    expect(result.exitCode).toBe(1); // the folded seed errors also flip anyErrors
  });
});
