// QF-20260726-921 — worker-signal starvation counter in the sweep tick line.
//
// The incident: 16 of 17 coordinator replies went to Adam, ZERO to workers, while a worker sat blocked
// 80 minutes. The coordinator never queried the worker lane, and `SIGNAL ROUTER: promoted=0` read as
// "nothing needs attention" when it only meant "nothing AUTO-promoted" — an empty queue and a queue of
// hand-needing signals printed identically.
//
// These tests pin the properties that make starvation VISIBLE. The load-bearing one is the =0 case:
// a counter that only appears when non-zero reproduces the exact ambiguity that hid the incident.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { reportWorkerSignalStarvation, resolveThresholdMs, DEFAULT_THRESHOLD_SEC } =
  require('../../../lib/coordinator/worker-signal-starvation.cjs');

const NOW = Date.parse('2026-07-26T05:00:00.000Z');
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

/** supabase stub whose builder resolves the supplied rows. */
function fakeSupabase(rows, { throwOn = false } = {}) {
  const api = {
    select() { return api; },
    gte() { return api; },
    order() { return api; },
    limit() {
      if (throwOn) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: rows });
    },
  };
  return { from: vi.fn(() => api) };
}

function capture() {
  const lines = [];
  return { lines, log: (m) => lines.push(m) };
}

describe('reportWorkerSignalStarvation', () => {
  it('LOAD-BEARING: prints an explicit =0 when nothing is starved, so measured-and-empty is distinguishable from unmeasured', async () => {
    const { lines, log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([]), { now: NOW, log, env: {} });
    const line = lines.find((l) => l.startsWith('WORKER SIGNALS:'));
    expect(line).toBeDefined();               // it MUST print even with nothing to report
    expect(line).toContain('unanswered_over_30m=0');
    expect(line).not.toContain('NOT MEASURED');
    expect(r).toMatchObject({ measured: true, starved: 0 });
  });

  it('counts an unanswered worker signal past the threshold and reports the oldest age', async () => {
    const { lines, log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([
      { id: 's-old', sender_session: 'w1', sender_type: 'worker', created_at: minsAgo(80), payload: { signal_type: 'stuck' } },
      { id: 's-mid', sender_session: 'w2', sender_type: 'worker', created_at: minsAgo(45), payload: { signal_type: 'stuck' } },
    ]), { now: NOW, log, env: {} });
    expect(r.starved).toBe(2);
    expect(r.oldestMin).toBe(80);
    const line = lines.find((l) => l.startsWith('WORKER SIGNALS:'));
    expect(line).toContain('unanswered_over_30m=2');
    expect(line).toContain('oldest=80m');
    // sample lines make it actionable, not just a number
    expect(lines.filter((l) => l.includes('WORKER_SIGNAL_UNANSWERED')).length).toBe(2);
  });

  it('does NOT count signals that are answered, routed, under threshold, or from non-worker senders', async () => {
    // SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-3: row 'b' (read but never answered) was removed
    // from this fixture and promoted to its own test below. Asserting starved===0 over a set that
    // included a read-but-unanswered row locked in the defect that blinded this gauge to 99.85% of
    // its population.
    const { log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([
      { id: 'a', sender_session: 'w', sender_type: 'worker', created_at: minsAgo(90), acknowledged_at: minsAgo(5), payload: { signal_type: 'stuck' } },
      { id: 'c', sender_session: 'w', sender_type: 'worker', created_at: minsAgo(90), payload: { signal_type: 'stuck', routed_to_feedback_id: 'f-1' } },
      { id: 'd', sender_session: 'w', sender_type: 'worker', created_at: minsAgo(10), payload: { signal_type: 'stuck' } },   // too young
      { id: 'e', sender_session: 'adam', sender_type: 'adam', created_at: minsAgo(90), payload: { signal_type: 'stuck' } },  // not a worker
    ]), { now: NOW, log, env: {} });
    expect(r.starved).toBe(0);
  });

  it('DOES count a read-but-unanswered signal (FR-3 — read_at is delivery, not disposition)', async () => {
    const { log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([
      { id: 'b', sender_session: 'w', sender_type: 'worker', created_at: minsAgo(90), read_at: minsAgo(5), payload: { signal_type: 'stuck' } },
    ]), { now: NOW, log, env: {} });
    expect(r.starved).toBe(1);
  });

  // QF-20260727-683: every /checkin emits a fresh payload.kind='roll_call' availability
  // ping with an empty body and deliberately NO payload.signal_type (contract stated in
  // .claude/commands/checkin.md). The sweep counted these as WORKER_SIGNAL_UNANSWERED
  // anyway, so the gauge could never reach zero — measured: 4 of 5 rows named on one tick
  // were roll_calls. This exercises the fix end-to-end through the reporter, not just the
  // pure detector (see tests/unit/coordinator/detectors.test.js for the predicate-level cases).
  it('QF-20260727-683: does NOT count empty-bodied roll_call rows, but still counts a real payload.signal_type row', async () => {
    const { lines, log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([
      { id: 'rc-1', sender_session: 'w1', sender_type: 'worker', created_at: minsAgo(80), body: null, payload: { kind: 'roll_call', sender_callsign: 'Bravo', available: true } },
      { id: 'rc-2', sender_session: 'w1', sender_type: 'worker', created_at: minsAgo(60), body: null, payload: { kind: 'roll_call', sender_callsign: 'Bravo', available: true } },
      { id: 'bare-1', sender_session: 'w1', sender_type: 'worker', created_at: minsAgo(50), body: null, payload: {} }, // neither kind nor signal_type
      { id: 'sig-1', sender_session: 'w2', sender_type: 'worker', created_at: minsAgo(117), body: 'handing off a utilization decision', payload: { signal_type: 'feedback', sender_callsign: 'Charlie' } },
    ]), { now: NOW, log, env: {} });
    expect(r.starved).toBe(1);
    expect(r.oldestMin).toBe(117);
    const line = lines.find((l) => l.startsWith('WORKER SIGNALS:'));
    expect(line).toContain('unanswered_over_30m=1');
    expect(lines.some((l) => l.includes('WORKER_SIGNAL_UNANSWERED: id=sig-1'))).toBe(true);
    expect(lines.some((l) => l.includes('WORKER_SIGNAL_UNANSWERED: id=rc-1'))).toBe(false);
    expect(lines.some((l) => l.includes('WORKER_SIGNAL_UNANSWERED: id=rc-2'))).toBe(false);
    expect(lines.some((l) => l.includes('WORKER_SIGNAL_UNANSWERED: id=bare-1'))).toBe(false);
  });

  it('REGRESSION: fails OPEN but says NOT MEASURED out loud — a silent catch would recreate the bug', async () => {
    const { lines, log } = capture();
    const r = await reportWorkerSignalStarvation(fakeSupabase([], { throwOn: true }), { now: NOW, log, env: {} });
    expect(r.measured).toBe(false);
    const line = lines.find((l) => l.startsWith('WORKER SIGNALS:'));
    expect(line).toContain('NOT MEASURED');
    // and it must NOT masquerade as a clean zero
    expect(line).not.toContain('unanswered_over_30m=0');
  });

  it('CONTRACT: runs regardless of COORD_DETECTORS_V2 — a visibility counter behind a default-off flag is not visibility', async () => {
    const { lines, log } = capture();
    // COORD_DETECTORS_V2 explicitly off (its real default) — the counter must still report.
    await reportWorkerSignalStarvation(fakeSupabase([
      { id: 'z', sender_session: 'w', sender_type: 'worker', created_at: minsAgo(99), payload: { signal_type: 'stuck' } },
    ]), { now: NOW, log, env: { COORD_DETECTORS_V2: 'false' } });
    expect(lines.find((l) => l.startsWith('WORKER SIGNALS:'))).toContain('unanswered_over_30m=1');
  });

  it('threshold is env-tunable and defaults to the detector default (30m)', () => {
    expect(DEFAULT_THRESHOLD_SEC).toBe(1800);
    expect(resolveThresholdMs({})).toBe(1800 * 1000);
    expect(resolveThresholdMs({ COORD_REPLY_STARVATION_SEC: '600' })).toBe(600 * 1000);
  });

  it('is READ-ONLY: only session_coordination is read, and no write verb is ever invoked', async () => {
    const { log } = capture();
    const sb = fakeSupabase([]);
    await reportWorkerSignalStarvation(sb, { now: NOW, log, env: {} });
    expect(sb.from).toHaveBeenCalledWith('session_coordination');
    expect(sb.from).toHaveBeenCalledTimes(1);
  });
});

describe('both sweep twins report the counter (QF-20260726-921 parity)', () => {
  it('the pass AND the SWEEP_PASS_REGISTRY=off legacy fallback both call the shared helper', () => {
    // Pinning the require + call in BOTH twins: the parity test in tests/ci only counts five other
    // functions, so nothing else would catch a one-sided addition here.
    const fs = require('node:fs');
    const pass = fs.readFileSync('lib/sweep/passes/coordination-detectors.cjs', 'utf8');
    const legacy = fs.readFileSync('lib/sweep/legacy-fallback.cjs', 'utf8');
    for (const [name, src] of [['pass', pass], ['legacy-fallback', legacy]]) {
      expect(src, name + ' must require the shared helper').toContain('worker-signal-starvation.cjs');
      expect(src, name + ' must call it').toContain('reportWorkerSignalStarvation(supabase)');
    }
  });
});
