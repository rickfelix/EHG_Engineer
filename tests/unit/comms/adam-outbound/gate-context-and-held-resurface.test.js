/**
 * QF-20260727-589 — the chairman-SMS gate held 100% of sends on two live paths, and the
 * away-bridge recorded those holds as delivered.
 *
 * Two defects, both on the chairman notification path:
 *   (1) TYPE-CONVENTION MISMATCH. etHour() accepted only context.nowHourET (integer) or
 *       context.now (Date). away-bridge and decision-scheduler both treat `now` as an epoch
 *       NUMBER, and the two live call sites passed a literal `{}`. So the rubric threw
 *       unconditionally and the gate returned held/gate_unavailable on EVERY invocation,
 *       time-independently. Merely forwarding the schedulers' own context would ALSO have
 *       thrown — that is why widening etHour is the fix, not just plumbing.
 *   (2) SILENT FAILURE REPORTED AS SUCCESS. away-bridge discarded the sender's return value,
 *       then called markResurfaced() and reported action:'resurfaced' regardless. An owed
 *       decision therefore burned all K re-surfaces while zero texts were sent, and the
 *       K-escalation was reached having reported K successful notifications.
 *
 * The coordinator made fixing (2) a BINDING condition of this row: restoring sends alone
 * would leave a path that lies about outcomes the next time anything holds a send.
 */
import { describe, it, expect, vi } from 'vitest';
import { etHour, inQuietHours } from '../../../../lib/comms/adam-outbound/rubric-engine/lint.js';
import { processOwedDecisions } from '../../../../lib/comms/adam-outbound/away-bridge/index.js';

// ── (a) etHour accepts the epoch-number convention ────────────────────────────
describe('QF-20260727-589 (a) — etHour accepts a finite epoch number', () => {
  const FIXED = Date.parse('2026-07-27T16:00:00Z'); // 12:00 ET (EDT)

  it('accepts an epoch NUMBER — the convention away-bridge/decision-scheduler already use', () => {
    // Threw before this change; this is the assertion that fails on the pre-fix code.
    expect(etHour({ now: FIXED })).toBe(12);
  });

  it('still accepts a Date instance (unchanged contract)', () => {
    expect(etHour({ now: new Date(FIXED) })).toBe(12);
  });

  it('still prefers an explicit nowHourET (deterministic tests keep winning)', () => {
    expect(etHour({ nowHourET: 3, now: FIXED })).toBe(3);
  });

  it('epoch number and Date agree, so the two conventions cannot drift apart', () => {
    expect(etHour({ now: FIXED })).toBe(etHour({ now: new Date(FIXED) }));
  });

  it('STILL FAILS CLOSED on an unusable now — the engine must never guess quiet-hours', () => {
    for (const bad of [{}, { now: null }, { now: 'today' }, { now: NaN }, { now: Infinity }]) {
      expect(() => etHour(bad)).toThrow(/quiet-hours needs/);
    }
  });

  it('quiet-hours evaluates correctly from an epoch number (the derived consumer)', () => {
    // 02:00 ET is inside the 22:00-05:59 window; 12:00 ET is outside.
    expect(inQuietHours({ now: Date.parse('2026-07-27T06:00:00Z') })).toBe(true);
    expect(inQuietHours({ now: FIXED })).toBe(false);
  });
});

// ── (c) a HELD send must not be recorded as resurfaced ────────────────────────
describe('QF-20260727-589 (c) — away-bridge observes the sender verdict', () => {
  // isAway() derives presence from (now - lastInputAt) > awayThresholdMs, both finite NUMBERS —
  // note this module's epoch-number convention, which is the same one etHour now accepts.
  const NOW = Date.parse('2026-07-27T16:00:00Z');
  const AWAY = { now: NOW, lastInputAt: NOW - (60 * 60 * 1000), awayThresholdMs: 5 * 60 * 1000 };

  function makeOwedStore(owed) {
    return {
      getOwedDecisions: vi.fn(async () => owed),
      markResurfaced: vi.fn(async () => {}),
    };
  }
  const owedRow = { owedId: 'o1', message: { body: 'Approve X?', decisionId: 'd1' }, resurfaceCount: 0 };

  it('does NOT mark resurfaced when the gate HELD the send', async () => {
    const owedStore = makeOwedStore([{ ...owedRow }]);
    const sender = vi.fn(async () => ({ sent: false, held: true, reason: 'gate_unavailable' }));

    const results = await processOwedDecisions(AWAY, { owedStore, sender, K: 3 });

    expect(sender).toHaveBeenCalledTimes(1);
    // THE POINT: the re-surface was not spent on a text nobody received.
    expect(owedStore.markResurfaced).not.toHaveBeenCalled();
    expect(results).toEqual([{ owedId: 'o1', action: 'resurface_held', reason: 'gate_unavailable' }]);
  });

  it('treats sent:false as held even without an explicit held flag', async () => {
    const owedStore = makeOwedStore([{ ...owedRow }]);
    const sender = vi.fn(async () => ({ sent: false, reason: 'blocked' }));
    const results = await processOwedDecisions(AWAY, { owedStore, sender, K: 3 });
    expect(owedStore.markResurfaced).not.toHaveBeenCalled();
    expect(results[0].action).toBe('resurface_held');
  });

  it('DOES mark resurfaced on a successful send (the happy path is unchanged)', async () => {
    const owedStore = makeOwedStore([{ ...owedRow }]);
    const sender = vi.fn(async () => ({ sent: true, held: false }));
    const results = await processOwedDecisions(AWAY, { owedStore, sender, K: 3 });
    expect(owedStore.markResurfaced).toHaveBeenCalledWith('o1');
    expect(results).toEqual([{ owedId: 'o1', action: 'resurfaced' }]);
  });

  it('a legacy sender returning nothing keeps its previous meaning (additive, not a redefinition)', async () => {
    const owedStore = makeOwedStore([{ ...owedRow }]);
    const sender = vi.fn(async () => undefined);
    const results = await processOwedDecisions(AWAY, { owedStore, sender, K: 3 });
    expect(owedStore.markResurfaced).toHaveBeenCalledWith('o1');
    expect(results[0].action).toBe('resurfaced');
  });

  it('THE COMPOUND FAILURE: K held sends must not silently spend all K re-surfaces', async () => {
    // Pre-fix, each held send still incremented the count, so an owed decision reached the
    // K-escalation having reported K deliveries while the chairman received nothing.
    const sender = vi.fn(async () => ({ sent: false, held: true, reason: 'gate_unavailable' }));
    let count = 0;
    const owedStore = {
      getOwedDecisions: vi.fn(async () => [{ ...owedRow, resurfaceCount: count }]),
      markResurfaced: vi.fn(async () => { count += 1; }),
    };
    for (let i = 0; i < 3; i++) {
      await processOwedDecisions(AWAY, { owedStore, sender, K: 3 });
    }
    expect(sender).toHaveBeenCalledTimes(3);
    expect(owedStore.markResurfaced).not.toHaveBeenCalled();
    expect(count).toBe(0); // no re-surface was consumed by an undelivered text
  });
});
