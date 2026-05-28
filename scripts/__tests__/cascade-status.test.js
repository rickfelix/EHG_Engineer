/**
 * Cascade Status CLI — unit tests for scripts/cron/cascade-status.mjs
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-C
 * Covers PRD test scenario TS-10 + edge cases per PLAN TESTING agent.
 */
import { describe, it, expect } from 'vitest';
import { ageHuman, gatherStatus, renderStatus, deriveExitCode } from '../cron/cascade-status.mjs';

const NOW = new Date('2026-05-27T22:00:00Z');

function makeSupabase({ heartbeat = null, errors = [], successCount24h = 0 } = {}) {
  function chain(table) {
    const handlers = {
      cascade_watcher_heartbeats: () => {
        if (chainState.head && chainState.count === 'exact') {
          return Promise.resolve({ data: null, error: null, count: successCount24h });
        }
        return Promise.resolve({ data: heartbeat, error: null });
      },
      eva_cascade_errors: () => Promise.resolve({ data: errors, error: null }),
    };
    const chainState = { count: null, head: false };
    const builder = {
      select(_cols, opts) {
        if (opts?.count) chainState.count = opts.count;
        if (opts?.head) chainState.head = true;
        return builder;
      },
      order() { return builder; },
      limit() { return builder; },
      eq() { return builder; },
      not() { return builder; },
      gte() { return builder; },
      is() { return builder; },
      maybeSingle() { return handlers[table](); },
      then(resolve, reject) { return handlers[table]().then(resolve, reject); },
    };
    return builder;
  }
  return { from: chain };
}

describe('ageHuman', () => {
  it('formats seconds', () => expect(ageHuman(5000)).toBe('5s'));
  it('formats minutes+seconds', () => expect(ageHuman(125_000)).toBe('2m 5s'));
  it('formats hours+minutes', () => expect(ageHuman(3_900_000)).toBe('1h 5m'));
});

describe('deriveExitCode', () => {
  it('returns 0 on fresh heartbeat + zero errors', () => {
    expect(deriveExitCode({ heartbeatStale: false, errors: [] })).toBe(0);
  });
  it('returns 1 when heartbeat stale', () => {
    expect(deriveExitCode({ heartbeatStale: true, errors: [] })).toBe(1);
  });
  it('returns 1 when unresolved errors present', () => {
    expect(deriveExitCode({ heartbeatStale: false, errors: [{ stage: 'vision_to_archplan' }] })).toBe(1);
  });
});

describe('gatherStatus', () => {
  it('TS-10: heartbeat 30s ago + 2 successes + 1 unresolved error → exitCode 1', async () => {
    const heartbeat = {
      run_id: 'aaaa-bbbb',
      started_at: new Date(NOW.getTime() - 30_000).toISOString(),
      finished_at: new Date(NOW.getTime() - 25_000).toISOString(),
      exit_code: 0,
      refusal_count: 1,
      success_count: 2,
      hostname: 'test-host',
    };
    const errors = [
      { vision_id: '11111111-2222-3333-4444-555555555555', stage: 'vision_to_archplan', error_code: 'ARCH_SECTION_NOT_FOUND', error_message: 'No section', remediation_command: 'node scripts/eva/archplan-command.mjs upsert --plan-key ...', created_at: NOW.toISOString(), updated_at: NOW.toISOString() },
    ];
    const supabase = makeSupabase({ heartbeat, errors, successCount24h: 2 });
    const status = await gatherStatus(supabase, { now: NOW });
    expect(status.heartbeat?.run_id).toBe('aaaa-bbbb');
    expect(status.heartbeatStale).toBe(false);
    expect(status.errors.length).toBe(1);
    expect(status.errorsByStage.vision_to_archplan).toBe(1);
    expect(status.success24h).toBe(2);
    expect(deriveExitCode(status)).toBe(1);
  });

  it('healthy state: recent heartbeat + zero errors → exitCode 0', async () => {
    const heartbeat = {
      run_id: 'cccc-dddd',
      started_at: new Date(NOW.getTime() - 60_000).toISOString(),
      finished_at: new Date(NOW.getTime() - 55_000).toISOString(),
      exit_code: 0,
      refusal_count: 0,
      success_count: 0,
      hostname: 'h',
    };
    const supabase = makeSupabase({ heartbeat, errors: [], successCount24h: 5 });
    const status = await gatherStatus(supabase, { now: NOW });
    expect(status.heartbeatStale).toBe(false);
    expect(status.errors.length).toBe(0);
    expect(deriveExitCode(status)).toBe(0);
  });

  it('empty state (fresh tables): no heartbeat → exitCode 1', async () => {
    const supabase = makeSupabase({ heartbeat: null, errors: [], successCount24h: 0 });
    const status = await gatherStatus(supabase, { now: NOW });
    expect(status.heartbeat).toBeNull();
    expect(status.heartbeatStale).toBe(true);
    expect(deriveExitCode(status)).toBe(1);
  });

  it('TS-14: abandoned heartbeat (finished_at null, age > 5min)', async () => {
    const heartbeat = {
      run_id: 'eeee-ffff',
      started_at: new Date(NOW.getTime() - 600_000).toISOString(),
      finished_at: null,
      exit_code: null,
      refusal_count: 0,
      success_count: 0,
      hostname: 'h',
    };
    const supabase = makeSupabase({ heartbeat, errors: [], successCount24h: 0 });
    const status = await gatherStatus(supabase, { now: NOW });
    expect(status.abandoned).toBe(true);
    expect(status.heartbeatStale).toBe(true);
    expect(deriveExitCode(status)).toBe(1);
  });
});

describe('renderStatus', () => {
  it('includes "ABANDONED" flag when finished_at is null + stale', () => {
    const status = {
      heartbeat: { run_id: 'x', started_at: NOW.toISOString(), finished_at: null, exit_code: null, refusal_count: 0, success_count: 0, hostname: 'h' },
      heartbeatAgeMs: 1_000_000,
      heartbeatStale: true,
      abandoned: true,
      errors: [],
      errorsByStage: {},
      success24h: 0,
    };
    const out = renderStatus(status);
    expect(out).toMatch(/ABANDONED/);
  });

  it('NONE renders when heartbeat is null', () => {
    const status = { heartbeat: null, heartbeatAgeMs: null, heartbeatStale: true, abandoned: false, errors: [], errorsByStage: {}, success24h: 0 };
    const out = renderStatus(status);
    expect(out).toMatch(/Last heartbeat: NONE/);
  });

  it('truncates long error lists with +N more', () => {
    const errors = Array.from({ length: 25 }, (_, i) => ({
      vision_id: `vision-${i}-aaaa-bbbb-cccc-dddddddddddd`,
      stage: 'vision_to_archplan',
      error_code: 'CODE',
      remediation_command: 'cmd',
    }));
    const status = { heartbeat: null, heartbeatAgeMs: null, heartbeatStale: true, abandoned: false, errors, errorsByStage: { vision_to_archplan: 25 }, success24h: 0 };
    const out = renderStatus(status);
    expect(out).toMatch(/\+5 more/);
  });
});
