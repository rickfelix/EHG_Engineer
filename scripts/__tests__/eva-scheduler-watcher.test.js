/**
 * Unit tests for scripts/cron/eva-scheduler-watcher.mjs
 *
 * SD: SD-LEO-INFRA-REVIVE-EVA-SCHEDULER-SERVICE-001
 *
 * Hermetic — no real DB, no real process spawn. A stateful singleton-row mock
 * simulates the ATOMIC conditional UPDATE that backs the single-instance guarantee
 * (MF1): claimRevival's `.update().eq().or().select()` applies the patch only when the
 * row still matches the staleness predicate, so a second concurrent claim against the
 * now-fresh row returns 0 rows. spawn is injected (deps.spawn) so the race test proves
 * "exactly one process spawned" without forking. Clock + sleep injected for determinism.
 *
 * Covers TS-1 (alive→noop), TS-2 (stale→revive), TS-3 (concurrency race→one spawn),
 * TS-4 (missing creds→exit 2), TS-5 (disabled→noop), TS-6 (dry-run→claim no spawn),
 * TS-7 (confirm via instance_id takeover), TS-8 (unconfirmed→exit 1).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseArgs,
  assertSpawnCreds,
  schedulerLiveness,
  claimRevival,
  confirmRevival,
  main,
} from '../cron/eva-scheduler-watcher.mjs';

const FIXED = Date.parse('2026-06-09T22:00:00.000Z');
const fixedNow = () => FIXED;
const CREDS = { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };

// PostgREST `.or()` predicate evaluator for the single-table mock (last_poll_at.is.null,last_poll_at.lt.<iso>)
function evalOr(orStr, row) {
  if (!orStr) return true;
  return orStr.split(',').some((clause) => {
    const parts = clause.split('.');
    const col = parts[0];
    const op = parts[1];
    const val = parts.slice(2).join('.'); // ISO timestamps contain dots — rejoin
    if (op === 'is' && val === 'null') return row[col] == null;
    if (op === 'lt') return row[col] != null && Date.parse(row[col]) < Date.parse(val);
    return false;
  });
}

/**
 * Stateful mock of the eva_scheduler_heartbeat singleton row.
 * @param initial row object or null (no heartbeat yet)
 * @param opts.readError / opts.claimError to simulate DB failures
 */
function makeHeartbeatDB(initial, opts = {}) {
  const state = { row: initial ? { ...initial } : null };
  const calls = { updates: 0, reads: 0 };
  function from() {
    let isUpdate = false; let patch = null; let orStr = null;
    const builder = {
      select() {
        if (isUpdate) {
          calls.updates++;
          if (opts.claimError) return Promise.resolve({ data: null, error: { message: 'claim boom' } });
          // Enforce the REAL eva_scheduler_heartbeat_status_check (running|stopping|stopped).
          // This is the regression guard for the prod bug live-dogfooding caught: a claim that
          // sets status='reviving' violates the constraint and can NEVER succeed in production.
          const ALLOWED_STATUS = ['running', 'stopping', 'stopped'];
          if (patch && patch.status != null && !ALLOWED_STATUS.includes(patch.status)) {
            return Promise.resolve({ data: null, error: { message: 'new row violates check constraint "eva_scheduler_heartbeat_status_check"' } });
          }
          let matched = false;
          if (state.row && evalOr(orStr, state.row)) { Object.assign(state.row, patch); matched = true; }
          return Promise.resolve({ data: matched ? [{ ...state.row }] : [], error: null });
        }
        return builder;
      },
      eq() { return builder; },
      or(s) { orStr = s; return builder; },
      update(p) { isUpdate = true; patch = p; return builder; },
      maybeSingle() {
        calls.reads++;
        if (opts.readError) return Promise.resolve({ data: null, error: { message: 'read boom' } });
        return Promise.resolve({ data: state.row ? { ...state.row } : null, error: null });
      },
    };
    return builder;
  }
  return { from, _state: state, _calls: calls };
}

const freshRow = (instance = 'scheduler-aaaa1111') => ({ id: 1, instance_id: instance, status: 'running', last_poll_at: new Date(FIXED - 10_000).toISOString(), poll_count: 99 });
const staleRow = (instance = 'scheduler-dead0000') => ({ id: 1, instance_id: instance, status: 'running', last_poll_at: new Date(FIXED - 9_000_000).toISOString(), poll_count: 533 });

const okSpawn = () => vi.fn(() => ({ pid: 4242, unref: vi.fn() }));
const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

describe('parseArgs', () => {
  it('parses --once / --dry-run / --help', () => {
    expect(parseArgs(['node', 'cmd', '--once'])).toMatchObject({ once: true });
    expect(parseArgs(['node', 'cmd', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(parseArgs(['node', 'cmd', '--help'])).toMatchObject({ help: true });
    expect(parseArgs(['node', 'cmd'])).toMatchObject({ once: false, dryRun: false, help: false });
  });
});

describe('assertSpawnCreds', () => {
  it('ok when url+key present (either url alias)', () => {
    expect(assertSpawnCreds(CREDS).ok).toBe(true);
    expect(assertSpawnCreds({ NEXT_PUBLIC_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }).ok).toBe(true);
  });
  it('reports each missing credential', () => {
    expect(assertSpawnCreds({}).missing).toEqual(['SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    expect(assertSpawnCreds({ SUPABASE_URL: 'u' }).missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
  });
});

describe('schedulerLiveness', () => {
  it('alive when last_poll_at within staleMs', async () => {
    const db = makeHeartbeatDB(freshRow());
    const r = await schedulerLiveness(db, { now: fixedNow, staleMs: 300_000 });
    expect(r).toMatchObject({ ok: true, alive: true, exists: true });
    expect(r.ageMs).toBe(10_000);
  });
  it('stale when older than staleMs', async () => {
    const db = makeHeartbeatDB(staleRow());
    const r = await schedulerLiveness(db, { now: fixedNow, staleMs: 300_000 });
    expect(r).toMatchObject({ ok: true, alive: false, exists: true });
  });
  it('absent (no row) → not alive, exists:false', async () => {
    const db = makeHeartbeatDB(null);
    const r = await schedulerLiveness(db, { now: fixedNow });
    expect(r).toMatchObject({ ok: true, alive: false, exists: false, ageMs: Infinity });
  });
  it('null last_poll_at → not alive (age Infinity)', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'x', last_poll_at: null });
    const r = await schedulerLiveness(db, { now: fixedNow });
    expect(r.alive).toBe(false);
    expect(r.ageMs).toBe(Infinity);
  });
  it('DB read error → ok:false', async () => {
    const db = makeHeartbeatDB(staleRow(), { readError: true });
    const r = await schedulerLiveness(db, { now: fixedNow });
    expect(r.ok).toBe(false);
  });
});

describe('claimRevival (MF1 atomic single-winner)', () => {
  it('wins on a stale row, stamps instance_id+last_poll_at, leaves status untouched (constraint-safe)', async () => {
    const db = makeHeartbeatDB(staleRow());
    const r = await claimRevival(db, { token: 'supervisor-t1', nowIso: new Date(FIXED).toISOString(), staleThresholdIso: new Date(FIXED - 300_000).toISOString() });
    expect(r.won).toBe(true);
    expect(db._state.row.instance_id).toBe('supervisor-t1');
    expect(db._state.row.last_poll_at).toBe(new Date(FIXED).toISOString());
    expect(db._state.row.status).toBe('running'); // NOT changed → never trips the status CHECK
  });
  it('loses when row is already fresh (predicate no longer matches)', async () => {
    const db = makeHeartbeatDB(freshRow());
    const r = await claimRevival(db, { token: 'supervisor-t2', nowIso: new Date(FIXED).toISOString(), staleThresholdIso: new Date(FIXED - 300_000).toISOString() });
    expect(r.won).toBe(false);
  });
  it('second claim against the same row loses after the first wins', async () => {
    const db = makeHeartbeatDB(staleRow());
    const a = await claimRevival(db, { token: 'A', nowIso: new Date(FIXED).toISOString(), staleThresholdIso: new Date(FIXED - 300_000).toISOString() });
    const b = await claimRevival(db, { token: 'B', nowIso: new Date(FIXED).toISOString(), staleThresholdIso: new Date(FIXED - 300_000).toISOString() });
    expect(a.won).toBe(true);
    expect(b.won).toBe(false);
    expect(db._state.row.instance_id).toBe('A');
  });
});

describe('confirmRevival (MF2)', () => {
  it('confirmed when instance_id moves off our token', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'reviving' });
    // sleep simulates the daemon stamping its own instance on first poll
    const sleep = vi.fn(async () => { db._state.row.instance_id = 'scheduler-new99'; db._state.row.status = 'running'; });
    const r = await confirmRevival(db, { token: 'supervisor-t', sleep, now: fixedNow });
    expect(r).toMatchObject({ confirmed: true, instanceId: 'scheduler-new99', status: 'running' });
  });
  it('times out (exit-1 path) when instance never changes', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'reviving' });
    let t = FIXED;
    const now = () => (t += 600); // advance 600ms per call → crosses 8s timeout
    const r = await confirmRevival(db, { token: 'supervisor-t', sleep: async () => {}, now });
    expect(r.confirmed).toBe(false);
  });
});

describe('main — integration', () => {
  const base = (db, extra = {}) => ({ supabase: db, logger: silentLogger, now: fixedNow, env: CREDS, token: 'supervisor-fixedtok', ...extra });

  it('TS-1: alive scheduler → no action, no spawn', async () => {
    const db = makeHeartbeatDB(freshRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 0, action: 'alive' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-5: EVA_SCHEDULER_ENABLED=false → suppressed, no DB read, no spawn', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn, env: { ...CREDS, EVA_SCHEDULER_ENABLED: 'false' } }));
    expect(r).toMatchObject({ exitCode: 0, action: 'disabled' });
    expect(db._calls.reads).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-4: stale but missing creds → exit 2, no spawn, no claim', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn, env: { SUPABASE_URL: 'u' } }));
    expect(r).toMatchObject({ exitCode: 2, action: 'missing_creds' });
    expect(db._calls.updates).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-6: dry-run → claims (single-winner) but does NOT spawn', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--dry-run'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 0, action: 'dry_run' });
    expect(db._calls.updates).toBe(1);
    expect(db._state.row.instance_id).toBe('supervisor-fixedtok'); // claim applied
    expect(db._state.row.status).toBe('running');                 // status untouched (constraint-safe)
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-2/TS-7: stale → wins claim, spawns once, confirms takeover → exit 0 revived', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const sleep = vi.fn(async () => { db._state.row.instance_id = 'scheduler-live01'; db._state.row.status = 'running'; });
    const r = await main(['node', 'w', '--once'], base(db, { spawn, sleep }));
    expect(r).toMatchObject({ exitCode: 0, action: 'revived', instanceId: 'scheduler-live01' });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, argv, optsArg] = spawn.mock.calls[0];
    expect(argv).toEqual(expect.arrayContaining([expect.stringContaining('eva-scheduler.js'), 'start']));
    expect(optsArg).toMatchObject({ detached: true, windowsHide: true, stdio: 'ignore' });
  });

  it('TS-3: two concurrent watchers → EXACTLY ONE spawns (single-instance)', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const sleep = async () => { db._state.row.instance_id = 'scheduler-winner'; db._state.row.status = 'running'; };
    const results = await Promise.all([
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-A' })),
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-B' })),
    ]);
    const actions = results.map((r) => r.action).sort();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(actions).toEqual(['claim_lost', 'revived']);
    expect(db._calls.updates).toBe(2); // both attempted the claim; only one matched
  });

  it('spawn throwing → exit 1 spawn_error', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = vi.fn(() => { throw new Error('ENOENT'); });
    const r = await main(['node', 'w', '--once'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 1, action: 'spawn_error' });
  });

  it('claim DB error → exit 1 claim_error, no spawn', async () => {
    const db = makeHeartbeatDB(staleRow(), { claimError: true });
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 1, action: 'claim_error' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('heartbeat read error → exit 1 db_error', async () => {
    const db = makeHeartbeatDB(staleRow(), { readError: true });
    const r = await main(['node', 'w', '--once'], base(db, { spawn: okSpawn() }));
    expect(r).toMatchObject({ exitCode: 1, action: 'db_error' });
  });
});
