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
  it('returns well-formed SVG containing each wave title', () => {
    const svg = buildGanttSvg(waves);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Wave 1: Foundation');
    expect(svg).toContain('Wave 2: Revenue rails');
    expect(svg).toContain('71%');
    expect(svg).toContain('20%');
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
