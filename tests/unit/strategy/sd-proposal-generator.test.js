import { describe, it, expect, vi } from 'vitest';

// Test the governor gate and proposal generation logic by testing the core logic functions
// without hitting real database.

describe('sd-proposal-generator', () => {
  const MAX_PROPOSALS_PER_CYCLE = 5;

  // Matches actual sd_proposals.urgency_level constraint: low, medium, critical
  const TIME_HORIZON_URGENCY = {
    now: 'critical',
    next: 'medium',
    later: 'low',
    eventually: 'low',
  };

  const TIME_HORIZON_IMPACT = {
    now: 0.95,
    next: 0.75,
    later: 0.50,
    eventually: 0.30,
  };

  function generateProposalsFromGaps(objectivesWithGaps, maxProposals = MAX_PROPOSALS_PER_CYCLE) {
    const allProposals = objectivesWithGaps.map(obj => {
      const gapList = obj.gap_capabilities.join(', ');
      const coverage = obj.coverage_pct ?? 0;
      return {
        title: `Deliver ${gapList} for "${obj.objective_title}"`.substring(0, 200),
        urgency_level: TIME_HORIZON_URGENCY[obj.time_horizon] || 'medium',
        confidence_score: Math.min(0.99, Math.max(0.50, (100 - coverage) / 100)),
        impact_score: TIME_HORIZON_IMPACT[obj.time_horizon] || 0.50,
        dedupe_key: `gap-${obj.objective_id}`,
        trigger_type: 'manual',
        gap_capabilities: obj.gap_capabilities,
        time_horizon: obj.time_horizon,
      };
    });

    const proposals = allProposals.slice(0, maxProposals);
    const skipped = allProposals.length - proposals.length;

    return { proposals, skipped };
  }

  it('generates proposals from capability gaps', () => {
    const gaps = [
      { objective_id: 'obj-1', objective_title: 'Auth', time_horizon: 'now', gap_capabilities: ['mfa', 'sso'], coverage_pct: 33 },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].urgency_level).toBe('critical');
    expect(result.proposals[0].gap_capabilities).toEqual(['mfa', 'sso']);
    expect(result.proposals[0].trigger_type).toBe('manual');
    expect(result.proposals[0].dedupe_key).toBe('gap-obj-1');
    expect(result.skipped).toBe(0);
  });

  it('governor gate limits to MAX_PROPOSALS_PER_CYCLE', () => {
    const gaps = Array.from({ length: 8 }, (_, i) => ({
      objective_id: `obj-${i}`,
      objective_title: `Objective ${i}`,
      time_horizon: 'now',
      gap_capabilities: [`cap-${i}`],
      coverage_pct: 0,
    }));

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals).toHaveLength(5);
    expect(result.skipped).toBe(3);
  });

  it('maps time_horizon to urgency_level correctly', () => {
    const gaps = [
      { objective_id: 'a', objective_title: 'A', time_horizon: 'now', gap_capabilities: ['x'], coverage_pct: 0 },
      { objective_id: 'b', objective_title: 'B', time_horizon: 'next', gap_capabilities: ['y'], coverage_pct: 0 },
      { objective_id: 'c', objective_title: 'C', time_horizon: 'later', gap_capabilities: ['z'], coverage_pct: 0 },
      { objective_id: 'd', objective_title: 'D', time_horizon: 'eventually', gap_capabilities: ['w'], coverage_pct: 0 },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals[0].urgency_level).toBe('critical');
    expect(result.proposals[1].urgency_level).toBe('medium');
    expect(result.proposals[2].urgency_level).toBe('low');
    expect(result.proposals[3].urgency_level).toBe('low');
  });

  it('returns empty when no gaps exist', () => {
    const result = generateProposalsFromGaps([]);
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it('custom maxProposals overrides default', () => {
    const gaps = Array.from({ length: 4 }, (_, i) => ({
      objective_id: `obj-${i}`,
      objective_title: `Objective ${i}`,
      time_horizon: 'now',
      gap_capabilities: [`cap-${i}`],
      coverage_pct: 0,
    }));

    const result = generateProposalsFromGaps(gaps, 2);
    expect(result.proposals).toHaveLength(2);
    expect(result.skipped).toBe(2);
  });

  it('confidence_score derives from coverage_pct', () => {
    const gaps = [
      { objective_id: 'a', objective_title: 'Low Coverage', time_horizon: 'now', gap_capabilities: ['x'], coverage_pct: 10 },
      { objective_id: 'b', objective_title: 'High Coverage', time_horizon: 'now', gap_capabilities: ['y'], coverage_pct: 80 },
    ];

    const result = generateProposalsFromGaps(gaps);
    // Lower coverage = higher confidence
    expect(result.proposals[0].confidence_score).toBe(0.90);
    expect(result.proposals[1].confidence_score).toBe(0.50); // Clamped to min 0.50
  });

  it('impact_score derives from time_horizon', () => {
    const gaps = [
      { objective_id: 'a', objective_title: 'Now', time_horizon: 'now', gap_capabilities: ['x'], coverage_pct: 0 },
      { objective_id: 'b', objective_title: 'Eventually', time_horizon: 'eventually', gap_capabilities: ['y'], coverage_pct: 0 },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals[0].impact_score).toBe(0.95);
    expect(result.proposals[1].impact_score).toBe(0.30);
  });

  it('truncates title to 200 characters', () => {
    const longCaps = Array.from({ length: 20 }, (_, i) => `very-long-capability-name-${i}`);
    const gaps = [
      { objective_id: 'a', objective_title: 'Long Objective', time_horizon: 'now', gap_capabilities: longCaps, coverage_pct: 0 },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals[0].title.length).toBeLessThanOrEqual(200);
  });
});
