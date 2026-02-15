/**
 * Unit tests for Stage 14 - Technical Architecture template
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario: Stage 14 validation enforces all 5 required layers
 * (presentation, api, business_logic, data, infrastructure) with components and integration points.
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
      expect(stage14.version).toBe('3.0.0');
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
        security: { authStrategy: null, dataClassification: null, complianceRequirements: [] },
        dataEntities: [],
        integration_points: [],
        constraints: [],
        layer_count: 0,
        total_components: 0,
        all_layers_defined: false,
        entity_count: 0,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage14.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage14.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(REQUIRED_LAYERS).toEqual(['presentation', 'api', 'business_logic', 'data', 'infrastructure']);
      expect(MIN_INTEGRATION_POINTS).toBe(1);
    });
  });

  describe('validate() - Architecture summary', () => {
    const validLayers = {
      presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
      business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };

    const validSecurity = { authStrategy: 'JWT', dataClassification: 'internal', complianceRequirements: [] };
    const validEntities = [{ name: 'User', description: 'App user entity', relationships: ['Order'] }];
    const validIntegration = [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }];

    it('should pass for valid architecture_summary', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for architecture_summary below minimum length', () => {
      const invalidData = {
        architecture_summary: 'Short summary',
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture_summary'))).toBe(true);
    });

    it('should fail for missing architecture_summary', () => {
      const invalidData = {
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
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
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers is required'))).toBe(true);
    });

    it('should fail for missing presentation layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'api', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.presentation is required'))).toBe(true);
    });

    it('should fail for missing api layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.api is required'))).toBe(true);
    });

    it('should fail for missing data layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.data is required'))).toBe(true);
    });

    it('should fail for missing infrastructure layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.infrastructure is required'))).toBe(true);
    });
  });

  describe('validate() - Layer properties', () => {
    it('should fail for layer missing technology', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.presentation.technology'))).toBe(true);
    });

    it('should fail for layer missing rationale', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'] },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.api.rationale'))).toBe(true);
    });

    it('should fail for layer with empty components array', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: [], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'api', target_layer: 'data', protocol: 'SQL' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.presentation.components'))).toBe(true);
    });

    it('should fail for layer missing components', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('layers.data.components'))).toBe(true);
    });
  });

  describe('validate() - Integration points', () => {
    const validLayers = {
      presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
      business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };
    const validSecurity = { authStrategy: 'JWT', dataClassification: 'internal' };
    const validEntities = [{ name: 'User', description: 'Entity' }];

    it('should fail for empty integration_points array', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
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
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: [{ source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].name'))).toBe(true);
    });

    it('should fail for integration point missing source_layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: [{ name: 'API Call', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].source_layer'))).toBe(true);
    });

    it('should fail for integration point missing target_layer', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: [{ name: 'API Call', source_layer: 'presentation', protocol: 'HTTP' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].target_layer'))).toBe(true);
    });

    it('should fail for integration point missing protocol', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api' }],
      };
      const result = stage14.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integration_points[0].protocol'))).toBe(true);
    });
  });

  describe('validate() - Constraints (optional)', () => {
    const validLayers = {
      presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
      api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
      business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
      data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
      infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
    };
    const validSecurity = { authStrategy: 'JWT', dataClassification: 'internal' };
    const validEntities = [{ name: 'User', description: 'Entity' }];
    const validIntegration = [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }];

    it('should pass when constraints are omitted', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when constraints are empty array', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
        constraints: [],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when constraints have valid items', () => {
      const validData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
        constraints: [{ name: 'C1', description: 'Constraint 1' }],
      };
      const result = stage14.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for constraint missing name', () => {
      const invalidData = {
        architecture_summary: 'A'.repeat(20),
        layers: validLayers,
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
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
        security: validSecurity,
        dataEntities: validEntities,
        integration_points: validIntegration,
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
          presentation: { technology: 'React', components: ['UI', 'Router'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST', 'Auth'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        dataEntities: [],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.layer_count).toBe(5);
    });

    it('should calculate total_components correctly', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI', 'Router', 'State'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST', 'Auth'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2', 'S3'], rationale: 'Scalable' },
        },
        dataEntities: [],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.total_components).toBe(9);
    });

    it('should set all_layers_defined to true when all 5 layers present', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        dataEntities: [],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.all_layers_defined).toBe(true);
    });

    it('should set all_layers_defined to false when layers missing', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
        },
        dataEntities: [],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const result = stage14.computeDerived(data);
      expect(result.all_layers_defined).toBe(false);
    });

    it('should handle empty layers object', () => {
      const data = {
        architecture_summary: 'A'.repeat(20),
        layers: {},
        dataEntities: [],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
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
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          api: { technology: 'Express', components: ['REST'], rationale: 'Lightweight' },
          business_logic: { technology: 'Node.js', components: ['Services'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infrastructure: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        security: { authStrategy: 'JWT', dataClassification: 'internal' },
        dataEntities: [{ name: 'User', description: 'Entity' }],
        integration_points: [{ name: 'API Call', source_layer: 'presentation', target_layer: 'api', protocol: 'HTTP' }],
      };
      const validation = stage14.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage14.computeDerived(data);
      expect(computed.all_layers_defined).toBe(true);
      expect(computed.layer_count).toBe(5);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        architecture_summary: 'Short',
        layers: {
          presentation: { technology: 'React', components: ['UI'], rationale: 'Modern' },
        },
        dataEntities: [],
        integration_points: [],
      };
      const computed = stage14.computeDerived(data);
      expect(computed.layer_count).toBe(1);
      expect(computed.all_layers_defined).toBe(false);
    });
  });
});
