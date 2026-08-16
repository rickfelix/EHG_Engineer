/**
 * SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001 (TS-8, FR-4): buildVisionGapSummaryLine
 * must still report when everything was excluded (0 surfaced) as long as something was
 * dropped -- gating the print purely on visionGaps.length would silently print nothing for
 * exactly the scenario this SD exists to fix.
 */
import { describe, it, expect } from 'vitest';
import { buildVisionGapSummaryLine } from '../../../scripts/modules/learning/index.js';

describe('buildVisionGapSummaryLine', () => {
  it('TS-8: returns a line stating the not-evaluated count when everything is excluded (0 surfaced, N dropped) -- the primary motivating scenario', () => {
    const line = buildVisionGapSummaryLine([], { excluded: 22, unscored: 9 });

    expect(line).not.toBeNull();
    expect(line).toMatch(/Vision Gaps \(\d+ surfaced, \d+ dimensions not evaluated: .*\)/);
    expect(line).toContain('0 surfaced');
    expect(line).toContain('31 dimensions not evaluated');
    expect(line).toContain('excluded 22');
    expect(line).toContain('unscored 9');
  });

  it('returns null when there is genuinely nothing to report (no gaps surfaced, sync never ran)', () => {
    const line = buildVisionGapSummaryLine([], null);
    expect(line).toBeNull();
  });

  it('reports zero-dropped explicitly when the sync ran but found nothing to exclude (still non-null dropped)', () => {
    const line = buildVisionGapSummaryLine([], { excluded: 0, unscored: 0 });

    expect(line).not.toBeNull();
    expect(line).toContain('0 dimensions not evaluated');
  });

  it('preserves the surfaced count and reports dropped alongside it when both are present', () => {
    const gaps = [{ pattern_id: 'VGAP-A01' }, { pattern_id: 'VGAP-A02' }];
    const line = buildVisionGapSummaryLine(gaps, { excluded: 5, unscored: 1 });

    expect(line).toContain('2 surfaced');
    expect(line).toContain('6 dimensions not evaluated');
  });

  it('falls back to the pre-SD phrasing shape (surfaced count only, no dropped clause) when dropped is null but gaps exist -- backward-compatible with a sync that never populated dropped', () => {
    const gaps = [{ pattern_id: 'VGAP-A01' }];
    const line = buildVisionGapSummaryLine(gaps, null);

    expect(line).not.toBeNull();
    expect(line).toContain('1 surfaced');
    expect(line).not.toContain('dimensions not evaluated');
  });
});
