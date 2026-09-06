/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-2/FR-5 (TS-3/TS-3b/TS-4,
 * AC-4/AC-5/AC-19).
 *
 * decide() is pure and covers the hold-window/re-emit-window/clear-transition logic in isolation.
 * emitToLiveSeats()/tick() drive the REAL dispatchToWorker -> insertCoordinationRow choke point
 * through the same permissive generic supabase double established in
 * fleet-dashboard-signal-receipt.test.js (a nested CJS require() cannot be vi.mock'd here either).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const { decide, emitToLiveSeats, tick, readState, writeState, defaultStatePath } =
  require('../../../lib/coordinator/capped-pool-broadcast.cjs');

const COORDINATOR = 'c0000000-0000-4000-8000-000000000001';
const SEAT_A = '00000000-0000-4000-8000-00000000000a';
const SEAT_B = '00000000-0000-4000-8000-00000000000b';
const SEAT_C = '00000000-0000-4000-8000-00000000000c';
const SEAT_D = '00000000-0000-4000-8000-00000000000d';

/** Same permissive double shape as fleet-dashboard-signal-receipt.test.js's mockSupabase. */
function mockSupabase({ liveTargets = [] } = {}) {
  const inserted = [];
  const live = new Set(liveTargets);

  function sessionCoordinationChain() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      not() { return chain; },
      is() { return chain; },
      gt() { return chain; },
      gte() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      in() { return chain; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      update() { return chain; },
      insert(row) {
        const stored = { id: `row-${inserted.length + 1}`, ...row };
        inserted.push(stored);
        chain._inserted = stored;
        return chain;
      },
      then(resolve, reject) {
        return Promise.resolve({ data: chain._inserted ? [chain._inserted] : [], error: null }).then(resolve, reject);
      },
    };
    return chain;
  }

  function claudeSessionsChain() {
    let lastEqCol = null;
    let lastEqVal = null;
    const chain = {
      select() { return chain; },
      eq(col, val) { lastEqCol = col; lastEqVal = val; return chain; },
      is() { return chain; },
      gte() { return chain; },
      limit() { return chain; },
      maybeSingle() {
        if (lastEqCol === 'session_id' && live.has(lastEqVal)) {
          return Promise.resolve({ data: { session_id: lastEqVal, heartbeat_at: new Date().toISOString(), sd_key: null }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
    };
    return chain;
  }

  function genericChain() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      not() { return chain; },
      is() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
    return chain;
  }

  const supabase = {
    from(table) {
      if (table === 'session_coordination') return sessionCoordinationChain();
      if (table === 'claude_sessions') return claudeSessionsChain();
      return genericChain();
    },
  };
  return { supabase, inserted };
}

describe('decide() (pure): hold window / re-emit window / clear transition', () => {
  const nowMs = Date.parse('2026-09-06T12:00:00.000Z');
  const emptyState = { over_cap_since: null, last_emitted_at: null, last_cleared_notice_at: null };

  it('not over cap, no prior state -> none', () => {
    expect(decide({ used: 38, cap: 40, state: emptyState, nowMs }).action).toBe('none');
  });

  it('over cap but within the hold window -> none (stamps over_cap_since)', () => {
    const result = decide({ used: 41, cap: 40, state: emptyState, nowMs });
    expect(result.action).toBe('none');
    expect(result.nextState.over_cap_since).toBe(new Date(nowMs).toISOString());
  });

  it('AC-4: over cap for exactly the hold window -> emit', () => {
    const overSince = new Date(nowMs - 30 * 60 * 1000 - 1000).toISOString();
    const result = decide({ used: 41, cap: 40, state: { ...emptyState, over_cap_since: overSince }, nowMs });
    expect(result.action).toBe('emit');
  });

  it('AC-4: a second tick within the re-emit window after an emit -> none', () => {
    const overSince = new Date(nowMs - 31 * 60 * 1000).toISOString();
    const justEmitted = new Date(nowMs - 60 * 1000).toISOString();
    const result = decide({ used: 41, cap: 40, state: { over_cap_since: overSince, last_emitted_at: justEmitted, last_cleared_notice_at: null }, nowMs });
    expect(result.action).toBe('none');
  });

  it('AC-4: a tick after the 6h re-emit window elapses -> emit again', () => {
    const overSince = new Date(nowMs - 7 * 60 * 60 * 1000).toISOString();
    const staleEmit = new Date(nowMs - 6 * 60 * 60 * 1000 - 1000).toISOString();
    const result = decide({ used: 41, cap: 40, state: { over_cap_since: overSince, last_emitted_at: staleEmit, last_cleared_notice_at: null }, nowMs });
    expect(result.action).toBe('emit');
  });

  it('AC-5: condition clears after an emit -> notify_clear exactly once', () => {
    const overSince = new Date(nowMs - 31 * 60 * 1000).toISOString();
    const state = { over_cap_since: overSince, last_emitted_at: overSince, last_cleared_notice_at: null };
    const first = decide({ used: 38, cap: 40, state, nowMs });
    expect(first.action).toBe('notify_clear');
    const second = decide({ used: 38, cap: 40, state: first.nextState, nowMs: nowMs + 1000 });
    expect(second.action).toBe('none');
  });

  // WARNING (adversarial post-merge review, PR #8356): the prior shouldNotifyClear check gated
  // solely on `over_cap_since != null`, which is stamped on the FIRST over-cap tick -- well before
  // the hold window elapses. A brief over-cap blip that cleared BEFORE ever reaching the emit
  // threshold still fanned out a "no longer required" notice to the whole fleet, referring to a
  // notice nobody ever received.
  it('WARN-fix: a brief over-cap blip that clears WITHIN the hold window (no emit ever sent) -> none, not notify_clear', () => {
    const overSince = new Date(nowMs - 5 * 60 * 1000).toISOString(); // only 5 minutes ago, well under the 30m hold
    const state = { over_cap_since: overSince, last_emitted_at: null, last_cleared_notice_at: null };
    const result = decide({ used: 38, cap: 40, state, nowMs }); // now back under cap
    expect(result.action).toBe('none');
    expect(result.nextState.over_cap_since).toBeNull();
  });

  it('WARN-fix: over_cap_since predates the last actual emit (a STALE episode marker) -> none, not notify_clear', () => {
    // last_emitted_at is from an OLDER episode, before this over_cap_since was stamped -- the
    // emit did not happen FOR this episode, so no clear notice is owed for it.
    const olderEmit = new Date(nowMs - 10 * 60 * 60 * 1000).toISOString();
    const newerOverCapSince = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const state = { over_cap_since: newerOverCapSince, last_emitted_at: olderEmit, last_cleared_notice_at: null };
    const result = decide({ used: 38, cap: 40, state, nowMs });
    expect(result.action).toBe('none');
  });

  it('AC-19: dedupe is entirely emission-recency-based -- decide() takes no acknowledged_at input at all', () => {
    // The function signature itself has no ack-state parameter; this is a structural guarantee,
    // not a runtime one. Documented here as the load-bearing contract TST-P3 requires.
    expect(decide.length).toBe(1); // single destructured-object parameter
  });
});

describe('emitToLiveSeats: fan-out shape (TS-3)', () => {
  it('AC-4: sends one directed INFO row per live seat, all sharing one run_id', async () => {
    const { supabase, inserted } = mockSupabase({ liveTargets: [SEAT_A, SEAT_B, SEAT_C, SEAT_D] });
    const result = await emitToLiveSeats(supabase, {
      coordinatorId: COORDINATOR,
      seats: [{ session_id: SEAT_A }, { session_id: SEAT_B }, { session_id: SEAT_C }, { session_id: SEAT_D }],
      used: 41,
      cap: 40,
    });
    expect(result.written).toBe(4);
    expect(inserted).toHaveLength(4);
    const runIds = new Set(inserted.map((r) => r.payload.run_id));
    expect(runIds.size).toBe(1);
    expect(inserted.every((r) => r.payload.kind === 'capped_pool_broadcast')).toBe(true);
    expect(inserted.every((r) => r.message_type === 'INFO')).toBe(true);
  });

  it('AC-5: a cleared-notice fan-out stamps payload.cleared=true', async () => {
    const { supabase, inserted } = mockSupabase({ liveTargets: [SEAT_A] });
    await emitToLiveSeats(supabase, { coordinatorId: COORDINATOR, seats: [{ session_id: SEAT_A }], used: 38, cap: 40, cleared: true });
    expect(inserted[0].payload.cleared).toBe(true);
  });

  it('a refused dispatch for one seat is counted as skipped and does not stop the batch', async () => {
    const { supabase, inserted } = mockSupabase({ liveTargets: [SEAT_A] }); // SEAT_B not live -> refused
    const result = await emitToLiveSeats(supabase, {
      coordinatorId: COORDINATOR,
      seats: [{ session_id: SEAT_A }, { session_id: SEAT_B }],
      used: 41,
      cap: 40,
    });
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1);
    expect(inserted).toHaveLength(1);
  });
});

describe('tick(): state-file persistence + AC-19 acked-target-still-suppressed', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-test-'));
    statePath = defaultStatePath(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC-4/TS-3: persists over_cap_since on first over-cap tick, then emits once the hold window elapses', async () => {
    const { supabase: sb1 } = mockSupabase({ liveTargets: [SEAT_A] });
    const first = await tick(sb1, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 41, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(first.action).toBe('none');
    const stateAfterFirst = readState(statePath);
    expect(stateAfterFirst.over_cap_since).not.toBeNull();

    // Simulate 31 minutes having passed by rewriting the state file directly (pure function under
    // test elsewhere; this integration test only needs the state-file round-trip to work).
    writeState(statePath, { ...stateAfterFirst, over_cap_since: new Date(Date.now() - 31 * 60 * 1000).toISOString() });

    const { supabase: sb2, inserted } = mockSupabase({ liveTargets: [SEAT_A] });
    const second = await tick(sb2, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 41, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(second.action).toBe('emit');
    expect(inserted).toHaveLength(1);
  });

  it('TS-3b/AC-19: a target that acknowledged its broadcast row still receives ZERO more within the re-emit window', async () => {
    // Seed state as already-emitted 1 minute ago, well within the 6h re-emit window.
    writeState(statePath, {
      schema_version: 1,
      over_cap_since: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      last_emitted_at: new Date(Date.now() - 60 * 1000).toISOString(),
      last_cleared_notice_at: null,
    });
    // The mock's session_coordination.then() never simulates an ack lookup at all -- proving
    // the dedupe genuinely never queries acknowledged_at, per TST-P3's own requirement.
    const { supabase, inserted } = mockSupabase({ liveTargets: [SEAT_A] });
    const result = await tick(supabase, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 41, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(result.action).toBe('none');
    expect(inserted).toHaveLength(0);
  });

  it('TS-4/AC-5: condition clears -> exactly one cleared notice, then none after that', async () => {
    writeState(statePath, {
      schema_version: 1,
      over_cap_since: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      last_emitted_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      last_cleared_notice_at: null,
    });
    const { supabase: sb1, inserted: inserted1 } = mockSupabase({ liveTargets: [SEAT_A] });
    const first = await tick(sb1, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 38, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(first.action).toBe('notify_clear');
    expect(inserted1).toHaveLength(1);
    expect(inserted1[0].payload.cleared).toBe(true);

    const { supabase: sb2, inserted: inserted2 } = mockSupabase({ liveTargets: [SEAT_A] });
    const second = await tick(sb2, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 38, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(second.action).toBe('none');
    expect(inserted2).toHaveLength(0);
  });

  // WARNING (adversarial post-merge review, PR #8356): tick() used to persist last_emitted_at
  // unconditionally, even when the fan-out reached ZERO seats (every dispatch refused) --
  // burning the 6-hour re-emit window on a notice nobody received, with no operator-visible
  // failure signal.
  it('WARN-fix: a fan-out that reaches ZERO seats does NOT persist last_emitted_at -- the next tick retries immediately', async () => {
    const overSince = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writeState(statePath, { schema_version: 1, over_cap_since: overSince, last_emitted_at: null, last_cleared_notice_at: null });

    // No live targets registered -> every dispatch is refused, written=0.
    const { supabase: sb1 } = mockSupabase({ liveTargets: [] });
    const first = await tick(sb1, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 41, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(first.action).toBe('emit');
    expect(first.written).toBe(0);
    const stateAfterFirst = readState(statePath);
    expect(stateAfterFirst.last_emitted_at).toBeNull(); // NOT stamped -- nothing was delivered

    // A tick moments later, now with a live seat, must retry immediately (not wait 6h).
    const { supabase: sb2, inserted } = mockSupabase({ liveTargets: [SEAT_A] });
    const second = await tick(sb2, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 41, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(second.action).toBe('emit');
    expect(inserted).toHaveLength(1);
  });

  // ROUND-2 FIX (adversarial post-merge review, PR #8356): the FIRST fix reverted only
  // last_cleared_notice_at on a zero-seat notify_clear, which was inert -- decide()'s not-overCap
  // branch ALWAYS flushes over_cap_since to null in nextState, and decide()'s own gate for even
  // considering a clear notice requires over_cap_since != null. Without ALSO restoring
  // over_cap_since, a zero-seat clear fan-out permanently drops the episode marker and the clear
  // notice can never be retried on any later tick.
  it('WARN-fix round 2: a notify_clear that reaches ZERO seats restores over_cap_since too -- the next tick can still retry the clear notice', async () => {
    const overSince = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writeState(statePath, { schema_version: 1, over_cap_since: overSince, last_emitted_at: overSince, last_cleared_notice_at: null });

    // No live targets -> every dispatch is refused, written=0.
    const { supabase: sb1 } = mockSupabase({ liveTargets: [] });
    const first = await tick(sb1, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 38, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(first.action).toBe('notify_clear');
    expect(first.written).toBe(0);
    const stateAfterFirst = readState(statePath);
    expect(stateAfterFirst.over_cap_since).toBe(overSince); // restored, not flushed to null
    expect(stateAfterFirst.last_cleared_notice_at).toBeNull(); // also restored -- never actually sent

    // A later tick, now with a live seat, must still be ABLE to send the clear notice.
    const { supabase: sb2, inserted } = mockSupabase({ liveTargets: [SEAT_A] });
    const second = await tick(sb2, { repoRoot: tmpDir, coordinatorId: COORDINATOR, used: 38, cap: 40, statePath, seats: [{ session_id: SEAT_A }] });
    expect(second.action).toBe('notify_clear');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.cleared).toBe(true);
  });

  // WARNING (adversarial post-merge review, PR #8356): writeState was a bare fs.writeFileSync
  // with no temp+rename and no try/catch, unlike the reaper pattern it claimed to mirror.
  it('WARN-fix: writeState never throws, even when the target directory cannot be created', () => {
    const impossiblePath = path.join(tmpDir, 'not-a-dir', 'nested', 'state.json');
    // Create a FILE at the path a directory needs to occupy, so mkdirSync must fail.
    fs.writeFileSync(path.join(tmpDir, 'not-a-dir'), 'i am a file, not a directory');
    expect(() => writeState(impossiblePath, { schema_version: 1, over_cap_since: null, last_emitted_at: null, last_cleared_notice_at: null })).not.toThrow();
  });
});
