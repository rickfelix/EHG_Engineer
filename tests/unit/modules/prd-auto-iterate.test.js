/**
 * Tests for PRD Auto-Iterate Quality Loop
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-C
 */

import { describe, it, expect } from 'vitest';
import { scorePRDQuality, enrichPRDFromDimensions } from '../../../scripts/modules/prd-auto-iterate.js';

const visionDims = [
  { key: 'V01', name: 'Market Validation', weight: 0.2, description: 'Validate market demand' },
  { key: 'V02', name: 'Technical Feasibility', weight: 0.15, description: 'Assess technical viability' },
  { key: 'V03', name: 'User Experience', weight: 0.1, description: 'Optimize UX flows' },
];

const archDims = [
  { key: 'A01', name: 'Data Layer', weight: 0.3, description: 'Database schema and migrations' },
  { key: 'A02', name: 'API Layer', weight: 0.25, description: 'REST endpoints and validation' },
];

describe('PRD Auto-Iterate', () => {
  describe('scorePRDQuality', () => {
    it('should score a minimal PRD low', () => {
      const score = scorePRDQuality({
        executive_summary: 'Short',
        functional_requirements: [],
        system_architecture: null,
        acceptance_criteria: [],
        test_scenarios: [],
        implementation_approach: '',
        risks: [],
      });
      expect(score).toBeLessThan(20);
    });

    it('should score a complete PRD high', () => {
      const score = scorePRDQuality({
        executive_summary: 'A comprehensive summary that describes the full scope of this implementation work including all requirements.',
        functional_requirements: JSON.stringify([
          { id: 'FR-01', title: 'A' }, { id: 'FR-02', title: 'B' },
          { id: 'FR-03', title: 'C' }, { id: 'FR-04', title: 'D' },
          { id: 'FR-05', title: 'E' },
        ]),
        system_architecture: JSON.stringify({
          overview: 'Detailed architecture overview that explains the full system design with multiple components and data flow patterns across the stack.',
          components: [{ file: 'a.js' }, { file: 'b.js' }],
          data_flow: 'A -> B -> C',
        }),
        acceptance_criteria: JSON.stringify(['AC1', 'AC2', 'AC3', 'AC4', 'AC5']),
        test_scenarios: JSON.stringify([{ id: 'TS1' }, { id: 'TS2' }, { id: 'TS3' }]),
        implementation_approach: 'A detailed implementation approach that covers all the necessary steps and considerations for building this feature including testing and deployment.',
        risks: JSON.stringify([{ risk: 'R1' }, { risk: 'R2' }]),
      });
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it('should give bonus for vision traceability in FRs', () => {
      const base = scorePRDQuality({
        functional_requirements: JSON.stringify([{ id: 'FR-01', title: 'Something' }]),
      });
      const withVision = scorePRDQuality({
        functional_requirements: JSON.stringify([{ id: 'FR-01', title: 'Vision: Market', traceability: 'vision_dimension' }]),
      });
      expect(withVision).toBeGreaterThan(base);
    });
  });

  describe('enrichPRDFromDimensions', () => {
    it('should inject vision dimensions into functional_requirements on iteration 1', () => {
      const prd = { functional_requirements: JSON.stringify([]), metadata: {} };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 1);

      const fr = JSON.parse(updates.functional_requirements);
      expect(fr.length).toBe(3); // 3 vision dims
      expect(fr[0].title).toContain('Vision: Market Validation');
      expect(fr[0].source).toBe('auto_enrichment_v1');
    });

    it('should inject architecture decisions on iteration 1-2', () => {
      const prd = { system_architecture: JSON.stringify({}), metadata: {} };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 1);

      const arch = JSON.parse(updates.system_architecture);
      expect(arch.architecture_dimensions.length).toBe(2);
      expect(arch.architecture_dimensions[0].dimension).toBe('Data Layer');
    });

    it('should inject acceptance criteria on iteration 2+', () => {
      const prd = { acceptance_criteria: JSON.stringify([]), metadata: {} };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 2);

      const ac = JSON.parse(updates.acceptance_criteria);
      expect(ac.length).toBe(5); // 3 vision + 2 arch
      expect(ac[0]).toContain('Market Validation');
    });

    it('should be idempotent — no duplicate injection on same iteration', () => {
      const prd = { functional_requirements: JSON.stringify([]), metadata: { __auto_enriched__: [1] } };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 1);

      // Should return empty — already enriched for iteration 1
      expect(Object.keys(updates).length).toBe(0);
    });

    it('should not inject dimensions that already exist in content', () => {
      const existingFR = [{ id: 'FR-01', title: 'Vision: Market Validation' }];
      const prd = { functional_requirements: JSON.stringify(existingFR), metadata: {} };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 1);

      const fr = JSON.parse(updates.functional_requirements);
      // Only 2 new vision dims (Market Validation already exists)
      expect(fr.length).toBe(3); // 1 existing + 2 new
      expect(fr.filter(f => f.title?.includes('Market Validation')).length).toBe(1);
    });

    it('should track enrichment in metadata', () => {
      const prd = { functional_requirements: JSON.stringify([]), metadata: {} };
      const updates = enrichPRDFromDimensions(prd, visionDims, archDims, 1);

      expect(updates.metadata.__auto_enriched__).toContain(1);
      expect(updates.metadata.auto_iterate_last_iteration).toBe(1);
    });
  });

  describe('score improvement', () => {
    it('should improve score by 15+ points after enrichment', () => {
      const thinPrd = {
        executive_summary: 'A brief summary.',
        functional_requirements: JSON.stringify([]),
        system_architecture: JSON.stringify({}),
        acceptance_criteria: JSON.stringify([]),
        test_scenarios: JSON.stringify([]),
        implementation_approach: '',
        risks: JSON.stringify([]),
        metadata: {},
      };

      const beforeScore = scorePRDQuality(thinPrd);

      // Enrich iteration 1
      const updates1 = enrichPRDFromDimensions(thinPrd, visionDims, archDims, 1);
      const enriched1 = { ...thinPrd, ...updates1 };
      const afterScore1 = scorePRDQuality(enriched1);

      expect(afterScore1 - beforeScore).toBeGreaterThanOrEqual(15);
    });
  });
});
