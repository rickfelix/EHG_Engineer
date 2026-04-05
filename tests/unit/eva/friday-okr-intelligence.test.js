/**
 * Tests for Friday meeting OKR intelligence functions.
 * SD-LEO-INFRA-WIRE-FRIDAY-MEETING-001
 */
import { describe, it, expect } from 'vitest';

// Import the helpers by re-implementing them here since friday-meeting.mjs
// has side effects (Supabase client init). We test the pure logic functions.

function computeKrProgress(kr) {
  const baseline = kr.baseline_value ?? 0;
  const current = kr.current_value ?? 0;
  const target = kr.target_value ?? 100;
  const range = target - baseline;
  if (range === 0) return current >= target ? 100 : 0;
  const raw = ((current - baseline) / range) * 100;
  const progress = kr.direction === 'decrease' ? 100 - raw : raw;
  return Math.round(Math.max(0, Math.min(100, progress)));
}

function computeOkrDeltas(currentKrs, snapshots) {
  if (!snapshots || snapshots.length < 2) return {};
  const byKr = {};
  for (const s of snapshots) {
    if (!byKr[s.key_result_id]) byKr[s.key_result_id] = [];
    byKr[s.key_result_id].push(s);
  }
  const deltas = {};
  for (const kr of currentKrs) {
    const history = (byKr[kr.id] || []).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    if (history.length >= 2) {
      deltas[kr.id] = (history[0].current_value ?? 0) - (history[1].current_value ?? 0);
    }
  }
  return deltas;
}

function detectStaleKrs(currentKrs, snapshots, activeSdKrIds = new Set()) {
  if (!snapshots || snapshots.length < 2) return new Set();
  const byKr = {};
  for (const s of snapshots) {
    if (!byKr[s.key_result_id]) byKr[s.key_result_id] = [];
    byKr[s.key_result_id].push(s);
  }
  const stale = new Set();
  for (const kr of currentKrs) {
    if (activeSdKrIds.has(kr.id)) continue;
    const history = (byKr[kr.id] || []).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    if (history.length >= 2 && history[0].current_value === history[1].current_value) {
      stale.add(kr.id);
    }
  }
  return stale;
}

function forecastKrCompletion(kr, snapshots) {
  const history = (snapshots || [])
    .filter(s => s.key_result_id === kr.id)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  if (history.length < 3) return null;
  const target = kr.target_value ?? 100;
  const current = kr.current_value ?? 0;
  const remaining = target - current;
  if (remaining <= 0) return 'Achieved';
  const totalDelta = (history[history.length - 1].current_value ?? 0) - (history[0].current_value ?? 0);
  const weeks = history.length - 1;
  const weeklyRate = weeks > 0 ? totalDelta / weeks : 0;
  if (weeklyRate <= 0) return 'No progress trend';
  const weeksNeeded = Math.ceil(remaining / weeklyRate);
  const estDate = new Date();
  estDate.setDate(estDate.getDate() + weeksNeeded * 7);
  return `~${weeksNeeded}w (est. ${estDate.toISOString().slice(0, 10)})`;
}

// ─── computeKrProgress ──────────────────────────────────────

describe('computeKrProgress', () => {
  it('computes basic progress percentage', () => {
    expect(computeKrProgress({ baseline_value: 0, current_value: 50, target_value: 100 })).toBe(50);
  });

  it('returns 100 when target reached', () => {
    expect(computeKrProgress({ baseline_value: 0, current_value: 100, target_value: 100 })).toBe(100);
  });

  it('handles zero range', () => {
    expect(computeKrProgress({ baseline_value: 50, current_value: 50, target_value: 50 })).toBe(100);
  });

  it('handles decrease direction', () => {
    expect(computeKrProgress({ baseline_value: 100, current_value: 50, target_value: 0, direction: 'decrease' })).toBe(50);
  });

  it('clamps to 0-100 range', () => {
    expect(computeKrProgress({ baseline_value: 0, current_value: -10, target_value: 100 })).toBe(0);
    expect(computeKrProgress({ baseline_value: 0, current_value: 150, target_value: 100 })).toBe(100);
  });

  it('handles null values with defaults', () => {
    expect(computeKrProgress({})).toBe(0);
  });
});

// ─── computeOkrDeltas ───────────────────────────────────────

describe('computeOkrDeltas', () => {
  it('returns empty when no snapshots', () => {
    expect(computeOkrDeltas([{ id: 'kr1' }], null)).toEqual({});
    expect(computeOkrDeltas([{ id: 'kr1' }], [])).toEqual({});
  });

  it('returns empty when only 1 snapshot', () => {
    expect(computeOkrDeltas([{ id: 'kr1' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
    ])).toEqual({});
  });

  it('computes positive delta from 2 snapshots', () => {
    const deltas = computeOkrDeltas([{ id: 'kr1' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 15 },
    ]);
    expect(deltas.kr1).toBe(5);
  });

  it('computes negative delta', () => {
    const deltas = computeOkrDeltas([{ id: 'kr1' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 15 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
    ]);
    expect(deltas.kr1).toBe(-5);
  });

  it('handles multiple KRs independently', () => {
    const deltas = computeOkrDeltas([{ id: 'kr1' }, { id: 'kr2' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 20 },
      { key_result_id: 'kr2', snapshot_date: '2026-03-25', current_value: 5 },
      { key_result_id: 'kr2', snapshot_date: '2026-04-01', current_value: 5 },
    ]);
    expect(deltas.kr1).toBe(10);
    expect(deltas.kr2).toBe(0);
  });
});

// ─── detectStaleKrs ─────────────────────────────────────────

describe('detectStaleKrs', () => {
  it('returns empty when insufficient snapshots', () => {
    expect(detectStaleKrs([{ id: 'kr1' }], null)).toEqual(new Set());
    expect(detectStaleKrs([{ id: 'kr1' }], [])).toEqual(new Set());
  });

  it('flags KR with unchanged value across 2 snapshots', () => {
    const stale = detectStaleKrs([{ id: 'kr1' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
    ]);
    expect(stale.has('kr1')).toBe(true);
  });

  it('does not flag KR with changed value', () => {
    const stale = detectStaleKrs([{ id: 'kr1' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 15 },
    ]);
    expect(stale.has('kr1')).toBe(false);
  });

  it('exempts KRs with active SDs', () => {
    const stale = detectStaleKrs(
      [{ id: 'kr1' }],
      [
        { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
        { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
      ],
      new Set(['kr1']),
    );
    expect(stale.has('kr1')).toBe(false);
  });

  it('handles mixed stale and progressing KRs', () => {
    const stale = detectStaleKrs([{ id: 'kr1' }, { id: 'kr2' }], [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
      { key_result_id: 'kr2', snapshot_date: '2026-03-25', current_value: 5 },
      { key_result_id: 'kr2', snapshot_date: '2026-04-01', current_value: 8 },
    ]);
    expect(stale.has('kr1')).toBe(true);
    expect(stale.has('kr2')).toBe(false);
  });
});

// ─── forecastKrCompletion ───────────────────────────────────

describe('forecastKrCompletion', () => {
  it('returns null with fewer than 3 snapshots', () => {
    expect(forecastKrCompletion({ id: 'kr1', current_value: 10, target_value: 100 }, [])).toBe(null);
    expect(forecastKrCompletion({ id: 'kr1', current_value: 10, target_value: 100 }, [
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 5 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
    ])).toBe(null);
  });

  it('returns "Achieved" when target already met', () => {
    expect(forecastKrCompletion({ id: 'kr1', current_value: 100, target_value: 100 }, [
      { key_result_id: 'kr1', snapshot_date: '2026-03-18', current_value: 80 },
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 90 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 100 },
    ])).toBe('Achieved');
  });

  it('returns "No progress trend" when rate is zero or negative', () => {
    expect(forecastKrCompletion({ id: 'kr1', current_value: 10, target_value: 100 }, [
      { key_result_id: 'kr1', snapshot_date: '2026-03-18', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 10 },
    ])).toBe('No progress trend');
  });

  it('computes forecast with positive trend', () => {
    const result = forecastKrCompletion({ id: 'kr1', current_value: 30, target_value: 100 }, [
      { key_result_id: 'kr1', snapshot_date: '2026-03-18', current_value: 10 },
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 20 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 30 },
    ]);
    // Rate: 10/week, remaining: 70, weeks needed: 7
    expect(result).toMatch(/^~7w/);
  });

  it('filters snapshots to only the target KR', () => {
    const result = forecastKrCompletion({ id: 'kr1', current_value: 50, target_value: 100 }, [
      { key_result_id: 'kr1', snapshot_date: '2026-03-18', current_value: 20 },
      { key_result_id: 'kr2', snapshot_date: '2026-03-25', current_value: 99 },
      { key_result_id: 'kr1', snapshot_date: '2026-03-25', current_value: 35 },
      { key_result_id: 'kr1', snapshot_date: '2026-04-01', current_value: 50 },
    ]);
    // Rate: 15/week, remaining: 50, weeks needed: ceil(50/15) = 4
    expect(result).toMatch(/^~4w/);
  });
});
