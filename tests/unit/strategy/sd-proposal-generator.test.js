import { describe, it, expect, vi } from 'vitest';

// Test the governor gate and proposal generation logic by testing the core logic functions
// without hitting real database.

describe('sd-proposal-generator', () => {
  const MAX_PROPOSALS_PER_CYCLE = 5;

  const TIME_HORIZON_PRIORITY = {
    now: 'critical',
    next: 'high',
    later: 'medium',
    eventually: 'low',
  };

  function generateProposalsFromGaps(objectivesWithGaps, maxProposals = MAX_PROPOSALS_PER_CYCLE) {
    const allProposals = objectivesWithGaps.map(obj => ({
      strategy_objective_id: obj.objective_id,
      title: `Deliver ${obj.gap_capabilities.join(', ')} capabilities for "${obj.objective_title}"`,
      sd_type: 'infrastructure',
      priority: TIME_HORIZON_PRIORITY[obj.time_horizon] || 'medium',
      status: 'pending',
      gap_capabilities: obj.gap_capabilities,
      time_horizon: obj.time_horizon,
    }));

    const proposals = allProposals.slice(0, maxProposals);
    const skipped = allProposals.length - proposals.length;

    return { proposals, skipped };
  }

  it('generates proposals from capability gaps', () => {
    const gaps = [
      { objective_id: 'obj-1', objective_title: 'Auth', time_horizon: 'now', gap_capabilities: ['mfa', 'sso'] },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].priority).toBe('critical');
    expect(result.proposals[0].gap_capabilities).toEqual(['mfa', 'sso']);
    expect(result.skipped).toBe(0);
  });

  it('governor gate limits to MAX_PROPOSALS_PER_CYCLE', () => {
    const gaps = Array.from({ length: 8 }, (_, i) => ({
      objective_id: `obj-${i}`,
      objective_title: `Objective ${i}`,
      time_horizon: 'now',
      gap_capabilities: [`cap-${i}`],
    }));

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals).toHaveLength(5);
    expect(result.skipped).toBe(3);
  });

  it('maps time_horizon to priority correctly', () => {
    const gaps = [
      { objective_id: 'a', objective_title: 'A', time_horizon: 'now', gap_capabilities: ['x'] },
      { objective_id: 'b', objective_title: 'B', time_horizon: 'next', gap_capabilities: ['y'] },
      { objective_id: 'c', objective_title: 'C', time_horizon: 'later', gap_capabilities: ['z'] },
      { objective_id: 'd', objective_title: 'D', time_horizon: 'eventually', gap_capabilities: ['w'] },
    ];

    const result = generateProposalsFromGaps(gaps);
    expect(result.proposals[0].priority).toBe('critical');
    expect(result.proposals[1].priority).toBe('high');
    expect(result.proposals[2].priority).toBe('medium');
    expect(result.proposals[3].priority).toBe('low');
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
    }));

    const result = generateProposalsFromGaps(gaps, 2);
    expect(result.proposals).toHaveLength(2);
    expect(result.skipped).toBe(2);
  });
});
