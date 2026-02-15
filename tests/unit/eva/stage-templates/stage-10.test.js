/**
 * Unit tests for Stage 10 - Naming/Brand template
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Test Scenarios:
 * - TS-1: Weights must sum to exactly 100
 * - TS-2: Minimum 5 candidates required
 * - TS-3: Weighted scoring is deterministic
 * - TS-4: Brand genome validation
 *
 * @module tests/unit/eva/stage-templates/stage-10.test
 */

import { describe, it, expect } from 'vitest';
import stage10, { MIN_CANDIDATES, WEIGHT_SUM, BRAND_GENOME_KEYS } from '../../../../lib/eva/stage-templates/stage-10.js';

describe('stage-10.js - Naming/Brand template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage10.id).toBe('stage-10');
      expect(stage10.slug).toBe('naming-brand');
      expect(stage10.title).toBe('Naming / Brand');
      expect(stage10.version).toBe('2.0.0');
    });

    it('should export MIN_CANDIDATES = 5', () => {
      expect(MIN_CANDIDATES).toBe(5);
    });

    it('should export WEIGHT_SUM = 100', () => {
      expect(WEIGHT_SUM).toBe(100);
    });

    it('should export BRAND_GENOME_KEYS', () => {
      expect(BRAND_GENOME_KEYS).toEqual(['archetype', 'values', 'tone', 'audience', 'differentiators']);
    });

    it('should have defaultData', () => {
      expect(stage10.defaultData).toMatchObject({
        brandGenome: {
          archetype: null,
          values: [],
          tone: null,
          audience: null,
          differentiators: [],
        },
        scoringCriteria: [],
        candidates: [],
        narrativeExtension: { vision: null, mission: null, brandVoice: null },
        namingStrategy: null,
        ranked_candidates: [],
        decision: null,
        chairmanGate: { status: 'pending', rationale: null, decision_id: null },
      });
    });

    it('should have validate function', () => {
      expect(typeof stage10.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage10.computeDerived).toBe('function');
    });
  });

  describe('validate() - Brand genome validation (TS-4)', () => {
    const createValidData = () => ({
      brandGenome: {
        archetype: 'Innovator',
        values: ['Innovation', 'Excellence'],
        tone: 'Professional yet approachable',
        audience: 'Tech-savvy SMB decision makers',
        differentiators: ['AI-powered', 'User-friendly'],
      },
      scoringCriteria: [
        { name: 'Memorability', weight: 30 },
        { name: 'Relevance', weight: 40 },
        { name: 'Availability', weight: 30 },
      ],
      candidates: [
        { name: 'Candidate1', rationale: 'Reason 1', scores: { Memorability: 80, Relevance: 90, Availability: 70 } },
        { name: 'Candidate2', rationale: 'Reason 2', scores: { Memorability: 70, Relevance: 80, Availability: 90 } },
        { name: 'Candidate3', rationale: 'Reason 3', scores: { Memorability: 85, Relevance: 75, Availability: 80 } },
        { name: 'Candidate4', rationale: 'Reason 4', scores: { Memorability: 75, Relevance: 85, Availability: 75 } },
        { name: 'Candidate5', rationale: 'Reason 5', scores: { Memorability: 90, Relevance: 70, Availability: 85 } },
      ],
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
    });

    it('should pass for valid data', () => {
      const data = createValidData();
      const result = stage10.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing brandGenome', () => {
      const data = createValidData();
      delete data.brandGenome;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for non-object brandGenome', () => {
      const data = createValidData();
      data.brandGenome = 'not an object';
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome');
    });

    it('should fail for missing brandGenome.archetype', () => {
      const data = createValidData();
      delete data.brandGenome.archetype;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome.archetype');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for empty brandGenome.values array', () => {
      const data = createValidData();
      data.brandGenome.values = [];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome.values');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for missing brandGenome.tone', () => {
      const data = createValidData();
      delete data.brandGenome.tone;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome.tone');
    });

    it('should fail for missing brandGenome.audience', () => {
      const data = createValidData();
      delete data.brandGenome.audience;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome.audience');
    });

    it('should fail for empty brandGenome.differentiators array', () => {
      const data = createValidData();
      data.brandGenome.differentiators = [];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('brandGenome.differentiators');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });
  });

  describe('validate() - Scoring criteria validation (TS-1: Weights sum to 100)', () => {
    const createValidData = () => ({
      brandGenome: {
        archetype: 'Innovator',
        values: ['Innovation'],
        tone: 'Professional',
        audience: 'SMBs',
        differentiators: ['AI-powered'],
      },
      scoringCriteria: [
        { name: 'Memorability', weight: 40 },
        { name: 'Relevance', weight: 60 },
      ],
      candidates: [
        { name: 'C1', rationale: 'R1', scores: { Memorability: 80, Relevance: 90 } },
        { name: 'C2', rationale: 'R2', scores: { Memorability: 70, Relevance: 80 } },
        { name: 'C3', rationale: 'R3', scores: { Memorability: 85, Relevance: 75 } },
        { name: 'C4', rationale: 'R4', scores: { Memorability: 75, Relevance: 85 } },
        { name: 'C5', rationale: 'R5', scores: { Memorability: 90, Relevance: 70 } },
      ],
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
    });

    it('should pass when weights sum to exactly 100', () => {
      const data = createValidData();
      const result = stage10.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail when weights sum to 95 (TS-1)', () => {
      const data = createValidData();
      data.scoringCriteria = [
        { name: 'Memorability', weight: 35 },
        { name: 'Relevance', weight: 60 },
      ];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must sum to 100') && e.includes('got 95'))).toBe(true);
    });

    it('should fail when weights sum to 105', () => {
      const data = createValidData();
      data.scoringCriteria = [
        { name: 'Memorability', weight: 45 },
        { name: 'Relevance', weight: 60 },
      ];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must sum to 100') && e.includes('got 105'))).toBe(true);
    });

    it('should pass with three criteria totaling 100', () => {
      const data = createValidData();
      data.scoringCriteria = [
        { name: 'Memorability', weight: 30 },
        { name: 'Relevance', weight: 40 },
        { name: 'Availability', weight: 30 },
      ];
      for (const c of data.candidates) {
        c.scores.Availability = 80;
      }
      const result = stage10.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for empty scoringCriteria array', () => {
      const data = createValidData();
      data.scoringCriteria = [];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('scoringCriteria');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for criterion missing name', () => {
      const data = createValidData();
      data.scoringCriteria = [{ weight: 100 }];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('scoringCriteria[0].name'))).toBe(true);
    });

    it('should fail for criterion missing weight', () => {
      const data = createValidData();
      data.scoringCriteria = [{ name: 'Memorability' }];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('scoringCriteria[0].weight'))).toBe(true);
    });

    it('should fail for weight > 100', () => {
      const data = createValidData();
      data.scoringCriteria = [{ name: 'Memorability', weight: 120 }];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('scoringCriteria[0].weight') && e.includes('must be <= 100'))).toBe(true);
    });

    it('should fail for negative weight', () => {
      const data = createValidData();
      data.scoringCriteria = [{ name: 'Memorability', weight: -10 }];
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('scoringCriteria[0].weight'))).toBe(true);
    });
  });

  describe('validate() - Candidates validation (TS-2: Minimum 5 candidates)', () => {
    const createValidData = () => ({
      brandGenome: {
        archetype: 'Innovator',
        values: ['Innovation'],
        tone: 'Professional',
        audience: 'SMBs',
        differentiators: ['AI'],
      },
      scoringCriteria: [
        { name: 'Memorability', weight: 50 },
        { name: 'Relevance', weight: 50 },
      ],
      candidates: [
        { name: 'C1', rationale: 'R1', scores: { Memorability: 80, Relevance: 90 } },
        { name: 'C2', rationale: 'R2', scores: { Memorability: 70, Relevance: 80 } },
        { name: 'C3', rationale: 'R3', scores: { Memorability: 85, Relevance: 75 } },
        { name: 'C4', rationale: 'R4', scores: { Memorability: 75, Relevance: 85 } },
        { name: 'C5', rationale: 'R5', scores: { Memorability: 90, Relevance: 70 } },
      ],
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
    });

    it('should pass with exactly 5 candidates', () => {
      const data = createValidData();
      const result = stage10.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail with 4 candidates (< 5 required) (TS-2)', () => {
      const data = createValidData();
      data.candidates = data.candidates.slice(0, 4);
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('candidates');
      expect(result.errors[0]).toContain('must have at least 5 item(s)');
      expect(result.errors[0]).toContain('got 4');
    });

    it('should fail with 3 candidates', () => {
      const data = createValidData();
      data.candidates = data.candidates.slice(0, 3);
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('candidates');
      expect(result.errors[0]).toContain('must have at least 5 item(s)');
      expect(result.errors[0]).toContain('got 3');
    });

    it('should pass with 6 candidates (> 5 minimum)', () => {
      const data = createValidData();
      data.candidates.push({ name: 'C6', rationale: 'R6', scores: { Memorability: 85, Relevance: 85 } });
      const result = stage10.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for candidate missing name', () => {
      const data = createValidData();
      delete data.candidates[2].name;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[2].name'))).toBe(true);
    });

    it('should fail for candidate missing rationale', () => {
      const data = createValidData();
      delete data.candidates[1].rationale;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[1].rationale'))).toBe(true);
    });

    it('should fail for candidate missing scores object', () => {
      const data = createValidData();
      delete data.candidates[0].scores;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[0].scores'))).toBe(true);
    });

    it('should fail for candidate with non-object scores', () => {
      const data = createValidData();
      data.candidates[3].scores = 'not an object';
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[3].scores'))).toBe(true);
    });

    it('should fail for candidate missing a criterion score', () => {
      const data = createValidData();
      delete data.candidates[1].scores.Relevance;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[1].scores.Relevance'))).toBe(true);
    });

    it('should fail for candidate score > 100', () => {
      const data = createValidData();
      data.candidates[2].scores.Memorability = 120;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[2].scores.Memorability'))).toBe(true);
    });

    it('should fail for candidate score < 0', () => {
      const data = createValidData();
      data.candidates[4].scores.Relevance = -10;
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('candidates[4].scores.Relevance'))).toBe(true);
    });
  });

  describe('computeDerived() - Weighted scoring (TS-3: Deterministic scoring)', () => {
    const createValidData = () => ({
      brandGenome: {
        archetype: 'Innovator',
        values: ['Innovation'],
        tone: 'Professional',
        audience: 'SMBs',
        differentiators: ['AI'],
      },
      scoringCriteria: [
        { name: 'Memorability', weight: 30 },
        { name: 'Relevance', weight: 40 },
        { name: 'Availability', weight: 30 },
      ],
      candidates: [
        { name: 'Alpha', rationale: 'R1', scores: { Memorability: 80, Relevance: 90, Availability: 70 } },
        { name: 'Beta', rationale: 'R2', scores: { Memorability: 90, Relevance: 70, Availability: 80 } },
        { name: 'Gamma', rationale: 'R3', scores: { Memorability: 70, Relevance: 80, Availability: 90 } },
        { name: 'Delta', rationale: 'R4', scores: { Memorability: 85, Relevance: 85, Availability: 85 } },
        { name: 'Epsilon', rationale: 'R5', scores: { Memorability: 75, Relevance: 95, Availability: 65 } },
      ],
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
    });

    it('should compute weighted scores for all candidates (TS-3)', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      expect(result.candidates).toHaveLength(5);
      for (const candidate of result.candidates) {
        expect(candidate.weighted_score).toBeDefined();
        expect(typeof candidate.weighted_score).toBe('number');
      }
    });

    it('should compute correct weighted score (Alpha: 30% * 80 + 40% * 90 + 30% * 70)', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      const alpha = result.candidates.find(c => c.name === 'Alpha');
      // 0.3 * 80 + 0.4 * 90 + 0.3 * 70 = 24 + 36 + 21 = 81
      expect(alpha.weighted_score).toBe(81);
    });

    it('should compute correct weighted score (Beta: 30% * 90 + 40% * 70 + 30% * 80)', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      const beta = result.candidates.find(c => c.name === 'Beta');
      // 0.3 * 90 + 0.4 * 70 + 0.3 * 80 = 27 + 28 + 24 = 79
      expect(beta.weighted_score).toBe(79);
    });

    it('should compute correct weighted score (Delta: 30% * 85 + 40% * 85 + 30% * 85)', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      const delta = result.candidates.find(c => c.name === 'Delta');
      // All scores 85, weighted average = 85
      expect(delta.weighted_score).toBe(85);
    });

    it('should rank candidates by weighted_score descending', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      expect(result.ranked_candidates).toHaveLength(5);

      // Delta (85) should be first
      expect(result.ranked_candidates[0].name).toBe('Delta');
      expect(result.ranked_candidates[0].weighted_score).toBe(85);

      // Gamma (30% * 70 + 40% * 80 + 30% * 90 = 21 + 32 + 27 = 80)
      expect(result.ranked_candidates[1].name).toBe('Alpha');
      expect(result.ranked_candidates[1].weighted_score).toBe(81);

      // Alpha (81), Epsilon (30% * 75 + 40% * 95 + 30% * 65 = 22.5 + 38 + 19.5 = 80), Beta (79)
      // Check that scores are descending
      for (let i = 0; i < result.ranked_candidates.length - 1; i++) {
        expect(result.ranked_candidates[i].weighted_score).toBeGreaterThanOrEqual(
          result.ranked_candidates[i + 1].weighted_score
        );
      }
    });

    it('should round weighted scores to 2 decimal places', () => {
      const data = createValidData();
      data.scoringCriteria = [
        { name: 'A', weight: 33.33 },
        { name: 'B', weight: 33.33 },
        { name: 'C', weight: 33.34 },
      ];
      data.candidates = [
        { name: 'Test', rationale: 'R', scores: { A: 77, B: 83, C: 91 } },
        { name: 'C2', rationale: 'R', scores: { A: 50, B: 50, C: 50 } },
        { name: 'C3', rationale: 'R', scores: { A: 50, B: 50, C: 50 } },
        { name: 'C4', rationale: 'R', scores: { A: 50, B: 50, C: 50 } },
        { name: 'C5', rationale: 'R', scores: { A: 50, B: 50, C: 50 } },
      ];
      const result = stage10.computeDerived(data);
      const test = result.candidates.find(c => c.name === 'Test');
      // Should be rounded to 2 decimal places
      expect(test.weighted_score).toBe(Math.round((0.3333 * 77 + 0.3333 * 83 + 0.3334 * 91) * 100) / 100);
    });

    it('should preserve all original fields in candidates', () => {
      const data = createValidData();
      const result = stage10.computeDerived(data);
      for (let i = 0; i < data.candidates.length; i++) {
        expect(result.candidates[i].name).toBe(data.candidates[i].name);
        expect(result.candidates[i].rationale).toBe(data.candidates[i].rationale);
        expect(result.candidates[i].scores).toEqual(data.candidates[i].scores);
      }
    });

    it('should not mutate original data', () => {
      const data = createValidData();
      const original = JSON.parse(JSON.stringify(data));
      stage10.computeDerived(data);
      expect(data).toEqual(original);
    });

    it('should be deterministic (same input = same output)', () => {
      const data = createValidData();
      const result1 = stage10.computeDerived(data);
      const result2 = stage10.computeDerived(data);
      expect(result1.candidates).toEqual(result2.candidates);
      expect(result1.ranked_candidates).toEqual(result2.ranked_candidates);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    const createValidData = () => ({
      brandGenome: {
        archetype: 'Innovator',
        values: ['Innovation'],
        tone: 'Professional',
        audience: 'SMBs',
        differentiators: ['AI'],
      },
      scoringCriteria: [
        { name: 'M', weight: 50 },
        { name: 'R', weight: 50 },
      ],
      candidates: [
        { name: 'C1', rationale: 'R1', scores: { M: 80, R: 90 } },
        { name: 'C2', rationale: 'R2', scores: { M: 70, R: 80 } },
        { name: 'C3', rationale: 'R3', scores: { M: 85, R: 75 } },
        { name: 'C4', rationale: 'R4', scores: { M: 75, R: 85 } },
        { name: 'C5', rationale: 'R5', scores: { M: 90, R: 70 } },
      ],
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
    });

    it('should work together for valid data', () => {
      const data = createValidData();
      const validation = stage10.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage10.computeDerived(data);
      expect(computed.candidates).toHaveLength(5);
      expect(computed.ranked_candidates).toHaveLength(5);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = createValidData();
      data.candidates = data.candidates.slice(0, 3); // Invalid but computeDerived should still work
      const computed = stage10.computeDerived(data);
      expect(computed.candidates).toHaveLength(3);
      expect(computed.ranked_candidates).toHaveLength(3);
    });
  });
});
