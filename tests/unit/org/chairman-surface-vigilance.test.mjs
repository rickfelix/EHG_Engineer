/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F — additive vigilance_freshness section on the
 * chairman meeting-brief surface (S-4 gauge substrate). Kept as a SEPARATE file from Child B's
 * own tests/unit/org/chairman-surface.test.mjs (additive-only integration; Child B's suite is
 * untouched and continues to pass unmodified).
 */
import { describe, it, expect } from 'vitest';
import { buildChairmanBrief } from '../../../lib/org/chairman-surface.mjs';

const mockSupabase = () => ({
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
});

const fnsAllQuiet = {
  analyzeBottlenecks: async () => ({ bottlenecks: [] }),
  readVenturePortfolioSignals: async () => [],
  getDistanceToBroke: async () => ({ months_remaining: 24 }),
  detectConstraintDrift: async () => ({ ventureId: 'v1', driftDetected: false, severity: 'NONE', findings: [] }),
};

describe('chairman-surface — vigilance_freshness section (additive, Child F)', () => {
  it('a test-seam caller without computeVigilanceFreshness (pre-Child-F shape) falls back to an honest NO_DATA section, never throws', async () => {
    const brief = await buildChairmanBrief(mockSupabase(), { fns: fnsAllQuiet, logger: { warn: () => {} } });
    expect(brief.vigilance_freshness).toBeTruthy();
    expect(brief.vigilance_freshness.source).toBe('vigilance-freshness-gauge');
    expect(brief.vigilance_freshness.result.status).toBe('NO_DATA');
    expect(brief.vigilance_freshness.computed_at).toBeTruthy();
  });

  it('a supplied computeVigilanceFreshness is used and its result surfaces under vigilance_freshness.result', async () => {
    const fns = { ...fnsAllQuiet, computeVigilanceFreshness: async () => ({ status: 'FRESH', latest_observed_at: '2026-07-12T10:00:00Z', hours_since_latest: 1, thesis_count: 2, computed_at: '2026-07-12T11:00:00Z' }) };
    const brief = await buildChairmanBrief(mockSupabase(), { fns, logger: { warn: () => {} } });
    expect(brief.vigilance_freshness.result.status).toBe('FRESH');
    expect(brief.vigilance_freshness.result.thesis_count).toBe(2);
  });

  it('a failing vigilance gauge degrades its own section without sinking the whole brief (calm cockpit)', async () => {
    const fns = { ...fnsAllQuiet, computeVigilanceFreshness: async () => { throw new Error('vigilance table unreachable'); } };
    const brief = await buildChairmanBrief(mockSupabase(), { fns, logger: { warn: () => {} } });
    expect(brief.vigilance_freshness.error).toContain('vigilance table unreachable');
    expect(brief.top_constraint).toBeTruthy(); // other sections unaffected
  });

  it('pre-existing sections are unaffected by the additive vigilance section', async () => {
    const brief = await buildChairmanBrief(mockSupabase(), { fns: fnsAllQuiet, logger: { warn: () => {} } });
    for (const s of [brief.runway, brief.bottlenecks, brief.portfolio_signals, brief.constraint_drift]) {
      expect(s.computed_at).toBeTruthy();
    }
  });
});
