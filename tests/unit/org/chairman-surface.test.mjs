/**
 * Unit tests — lib/org/chairman-surface.mjs (FR-6).
 * All four computations injected via the fns seam; supabase mocked minimally.
 */
import { describe, it, expect } from 'vitest';
import { buildChairmanBrief, buildAttentionItems, pickTopConstraint } from '../../../lib/org/chairman-surface.mjs';

const mockSupabase = (venture) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: venture }) }),
        }),
      }),
    }),
  }),
});

const fnsAllQuiet = {
  analyzeBottlenecks: async () => ({ bottlenecks: [] }),
  readVenturePortfolioSignals: async () => [],
  getDistanceToBroke: async () => ({ months_remaining: 24 }),
  detectConstraintDrift: async () => ({ ventureId: 'v1', driftDetected: false, severity: 'NONE', findings: [] }),
};

describe('buildChairmanBrief', () => {
  it('composes all four live sections + deep-dive proposal for the focus venture', async () => {
    const brief = await buildChairmanBrief(mockSupabase({ id: 'v1', name: 'ApexNiche AI', attention_score: 88, current_lifecycle_stage: 5, dwell_days: 3, health_status: 'green' }), { fns: fnsAllQuiet, logger: { warn: () => {} } });
    expect(brief.top_constraint.line).toContain('No live constraint');
    expect(brief.deep_dive_proposal.venture_name).toBe('ApexNiche AI');
    expect(brief.deep_dive_proposal.scheduling_surface).toBe('meeting_brief_delivery');
    for (const s of [brief.runway, brief.bottlenecks, brief.portfolio_signals, brief.constraint_drift]) {
      expect(s.computed_at).toBeTruthy(); // live-sourced stamp, never hardcoded
    }
  });

  it('a failing computation degrades its section without sinking the brief', async () => {
    const fns = { ...fnsAllQuiet, analyzeBottlenecks: async () => { throw new Error('telemetry down'); } };
    const brief = await buildChairmanBrief(mockSupabase(null), { fns, logger: { warn: () => {} } });
    expect(brief.bottlenecks.error).toContain('telemetry down');
    expect(brief.top_constraint).toBeTruthy();
    expect(brief.deep_dive_proposal).toBeNull();
  });
});

describe('pickTopConstraint precedence (live-sourced)', () => {
  const quiet = { bottlenecks: { result: { bottlenecks: [] } }, signals: { signals: [] }, drift: { result: { driftDetected: false } }, runway: { result: { months_remaining: 24 } } };

  it('cash runway below threshold wins outright', () => {
    const t = pickTopConstraint({ ...quiet, runway: { result: { months_remaining: 3.2 } } });
    expect(t.kind).toBe('runway');
    expect(t.line).toContain('3.2 months');
  });

  it('blocking drift beats bottlenecks', () => {
    const t = pickTopConstraint({
      ...quiet,
      drift: { result: { driftDetected: true, severity: 'HIGH', ventureId: 'v9' } },
      bottlenecks: { result: { bottlenecks: [{ summary: 'slow gate' }] } },
    });
    expect(t.kind).toBe('constraint_drift');
  });

  it('worst bottleneck beats signals; strongest signal is the fallback', () => {
    const withB = pickTopConstraint({ ...quiet, bottlenecks: { result: { bottlenecks: [{ summary: 'PLAN queue backlog' }] } }, signals: { signals: [{ title: 'stale', strength: 80 }] } });
    expect(withB.kind).toBe('bottleneck');
    const onlyS = pickTopConstraint({ ...quiet, signals: { signals: [{ title: '5 ventures stale', strength: 80, type: 'stale_ventures' }] } });
    expect(onlyS.line).toContain('5 ventures stale');
  });
});

describe('buildAttentionItems', () => {
  it('ranks critical runway above medium items', () => {
    const items = buildAttentionItems({
      runway: { result: { months_remaining: 2 } },
      drift: { result: { driftDetected: true, severity: 'MEDIUM', ventureId: 'v1', findings: [1] } },
      bottlenecks: { result: { bottlenecks: [] } },
      signals: { signals: [{ title: 'stale ventures', strength: 50, type: 'stale_ventures' }] },
    });
    expect(items[0].kind).toBe('runway');
    expect(items[0].severity).toBe('critical');
    expect(items.length).toBe(3);
  });
});
