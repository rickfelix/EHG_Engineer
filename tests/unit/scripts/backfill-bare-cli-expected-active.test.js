/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-4) -- scripts/backfill-bare-cli-expected-active.mjs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { activeBareRows: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      const chain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        update: () => chain,
        then: (resolve) => resolve({ data: state.activeBareRows, error: null }),
      };
      return chain;
    },
  }),
}));

const { run, GENUINELY_BARE_PROCESS_KEYS } = await import('../../../scripts/backfill-bare-cli-expected-active.mjs');

describe('backfill-bare-cli-expected-active', () => {
  it('the genuinely-bare list is exactly the 5 confirmed rows -- the 4 with a real GHA invoker are deliberately excluded', () => {
    expect(GENUINELY_BARE_PROCESS_KEYS).toEqual([
      'cron_script:cascade-status.mjs',
      'cron_script:cascade-watcher.mjs',
      'cron_script:leo-build-starter.mjs',
      'cron_script:quality-findings-aggregator.mjs',
      'cron_script:review-self-tune.js',
    ]);
    // Explicitly NOT included -- these have a real GHA cron invoker (FR-4 acceptance criteria:
    // rows confirmed to have a real invoker must be left as-is, not misclassified).
    for (const excluded of [
      'cron_script:chairman-decision-sla-sweep.mjs',
      'cron_script:eva-scheduler-watcher.mjs',
      'cron_script:fr-c-generator.mjs',
      'cron_script:venture-ops-actuals-sweep.mjs',
    ]) {
      expect(GENUINELY_BARE_PROCESS_KEYS).not.toContain(excluded);
    }
  });

  beforeEach(() => {
    state.activeBareRows = GENUINELY_BARE_PROCESS_KEYS.map((process_key) => ({ process_key, currently_expected_active: true }));
  });

  it('dry run reports matched rows without updating', async () => {
    const result = await run({ apply: false });
    expect(result.matched).toBe(5);
    expect(result.updated).toBe(0);
  });

  it('nothing to do once all 5 are already currently_expected_active=false', async () => {
    state.activeBareRows = [];
    const result = await run({ apply: false });
    expect(result).toEqual({ matched: 0, updated: 0 });
  });
});
