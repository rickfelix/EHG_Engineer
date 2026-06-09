/**
 * Unit tests for scripts/cron/eva-scheduler-watcher.mjs
 *
 * SD: SD-LEO-INFRA-REVIVE-EVA-SCHEDULER-SERVICE-001
 *
 * Hermetic — no real DB, no real process spawn. A stateful singleton-row mock simulates
 * the ATOMIC compare-and-swap that backs the single-instance guarantee (MF1): claimRevival
 * either CAS-swaps instance_id (existing stale row) or INSERTs the singleton (fresh deploy),
 * and the mock enforces the real status CHECK plus PK-conflict on a duplicate insert. spawn
 * is injected so the race tests prove "exactly one process spawned" without forking; clock +
 * sleep injected for determinism.
 *
 * Covers TS-1..TS-12: alive→noop, stale→revive, race→one spawn, missing-creds→exit2,
 * disabled→noop, dry-run→NO mutation, confirm via fresh instance_id, unconfirmed→exit1,
 * fresh-deploy bootstrap + bootstrap race (the empty-table deadlock the adversarial review
 * caught), failed-spawn leaves row stale (no 5-min mask), zombie old-instance exclusion,
 * daemon early-exit capture.
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
const advancingNow = (start = FIXED, step = 600) => { let t = start; return () => (t += step); };
const CREDS = { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const STALE_LAST_POLL = new Date(FIXED - 9_000_000).toISOString();

const ALLOWED_STATUS = ['running', 'stopping', 'stopped'];

/**
 * Stateful mock of the eva_scheduler_heartbeat singleton row.
 * Simulates: maybeSingle read, CAS update (eq/is on instance_id), INSERT with PK conflict,
 * and the real status CHECK constraint on both insert and update.
 */
function makeHeartbeatDB(initial, opts = {}) {
  const state = { row: initial ? { ...initial } : null };
  const calls = { updates: 0, reads: 0, inserts: 0 };
  function from() {
    let op = null; let patch = null; let insertRow = null; let instanceIsNull = false;
    const eqs = {};
    const builder = {
      select() {
        if (op === 'update') {
          calls.updates++;
          if (opts.claimError) return Promise.resolve({ data: null, error: { message: 'claim boom' } });
          if (patch && patch.status != null && !ALLOWED_STATUS.includes(patch.status)) {
            return Promise.resolve({ data: null, error: { message: 'violates check constraint "eva_scheduler_heartbeat_status_check"' } });
          }
          let matched = false;
          if (state.row && (eqs.id == null || state.row.id === eqs.id)) {
            const instOk = instanceIsNull
              ? state.row.instance_id == null
              : (eqs.instance_id === undefined ? true : state.row.instance_id === eqs.instance_id);
            if (instOk) { Object.assign(state.row, patch); matched = true; }
          }
          return Promise.resolve({ data: matched ? [{ ...state.row }] : [], error: null });
        }
        if (op === 'insert') {
          calls.inserts++;
          if (insertRow && insertRow.status != null && !ALLOWED_STATUS.includes(insertRow.status)) {
            return Promise.resolve({ data: null, error: { message: 'violates check constraint "eva_scheduler_heartbeat_status_check"' } });
          }
          if (state.row) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "eva_scheduler_heartbeat_pkey"' } });
          }
          state.row = { ...insertRow };
          return Promise.resolve({ data: [{ ...state.row }], error: null });
        }
        return builder;
      },
      eq(col, val) { eqs[col] = val; return builder; },
      is(col, val) { if (col === 'instance_id' && val === null) instanceIsNull = true; return builder; },
      update(p) { op = 'update'; patch = p; return builder; },
      insert(r) { op = 'insert'; insertRow = r; return builder; },
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
const staleRow = (instance = 'scheduler-dead0000') => ({ id: 1, instance_id: instance, status: 'running', last_poll_at: STALE_LAST_POLL, poll_count: 533 });

const okSpawn = () => vi.fn(() => ({ pid: 4242, unref: vi.fn(), on: vi.fn() }));
const crashSpawn = () => vi.fn(() => ({ pid: 7, unref: vi.fn(), on: (evt, cb) => { if (evt === 'exit') cb(1); } }));
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
    const r = await schedulerLiveness(makeHeartbeatDB(freshRow()), { now: fixedNow, staleMs: 300_000 });
    expect(r).toMatchObject({ ok: true, alive: true, exists: true });
    expect(r.ageMs).toBe(10_000);
  });
  it('stale when older than staleMs', async () => {
    const r = await schedulerLiveness(makeHeartbeatDB(staleRow()), { now: fixedNow, staleMs: 300_000 });
    expect(r).toMatchObject({ ok: true, alive: false, exists: true });
  });
  it('absent (no row) → not alive, exists:false', async () => {
    const r = await schedulerLiveness(makeHeartbeatDB(null), { now: fixedNow });
    expect(r).toMatchObject({ ok: true, alive: false, exists: false, ageMs: Infinity });
  });
  it('null last_poll_at → not alive (age Infinity)', async () => {
    const r = await schedulerLiveness(makeHeartbeatDB({ id: 1, instance_id: 'x', last_poll_at: null }), { now: fixedNow });
    expect(r.alive).toBe(false);
    expect(r.ageMs).toBe(Infinity);
  });
  it('DB read error → ok:false', async () => {
    const r = await schedulerLiveness(makeHeartbeatDB(staleRow(), { readError: true }), { now: fixedNow });
    expect(r.ok).toBe(false);
  });
});

describe('claimRevival — MF1 CAS (existing row)', () => {
  it('wins when observed instance still matches; swaps instance_id; leaves last_poll_at + status UNTOUCHED', async () => {
    const db = makeHeartbeatDB(staleRow('scheduler-dead0000'));
    const r = await claimRevival(db, { token: 'supervisor-t1', observedInstanceId: 'scheduler-dead0000', rowExists: true });
    expect(r.won).toBe(true);
    expect(db._state.row.instance_id).toBe('supervisor-t1');
    expect(db._state.row.last_poll_at).toBe(STALE_LAST_POLL); // NOT bumped → immediate retry on failure
    expect(db._state.row.status).toBe('running');             // never written → never trips the CHECK
  });
  it('loses when a peer already swapped the observed instance', async () => {
    const db = makeHeartbeatDB(staleRow('peer-token'));
    const r = await claimRevival(db, { token: 'supervisor-t2', observedInstanceId: 'scheduler-dead0000', rowExists: true });
    expect(r.won).toBe(false);
    expect(db._state.row.instance_id).toBe('peer-token'); // untouched
  });
  it('second claim with the same observed loses after the first wins', async () => {
    const db = makeHeartbeatDB(staleRow('scheduler-dead0000'));
    const a = await claimRevival(db, { token: 'A', observedInstanceId: 'scheduler-dead0000', rowExists: true });
    const b = await claimRevival(db, { token: 'B', observedInstanceId: 'scheduler-dead0000', rowExists: true });
    expect(a.won).toBe(true);
    expect(b.won).toBe(false);
    expect(db._state.row.instance_id).toBe('A');
  });
  it('handles a null observed instance (CAS on instance_id IS NULL)', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: null, status: 'stopped', last_poll_at: STALE_LAST_POLL });
    const r = await claimRevival(db, { token: 'T', observedInstanceId: null, rowExists: true });
    expect(r.won).toBe(true);
    expect(db._state.row.instance_id).toBe('T');
  });
});

describe('claimRevival — MF1 bootstrap (fresh deploy, empty table)', () => {
  it('inserts the singleton when no row exists (the fresh-deploy fix)', async () => {
    const db = makeHeartbeatDB(null);
    const r = await claimRevival(db, { token: 'boot-1', observedInstanceId: null, rowExists: false });
    expect(r).toMatchObject({ won: true, bootstrap: true });
    expect(db._state.row).toMatchObject({ id: 1, instance_id: 'boot-1' });
    expect(ALLOWED_STATUS).toContain(db._state.row.status); // constraint-safe bootstrap status
  });
  it('loses on PK conflict when a peer inserted first (no error surfaced)', async () => {
    const db = makeHeartbeatDB(staleRow()); // row already present → simulates the peer-won race
    const r = await claimRevival(db, { token: 'boot-2', observedInstanceId: null, rowExists: false });
    expect(r).toMatchObject({ won: false, bootstrap: true });
    expect(r.error == null).toBe(true);
  });
});

describe('confirmRevival — MF2', () => {
  it('confirmed when instance_id becomes a fresh value (≠ token, ≠ observed)', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'running' });
    const sleep = vi.fn(async () => { db._state.row.instance_id = 'scheduler-new99'; db._state.row.status = 'running'; });
    const r = await confirmRevival(db, { token: 'supervisor-t', excludeInstances: ['scheduler-old'], sleep, now: fixedNow });
    expect(r).toMatchObject({ confirmed: true, instanceId: 'scheduler-new99' });
  });
  it('NOT confirmed when only the excluded (zombie) old instance reappears', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'running' });
    const sleep = async () => { db._state.row.instance_id = 'scheduler-old'; }; // zombie re-stamps its old id
    const r = await confirmRevival(db, { token: 'supervisor-t', excludeInstances: ['scheduler-old'], sleep, now: advancingNow() });
    expect(r.confirmed).toBe(false);
  });
  it('times out when instance never changes', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'running' });
    const r = await confirmRevival(db, { token: 'supervisor-t', sleep: async () => {}, now: advancingNow() });
    expect(r.confirmed).toBe(false);
  });
  it('early-returns with childExitCode when the spawned daemon exits during the window', async () => {
    const db = makeHeartbeatDB({ id: 1, instance_id: 'supervisor-t', status: 'running' });
    const r = await confirmRevival(db, { token: 'supervisor-t', sleep: async () => {}, now: fixedNow, getChildExit: () => ({ exited: true, code: 1 }) });
    expect(r).toMatchObject({ confirmed: false, childExitCode: 1 });
  });
});

describe('main — integration', () => {
  const base = (db, extra = {}) => ({ supabase: db, logger: silentLogger, now: fixedNow, env: CREDS, token: 'supervisor-fixedtok', stdio: 'ignore', ...extra });

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

  it('TS-4: stale but missing creds → exit 2, no claim, no spawn', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn, env: { SUPABASE_URL: 'u' } }));
    expect(r).toMatchObject({ exitCode: 2, action: 'missing_creds' });
    expect(db._calls.updates + db._calls.inserts).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-6: dry-run → NO mutation at all, no spawn', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const r = await main(['node', 'w', '--dry-run'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 0, action: 'dry_run' });
    expect(db._calls.updates + db._calls.inserts).toBe(0); // truly read-only
    expect(db._state.row.instance_id).toBe('scheduler-dead0000');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('TS-2/TS-7: stale → wins CAS, spawns once, confirms takeover → exit 0 revived', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const sleep = vi.fn(async () => { db._state.row.instance_id = 'scheduler-live01'; db._state.row.last_poll_at = new Date(FIXED).toISOString(); db._state.row.status = 'running'; });
    const r = await main(['node', 'w', '--once'], base(db, { spawn, sleep }));
    expect(r).toMatchObject({ exitCode: 0, action: 'revived', instanceId: 'scheduler-live01' });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [, argv, optsArg] = spawn.mock.calls[0];
    expect(argv).toEqual(expect.arrayContaining([expect.stringContaining('eva-scheduler.js'), 'start']));
    expect(optsArg).toMatchObject({ detached: true, windowsHide: true });
  });

  it('TS-3: two concurrent watchers (existing stale row) → EXACTLY ONE spawns', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = okSpawn();
    const sleep = async () => { db._state.row.instance_id = 'scheduler-winner'; db._state.row.status = 'running'; };
    const results = await Promise.all([
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-A' })),
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-B' })),
    ]);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.action).sort()).toEqual(['claim_lost', 'revived']);
    expect(db._calls.updates).toBe(2); // both attempted the CAS; only one matched
  });

  it('TS-9: fresh deploy (empty table) → bootstraps singleton, spawns, confirms', async () => {
    const db = makeHeartbeatDB(null);
    const spawn = okSpawn();
    const sleep = async () => { db._state.row.instance_id = 'scheduler-fresh'; db._state.row.status = 'running'; };
    const r = await main(['node', 'w', '--once'], base(db, { spawn, sleep }));
    expect(r).toMatchObject({ exitCode: 0, action: 'revived', instanceId: 'scheduler-fresh' });
    expect(db._calls.inserts).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('TS-10: fresh-deploy race → EXACTLY ONE inserts+spawns (PK conflict for the loser)', async () => {
    const db = makeHeartbeatDB(null);
    const spawn = okSpawn();
    const sleep = async () => { db._state.row.instance_id = 'scheduler-fresh'; db._state.row.status = 'running'; };
    const results = await Promise.all([
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-A' })),
      main(['node', 'w', '--once'], base(db, { spawn, sleep, token: 'supervisor-B' })),
    ]);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.action).sort()).toEqual(['claim_lost', 'revived']);
  });

  it('TS-11: failed spawn leaves last_poll_at STALE (no 5-min mask) → exit 1', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = vi.fn(() => { throw new Error('ENOENT'); });
    const r = await main(['node', 'w', '--once'], base(db, { spawn }));
    expect(r).toMatchObject({ exitCode: 1, action: 'spawn_error' });
    expect(db._state.row.last_poll_at).toBe(STALE_LAST_POLL); // unchanged → next tick retries immediately
  });

  it('TS-12: zombie old daemon re-stamps its id → NOT confirmed (excluded) → exit 1', async () => {
    const db = makeHeartbeatDB(staleRow('scheduler-zombie'));
    const spawn = okSpawn();
    const sleep = async () => { db._state.row.instance_id = 'scheduler-zombie'; }; // the OLD instance reappears
    const r = await main(['node', 'w', '--once'], base(db, { spawn, sleep, now: advancingNow() }));
    expect(r).toMatchObject({ exitCode: 1, action: 'unconfirmed' });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('daemon exits early during confirm → exit 1 unconfirmed with childExitCode', async () => {
    const db = makeHeartbeatDB(staleRow());
    const spawn = crashSpawn();
    const r = await main(['node', 'w', '--once'], base(db, { spawn, sleep: async () => {} }));
    expect(r).toMatchObject({ exitCode: 1, action: 'unconfirmed', childExitCode: 1 });
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
