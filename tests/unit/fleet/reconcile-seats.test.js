// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — seat reconciliation.

import { describe, it, expect, vi } from 'vitest';
import {
  reconcileSeats,
  classifySeat,
  absentFromClaudeImages,
  isSeatReconcileEnabled,
} from '../../../scripts/reconcile-seats.mjs';
import { MIN_ACTIVITY_SAMPLE_GAP_MS } from '../../../lib/fleet/console-reaper.mjs';

const ON = { FLEET_SEAT_RECONCILE_ENABLED: 'on' };
const idle = { ok: true, identical: true, intervalMs: MIN_ACTIVITY_SAMPLE_GAP_MS };
const busy = { ok: true, identical: false, intervalMs: MIN_ACTIVITY_SAMPLE_GAP_MS };

describe('FR5-SEAT: leg A maps the TRI-STATE probe correctly', () => {
  it('NO_MATCH means absent — leg A satisfied', () => {
    expect(absentFromClaudeImages('NO_MATCH')).toBe(true);
  });

  it('MATCH means a live claude.exe still carries the pid', () => {
    expect(absentFromClaudeImages('MATCH')).toBe(false);
  });

  it('PROBE_FAILED IS NOT ABSENCE — it must not read as death', () => {
    // The single most dangerous direction for this classifier: a broken probe reading as "dead"
    // would reconcile live seats away.
    expect(absentFromClaudeImages('PROBE_FAILED')).toBeNull();
    expect(absentFromClaudeImages(undefined)).toBeNull();
  });
});

describe('FR5-SEAT: a seat is DEAD only on both legs', () => {
  const seat = { session_id: 's1', pid: 4242 };

  it('absent AND idle => dead', async () => {
    const r = await classifySeat({}, seat, { probePid: () => 'NO_MATCH', sample: async () => idle });
    expect(r.dead).toBe(true);
  });

  it('absent but WORKING => alive', async () => {
    const r = await classifySeat({}, seat, { probePid: () => 'NO_MATCH', sample: async () => busy });
    expect(r.dead).toBe(false);
  });

  it('idle but a live claude.exe carries the pid => alive', async () => {
    const r = await classifySeat({}, seat, { probePid: () => 'MATCH', sample: async () => idle });
    expect(r.dead).toBe(false);
  });

  it('a FAILED probe => not dead', async () => {
    const r = await classifySeat({}, seat, { probePid: () => 'PROBE_FAILED', sample: async () => idle });
    expect(r.dead).toBe(false);
  });

  it('a seat with no pid cannot satisfy leg A', async () => {
    const r = await classifySeat({}, { session_id: 's2', pid: null }, { probePid: () => 'NO_MATCH', sample: async () => idle });
    expect(r.dead).toBe(false);
  });
});

describe('FR5-SEAT: report-only unless BOTH gates are open', () => {
  const seats = [{ session_id: 'dead-1', pid: 1 }, { session_id: 'live-1', pid: 2 }];
  const classify = async (_sb, s) => ({ session_id: s.session_id, dead: s.session_id === 'dead-1', legA: true, legB: true, why: '' });

  it('writes NOTHING without --reconcile', async () => {
    const markReleased = vi.fn();
    const r = await reconcileSeats({}, { env: ON, write: false, loadSeats: async () => seats, classify, markReleased, onLog: () => {} });
    expect(markReleased).not.toHaveBeenCalled();
    expect(r.reportOnly).toBe(true);
    expect(r.dead).toEqual(['dead-1']); // still REPORTS
  });

  it('writes NOTHING with --reconcile but the flag unset', async () => {
    const markReleased = vi.fn();
    const r = await reconcileSeats({}, { env: {}, write: true, loadSeats: async () => seats, classify, markReleased, onLog: () => {} });
    expect(markReleased).not.toHaveBeenCalled();
    expect(r.reportOnly).toBe(true);
  });

  it('writes ONLY when both --reconcile and the flag agree', async () => {
    const markReleased = vi.fn(async () => {});
    const r = await reconcileSeats({}, { env: ON, write: true, loadSeats: async () => seats, classify, markReleased, onLog: () => {} });
    expect(markReleased).toHaveBeenCalledTimes(1);
    expect(markReleased).toHaveBeenCalledWith('dead-1');
    expect(r.wrote).toBe(1);
  });

  it('a failed release does not abort the rest of the sweep', async () => {
    const many = [{ session_id: 'd1', pid: 1 }, { session_id: 'd2', pid: 2 }];
    const allDead = async (_sb, s) => ({ session_id: s.session_id, dead: true, legA: true, legB: true, why: '' });
    const markReleased = vi.fn(async (id) => { if (id === 'd1') throw new Error('rls denied'); });
    const r = await reconcileSeats({}, { env: ON, write: true, loadSeats: async () => many, classify: allDead, markReleased, onLog: () => {} });
    expect(r.wrote).toBe(1);
  });

  it('the flag is exact-match opt-in', () => {
    expect(isSeatReconcileEnabled({})).toBe(false);
    expect(isSeatReconcileEnabled({ FLEET_SEAT_RECONCILE_ENABLED: 'true' })).toBe(false);
    expect(isSeatReconcileEnabled(ON)).toBe(true);
  });
});
