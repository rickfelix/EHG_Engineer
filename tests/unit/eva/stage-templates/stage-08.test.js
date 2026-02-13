/**
 * Unit tests for Stage 08 - Business Model Canvas template
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Test Scenario TS-3: Stage 08 missing block fails validation with specific error
 *
 * @module tests/unit/eva/stage-templates/stage-08.test
 */

import { describe, it, expect } from 'vitest';
import stage08, { BMC_BLOCKS, MIN_ITEMS, DEFAULT_MIN_ITEMS } from '../../../../lib/eva/stage-templates/stage-08.js';

describe('stage-08.js - Business Model Canvas template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage08.id).toBe('stage-08');
      expect(stage08.slug).toBe('bmc');
      expect(stage08.title).toBe('Business Model Canvas');
      expect(stage08.version).toBe('2.0.0');
    });

    it('should export BMC_BLOCKS with all 9 blocks', () => {
      expect(BMC_BLOCKS).toEqual([
        'customerSegments',
        'valuePropositions',
        'channels',
        'customerRelationships',
        'revenueStreams',
        'keyResources',
        'keyActivities',
        'keyPartnerships',
        'costStructure',
      ]);
      expect(BMC_BLOCKS).toHaveLength(9);
    });

    it('should export MIN_ITEMS with keyPartnerships = 1', () => {
      expect(MIN_ITEMS).toEqual({ keyPartnerships: 1 });
    });

    it('should export DEFAULT_MIN_ITEMS = 2', () => {
      expect(DEFAULT_MIN_ITEMS).toBe(2);
    });

    it('should have defaultData with all 9 blocks as empty arrays', () => {
      const defaultData = stage08.defaultData;
      for (const block of BMC_BLOCKS) {
        expect(defaultData[block]).toEqual({ items: [] });
      }
    });

    it('should have validate function', () => {
      expect(typeof stage08.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage08.computeDerived).toBe('function');
    });
  });

  describe('validate() - BMC blocks validation', () => {
    const createValidBlock = (blockName, itemCount = null) => {
      const minItems = MIN_ITEMS[blockName] || DEFAULT_MIN_ITEMS;
      const count = itemCount !== null ? itemCount : minItems;
      return {
        items: Array.from({ length: count }, (_, i) => ({
          text: `${blockName} item ${i + 1}`,
          priority: 1,
          evidence: 'Sample evidence',
        })),
      };
    };

    const createValidData = () => {
      const data = {};
      for (const block of BMC_BLOCKS) {
        data[block] = createValidBlock(block);
      }
      return data;
    };

    it('should pass for valid data with all 9 blocks populated', () => {
      const data = createValidData();
      const result = stage08.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing block', () => {
      const data = createValidData();
      delete data.customerSegments;
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customerSegments');
      expect(result.errors[0]).toContain('is required and must be an object');
    });

    it('should fail when block is not an object', () => {
      const data = createValidData();
      data.valuePropositions = 'not an object';
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('valuePropositions');
      expect(result.errors[0]).toContain('is required and must be an object');
    });

    it('should fail when block has empty items array', () => {
      const data = createValidData();
      data.channels = { items: [] };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('channels.items');
      expect(result.errors[0]).toContain('must have at least 2 item(s)');
    });

    it('should fail when keyPartnerships has 0 items (requires 1)', () => {
      const data = createValidData();
      data.keyPartnerships = { items: [] };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('keyPartnerships.items');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should pass when keyPartnerships has exactly 1 item', () => {
      const data = createValidData();
      data.keyPartnerships = {
        items: [
          { text: 'Key partner', priority: 1 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail when other blocks have only 1 item (requires 2)', () => {
      const data = createValidData();
      data.customerSegments = {
        items: [
          { text: 'Only one segment', priority: 1 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customerSegments.items');
      expect(result.errors[0]).toContain('must have at least 2 item(s)');
    });

    it('should fail for item missing text', () => {
      const data = createValidData();
      data.revenueStreams = {
        items: [
          { priority: 1 },
          { text: 'Valid item', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('revenueStreams.items[0].text');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for item with empty text', () => {
      const data = createValidData();
      data.keyResources = {
        items: [
          { text: '', priority: 1 },
          { text: 'Valid item', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('keyResources.items[0].text');
      expect(result.errors[0]).toContain('must be at least 1 characters');
    });

    it('should fail for item missing priority', () => {
      const data = createValidData();
      data.keyActivities = {
        items: [
          { text: 'Missing priority' },
          { text: 'Valid item', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('keyActivities.items[0].priority');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for priority < 1', () => {
      const data = createValidData();
      data.costStructure = {
        items: [
          { text: 'Invalid priority', priority: 0 },
          { text: 'Valid item', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('costStructure.items[0].priority');
      expect(result.errors[0]).toContain('must be between 1 and 3');
    });

    it('should fail for priority > 3', () => {
      const data = createValidData();
      data.customerRelationships = {
        items: [
          { text: 'Invalid priority', priority: 4 },
          { text: 'Valid item', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customerRelationships.items[0].priority');
      expect(result.errors[0]).toContain('must be between 1 and 3');
    });

    it('should pass for priority at boundaries (1 and 3)', () => {
      const data = createValidData();
      data.valuePropositions = {
        items: [
          { text: 'Priority 1', priority: 1 },
          { text: 'Priority 3', priority: 3 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should allow optional evidence field', () => {
      const data = createValidData();
      data.channels = {
        items: [
          { text: 'With evidence', priority: 1, evidence: 'Supporting data' },
          { text: 'Without evidence', priority: 2 },
        ],
      };
      const result = stage08.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should collect errors across multiple blocks', () => {
      const data = createValidData();
      data.customerSegments = { items: [] }; // Too few
      data.valuePropositions = { items: [{ text: 'Only one' }] }; // Missing priority
      delete data.channels; // Missing block
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validate() - TS-3: Missing block specific error', () => {
    const createValidData = () => {
      const data = {};
      for (const block of BMC_BLOCKS) {
        const minItems = MIN_ITEMS[block] || DEFAULT_MIN_ITEMS;
        data[block] = {
          items: Array.from({ length: minItems }, (_, i) => ({
            text: `${block} item ${i + 1}`,
            priority: 1,
          })),
        };
      }
      return data;
    };

    it('should fail with specific error for missing customerSegments', () => {
      const data = createValidData();
      delete data.customerSegments;
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('customerSegments');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail with specific error for missing valuePropositions', () => {
      const data = createValidData();
      delete data.valuePropositions;
      const result = stage08.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('valuePropositions');
    });

    it('should fail with specific error for each missing block', () => {
      for (const block of BMC_BLOCKS) {
        const data = createValidData();
        delete data[block];
        const result = stage08.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain(block);
      }
    });
  });

  describe('computeDerived() - Cross-links computation', () => {
    const createValidData = () => {
      const data = {};
      for (const block of BMC_BLOCKS) {
        const minItems = MIN_ITEMS[block] || DEFAULT_MIN_ITEMS;
        data[block] = {
          items: Array.from({ length: minItems }, (_, i) => ({
            text: `${block} item ${i + 1}`,
            priority: 1,
          })),
        };
      }
      return data;
    };

    it('should add cross_links array to output', () => {
      const data = createValidData();
      const result = stage08.computeDerived(data);
      expect(result.cross_links).toBeDefined();
      expect(Array.isArray(result.cross_links)).toBe(true);
    });

    it('should include link to stage-06 (Risk)', () => {
      const data = createValidData();
      const result = stage08.computeDerived(data);
      const stage06Link = result.cross_links.find(link => link.stage_id === 'stage-06');
      expect(stage06Link).toBeDefined();
      expect(stage06Link.relationship).toContain('Cost Structure');
      expect(stage06Link.relationship).toContain('Risk');
    });

    it('should include link to stage-07 (Pricing)', () => {
      const data = createValidData();
      const result = stage08.computeDerived(data);
      const stage07Link = result.cross_links.find(link => link.stage_id === 'stage-07');
      expect(stage07Link).toBeDefined();
      expect(stage07Link.relationship).toContain('Revenue Streams');
      expect(stage07Link.relationship).toContain('Pricing');
    });

    it('should preserve all original blocks in output', () => {
      const data = createValidData();
      const result = stage08.computeDerived(data);
      for (const block of BMC_BLOCKS) {
        expect(result[block]).toBeDefined();
        expect(result[block].items).toEqual(data[block].items);
      }
    });

    it('should not mutate original data', () => {
      const data = createValidData();
      const original = JSON.parse(JSON.stringify(data));
      stage08.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    const createValidData = () => {
      const data = {};
      for (const block of BMC_BLOCKS) {
        const minItems = MIN_ITEMS[block] || DEFAULT_MIN_ITEMS;
        data[block] = {
          items: Array.from({ length: minItems }, (_, i) => ({
            text: `${block} item ${i + 1}`,
            priority: 1 + (i % 3),
          })),
        };
      }
      return data;
    };

    it('should work together for valid complete BMC', () => {
      const data = createValidData();
      const validation = stage08.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage08.computeDerived(data);
      expect(computed.cross_links).toHaveLength(2);
      for (const block of BMC_BLOCKS) {
        expect(computed[block]).toBeDefined();
      }
    });

    it('should compute derived even for invalid data (decoupled)', () => {
      const data = createValidData();
      data.customerSegments = { items: [] }; // Invalid
      const validation = stage08.validate(data);
      expect(validation.valid).toBe(false);

      const computed = stage08.computeDerived(data);
      expect(computed.cross_links).toBeDefined();
    });
  });
});
