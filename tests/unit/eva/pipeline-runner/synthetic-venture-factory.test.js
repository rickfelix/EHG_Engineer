import { describe, it, expect } from 'vitest';
import {
  SyntheticVentureFactory,
  shannonEntropy,
  normalizedEntropy,
} from '../../../../lib/eva/pipeline-runner/synthetic-venture-factory.js';

describe('SyntheticVentureFactory', () => {
  let factory;

  beforeEach(() => {
    factory = new SyntheticVentureFactory();
  });

  describe('createBatch', () => {
    it('creates requested number of ventures', () => {
      const { ventures } = factory.createBatch(4);
      expect(ventures).toHaveLength(4);
    });

    it('marks all ventures as synthetic', () => {
      const { ventures } = factory.createBatch(3);
      for (const v of ventures) {
        expect(v.is_synthetic).toBe(true);
        expect(v.origin_type).toBe('synthetic_pipeline');
      }
    });

    it('assigns archetype to each venture', () => {
      const { ventures } = factory.createBatch(4);
      for (const v of ventures) {
        expect(v.archetype).toBeTruthy();
        expect(v.synthetic_metadata.archetype_key).toBe(v.archetype);
      }
    });

    it('includes batch metadata', () => {
      const { ventures, metadata } = factory.createBatch(4, { seed: 42 });
      expect(metadata.batchId).toBeTruthy();
      expect(metadata.seed).toBe(42);
      expect(metadata.batchSize).toBe(4);
      expect(metadata.shannonEntropy).toBeGreaterThan(0);
      expect(metadata.generatedAt).toBeTruthy();
    });

    it('produces diverse archetypes for batch of 7', () => {
      const { metadata } = factory.createBatch(7, { seed: 42 });
      // With 7 archetypes and round-robin, a batch of 7 should use all archetypes
      const distinctCount = Object.keys(metadata.archetypeDistribution).length;
      expect(distinctCount).toBe(7);
    });

    it('reports diversity pass/fail', () => {
      const { metadata } = factory.createBatch(7, { seed: 42 });
      expect(metadata.diversityPass).toBe(true);
    });
  });

  describe('seed reproducibility', () => {
    it('produces identical batches with same seed', () => {
      const batch1 = factory.createBatch(4, { seed: 12345 });
      const batch2 = factory.createBatch(4, { seed: 12345 });

      for (let i = 0; i < 4; i++) {
        expect(batch1.ventures[i].name).toBe(batch2.ventures[i].name);
        expect(batch1.ventures[i].archetype).toBe(batch2.ventures[i].archetype);
        expect(batch1.ventures[i].problem_statement).toBe(batch2.ventures[i].problem_statement);
      }
    });

    it('produces different batches with different seeds', () => {
      const batch1 = factory.createBatch(4, { seed: 100 });
      const batch2 = factory.createBatch(4, { seed: 200 });

      // At least one venture should differ (very likely with different seeds)
      const anyDifferent = batch1.ventures.some(
        (v, i) => v.name !== batch2.ventures[i].name
      );
      expect(anyDifferent).toBe(true);
    });
  });

  describe('archetype filtering', () => {
    it('restricts to specified archetypes', () => {
      const { ventures } = factory.createBatch(4, {
        seed: 42,
        archetypeFilter: ['democratizer', 'automator'],
      });
      for (const v of ventures) {
        expect(['democratizer', 'automator']).toContain(v.archetype);
      }
    });
  });

  describe('venture structure', () => {
    it('has required fields for database insert', () => {
      const { ventures } = factory.createBatch(1, { seed: 42 });
      const v = ventures[0];
      expect(v.name).toBeTruthy();
      expect(v.description).toBeTruthy();
      expect(v.problem_statement).toBeTruthy();
      expect(v.target_market).toBeTruthy();
      expect(v.origin_type).toBe('synthetic_pipeline');
      expect(v.current_lifecycle_stage).toBe(0);
      expect(v.status).toBe('active');
      expect(v.metadata).toBeTruthy();
      expect(v.synthetic_metadata).toBeTruthy();
      expect(v.synthetic_metadata.batch_id).toBeTruthy();
      expect(v.synthetic_metadata.generated_at).toBeTruthy();
    });
  });
});

describe('shannonEntropy', () => {
  it('returns 0 for uniform distribution', () => {
    expect(shannonEntropy(['a', 'a', 'a'])).toBe(0);
  });

  it('returns max entropy for uniform distribution across all categories', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const entropy = shannonEntropy(keys);
    expect(entropy).toBeCloseTo(2.0, 1); // log2(4) = 2.0
  });

  it('returns intermediate entropy for mixed distribution', () => {
    const keys = ['a', 'a', 'b', 'c'];
    const entropy = shannonEntropy(keys);
    expect(entropy).toBeGreaterThan(0);
    expect(entropy).toBeLessThan(Math.log2(3));
  });
});

describe('normalizedEntropy', () => {
  it('returns 1.0 for max diversity', () => {
    const entropy = Math.log2(4); // 4 categories, all equal
    expect(normalizedEntropy(entropy, 4)).toBeCloseTo(1.0);
  });

  it('returns 0 for single category', () => {
    expect(normalizedEntropy(0, 1)).toBe(0);
  });
});
