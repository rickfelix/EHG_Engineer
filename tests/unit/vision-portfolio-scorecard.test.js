/**
 * Unit Tests: Vision Portfolio Scorecard for SD-Next
 * Part of SD-MAN-INFRA-VISION-PORTFOLIO-SCORECARD-001
 *
 * Tests: loadVisionScores(), formatVisionBadge(), displayVisionPortfolioHeader()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadVisionScores } from '../../scripts/modules/sd-next/data-loaders.js';
import { formatVisionBadge, displayVisionPortfolioHeader } from '../../scripts/modules/sd-next/display/vision-scorecard.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRow(sdId, totalScore, daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { sd_id: sdId, total_score: totalScore, scored_at: d.toISOString() };
}

function makeMockSupabase(rows = [], error = null) {
  const query = {
    select: () => query,
    order: () => Promise.resolve({ data: error ? null : rows, error }),
  };
  return { from: () => query };
}

// ─── formatVisionBadge ────────────────────────────────────────────────────

describe('formatVisionBadge', () => {
  it('returns empty string for null', () => {
    expect(formatVisionBadge(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatVisionBadge(undefined)).toBe('');
  });

  it('uses green ANSI for score >= 90', () => {
    const badge = formatVisionBadge(92);
    expect(badge).toContain('[V:92]');
    expect(badge).toContain('\x1b[32m'); // green
  });

  it('uses yellow ANSI for score 80-89', () => {
    const badge = formatVisionBadge(83);
    expect(badge).toContain('[V:83]');
    expect(badge).toContain('\x1b[33m'); // yellow
  });

  it('uses red ANSI for score < 80', () => {
    const badge = formatVisionBadge(72);
    expect(badge).toContain('[V:72]');
    expect(badge).toContain('\x1b[31m'); // red
  });

  it('rounds fractional scores', () => {
    expect(formatVisionBadge(82.7)).toContain('[V:83]');
    expect(formatVisionBadge(79.4)).toContain('[V:79]');
  });

  it('uses yellow at exactly 80 (boundary)', () => {
    const badge = formatVisionBadge(80);
    expect(badge).toContain('\x1b[33m');
  });

  it('uses green at exactly 90 (boundary)', () => {
    const badge = formatVisionBadge(90);
    expect(badge).toContain('\x1b[32m');
  });

  it('includes leading space and reset code', () => {
    const badge = formatVisionBadge(85);
    expect(badge.startsWith(' ')).toBe(true);
    expect(badge).toContain('\x1b[0m'); // reset
  });
});

// ─── loadVisionScores ─────────────────────────────────────────────────────

describe('loadVisionScores', () => {
  it('returns empty Map when no data', async () => {
    const supabase = makeMockSupabase([]);
    const result = await loadVisionScores(supabase);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns empty Map on DB error', async () => {
    const supabase = makeMockSupabase([], { message: 'network error' });
    const result = await loadVisionScores(supabase);
    expect(result.size).toBe(0);
  });

  it('computes avg of last 3 runs for a single SD', async () => {
    const rows = [
      makeRow('SD-FOO-001', 90, 0),
      makeRow('SD-FOO-001', 80, 1),
      makeRow('SD-FOO-001', 70, 2),
      makeRow('SD-FOO-001', 50, 3), // 4th run — excluded from avg
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);

    expect(result.has('SD-FOO-001')).toBe(true);
    const entry = result.get('SD-FOO-001');
    // avg of last 3: (90+80+70)/3 = 80
    expect(entry.avg).toBe(80);
    expect(entry.count).toBe(3);
  });

  it('uses only 1 run when only 1 available', async () => {
    const rows = [makeRow('SD-BAR-001', 75, 0)];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.get('SD-BAR-001').avg).toBe(75);
    expect(result.get('SD-BAR-001').count).toBe(1);
  });

  it('handles multiple SDs independently', async () => {
    const rows = [
      makeRow('SD-A-001', 90, 0),
      makeRow('SD-A-001', 80, 1),
      makeRow('SD-B-001', 60, 0),
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);

    expect(result.size).toBe(2);
    expect(result.get('SD-A-001').avg).toBe(85);
    expect(result.get('SD-B-001').avg).toBe(60);
  });

  it('trend is ▲ when avg improved by >= 5 vs 30d baseline', async () => {
    const rows = [
      makeRow('SD-TREND-001', 80, 0),  // recent
      makeRow('SD-TREND-001', 70, 31), // baseline (>30d)
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.get('SD-TREND-001').trend).toBe('▲');
  });

  it('trend is ▼ when avg declined by >= 5 vs 30d baseline', async () => {
    const rows = [
      makeRow('SD-TREND-002', 60, 0),  // recent
      makeRow('SD-TREND-002', 75, 31), // baseline
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.get('SD-TREND-002').trend).toBe('▼');
  });

  it('trend is → when change is < 5 in either direction', async () => {
    const rows = [
      makeRow('SD-TREND-003', 72, 0),  // recent
      makeRow('SD-TREND-003', 70, 31), // baseline (+2, < 5 threshold)
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.get('SD-TREND-003').trend).toBe('→');
  });

  it('trend is → when no baseline exists (no 30d old scores)', async () => {
    const rows = [makeRow('SD-NEW-001', 85, 0)]; // all recent
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.get('SD-NEW-001').trend).toBe('→');
  });

  it('skips rows with null sd_id', async () => {
    const rows = [
      { sd_id: null, total_score: 90, scored_at: new Date().toISOString() },
      makeRow('SD-VALID-001', 80, 0),
    ];
    const supabase = makeMockSupabase(rows);
    const result = await loadVisionScores(supabase);
    expect(result.size).toBe(1);
    expect(result.has('SD-VALID-001')).toBe(true);
  });

  it('does not throw on unexpected supabase exception', async () => {
    const badSupabase = {
      from: () => { throw new Error('connection refused'); }
    };
    const result = await loadVisionScores(badSupabase);
    expect(result.size).toBe(0);
  });
});

// ─── displayVisionPortfolioHeader ─────────────────────────────────────────

describe('displayVisionPortfolioHeader', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('outputs nothing for empty Map', () => {
    displayVisionPortfolioHeader(new Map());
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('outputs nothing for null', () => {
    displayVisionPortfolioHeader(null);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('outputs portfolio header when scores exist', () => {
    const scores = new Map([
      ['SD-A-001', { avg: 85, trend: '▲', count: 3 }],
      ['SD-B-001', { avg: 70, trend: '→', count: 2 }],
    ]);
    displayVisionPortfolioHeader(scores);
    expect(consoleSpy).toHaveBeenCalledTimes(3); // header + content + footer
    const allOutput = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allOutput).toContain('VISION PORTFOLIO');
    expect(allOutput).toContain('avg=');
    expect(allOutput).toContain('trend=');
    expect(allOutput).toContain('worst=');
  });

  it('computes correct portfolio avg', () => {
    // avg of [85, 75] = 80
    const scores = new Map([
      ['SD-A-001', { avg: 85, trend: '→', count: 1 }],
      ['SD-B-001', { avg: 75, trend: '→', count: 1 }],
    ]);
    displayVisionPortfolioHeader(scores);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('80');
  });

  it('identifies worst-scoring SD correctly', () => {
    const scores = new Map([
      ['SD-A-001', { avg: 90, trend: '▲', count: 3 }],
      ['SD-WORST-001', { avg: 42, trend: '▼', count: 1 }],
      ['SD-B-001', { avg: 75, trend: '→', count: 2 }],
    ]);
    displayVisionPortfolioHeader(scores);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('SD-WORST-001');
    expect(output).toContain('42');
  });

  it('shows ▲ trend when most SDs improving', () => {
    const scores = new Map([
      ['SD-A-001', { avg: 90, trend: '▲', count: 2 }],
      ['SD-B-001', { avg: 85, trend: '▲', count: 2 }],
      ['SD-C-001', { avg: 70, trend: '▼', count: 1 }],
    ]);
    displayVisionPortfolioHeader(scores);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    // 2 up, 1 down → portfolio trend ▲
    expect(output).toContain('▲');
  });
});
