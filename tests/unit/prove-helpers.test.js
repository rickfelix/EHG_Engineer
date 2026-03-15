import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  detectNextGate,
  rankVentures,
  formatGapSummary,
  buildBrainstormContext,
  assessGapComplexity,
  GATE_STAGES
} = require('../../scripts/prove-helpers.cjs');

describe('detectNextGate', () => {
  it('returns gate 3 for empty journal', () => {
    const result = detectNextGate([]);
    expect(result).toEqual({ from: 0, toGate: 3, isComplete: false });
  });

  it('returns gate 3 for null journal', () => {
    const result = detectNextGate(null);
    expect(result).toEqual({ from: 0, toGate: 3, isComplete: false });
  });

  it('advances to gate 5 after completing gate 3', () => {
    const journal = [
      { stage_number: 0 }, { stage_number: 1 },
      { stage_number: 2 }, { stage_number: 3 }
    ];
    const result = detectNextGate(journal);
    expect(result).toEqual({ from: 4, toGate: 5, isComplete: false });
  });

  it('advances to gate 10 after completing gate 5', () => {
    const journal = Array.from({ length: 6 }, (_, i) => ({ stage_number: i }));
    const result = detectNextGate(journal);
    expect(result).toEqual({ from: 6, toGate: 10, isComplete: false });
  });

  it('detects completion at stage 25', () => {
    const journal = Array.from({ length: 26 }, (_, i) => ({ stage_number: i }));
    const result = detectNextGate(journal);
    expect(result.isComplete).toBe(true);
  });

  it('handles mid-segment correctly (stage 7 assessed)', () => {
    const journal = Array.from({ length: 8 }, (_, i) => ({ stage_number: i }));
    const result = detectNextGate(journal);
    expect(result.from).toBe(8);
    expect(result.toGate).toBe(10);
  });
});

describe('rankVentures', () => {
  it('ranks by lifecycle stage', () => {
    const ventures = [
      { id: 'a', name: 'Early', current_lifecycle_stage: 2 },
      { id: 'b', name: 'Mature', current_lifecycle_stage: 15 },
      { id: 'c', name: 'Mid', current_lifecycle_stage: 8 }
    ];
    const ranked = rankVentures(ventures, []);
    expect(ranked[0].id).toBe('b');
    expect(ranked[0].rationale).toContain('Most mature');
  });

  it('prioritizes in-progress runs', () => {
    const ventures = [
      { id: 'a', name: 'Mature', current_lifecycle_stage: 20 },
      { id: 'b', name: 'InProgress', current_lifecycle_stage: 5 }
    ];
    const journalGroups = [{ venture_id: 'b', count: 10 }];
    const ranked = rankVentures(ventures, journalGroups);
    expect(ranked[0].id).toBe('b');
    expect(ranked[0].state).toBe('in_progress');
  });

  it('marks complete runs', () => {
    const ventures = [{ id: 'a', name: 'Done', current_lifecycle_stage: 25 }];
    const journalGroups = [{ venture_id: 'a', count: 26 }];
    const ranked = rankVentures(ventures, journalGroups);
    expect(ranked[0].state).toBe('complete');
  });
});

describe('formatGapSummary', () => {
  it('formats gap analysis with severity counts', () => {
    const analysis = {
      summary: { total: 5, by_severity: { blocker: 1, major: 2, minor: 2, cosmetic: 0 } },
      recommendation: 'fix_first',
      recommendation_reason: '1 blocker must be resolved',
      gaps: [{ severity: 'blocker', description: 'Missing create component' }]
    };
    const text = formatGapSummary(analysis);
    expect(text).toContain('Gaps: 5 total');
    expect(text).toContain('Blocker: 1');
    expect(text).toContain('FIX_FIRST');
    expect(text).toContain('Missing create component');
  });

  it('handles empty gap analysis', () => {
    expect(formatGapSummary(null)).toBe('No gap data available.');
    expect(formatGapSummary({})).toBe('No gap data available.');
  });
});

describe('assessGapComplexity', () => {
  it('returns complex for blockers', () => {
    const analysis = { gaps: [{ severity: 'blocker' }] };
    const result = assessGapComplexity(analysis);
    expect(result.isComplex).toBe(true);
    expect(result.reason).toContain('blocker');
  });

  it('returns complex for 3+ majors', () => {
    const analysis = { gaps: [
      { severity: 'major' }, { severity: 'major' }, { severity: 'major' }
    ]};
    const result = assessGapComplexity(analysis);
    expect(result.isComplex).toBe(true);
  });

  it('returns simple for minor gaps only', () => {
    const analysis = { gaps: [{ severity: 'minor' }, { severity: 'cosmetic' }] };
    const result = assessGapComplexity(analysis);
    expect(result.isComplex).toBe(false);
    expect(result.reason).toContain('quick fix');
  });
});

describe('buildBrainstormContext', () => {
  it('builds context with blocker gaps', () => {
    const analysis = {
      gaps: [
        { severity: 'blocker', stage_number: 2, description: 'Missing file X' },
        { severity: 'major', stage_number: 3, description: 'No validation' }
      ],
      recommendation_reason: 'Blockers must be resolved'
    };
    const ctx = buildBrainstormContext('FinTech App', 3, analysis);
    expect(ctx).toContain('FinTech App');
    expect(ctx).toContain('Gate 3');
    expect(ctx).toContain('Missing file X');
    expect(ctx).toContain('No validation');
  });
});

describe('GATE_STAGES', () => {
  it('has correct gate stages', () => {
    expect(GATE_STAGES).toEqual([3, 5, 10, 22, 25]);
  });
});
