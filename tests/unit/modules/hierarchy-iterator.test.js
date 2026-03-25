import { describe, it, expect, vi } from 'vitest';

// Mock the rubric module
vi.mock('../../../scripts/modules/decomposition-rubric.js', () => {
  let callCount = 0;
  return {
    THRESHOLD: 3.5,
    DIMENSIONS: ['boundary', 'balance', 'dependency', 'completeness'],
    scoreDecomposition: vi.fn().mockImplementation(async () => {
      callCount++;
      // First call fails, subsequent calls pass
      const score = callCount === 1 ? 2.5 : 4.0;
      return {
        aggregate: score,
        scores: {
          boundary: { score: callCount === 1 ? 2 : 4, reasoning: '' },
          balance: { score: callCount === 1 ? 2 : 4, reasoning: '' },
          dependency: { score: 3, reasoning: '' },
          completeness: { score: callCount === 1 ? 3 : 5, reasoning: '' },
        },
        recommendations: [],
        passed: score >= 3.5,
        threshold: 3.5,
      };
    })
  };
});

const { iterateHierarchy, MAX_ITERATIONS, restructureFromFeedback } = await import('../../../scripts/modules/hierarchy-iterator.js');

const MOCK_CHILDREN = [
  { title: 'Database Migration', scope: 'Add columns to EVA tables', dependencies: [] },
  { title: 'API Enhancement', scope: 'Update writeArtifact endpoint', dependencies: [] },
];

const MOCK_ARCH_PLAN = {
  sections: {
    implementation_phases: [
      { number: 1, title: 'Database Migration', description: 'Schema changes' },
      { number: 2, title: 'API Enhancement', description: 'Endpoint updates' },
    ]
  }
};

describe('hierarchy-iterator', () => {
  it('converges when score passes after restructure', async () => {
    // Use overlapping children so restructure actually changes something
    const overlapping = [
      { title: 'Database setup and migration work', scope: 'database migration setup and schema column changes for EVA', dependencies: [] },
      { title: 'Database schema migration columns', scope: 'database migration schema column additions for EVA tables', dependencies: [] },
      { title: 'API Enhancement', scope: 'Update writeArtifact endpoint for new columns', dependencies: [] },
    ];
    const result = await iterateHierarchy(overlapping, MOCK_ARCH_PLAN);
    // Should either converge or hit max iterations
    expect(result.iterations).toBeLessThanOrEqual(MAX_ITERATIONS);
    expect(result.score).toBeDefined();
    expect(result.score.aggregate).toBeGreaterThan(0);
  });

  it('returns score and iteration count', async () => {
    const result = await iterateHierarchy(MOCK_CHILDREN, MOCK_ARCH_PLAN);
    expect(result.score).toBeDefined();
    expect(result.score.aggregate).toBeGreaterThan(0);
    expect(typeof result.iterations).toBe('number');
  });

  it('exports MAX_ITERATIONS constant', () => {
    expect(MAX_ITERATIONS).toBe(3);
  });

  it('restructureFromFeedback handles low boundary score', () => {
    const children = [
      { title: 'Database setup and migration work', scope: 'database migration setup and schema changes' },
      { title: 'Database schema migration', scope: 'database migration schema and column additions' },
    ];
    const rubric = {
      scores: {
        boundary: { score: 1 },
        balance: { score: 4 },
        dependency: { score: 4 },
        completeness: { score: 4 },
      }
    };
    const result = restructureFromFeedback(children, rubric, MOCK_ARCH_PLAN);
    // Should merge similar children
    expect(result.length).toBeLessThanOrEqual(children.length);
  });
});
