/**
 * Unit tests for Stage 14 - Technical Architecture template
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario: Stage 14 validation enforces all 4 required layers
 * (frontend, backend, data, infra) with components and integration points.
 *
 * @module tests/unit/eva/stage-templates/stage-14.test
 */

import { describe, it, expect } from 'vitest';
import stage14, { REQUIRED_LAYERS, MIN_INTEGRATION_POINTS } from '../../../../lib/eva/stage-templates/stage-14.js';

describe('stage-14.js - Technical Architecture template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage14.id).toBe('stage-14');
      expect(stage14.slug).toBe('technical-architecture');
      expect(stage14.title).toBe('Technical Architecture');
      expect(stage14.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage14.schema).toBeDefined();
      expect(stage14.schema.architecture_summary).toEqual({
        type: 'string',
        minLength: 20,
        required: true,
      });
      expect(stage14.schema.layers).toBeDefined();
      expect(stage14.schema.integration_points).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage14.defaultData).toEqual({
        architecture_summary: null,
        layers: {},
        integration_points: [],
        constraints: [],
        layer_count: 0,
        total_components: 0,
        all_layers_defined: false,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage14.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage14.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(REQUIRED_LAYERS).toEqual(['frontend', 'backend', 'data', 'infra']);
      expect(MIN_INTEGRATION_POINTS).toBe(1);
    });
  });

  describe('validate() - Architecture summary', () => {
    const validLayers = {
      frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };

    it('should pass for valid architecture_summary', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for architecture_summary below minimum length', () => {
      const invalidData = {
        architecture_summary: 'Short summary',
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture_summary'))).toBe(true);
    });

    it('should fail for missing architecture_summary', () => {
      const invalidData = {
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture_summary'))).toBe(true);
    });
  });

  describe('validate() - Required layers', () => {
    it('should fail for missing layers object', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers is required'))).toBe(true);
    });

    it('should fail for missing frontend layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'backend', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.frontend is required'))).toBe(true);
    });

    it('should fail for missing backend layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.backend is required'))).toBe(true);
    });

    it('should fail for missing data layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.data is required'))).toBe(true);
    });

    it('should fail for missing infra layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.infra is required'))).toBe(true);
    });
  });

  describe('validate() - Layer properties', () => {
    it('should fail for layer missing technology', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.frontend.technology'))).toBe(true);
    });

    it('should fail for layer missing rationale', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'] },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.backend.rationale'))).toBe(true);
    });

    it('should fail for layer with empty components array', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: [], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'backend', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.frontend.components'))).toBe(true);
    });

    it('should fail for layer missing components', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.data.components'))).toBe(true);
    });
  });

  describe('validate() - Integration points', () => {
    const validLayers = {
      frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };

    it('should fail for empty integration_points array', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points'))).toBe(true);
    });

    it('should fail for integration point missing name', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].name'))).toBe(true);
    });

    it('should fail for integration point missing source_layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].source_layer'))).toBe(true);
    });

    it('should fail for integration point missing target_layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].target_layer'))).toBe(true);
    });

    it('should fail for integration point missing protocol', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].protocol'))).toBe(true);
    });
  });

  describe('validate() - Constraints (optional)', () => {
    const validLayers = {
      frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };

    it('should pass when constraints are omitted', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when constraints are empty array', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
        constraints: [],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when constraints have valid items', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
        constraints: [{ name: 'C1', description: 'Constraint 1' }],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for constraint missing name', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
        constraints: [{ description: 'Constraint 1' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('constraints[0].name'))).toBe(true);
    });

    it('should fail for constraint missing description', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
        constraints: [{ name: 'C1' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('constraints[0].description'))).toBe(true);
    });
  });

  describe('computeDerived() - Layer statistics', () => {
    it('should calculate layer_count correctly', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI', 'Router'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API', 'Auth'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.layer_count).toBe(4);
    });

    it('should calculate total_components correctly', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI', 'Router', 'State'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API', 'Auth'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2', 'S3'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.total_components).toBe(8);
    });

    it('should set all_layers_defined to true when all 4 layers present', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.all_layers_defined).toBe(true);
    });

    it('should set all_layers_defined to false when layers missing', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.all_layers_defined).toBe(false);
    });

    it('should handle empty layers object', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {},
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.layer_count).toBe(0);
      expect(result.total_components).toBe(0);
      expect(result.all_layers_defined).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const result = stage14.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined values', () => {
      const result = stage14.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node.js', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const validation = stage14.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage14.computeDerived(data);
      expect(computed.all_layers_defined).toBe(true);
      expect(computed.layer_count).toBe(4);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        architecture_summary: 'Short',
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
        },
        integration_points: [],
      };
      const computed = stage14.computeDerived(data);
      expect(computed.layer_count).toBe(1);
      expect(computed.all_layers_defined).toBe(false);
    });
  });
});
