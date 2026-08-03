/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D (FR-1) — Gantt SVG + PNG renderer.
 * Hand-rolled, no external network/AI-generation call — no mocks needed beyond the real sharp lib.
 */
import { describe, it, expect } from 'vitest';
import { buildGanttSvg, renderGanttPng } from '../../../lib/chairman/daily-review/gantt-renderer.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const waves = [
  { wave_id: 'w1', title: 'Wave 1: Foundation', status: 'active', progress_pct: 71 },
  { wave_id: 'w2', title: 'Wave 2: Revenue rails', status: 'approved', progress_pct: 20 },
];

describe('buildGanttSvg (FR-1)', () => {
  // SD-LEO-INFRA-ROADMAP-WAVES-PROGRESS-001 (FR-2): this test previously ASSERTED the fallback —
  // it required '71%' and '20%' to appear for waves that carry no item_counts. QF-20260719-275
  // removed the fallback from the primary path but left it as a fallback AND pinned it here, so
  // the surviving half of the defect was defended by the suite: anyone deleting it was told they
  // had broken something. The rung-level values it asserts (71, 20) are the very numbers the live
  // table still holds across four and two waves respectively. Now inverted.
  it('renders each wave title and emits NO percentage when item_counts is absent', () => {
    const svg = buildGanttSvg(waves);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Wave 1: Foundation');
    expect(svg).toContain('Wave 2: Revenue rails');
    expect(svg).not.toContain('71%');
    expect(svg).not.toContain('20%');
    expect(svg).toContain('not yet scoped');
  });

  it('handles an empty waves array without throwing', () => {
    expect(() => buildGanttSvg([])).not.toThrow();
    const svg = buildGanttSvg([]);
    expect(svg).toContain('No roadmap waves available');
  });

  it('escapes XML-unsafe characters in wave titles', () => {
    const svg = buildGanttSvg([{ title: 'A & B <script>', progress_pct: 50 }]);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');
  });

  // QF-20260719-275: progress_pct is one shared V1 rung gauge repeated across every wave —
  // bars must derive from per-wave item_counts instead, so distinct waves render distinct pcts.
  it('derives bar pct from item_counts, not the shared progress_pct, when item_counts is present', () => {
    const svg = buildGanttSvg([
      { title: 'W0', progress_pct: 71, item_counts: { total: 10, promoted: 10 } },
      { title: 'W2', progress_pct: 71, item_counts: { total: 10, promoted: 3 } },
      { title: 'W5', progress_pct: 0, item_counts: { total: 213, promoted: 78 } },
    ]);
    expect(svg).toContain('100%');
    expect(svg).toContain('30%');
    expect(svg).toContain('37%'); // 78/213 rounds to 37%, not the stale shared 0%
    expect(svg).not.toContain('>0%<');
  });

  // THE REGRESSION FIXTURE, in miniature. The artifact delivered to the chairman on 2026-07-22
  // (chairman-daily-review/2026-07-22.png) drew a 75% filled bar over a wave with ZERO items,
  // because total === 0 fell back to the rung value. A zero-item wave has no per-wave progress:
  // the honest render is an empty track, not a plausible number.
  it('emits NO percentage for a wave with zero items — not a fallback, no number at all', () => {
    const svg = buildGanttSvg([{ title: 'Empty wave', progress_pct: 45, item_counts: { total: 0, promoted: 0 } }]);
    expect(svg).not.toContain('45%');
    expect(svg).not.toMatch(/>\d+%</);
    expect(svg).toContain('not yet scoped');
  });

  // QF-20260719-275: long titles overflowed under the bar area into the right-edge pct labels.
  it('truncates long titles with an ellipsis so they never collide with the pct label column', () => {
    const longTitle = 'A very long wave title that would otherwise overflow the label column';
    const svg = buildGanttSvg([{ title: longTitle, progress_pct: 50 }]);
    expect(svg).not.toContain(longTitle);
    expect(svg).toContain('…');
  });

  it('leaves short titles untouched', () => {
    const svg = buildGanttSvg([{ title: 'Short', progress_pct: 50 }]);
    expect(svg).toContain('>Short<');
    expect(svg).not.toContain('…');
  });
});

describe('renderGanttPng (FR-1)', () => {
  it('returns a Buffer starting with the PNG magic bytes', async () => {
    const png = await renderGanttPng(waves);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('handles an empty waves array without throwing', async () => {
    await expect(renderGanttPng([])).resolves.toBeInstanceOf(Buffer);
  });
});
