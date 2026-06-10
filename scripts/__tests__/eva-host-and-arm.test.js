/**
 * Unit tests for SD-LEO-INFRA-REVIVE-EVA-HOST-AND-ARM-001 (host the daemon + arm the watcher).
 *
 * Covers the four code deliverables, hermetically (no real DB, schtasks, or process exit):
 *   FR-1  setup-eva-watcher-task builders (wrapper .cmd, schtasks/remove/query argv)
 *   FR-2  watcher gracefulExit (sets exitCode, never throws) + static source-pin (no dangerous
 *         synchronous process.exit on main()'s resolution path)
 *   FR-3  observeOnly gate in _runDueJobs (jobs logged + cadence-stamped, handler NOT run)
 *   FR-4  parseHeartbeatCadenceState (pure, fail-open) + _rehydrateCadenceState (seeds maps,
 *         runs BEFORE the first heartbeat write)
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { EvaMasterScheduler, parseHeartbeatCadenceState } from '../../lib/eva/eva-master-scheduler.js';
import {
  buildWrapperScript,
  buildSchtasksArgs,
  buildRemoveArgs,
  buildQueryArgs,
  parseArgs as parseTaskArgs,
  TASK_NAME,
  TASK_ENV,
  NPM_COMMAND,
} from '../setup-eva-watcher-task.mjs';
import { gracefulExit } from '../cron/eva-scheduler-watcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Minimal chainable heartbeat mock supporting select().eq().maybeSingle() and upsert(). */
function makeSupabase({ heartbeatRow = null, error = null } = {}) {
  const calls = { upserts: 0, reads: 0, inserts: 0 };
  const api = {
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        maybeSingle() { calls.reads++; return Promise.resolve({ data: heartbeatRow, error }); },
        single() { calls.reads++; return Promise.resolve({ data: heartbeatRow, error }); },
        upsert() { calls.upserts++; return Promise.resolve({ data: null, error: null }); },
        insert() { calls.inserts++; return Promise.resolve({ data: null, error: null }); },
        then(resolve) { return resolve({ data: null, error: null }); },
      };
      return b;
    },
    rpc() { return Promise.resolve({ data: [], error: null }); },
  };
  return { api, calls };
}

const silentLogger = { log() {}, warn() {}, error() {} };

// ── FR-4: parseHeartbeatCadenceState (pure, fail-open) ──────────────────────────

describe('FR-4 parseHeartbeatCadenceState', () => {
  it('returns empty maps for null/missing metadata (cold-start behavior)', () => {
    for (const input of [null, undefined, {}, { foo: 1 }]) {
      const r = parseHeartbeatCadenceState(input);
      expect(r.lastRoundRun.size).toBe(0);
      expect(r.jobLastRunAt.size).toBe(0);
    }
  });

  it('seeds epoch maps from populated metadata', () => {
    const r = parseHeartbeatCadenceState({
      last_round_runs: { friday_meeting: 1717000000000, gap_analysis: 1716000000000 },
      job_last_runs: { 'okr-monthly-generate': 1715000000000 },
    });
    expect(r.lastRoundRun.get('friday_meeting')).toBe(1717000000000);
    expect(r.lastRoundRun.get('gap_analysis')).toBe(1716000000000);
    expect(r.jobLastRunAt.get('okr-monthly-generate')).toBe(1715000000000);
  });

  it('drops non-numeric, non-positive, and non-string-keyed entries (defensive)', () => {
    const r = parseHeartbeatCadenceState({
      last_round_runs: { good: 100, bad: 'NaN', zero: 0, neg: -5, nul: null },
      job_last_runs: { ok: 200 },
    });
    expect([...r.lastRoundRun.keys()]).toEqual(['good']);
    expect(r.jobLastRunAt.get('ok')).toBe(200);
  });

  it('is fail-open on garbled (non-object) shapes — never throws', () => {
    for (const bad of [{ last_round_runs: 'oops', job_last_runs: [1, 2] }, 'string', 42, [1, 2, 3]]) {
      const r = parseHeartbeatCadenceState(bad);
      expect(r.lastRoundRun.size).toBe(0);
      expect(r.jobLastRunAt.size).toBe(0);
    }
  });
});

// ── FR-4: _rehydrateCadenceState (DB-backed, ordering) ──────────────────────────

describe('FR-4 _rehydrateCadenceState', () => {
  it('seeds in-memory maps from the persisted heartbeat metadata', async () => {
    const { api } = makeSupabase({
      heartbeatRow: { metadata: { last_round_runs: { friday_meeting: 1717000000000 }, job_last_runs: { 'okr-monthly-generate': 1715000000000 } } },
    });
    const s = new EvaMasterScheduler({ supabase: api, logger: silentLogger });
    await s._rehydrateCadenceState();
    expect(s._lastRoundRun.get('friday_meeting')).toBe(1717000000000);
    expect(s._jobLastRunAt.get('okr-monthly-generate')).toBe(1715000000000);
  });

  it('leaves maps empty when no heartbeat row exists (fresh deploy)', async () => {
    const { api } = makeSupabase({ heartbeatRow: null });
    const s = new EvaMasterScheduler({ supabase: api, logger: silentLogger });
    await s._rehydrateCadenceState();
    expect(s._lastRoundRun.size).toBe(0);
  });

  it('is fail-open on a DB read error (does not throw, maps stay empty)', async () => {
    const { api } = makeSupabase({ heartbeatRow: null, error: { message: 'boom' } });
    const s = new EvaMasterScheduler({ supabase: api, logger: silentLogger });
    await expect(s._rehydrateCadenceState()).resolves.toBeUndefined();
    expect(s._lastRoundRun.size).toBe(0);
  });

  it('runs BEFORE the first heartbeat write in start() (no clobber of persisted metadata)', async () => {
    const { api } = makeSupabase({ heartbeatRow: { metadata: { last_round_runs: { friday_meeting: 1717000000000 } } } });
    const s = new EvaMasterScheduler({ supabase: api, logger: silentLogger });
    const order = [];
    vi.spyOn(s, '_rehydrateCadenceState').mockImplementation(async () => { order.push('rehydrate'); });
    vi.spyOn(s, '_updateHeartbeat').mockImplementation(async () => { order.push('heartbeat'); });
    vi.spyOn(s, '_runDueJobs').mockImplementation(async () => { order.push('jobs'); });
    vi.spyOn(s, '_safePoll').mockImplementation(async () => { order.push('poll'); });
    vi.spyOn(s, '_startAdaptivePolling').mockImplementation(() => {});
    await s.start();
    if (s._shutdownHandler) { process.removeListener('SIGINT', s._shutdownHandler); process.removeListener('SIGTERM', s._shutdownHandler); }
    expect(order.indexOf('rehydrate')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('rehydrate')).toBeLessThan(order.indexOf('heartbeat'));
    expect(order.indexOf('heartbeat')).toBeLessThan(order.indexOf('jobs'));
  });
});

// ── FR-3: observeOnly gate in _runDueJobs ───────────────────────────────────────

describe('FR-3 observeOnly gate on jobs', () => {
  function schedulerWithOneJob(observeOnly) {
    const { api } = makeSupabase();
    const s = new EvaMasterScheduler({ supabase: api, logger: silentLogger, config: { observeOnly } });
    const handler = vi.fn().mockResolvedValue(undefined);
    // Isolate to a single controlled job (a plain Map iterates + works with .get/.set).
    s._jobRegistry = new Map([['test-job', { enabled: true, cadenceDays: 1, handler }]]);
    s._jobLastRunAt = new Map();
    return { s, handler };
  }

  it('observe-only: does NOT run the job handler but stamps lastRun so cadence advances', async () => {
    const { s, handler } = schedulerWithOneJob(true);
    await s._runDueJobs();
    expect(handler).not.toHaveBeenCalled();
    expect(s._jobLastRunAt.get('test-job')).toBeTypeOf('number');
  });

  it('non-observe: runs the job handler and stamps lastRun', async () => {
    const { s, handler } = schedulerWithOneJob(false);
    await s._runDueJobs();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(s._jobLastRunAt.get('test-job')).toBeTypeOf('number');
  });

  it('observe-only respects cadence: a recently-run job is skipped entirely', async () => {
    const { s, handler } = schedulerWithOneJob(true);
    s._jobLastRunAt.set('test-job', Date.now()); // ran just now → not due
    await s._runDueJobs();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ── FR-1: setup-eva-watcher-task builders ───────────────────────────────────────

describe('FR-1 setup-eva-watcher-task builders', () => {
  it('wrapper .cmd sets both safety flags, cds to repo, and calls the npm script', () => {
    const cmd = buildWrapperScript({ repoRoot: 'C:\\repo\\EHG' });
    expect(cmd).toContain('set EVA_SCHEDULER_OBSERVE_ONLY=true');
    expect(cmd).toContain('set OKR_REQUIRE_ACCEPTANCE=true');
    expect(cmd).toContain('cd /d "C:\\repo\\EHG"');
    expect(cmd).toContain(`call npm run ${NPM_COMMAND}`);
    expect(cmd.endsWith('\r\n')).toBe(true);
  });

  it('schtasks argv schedules every 5 minutes and overwrites idempotently', () => {
    const args = buildSchtasksArgs({ wrapperPath: 'C:\\repo\\EHG\\scripts\\cron\\eva-watcher-task.cmd' });
    expect(args.join(' ')).toContain('/SC MINUTE /MO 5');
    expect(args).toContain('/F');
    expect(args).toContain('/TN');
    expect(args[args.indexOf('/TN') + 1]).toBe(TASK_NAME);
    expect(args[args.indexOf('/TR') + 1]).toContain('eva-watcher-task.cmd');
  });

  it('honors a custom interval and rejects an invalid one', () => {
    expect(buildSchtasksArgs({ wrapperPath: 'x', intervalMinutes: 3 }).join(' ')).toContain('/MO 3');
    expect(() => buildSchtasksArgs({ wrapperPath: 'x', intervalMinutes: 0 })).toThrow();
    expect(() => buildSchtasksArgs({})).toThrow(/wrapperPath/);
  });

  it('TASK_ENV bakes exactly the two safety flags', () => {
    expect(TASK_ENV).toEqual({ EVA_SCHEDULER_OBSERVE_ONLY: 'true', OKR_REQUIRE_ACCEPTANCE: 'true' });
  });

  it('remove/query argv target the named task', () => {
    expect(buildRemoveArgs()).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
    expect(buildQueryArgs()).toEqual(['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']);
  });

  it('parses CLI modes', () => {
    expect(parseTaskArgs(['node', 'x']).mode).toBe('register');
    expect(parseTaskArgs(['node', 'x', '--remove']).mode).toBe('remove');
    expect(parseTaskArgs(['node', 'x', '--status']).mode).toBe('status');
    expect(parseTaskArgs(['node', 'x', '--dry-run']).dryRun).toBe(true);
  });
});

// ── FR-2: gracefulExit + static source-pins ─────────────────────────────────────

describe('FR-2 Windows-safe exit', () => {
  it('gracefulExit sets process.exitCode without throwing or hard-exiting', async () => {
    const prev = process.exitCode;
    await gracefulExit(0, { backstopMs: 999999 }); // long backstop, unref'd → never fires in-test
    expect(process.exitCode).toBe(0);
    process.exitCode = prev; // restore so the test runner is unaffected
  });

  it('watcher has no dangerous synchronous process.exit on main()’s resolution path', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'cron', 'eva-scheduler-watcher.mjs'), 'utf8');
    // The old dangerous form must be gone; the new path routes through gracefulExit.
    expect(src).not.toMatch(/main\(\)\s*\.then\(\s*\(\{\s*exitCode\s*\}\)\s*=>\s*process\.exit/);
    expect(src).toMatch(/=>\s*gracefulExit\(exitCode\)/);
    // Any process.exit in CODE (comments legitimately discuss the anti-pattern) must live
    // inside the unref'd backstop only. Strip block + line comments before counting call sites.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const exitMatches = code.match(/process\.exit\(/g) || [];
    expect(exitMatches.length).toBeLessThanOrEqual(1);
    expect(src).toMatch(/setTimeout\(\(\)\s*=>\s*process\.exit\([^)]*\),\s*backstopMs\)\.unref\(\)/);
  });

  it('scheduler source pins the observeOnly job guard (FR-3 regression guard)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'eva', 'eva-master-scheduler.js'), 'utf8');
    expect(src).toContain('OBSERVE: Would run job');
  });
});
