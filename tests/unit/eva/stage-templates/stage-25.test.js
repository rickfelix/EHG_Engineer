/**
 * Unit tests for Stage 25 - Venture Review template
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Test Scenario: Stage 25 validation enforces 5-category initiative review
 * (product, market, technical, financial, team) with drift detection against
 * Stage 1 vision/constraints.
 *
 * @module tests/unit/eva/stage-templates/stage-25.test
 */

import { describe, it, expect } from 'vitest';
import stage25, { detectDrift, REVIEW_CATEGORIES, MIN_INITIATIVES_PER_CATEGORY } from '../../../../lib/eva/stage-templates/stage-25.js';

describe('stage-25.js - Venture Review template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage25.id).toBe('stage-25');
      expect(stage25.slug).toBe('venture-review');
      expect(stage25.title).toBe('Venture Review');
      expect(stage25.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage25.schema).toBeDefined();
      expect(stage25.schema.review_summary).toBeDefined();
      expect(stage25.schema.initiatives).toBeDefined();
      expect(stage25.schema.current_vision).toBeDefined();
      expect(stage25.schema.drift_justification).toBeDefined();
      expect(stage25.schema.next_steps).toBeDefined();
      expect(stage25.schema.total_initiatives).toBeDefined();
      expect(stage25.schema.all_categories_reviewed).toBeDefined();
      expect(stage25.schema.drift_detected).toBeDefined();
      expect(stage25.schema.drift_check).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage25.defaultData).toEqual({
        review_summary: null,
        initiatives: {},
        current_vision: null,
        drift_justification: null,
        next_steps: [],
        financialComparison: { projected: null, actual: null },
        chairmanGate: { status: 'pending', rationale: null, decision_id: null },
        total_initiatives: 0,
        all_categories_reviewed: false,
        drift_detected: false,
        drift_check: null,
        ventureDecision: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage25.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage25.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(REVIEW_CATEGORIES).toEqual(['product', 'market', 'technical', 'financial', 'team']);
      expect(MIN_INITIATIVES_PER_CATEGORY).toBe(1);
    });

    it('should export detectDrift function', () => {
      expect(typeof detectDrift).toBe('function');
    });
  });

  describe('validate() - Review summary', () => {
    it('should fail for missing review_summary', () => {
      const invalidData = {
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('review_summary'))).toBe(true);
    });

    it('should fail for review_summary < 20 characters', () => {
      const invalidData = {
        review_summary: 'Short summary',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('review_summary'))).toBe(true);
    });

    it('should pass for valid review_summary', () => {
      const validData = {
        review_summary: 'Comprehensive review of all venture aspects completed successfully',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const result = stage25.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validate() - Initiatives object structure', () => {
    it('should fail for missing initiatives object', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives'))).toBe(true);
    });

    it('should fail for non-object initiatives', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: 'not an object',
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives'))).toBe(true);
    });
  });

  describe('validate() - Initiative categories', () => {
    it('should pass for valid initiatives across all categories', () => {
      const validData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'MVP Launch', status: 'completed', outcome: 'Successfully launched' }],
          market: [{ title: 'Market Analysis', status: 'completed', outcome: 'Positive feedback' }],
          technical: [{ title: 'Infrastructure Setup', status: 'completed', outcome: 'Stable platform' }],
          financial: [{ title: 'Funding Round', status: 'completed', outcome: 'Fully funded' }],
          team: [{ title: 'Team Expansion', status: 'completed', outcome: 'Key hires made' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const result = stage25.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing product category', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives.product'))).toBe(true);
    });

    it('should fail for empty product array', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives.product') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for initiative missing title', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives.product[0].title'))).toBe(true);
    });

    it('should fail for initiative missing status', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives.product[0].status'))).toBe(true);
    });

    it('should fail for initiative missing outcome', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initiatives.product[0].outcome'))).toBe(true);
    });

    it('should allow multiple initiatives per category', () => {
      const validData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [
            { title: 'MVP Launch', status: 'completed', outcome: 'Success' },
            { title: 'Feature A', status: 'completed', outcome: 'Success' },
          ],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const result = stage25.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Current vision', () => {
    const validInitiatives = {
      product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
      market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
      technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
      financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
      team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
    };

    it('should fail for missing current_vision', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: validInitiatives,
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('current_vision'))).toBe(true);
    });

    it('should fail for current_vision < 10 characters', () => {
      const invalidData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: validInitiatives,
        current_vision: 'Short',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('current_vision'))).toBe(true);
    });

    it('should pass for valid current_vision', () => {
      const validData = {
        review_summary: 'Comprehensive review summary here',
        initiatives: validInitiatives,
        current_vision: 'Current vision statement for the venture',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const result = stage25.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Next steps', () => {
    const validData = {
      review_summary: 'Comprehensive review summary here',
      initiatives: {
        product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
        market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
        technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
        team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
      },
      current_vision: 'Current vision statement',
    };

    it('should fail for missing next_steps', () => {
      const invalidData = { ...validData };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('next_steps'))).toBe(true);
    });

    it('should fail for empty next_steps array', () => {
      const invalidData = {
        ...validData,
        next_steps: [],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('next_steps') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for next step missing action', () => {
      const invalidData = {
        ...validData,
        next_steps: [{ owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('next_steps[0].action'))).toBe(true);
    });

    it('should fail for next step missing owner', () => {
      const invalidData = {
        ...validData,
        next_steps: [{ action: 'Action 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('next_steps[0].owner'))).toBe(true);
    });

    it('should fail for next step missing timeline', () => {
      const invalidData = {
        ...validData,
        next_steps: [{ action: 'Action 1', owner: 'Owner 1' }],
      };
      const result = stage25.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('next_steps[0].timeline'))).toBe(true);
    });

    it('should pass for valid next steps', () => {
      const validDataWithSteps = {
        ...validData,
        next_steps: [
          { action: 'Launch next phase', owner: 'CEO', timeline: 'Q1 2026' },
          { action: 'Expand team', owner: 'HR', timeline: 'Q2 2026' },
        ],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const result = stage25.validate(validDataWithSteps);
      expect(result.valid).toBe(true);
    });
  });

  describe('detectDrift() - Pure function', () => {
    it('should detect no drift for null original_vision', () => {
      const result = detectDrift({
        original_vision: null,
        current_vision: 'Current vision statement',
      });
      expect(result.drift_detected).toBe(false);
      expect(result.rationale).toContain('No original vision');
      expect(result.original_vision).toBeNull();
      expect(result.current_vision).toBe('Current vision statement');
    });

    it('should detect no drift for identical visions', () => {
      const vision = 'Building revolutionary platform technology solutions';
      const result = detectDrift({
        original_vision: vision,
        current_vision: vision,
      });
      expect(result.drift_detected).toBe(false);
      expect(result.rationale).toContain('100% overlap');
    });

    it('should detect no drift for high overlap (>30%)', () => {
      const result = detectDrift({
        original_vision: 'Building revolutionary platform technology solutions marketplace',
        current_vision: 'Building innovative platform technology solutions ecosystem',
      });
      expect(result.drift_detected).toBe(false);
      expect(result.rationale).toContain('overlap');
    });

    it('should detect drift for low overlap (<30%)', () => {
      const result = detectDrift({
        original_vision: 'Building revolutionary platform technology solutions marketplace',
        current_vision: 'Creating artisanal handmade crafts store',
      });
      expect(result.drift_detected).toBe(true);
      expect(result.rationale).toContain('Significant drift');
      expect(result.rationale).toContain('overlap');
    });

    it('should filter out short words (<=3 chars) in overlap calculation', () => {
      const result = detectDrift({
        original_vision: 'A big red car and the sun',
        current_vision: 'The big sun',
      });
      // Only words >3 chars: original = [], current = []
      // Should detect drift due to no meaningful overlap
      expect(result.drift_detected).toBe(false); // No words >3 chars, so 100% overlap of empty sets
    });

    it('should be case-insensitive', () => {
      const result = detectDrift({
        original_vision: 'Building Revolutionary Platform Technology',
        current_vision: 'building revolutionary platform technology',
      });
      expect(result.drift_detected).toBe(false);
      expect(result.rationale).toContain('100% overlap');
    });

    it('should handle whitespace and punctuation', () => {
      const result = detectDrift({
        original_vision: 'Building  revolutionary   platform!',
        current_vision: 'Building revolutionary platform.',
      });
      expect(result.drift_detected).toBe(false);
    });
  });

  describe('computeDerived() - Initiative counts', () => {
    it('should calculate total_initiatives correctly', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }, { title: 'P2', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }, { title: 'F2', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.total_initiatives).toBe(7);
    });

    it('should set all_categories_reviewed to true when all categories present', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.all_categories_reviewed).toBe(true);
    });

    it('should set all_categories_reviewed to false when missing categories', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [],
          financial: [],
          team: [],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.all_categories_reviewed).toBe(false);
    });
  });

  describe('computeDerived() - Drift detection integration', () => {
    it('should include drift check when prerequisites.stage01 provided', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Building revolutionary platform technology solutions',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const prerequisites = {
        stage01: {
          venture_name: 'Platform Builder',
          elevator_pitch: 'Building revolutionary platform technology solutions',
        },
      };
      const result = stage25.computeDerived(data, prerequisites);
      expect(result.drift_check).toBeDefined();
      expect(result.drift_check.drift_detected).toBe(false);
      expect(result.drift_detected).toBe(false);
    });

    it('should detect drift when vision changed significantly', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Creating artisanal handmade crafts marketplace',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const prerequisites = {
        stage01: {
          venture_name: 'Platform Builder',
          elevator_pitch: 'Building revolutionary platform technology solutions',
        },
      };
      const result = stage25.computeDerived(data, prerequisites);
      expect(result.drift_check).toBeDefined();
      expect(result.drift_check.drift_detected).toBe(true);
      expect(result.drift_detected).toBe(true);
    });

    it('should skip drift check when prerequisites not provided', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.drift_check).toBeDefined();
      expect(result.drift_check.drift_detected).toBe(false);
      expect(result.drift_check.rationale).toContain('Stage 1 data not provided');
    });

    it('should preserve original data fields', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {
          product: [{ title: 'P1', status: 'completed', outcome: 'Success' }],
          market: [{ title: 'M1', status: 'completed', outcome: 'Success' }],
          technical: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
          financial: [{ title: 'F1', status: 'completed', outcome: 'Success' }],
          team: [{ title: 'T1', status: 'completed', outcome: 'Success' }],
        },
        current_vision: 'Current vision statement',
        drift_justification: 'Justification text',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.review_summary).toBe(data.review_summary);
      expect(result.initiatives).toEqual(data.initiatives);
      expect(result.current_vision).toBe(data.current_vision);
      expect(result.drift_justification).toBe(data.drift_justification);
      expect(result.next_steps).toEqual(data.next_steps);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage25.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage25.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty initiatives object in computeDerived', () => {
      const data = {
        review_summary: 'Comprehensive review summary here',
        initiatives: {},
        current_vision: 'Current vision statement',
        next_steps: [{ action: 'Action 1', owner: 'Owner 1', timeline: 'Q1 2026' }],
      };
      const result = stage25.computeDerived(data);
      expect(result.total_initiatives).toBe(0);
      expect(result.all_categories_reviewed).toBe(false);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        review_summary: 'Comprehensive review of all venture aspects completed successfully',
        initiatives: {
          product: [{ title: 'MVP Launch', status: 'completed', outcome: 'Successfully launched' }],
          market: [{ title: 'Market Analysis', status: 'completed', outcome: 'Positive feedback' }],
          technical: [{ title: 'Infrastructure Setup', status: 'completed', outcome: 'Stable platform' }],
          financial: [{ title: 'Funding Round', status: 'completed', outcome: 'Fully funded' }],
          team: [{ title: 'Team Expansion', status: 'completed', outcome: 'Key hires made' }],
        },
        current_vision: 'Building revolutionary platform technology solutions',
        drift_justification: 'No drift detected, vision remains consistent',
        next_steps: [
          { action: 'Launch next phase', owner: 'CEO', timeline: 'Q1 2026' },
        ],
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      };
      const validation = stage25.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage25.computeDerived(data);
      expect(computed.total_initiatives).toBe(5);
      expect(computed.all_categories_reviewed).toBe(true);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        review_summary: 'Short', // Invalid: < 20 chars
        initiatives: {
          product: [{ title: 'P1' }], // Invalid: missing status and outcome
          market: [],
          technical: [],
          financial: [],
          team: [],
        },
        current_vision: 'CV',
        next_steps: [],
      };
      const computed = stage25.computeDerived(data);
      expect(computed.total_initiatives).toBe(1);
      expect(computed.all_categories_reviewed).toBe(false);
    });
  });
});
