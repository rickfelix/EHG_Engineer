import { describe, it, expect, vi } from 'vitest';

// SD-LEO-INFRA-DOWNSTREAM-OPERATING-MODEL-PROPAGATION-001 regression tests for the code-level
// invariants (the prompt-injection FRs are verified by inspection / the producers' own suites).

describe('FR-3: S25 separability — zero-team venture is NOT penalized (inversion fixed)', () => {
  // Complete supabase stub: `.in()` resolves contract rows (terminal), `.single()` resolves a row
  // (terminal for eva_ventures + the persist .select().single()).
  function makeSupabase(contractRows) {
    return {
      from() {
        const b = {
          select() { return b; },
          eq() { return b; },
          insert() { return b; },
          in() { return Promise.resolve({ data: contractRows, error: null }); },
          single() { return Promise.resolve({ data: { id: 'row1', status: 'active' }, error: null }); },
        };
        return b;
      },
    };
  }
  async function teamDep(contractRows) {
    const mod = await import('../../../lib/eva/exit/separability-scorer.js');
    const result = await mod.computeSeparabilityScore('v1', { supabase: makeSupabase(contractRows), logger: { warn() {}, error() {}, info() {} } });
    return { score: result.team_dependency, reasoning: result.metadata.reasoning.team_dependency };
  }

  it('zero human-retention dependency scores HIGH (self-sufficient, peel-off ready)', async () => {
    const { score, reasoning } = await teamDep([]);
    expect(score).toBe(90);
    expect(reasoning).toMatch(/self-sufficient|maximally separable|peel-off/i);
  });

  it('human-retention dependencies REDUCE the score (but never zero it)', async () => {
    const { score } = await teamDep([{ asset_type: 'contract' }, { asset_type: 'partnership' }]);
    expect(score).toBe(60); // 90 - 2*15
  });

  it('floors at 40 under heavy people-lock-in (no longer rewards team presence)', async () => {
    const many = Array.from({ length: 10 }, () => ({ asset_type: 'contract' }));
    const { score } = await teamDep(many);
    expect(score).toBe(40);
  });
});

describe('FR-1: S22 paid-budget advisory', () => {
  it('flags when paid channels exceed 20% of budget', async () => {
    const { paidBudgetAdvisory } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js');
    const r = paidBudgetAdvisory({ by_channel: { google_ads: '40%', facebook_instagram: '35%', twitter_x: '15%', blog_seo: '10%' } });
    expect(r.flagged).toBe(true);
    expect(r.paid_pct).toBe(75);
  });

  it('does NOT flag an organic-first allocation (paid <= 20%)', async () => {
    const { paidBudgetAdvisory } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js');
    const r = paidBudgetAdvisory({ by_channel: { twitter_x: '50%', blog_seo: '40%', google_ads: '10%' } });
    expect(r.flagged).toBe(false);
    expect(r.paid_pct).toBe(10);
  });

  it('treats $0 paid (organic-only) as not flagged', async () => {
    const { paidBudgetAdvisory } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js');
    const r = paidBudgetAdvisory({ by_channel: { twitter_x: '60%', email: '40%' } });
    expect(r.flagged).toBe(false);
    expect(r.paid_pct).toBe(0);
  });
});
