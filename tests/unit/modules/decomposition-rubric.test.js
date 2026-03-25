import { describe, it, expect, vi } from 'vitest';

// Mock LLM before import
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({
    complete: vi.fn().mockResolvedValue(JSON.stringify({
      boundary: { score: 4, reasoning: 'Clear boundaries' },
      balance: { score: 4, reasoning: 'Even distribution' },
      dependency: { score: 5, reasoning: 'Dependencies explicit' },
      completeness: { score: 4, reasoning: 'All phases covered' },
      aggregate: 4.25,
      recommendations: []
    }))
  })
}));

vi.mock('../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: (str) => typeof str === 'string' ? JSON.parse(str) : str,
  extractUsage: () => ({})
}));

const { scoreDecomposition, DIMENSIONS, THRESHOLD } = await import('../../../scripts/modules/decomposition-rubric.js');

const MOCK_CHILDREN = [
  { title: 'Database Migration', scope: 'Add columns to EVA tables', dependencies: [] },
  { title: 'API Enhancement', scope: 'Update writeArtifact endpoint', dependencies: [{ sd_key: 'child-1' }] },
  { title: 'Stage Template Updates', scope: 'Pass vision keys through stages', dependencies: [{ sd_key: 'child-2' }] },
];

const MOCK_ARCH_PLAN = {
  sections: {
    implementation_phases: [
      { number: 1, title: 'Database Migration', description: 'Schema changes' },
      { number: 2, title: 'API Enhancement', description: 'Endpoint updates' },
      { number: 3, title: 'Stage Templates', description: 'Key passing' },
    ]
  }
};

describe('decomposition-rubric', () => {
  it('scores a decomposition with 4 dimensions', async () => {
    const result = await scoreDecomposition(MOCK_CHILDREN, MOCK_ARCH_PLAN);
    expect(Object.keys(result.scores)).toHaveLength(4);
    for (const dim of DIMENSIONS) {
      expect(result.scores[dim]).toBeDefined();
      expect(result.scores[dim].score).toBeGreaterThanOrEqual(1);
      expect(result.scores[dim].score).toBeLessThanOrEqual(5);
    }
  });

  it('calculates aggregate score', async () => {
    const result = await scoreDecomposition(MOCK_CHILDREN, MOCK_ARCH_PLAN);
    expect(result.aggregate).toBeGreaterThan(0);
    expect(result.aggregate).toBeLessThanOrEqual(5);
  });

  it('returns passed=true when aggregate >= threshold', async () => {
    const result = await scoreDecomposition(MOCK_CHILDREN, MOCK_ARCH_PLAN);
    expect(result.passed).toBe(result.aggregate >= THRESHOLD);
  });

  it('handles empty children gracefully', async () => {
    const result = await scoreDecomposition([], MOCK_ARCH_PLAN);
    expect(result.aggregate).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('exports threshold constant', () => {
    expect(THRESHOLD).toBe(3.5);
  });

  it('exports dimensions array', () => {
    expect(DIMENSIONS).toEqual(['boundary', 'balance', 'dependency', 'completeness']);
  });
});
