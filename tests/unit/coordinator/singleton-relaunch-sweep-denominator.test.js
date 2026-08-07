// SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 (FR-3) — the relaunch sweep's denominator.
//
// MEASURED STATE THAT MOTIVATED THIS: payload.kind='singleton_relaunch_scheduled' reads 0 of 5,166
// session_coordination rows, LIFETIME. The sweep recorded NOTHING when it declined, so that zero
// could not be read from inside the database at all.
//
// A CORRECTION THE SD ITSELF NEEDS: the SD searched system_events for %relaunch%, found nothing, and
// concluded the relaunch net had no recorder. It HAS one — writeScheduleRecord — in
// session_coordination. The SD looked in the wrong table. The denominator goes to system_events so
// that original diagnostic query answers truthfully instead of misleading the next reader.
//
// WHY THIS MATTERS MORE THAN THE COUNT: proving the sweep runs at all currently requires LEAVING the
// system and reading GitHub Actions history (singleton-relaunch-cron.yml, 10 consecutive successes).
// That is the same "induce it and watch" cost the SD was filed about, wearing different clothes.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  summarizeSweep,
  recordSweepEvaluation,
  sweepAuditFailures,
} from '../../../lib/coordinator/singleton-relaunch-trigger.js';

const capture = () => {
  const rows = [];
  return { rows, sb: { from: () => ({ insert: async (r) => { rows.push(r); return { error: null }; } }) } };
};
const errorSb = { from: () => ({ insert: async () => ({ error: { message: 'permission denied' } }) }) };
const throwingSb = { from: () => ({ insert: async () => { throw new Error('socket hang up'); } }) };

const declined = [
  { role: 'adam', scheduled: false, reason: 'fleet_busy' },
  { role: 'solomon', scheduled: false, reason: 'fleet_busy' },
  { role: 'coordinator', scheduled: false, reason: 'target_not_idle' },
];

beforeEach(() => { sweepAuditFailures.singleton_relaunch_evaluated = 0; });

describe('FR-3: an all-declined sweep is still recorded', () => {
  // THE LOAD-BEARING TEST. Recording only sweeps that scheduled something would reproduce exactly
  // the blindness being fixed — the all-declined sweep IS the case in question.
  it('writes a row even when nothing was scheduled', async () => {
    const { rows, sb } = capture();
    await recordSweepEvaluation(sb, declined, { now: '2026-08-03T06:00:00Z' });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('singleton_relaunch_evaluated');
    expect(rows[0].payload.evaluated).toBe(3);
    expect(rows[0].payload.scheduled).toBe(0);
  });

  // The two states the SD is about. Before FR-3 both were the same observation: nothing.
  it('distinguishes ran-and-declined from never-ran', async () => {
    const { rows, sb } = capture();
    await recordSweepEvaluation(sb, declined, {});
    expect(rows[0].payload.evaluated).toBeGreaterThan(0);  // it RAN
    expect(rows[0].payload.scheduled).toBe(0);             // and declined — readable, not alarming
    // never-ran is the absence of any such row, which is now a distinguishable observation
    const { rows: none } = capture();
    expect(none).toEqual([]);
  });

  // by_reason is the field that does the work: a bare zero is not diagnosable, a reason breakdown
  // names which precondition is blocking — and an all-unknown_role breakdown would expose a wiring
  // fault that the count alone would hide.
  it('breaks the declines down by reason', async () => {
    const { rows, sb } = capture();
    await recordSweepEvaluation(sb, declined, {});
    expect(rows[0].payload.by_reason).toEqual({ fleet_busy: 2, target_not_idle: 1 });
    expect(rows[0].payload.guard).toBe('singleton_relaunch');
  });

  it('counts a genuine schedule in the numerator', () => {
    const s = summarizeSweep([
      { role: 'adam', scheduled: true, reason: 'behind_and_quiescent' },
      { role: 'solomon', scheduled: false, reason: 'fleet_busy' },
    ]);
    expect(s.evaluated).toBe(2);
    expect(s.scheduled).toBe(1);
  });

  it('tolerates a malformed result set rather than mislabelling it', () => {
    const s = summarizeSweep([null, undefined, { role: 'adam' }]);
    expect(s.evaluated).toBe(1);
    expect(s.scheduled).toBe(0);
    expect(s.by_reason).toEqual({ no_reason_recorded: 1 });   // never silently counted as a decline
  });

  it('handles a non-array without throwing', () => {
    expect(summarizeSweep(undefined).evaluated).toBe(0);
    expect(summarizeSweep('nonsense').evaluated).toBe(0);
  });
});

describe('FR-3 inherits FR-1: the denominator writer cannot itself be silent', () => {
  it('counts and reports a returned error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await recordSweepEvaluation(errorSb, declined, {});
      expect(sweepAuditFailures.singleton_relaunch_evaluated).toBe(1);
      const said = warn.mock.calls.flat().join(' ');
      expect(said).toMatch(/SWEEP-COUNT WRITE FAILED/);
      expect(said).toMatch(/uninterpretable/);
    } finally { warn.mockRestore(); }
  });

  it('counts and reports a thrown error too — both failure shapes, not just the tidy one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await recordSweepEvaluation(throwingSb, declined, {});
      expect(sweepAuditFailures.singleton_relaunch_evaluated).toBe(1);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/at least 1 sweep/);
    } finally { warn.mockRestore(); }
  });

  // CONTROL — telemetry that could break the relaunch net would trade an observability gap for the
  // very outage the net exists to prevent.
  it('CONTROL: never throws, so it cannot break the sweep', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(recordSweepEvaluation(throwingSb, declined, {})).resolves.toBeTruthy();
      const hostile = { from: () => { throw new Error('client exploded'); } };
      await expect(recordSweepEvaluation(hostile, declined, {})).resolves.toBeTruthy();
      expect(sweepAuditFailures.singleton_relaunch_evaluated).toBe(2);
    } finally { warn.mockRestore(); }
  });

  it('CONTROL: a successful write neither counts nor warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { sb } = capture();
      await recordSweepEvaluation(sb, declined, {});
      expect(sweepAuditFailures.singleton_relaunch_evaluated).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
});

// THE WIRING TEST. This SD's own investigation found relaunchOntoFreshCheckout — a fully built,
// fully tested relaunch executor with ZERO production callers. A recorder that exists but is never
// invoked emits the same unreadable zero as no recorder at all, so shipping one unwired would
// reproduce the defect while appearing to fix it.
describe('FR-3: the recorder is actually CALLED by the sweep', () => {
  it('evaluateAllSingletons invokes recordSweepEvaluation', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../../lib/coordinator/singleton-relaunch-trigger.js', import.meta.url), 'utf8'));
    const body = src.slice(src.indexOf('export async function evaluateAllSingletons'));
    expect(body).toMatch(/await recordSweepEvaluation\(supabase, results\)/);
    // and it is reached on every path — not tucked behind a scheduled-something branch
    const upToCall = body.slice(0, body.indexOf('await recordSweepEvaluation'));
    expect(upToCall).not.toMatch(/if\s*\([^)]*scheduled/);
  });
});
