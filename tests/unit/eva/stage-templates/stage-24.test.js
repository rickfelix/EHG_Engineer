/**
 * Unit tests for Stage 23 - Marketing Preparation template
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Test Scenario: Stage 23 validation enforces marketing item requirements,
 * marketing strategy summary, and release readiness checks against Stage 22.
 *
 * @module tests/unit/eva/stage-templates/stage-23.test
 */

import { describe, it, expect } from 'vitest';
import stage23, {
  checkReleaseReadiness,
  MARKETING_ITEM_TYPES,
  MARKETING_PRIORITIES,
  MIN_MARKETING_ITEMS,
} from '../../../../lib/eva/stage-templates/stage-23.js';

describe('stage-23.js - Marketing Preparation template', () => {
  describe('Template contract', () => {
    it('should export TEMPLATE with required properties', () => {
      expect(stage23).toBeDefined();
      expect(stage23.id).toBeDefined();
      expect(stage23.slug).toBeDefined();
      expect(stage23.title).toBeDefined();
      expect(stage23.version).toBeDefined();
    });

    it('should have correct id, slug, title, version', () => {
      expect(stage23.id).toBe('stage-23');
      expect(stage23.slug).toBe('marketing-preparation');
      expect(stage23.title).toBe('Marketing Preparation');
      expect(stage23.version).toBe('2.0.0');
    });

    it('should have schema, defaultData, validate, computeDerived', () => {
      expect(stage23.schema).toBeDefined();
      expect(stage23.defaultData).toBeDefined();
      expect(typeof stage23.validate).toBe('function');
      expect(typeof stage23.computeDerived).toBe('function');
    });

    it('should have analysisStep function', () => {
      expect(typeof stage23.analysisStep).toBe('function');
    });

    it('should have outputSchema from extractOutputSchema', () => {
      expect(stage23.outputSchema).toBeDefined();
    });

    it('should have schema with expected fields', () => {
      expect(stage23.schema.marketing_items).toBeDefined();
      expect(stage23.schema.sd_bridge_payloads).toBeDefined();
      expect(stage23.schema.marketing_sds).toBeDefined();
      expect(stage23.schema.marketing_strategy_summary).toBeDefined();
      expect(stage23.schema.target_audience).toBeDefined();
      expect(stage23.schema.marketing_readiness_pct).toBeDefined();
      expect(stage23.schema.total_marketing_items).toBeDefined();
      expect(stage23.schema.sds_created_count).toBeDefined();
    });

    it('should have correct defaultData', () => {
      expect(stage23.defaultData).toEqual({
        marketing_items: [],
        sd_bridge_payloads: [],
        marketing_sds: [],
        marketing_strategy_summary: null,
        target_audience: null,
        marketing_readiness_pct: 0,
        total_marketing_items: 0,
        sds_created_count: 0,
      });
    });

    it('should export constants', () => {
      expect(Array.isArray(MARKETING_ITEM_TYPES)).toBe(true);
      expect(MARKETING_ITEM_TYPES).toContain('landing_page');
      expect(MARKETING_ITEM_TYPES).toContain('social_media_campaign');
      expect(MARKETING_ITEM_TYPES).toContain('press_release');
      expect(MARKETING_ITEM_TYPES).toContain('email_campaign');
      expect(MARKETING_ITEM_TYPES).toContain('launch_announcement');
      expect(MARKETING_ITEM_TYPES).toHaveLength(10);

      expect(MARKETING_PRIORITIES).toEqual(['critical', 'high', 'medium', 'low']);
      expect(MIN_MARKETING_ITEMS).toBe(3);
    });

    it('should export checkReleaseReadiness function', () => {
      expect(typeof checkReleaseReadiness).toBe('function');
    });
  });

  describe('validate() - Marketing items', () => {
    const validBase = {
      marketing_strategy_summary: 'Comprehensive marketing strategy for launch',
    };

    it('should pass for well-formed data with 3+ marketing items', () => {
      const validData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', description: 'Main product landing page', type: 'landing_page', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for fewer than 3 marketing items', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', description: 'Main product landing page', type: 'landing_page', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items') && e.includes('at least 3'))).toBe(true);
    });

    it('should fail for empty marketing items array', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items'))).toBe(true);
    });

    it('should fail for missing marketing_items', () => {
      const invalidData = {
        ...validBase,
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items'))).toBe(true);
    });

    it('should fail for marketing item missing title', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { description: 'Main product landing page', type: 'landing_page', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items[0].title'))).toBe(true);
    });

    it('should fail for marketing item missing description', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', type: 'landing_page', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items[0].description'))).toBe(true);
    });

    it('should fail for marketing item with invalid type', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', description: 'Main page', type: 'invalid_type', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items[0].type'))).toBe(true);
    });

    it('should fail for marketing item with invalid priority', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', description: 'Main page', type: 'landing_page', priority: 'urgent' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items[0].priority'))).toBe(true);
    });

    it('should validate multiple items and collect all errors', () => {
      const invalidData = {
        ...validBase,
        marketing_items: [
          { title: 'Landing Page', description: 'Main page', type: 'landing_page', priority: 'critical' },
          { description: 'Missing title', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', type: 'email_campaign', priority: 'medium' },
        ],
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items[1].title'))).toBe(true);
      expect(result.errors.some(e => e.includes('marketing_items[2].description'))).toBe(true);
    });
  });

  describe('validate() - Marketing strategy summary', () => {
    const validItems = [
      { title: 'Landing Page', description: 'Main product landing page', type: 'landing_page', priority: 'critical' },
      { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
      { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
    ];

    it('should fail for missing marketing_strategy_summary', () => {
      const invalidData = {
        marketing_items: validItems,
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_strategy_summary'))).toBe(true);
    });

    it('should fail for marketing_strategy_summary shorter than 10 characters', () => {
      const invalidData = {
        marketing_items: validItems,
        marketing_strategy_summary: 'Short',
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_strategy_summary'))).toBe(true);
    });

    it('should pass for marketing_strategy_summary with 10+ characters', () => {
      const validData = {
        marketing_items: validItems,
        marketing_strategy_summary: 'Comprehensive marketing strategy for product launch',
      };
      const result = stage23.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived()', () => {
    it('should spread input data to output', () => {
      const data = {
        marketing_items: [
          { title: 'Landing Page', description: 'Main page', type: 'landing_page', priority: 'critical' },
        ],
        marketing_strategy_summary: 'Strategy summary text here',
      };
      const result = stage23.computeDerived(data);
      expect(result.marketing_items).toEqual(data.marketing_items);
      expect(result.marketing_strategy_summary).toBe(data.marketing_strategy_summary);
    });
  });

  describe('checkReleaseReadiness() - Pure function', () => {
    it('should return ready when stage22 promotion gate passes and release decision is release', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: true, blockers: [] },
          releaseDecision: { decision: 'release' },
        },
      });
      expect(result.ready).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should return ready when release decision is approved', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: true, blockers: [] },
          releaseDecision: { decision: 'approved' },
        },
      });
      expect(result.ready).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should return not ready when stage23Data is not provided', () => {
      const result = checkReleaseReadiness({ stage23Data: undefined });
      expect(result.ready).toBe(false);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('not available');
    });

    it('should return not ready when promotion gate has not passed', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: false, blockers: ['Test coverage below 80%'] },
          releaseDecision: { decision: 'release' },
        },
      });
      expect(result.ready).toBe(false);
      expect(result.reasons.some(r => r.includes('promotion gate'))).toBe(true);
    });

    it('should return not ready when release decision is not release or approved', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: true, blockers: [] },
          releaseDecision: { decision: 'hold' },
        },
      });
      expect(result.ready).toBe(false);
      expect(result.reasons.some(r => r.includes('release decision'))).toBe(true);
    });

    it('should return not ready when releaseDecision is missing', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: true, blockers: [] },
        },
      });
      expect(result.ready).toBe(false);
      expect(result.reasons.some(r => r.includes('release decision not found'))).toBe(true);
    });

    it('should collect multiple reasons when both gate and decision fail', () => {
      const result = checkReleaseReadiness({
        stage23Data: {
          promotion_gate: { pass: false, blockers: ['Not ready'] },
          releaseDecision: { decision: 'hold' },
        },
      });
      expect(result.ready).toBe(false);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons.some(r => r.includes('promotion gate'))).toBe(true);
      expect(result.reasons.some(r => r.includes('release decision'))).toBe(true);
    });

    it('should handle null stage23Data', () => {
      const result = checkReleaseReadiness({ stage23Data: null });
      expect(result.ready).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage23.validate(null, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage23.validate(undefined, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle non-array marketing_items', () => {
      const invalidData = {
        marketing_items: 'not an array',
        marketing_strategy_summary: 'Valid strategy summary text',
      };
      const result = stage23.validate(invalidData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('marketing_items'))).toBe(true);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        marketing_items: [
          { title: 'Landing Page', description: 'Main product landing page', type: 'landing_page', priority: 'critical' },
          { title: 'Press Release', description: 'Launch press release', type: 'press_release', priority: 'high' },
          { title: 'Email Blast', description: 'Launch email campaign', type: 'email_campaign', priority: 'medium' },
        ],
        marketing_strategy_summary: 'Comprehensive marketing strategy for product launch',
        sd_bridge_payloads: [],
        marketing_sds: [],
      };
      const validation = stage23.validate(data, { logger: { warn: () => {} } });
      expect(validation.valid).toBe(true);

      const computed = stage23.computeDerived(data);
      expect(computed.marketing_items).toEqual(data.marketing_items);
      expect(computed.marketing_strategy_summary).toBe(data.marketing_strategy_summary);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        marketing_items: [],
        marketing_strategy_summary: 'Short',
      };
      // computeDerived should not throw even with invalid data
      const computed = stage23.computeDerived(data);
      expect(computed.marketing_items).toEqual([]);
    });
  });
});
