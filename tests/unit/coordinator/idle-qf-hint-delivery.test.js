/**
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-5 / FR-6 — dispatch delivery integrity.
 *
 * THE DEFECT (FR-5). insertCoordinationRow → assertDispatchTarget fails closed and THROWS. Called
 * bare inside the per-worker loop, that propagated to main().catch and exited the process, so ONE
 * seat whose heartbeat had aged past the cutoff starved every worker later in the loop. Observed
 * fleet-wide on 2026-07-26: no worker anywhere was offered anything.
 *
 * THE DEFECT (FR-6). Telemetry printed `hinted=N`, a bare count. It is internally self-consistent
 * at 1-of-10 and at 9-of-10, so no case can contradict another: the metric cannot fail, therefore
 * it cannot detect. A pass reporting completion while reaching a minority is the same camouflage as
 * a stranded QF the gauge still counts — the other half of this SD.
 *
 * WHY THE FAILING TARGET IS IN THE MIDDLE. If it were first, an implementation that aborts on the
 * first error and one that skips are indistinguishable when you only check "the last worker got
 * theirs". Middle placement forces the loop to prove it continued PAST a failure.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDeliveryRatio,
  shouldAlarmDelivery,
  deliverHints,
  emitDeliveryAlarm,
  deliveryAlarmDedupKey,
  DELIVERY_MIN_SAMPLE,
  DELIVERY_ALARM_THRESHOLD,
  DELIVERY_ALARM_EVENT,
} from '../../../scripts/coordinator-idle-qf-hint.mjs';

const worker = (id) => ({ session_id: id, metadata: {} });
const qf = (id) => ({ id, severity: 'critical', routing_tier: 1 });
const newSummary = () => ({ idleWorkers: 0, hinted: 0, skippedGated: 0, attempted: 0, undelivered: 0, undeliveredReasons: [] });

describe('FR-5: one undeliverable addressee must not starve the others', () => {
  it('CONTINUES past a failure in the MIDDLE of the list', async () => {
    // Middle placement is deliberate. With the failing target FIRST, "abort on error" and
    // "skip and continue" are indistinguishable if you only check that someone got a hint.
    const sent = [];
    const insertRow = async (_sb, row) => {
      if (row.target_session === 'w2') { const e = new Error('stale heartbeat'); e.code = 'DISPATCH_TARGET_INVALID'; throw e; }
      sent.push(row.target_session);
    };
    const summary = newSummary();
    await deliverHints([worker('w1'), worker('w2'), worker('w3')], [qf('QF-A'), qf('QF-B'), qf('QF-C')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow });

    expect(sent).toEqual(['w1', 'w3']);        // the pass reached PAST the bad addressee
    expect(summary.hinted).toBe(2);
    expect(summary.attempted).toBe(3);          // the denominator that makes 2-of-3 legible
    expect(summary.undelivered).toBe(1);
    expect(summary.undeliveredReasons[0]).toMatch(/DISPATCH_TARGET_INVALID/);
  });

  it('does NOT swallow the QF that failed to deliver — supply is preserved', async () => {
    // A skipped worker must not consume the work item. If the QF were dropped, one unreachable
    // seat would silently reduce fleet supply — the same disappearing-work defect as Part A,
    // arriving by a different route.
    const sent = [];
    const insertRow = async (_sb, row) => {
      if (row.target_session === 'w1') throw new Error('unreachable');
      sent.push(row.qfId || row.target_session);
    };
    const summary = newSummary();
    await deliverHints([worker('w1'), worker('w2')], [qf('QF-ONLY')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow });

    expect(summary.attempted).toBe(2);
    expect(summary.hinted).toBe(1);   // w2 still received the one available QF
  });

  it('does not throw out of the pass — the process must survive', async () => {
    // The original defect propagated to main().catch and exit(1). Every worker later in the loop
    // was starved. This asserts the loop itself no longer terminates the run.
    const summary = newSummary();
    await expect(deliverHints([worker('w1')], [qf('QF-A')], {
      summary, supabase: {}, coordinatorId: 'coord',
      insertRow: async () => { throw new Error('always fails'); },
    })).resolves.toBeDefined();
    expect(summary.hinted).toBe(0);
    expect(summary.attempted).toBe(1);   // an all-failed pass is VISIBLE, not silent
  });

  it('dry-run attempts without writing', async () => {
    let calls = 0;
    const summary = newSummary();
    await deliverHints([worker('w1')], [qf('QF-A')],
      { summary, supabase: {}, coordinatorId: 'coord', dryRun: true, insertRow: async () => { calls += 1; } });
    expect(calls).toBe(0);
    expect(summary.hinted).toBe(1);
    expect(summary.attempted).toBe(1);
  });
});

describe('FR-6: computeDeliveryRatio carries the denominator', () => {
  it('makes 1-of-10 and 9-of-10 OBSERVABLY different', () => {
    // The load-bearing assertion. A bare count passes every other test in this file; only the
    // presence of a denominator makes these two states distinguishable at all.
    const bad = computeDeliveryRatio({ delivered: 1, attempted: 10 });
    const good = computeDeliveryRatio({ delivered: 9, attempted: 10 });
    expect(bad.ratio).toBeCloseTo(0.1);
    expect(good.ratio).toBeCloseTo(0.9);
    expect(bad).not.toEqual(good);
  });

  it('always reports BOTH numbers, never one', () => {
    const r = computeDeliveryRatio({ delivered: 2, attempted: 3 });
    expect(r.delivered).toBe(2);
    expect(r.attempted).toBe(3);   // the number whose absence caused the defect
  });

  it('distinguishes an IDLE tick from delivering to nobody', () => {
    // attempted=0 is "no eligible workers", not "reached none of them". null rather than 0/NaN
    // keeps those apart — collapsing them would make a quiet fleet look like an outage.
    expect(computeDeliveryRatio({ delivered: 0, attempted: 0 }).ratio).toBeNull();
    expect(computeDeliveryRatio({ delivered: 0, attempted: 5 }).ratio).toBe(0);
  });
});

describe('FR-6: the alarm fires on a degraded ratio', () => {
  it('FIRES at 1-of-10 — the only case an always-off alarm fails', () => {
    // Without this arm every other assertion here is satisfied by `return false`, which is an
    // alarm that can never fire: it would pass its own tests while reporting nothing, forever.
    expect(shouldAlarmDelivery({ delivered: 1, attempted: 10 })).toBe(true);
  });

  it('stays silent at full delivery', () => {
    expect(shouldAlarmDelivery({ delivered: 10, attempted: 10 })).toBe(false);
  });

  it('stays silent below the minSample floor, but NOT because delivered is zero', () => {
    // Paired deliberately: 0-of-1 is suppressed by the FLOOR, 0-of-10 is not. If the suppression
    // were a delivered===0 special case instead, the second line would wrongly stay false and a
    // total outage would be silent — the worst possible failure for this alarm.
    expect(shouldAlarmDelivery({ delivered: 0, attempted: 1 })).toBe(false);
    expect(shouldAlarmDelivery({ delivered: 0, attempted: 10 })).toBe(true);
  });

  it('does not fire on an idle tick', () => {
    expect(shouldAlarmDelivery({ delivered: 0, attempted: 0 })).toBe(false);
  });

  it('exposes the threshold and floor as named constants, not magic numbers', () => {
    // An operator has to be able to see what "degraded" means without reading the implementation.
    expect(DELIVERY_ALARM_THRESHOLD).toBeGreaterThan(0);
    expect(DELIVERY_ALARM_THRESHOLD).toBeLessThanOrEqual(1);
    expect(DELIVERY_MIN_SAMPLE).toBeGreaterThan(1);
    // Right at the threshold is NOT degraded — pinned so a future refactor cannot flip < to <=
    // and start alarming on healthy passes.
    expect(shouldAlarmDelivery({ delivered: 8, attempted: 10, threshold: 0.8 })).toBe(false);
    expect(shouldAlarmDelivery({ delivered: 7, attempted: 10, threshold: 0.8 })).toBe(true);
  });
});

describe('FR-5/FR-6: a RESOLVED failure counts against the ratio, never toward it', () => {
  it('counts a {error} result as UNDELIVERED — the shape insertCoordinationRow actually returns', async () => {
    // THE GAP THIS CLOSES. insertCoordinationRow throws on exactly ONE class (the enum violation,
    // QF-20260725-367) and deliberately RETURNS {data, error} for everything else, so that callers
    // "that legitimately inspect {data, error} for transient faults keep today's behaviour". This
    // is such a caller. Catching only throws therefore books an RLS denial as a DELIVERY, and the
    // ratio reports a confident 3-of-3 while a row was dropped — this SD's own camouflage,
    // reassembled inside the metric built to detect it.
    const summary = newSummary();
    const insertRow = async (_sb, row) => (row.target_session === 'w2'
      ? { data: null, error: { code: '42501', message: 'permission denied for table session_coordination' } }
      : { data: { id: 'ok' }, error: null });

    await deliverHints([worker('w1'), worker('w2'), worker('w3')], [qf('QF-A'), qf('QF-B'), qf('QF-C')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow });

    expect(summary.hinted).toBe(2);        // NOT 3 — pre-fix this read 3
    expect(summary.attempted).toBe(3);
    expect(summary.undelivered).toBe(1);
    expect(summary.undeliveredReasons[0]).toMatch(/42501/);
  });

  it('puts BOTH fail-shapes in the SAME denominator', async () => {
    // A thrown fault and a resolved-with-error fault are the same event to the fleet. If only one
    // reaches `undelivered`, the ratio silently under-reports an entire class of failure — and the
    // class it drops is the more common one.
    const summary = newSummary();
    const insertRow = async (_sb, row) => {
      if (row.target_session === 'w1') { const e = new Error('stale'); e.code = 'DISPATCH_TARGET_INVALID'; throw e; }
      if (row.target_session === 'w2') return { data: null, error: { code: 'RLS_DENIED', message: 'denied' } };
      return { data: { id: 'ok' }, error: null };
    };

    await deliverHints([worker('w1'), worker('w2'), worker('w3')], [qf('QF-A'), qf('QF-B'), qf('QF-C')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow });

    expect(summary.undelivered).toBe(2);
    expect(summary.hinted).toBe(1);
    expect(summary.attempted).toBe(3);
    const reasons = summary.undeliveredReasons.join(',');
    expect(reasons).toMatch(/DISPATCH_TARGET_INVALID/);
    expect(reasons).toMatch(/RLS_DENIED/);
  });

  it('does not swallow the QF when the failure was a resolved error', async () => {
    // Same supply-preservation contract as the throw path: an unreachable seat must not consume
    // the work item, or one bad addressee silently reduces fleet supply.
    const summary = newSummary();
    const insertRow = async (_sb, row) => (row.target_session === 'w1'
      ? { data: null, error: { code: 'RLS_DENIED', message: 'denied' } }
      : { data: { id: 'ok' }, error: null });

    await deliverHints([worker('w1'), worker('w2')], [qf('QF-ONLY')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow });

    expect(summary.hinted).toBe(1);   // w2 still received the one available QF
    expect(summary.attempted).toBe(2);
  });

  it('still treats a void-returning writer as success — production and fakes unchanged', async () => {
    // Guards the compatibility direction: the new check keys on a PRESENT error, not on a truthy
    // return, so writers that resolve undefined keep their existing meaning.
    const summary = newSummary();
    await deliverHints([worker('w1')], [qf('QF-A')],
      { summary, supabase: {}, coordinatorId: 'coord', insertRow: async () => undefined });
    expect(summary.hinted).toBe(1);
    expect(summary.undelivered).toBe(0);
  });
});

describe('FR-6: the alarm is DURABLE, not merely loud', () => {
  const degraded = { delivered: 1, attempted: 10 };

  it('writes ONE queryable record, carrying the ratio AND its parts', async () => {
    // FR-6 opens "a logged skip count is a record nobody reads" — so a console.error alarm in an
    // unattended coordinator tick reproduces the very defect. And a durable record naming only
    // "degraded" without its numbers would repeat the denominator-less failure in stored form.
    const events = [];
    const r = await emitDeliveryAlarm({}, {
      ...degraded,
      emit: async (_sb, ev) => { events.push(ev); return { ok: true, id: 'evt-1' }; },
      hasPriorAlarm: async () => false,
    });

    expect(r.alarmed).toBe(true);
    expect(r.event_id).toBe('evt-1');
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe(DELIVERY_ALARM_EVENT);
    expect(events[0].payload).toMatchObject({ delivered: 1, attempted: 10, threshold: DELIVERY_ALARM_THRESHOLD });
    expect(events[0].payload.ratio).toBeCloseTo(0.1);
    expect(events[0].payload.dedup_key).toBeTruthy();
  });

  it('writes NOTHING at full delivery or below the minSample floor', async () => {
    let calls = 0;
    const emit = async () => { calls += 1; return { ok: true, id: 'x' }; };
    const full = await emitDeliveryAlarm({}, { delivered: 10, attempted: 10, emit, hasPriorAlarm: async () => false });
    const tiny = await emitDeliveryAlarm({}, { delivered: 0, attempted: 1, emit, hasPriorAlarm: async () => false });
    expect(full.alarmed).toBe(false);
    expect(tiny.alarmed).toBe(false);
    expect(calls).toBe(0);            // the floor and the threshold gate the WRITE, not just a flag
  });

  it('does NOT claim to have alarmed when the write failed', async () => {
    // logCoordinationEvent is fail-open BY CONTRACT — {ok:false}, never a throw. An unchecked call
    // would report a degraded pass as alarmed while nothing was recorded: reporting success having
    // delivered nothing, one layer above the bug this SD removes.
    const warned = [];
    const r = await emitDeliveryAlarm({}, {
      ...degraded,
      emit: async () => ({ ok: false, error: 'insert failed' }),
      hasPriorAlarm: async () => false,
      logger: { warn: (m) => warned.push(m) },
    });
    expect(r.alarmed).toBe(false);
    expect(r.reason).toBe('alarm_write_failed');
    expect(warned.join(' ')).toMatch(/UNRECORDED/);
  });

  it('suppresses a repeat in-window, but FAILS OPEN when the dedup read faults', async () => {
    // Paired deliberately. Suppression stops a persistent condition flooding the bus; but a dedup
    // read that errors must never swallow the alarm. A duplicate record is cheap; a lost outage
    // signal is this SD's entire failure class. An implementation that fails CLOSED here would
    // pass the suppression arm alone.
    let emitted = 0;
    const emit = async () => { emitted += 1; return { ok: true, id: 'e' }; };

    const dup = await emitDeliveryAlarm({}, { ...degraded, emit, hasPriorAlarm: async () => true });
    expect(dup.alarmed).toBe(false);
    expect(dup.reason).toBe('deduped');
    expect(emitted).toBe(0);

    const faulted = await emitDeliveryAlarm({}, {
      ...degraded, emit, hasPriorAlarm: async () => { throw new Error('read failed'); },
    });
    expect(faulted.alarmed).toBe(true);
    expect(emitted).toBe(1);
  });

  it('keys dedup per WINDOW, so a persistent condition alarms again next window', () => {
    const w = 60 * 60 * 1000;
    expect(deliveryAlarmDedupKey(0, w)).toBe(deliveryAlarmDedupKey(w - 1, w));
    expect(deliveryAlarmDedupKey(0, w)).not.toBe(deliveryAlarmDedupKey(w, w));
  });
});
