import { describe, it, expect } from 'vitest';
import { buildFramingDigest } from '../../lib/org/chairman-surface.mjs';

// FW-3 Child D (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-E): the chairman-visible framing digest.
// "Screen ranks, chairman picks" — pick-class first; the empty case is VISIBLE (govern-by-absence),
// not silently omitted; null/degraded input never throws.

describe('buildFramingDigest (FW3 Child D)', () => {
  it('ranks pick-class framings before instrument-class', () => {
    const d = buildFramingDigest([
      { framing_class: 'instrument', summary: 'i1', created_at: '2026-07-19T10:00:00Z' },
      { framing_class: 'pick', summary: 'p1', created_at: '2026-07-19T09:00:00Z' },
    ]);
    expect(d.items[0].framing_class).toBe('pick');
    expect(d.pickCount).toBe(1);
    expect(d.instrumentCount).toBe(1);
    expect(d.total).toBe(2);
    expect(d.empty).toBe(false);
  });

  it('sorts most-recent-first within a class', () => {
    const d = buildFramingDigest([
      { framing_class: 'pick', summary: 'older', created_at: '2026-07-19T08:00:00Z' },
      { framing_class: 'pick', summary: 'newer', created_at: '2026-07-19T12:00:00Z' },
    ]);
    expect(d.items[0].line).toContain('newer');
    expect(d.items[1].line).toContain('older');
  });

  it('renders an EXPLICIT visible-absence note for the empty case (govern-by-absence)', () => {
    const d = buildFramingDigest([]);
    expect(d.empty).toBe(true);
    expect(d.total).toBe(0);
    expect(d.items).toEqual([]);
    expect(d.note).toMatch(/No framings this period/);
    expect(d.note).toMatch(/absence/);
  });

  it('degrades gracefully on null/undefined/non-array input (never throws)', () => {
    for (const bad of [null, undefined, {}, 42, 'x']) {
      expect(() => buildFramingDigest(bad)).not.toThrow();
      expect(buildFramingDigest(bad).empty).toBe(true);
    }
  });

  it('treats a framing with no framing_class as instrument-class (never dropped) — degrade until FW3-B lands', () => {
    const d = buildFramingDigest([{ summary: 'unclassified', created_at: '2026-07-19T10:00:00Z' }]);
    expect(d.total).toBe(1);
    expect(d.items[0].framing_class).toBe('instrument');
    expect(d.instrumentCount).toBe(1);
  });
});
