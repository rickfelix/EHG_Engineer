/**
 * Unit tests for Stage 21 - Integration Testing template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 21 validation enforces integration test data
 * and tracks pass/fail status per integration point.
 *
 * @module tests/unit/eva/stage-templates/stage-21.test
 */

import { describe, it, expect } from 'vitest';
import stage21, { INTEGRATION_STATUSES, MIN_INTEGRATIONS } from '../../../../lib/eva/stage-templates/stage-21.js';

describe('stage-21.js - Integration Testing template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage21.id).toBe('stage-21');
      expect(stage21.slug).toBe('integration-testing');
      expect(stage21.title).toBe('Integration Testing');
      expect(stage21.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage21.schema).toBeDefined();
      expect(stage21.schema.integrations).toBeDefined();
      expect(stage21.schema.environment).toBeDefined();
      expect(stage21.schema.total_integrations).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage21.defaultData).toEqual({
        integrations: [],
        environment: null,
        total_integrations: 0,
        passing_integrations: 0,
        failing_integrations: [],
        pass_rate: 0,
        all_passing: false,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage21.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage21.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(INTEGRATION_STATUSES).toEqual(['pass', 'fail', 'skip', 'pending']);
      expect(MIN_INTEGRATIONS).toBe(1);
    });
  });

  describe('validate() - Environment', () => {
    const validIntegrations = [
      { name: 'API to DB', source: 'API', target: 'Database', status: 'pass' },
    ];

    it('should pass for valid environment', () => {
      const validData = {
        environment: 'staging',
        integrations: validIntegrations,
      };
      const result = stage21.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing environment', () => {
      const invalidData = {
        integrations: validIntegrations,
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('environment'))).toBe(true);
    });

    it('should fail for empty environment', () => {
      const invalidData = {
        environment: '',
        integrations: validIntegrations,
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('environment'))).toBe(true);
    });
  });

  describe('validate() - Integrations', () => {
    it('should pass for valid integrations', () => {
      const validData = {
        environment: 'staging',
        integrations: [
          { name: 'API to DB', source: 'API', target: 'Database', status: 'pass' },
          { name: 'Frontend to API', source: 'Frontend', target: 'API', status: 'fail', error_message: 'Timeout' },
        ],
      };
      const result = stage21.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing integrations array', () => {
      const invalidData = {
        environment: 'staging',
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations'))).toBe(true);
    });

    it('should fail for empty integrations array', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for integration missing name', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [{ source: 'API', target: 'Database', status: 'pass' }],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations[0].name'))).toBe(true);
    });

    it('should fail for integration missing source', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [{ name: 'API to DB', target: 'Database', status: 'pass' }],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations[0].source'))).toBe(true);
    });

    it('should fail for integration missing target', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [{ name: 'API to DB', source: 'API', status: 'pass' }],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations[0].target'))).toBe(true);
    });

    it('should fail for integration missing status', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [{ name: 'API to DB', source: 'API', target: 'Database' }],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations[0].status'))).toBe(true);
    });

    it('should fail for integration with invalid status', () => {
      const invalidData = {
        environment: 'staging',
        integrations: [{ name: 'API to DB', source: 'API', target: 'Database', status: 'invalid' }],
      };
      const result = stage21.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('integrations[0].status'))).toBe(true);
    });

    it('should pass with optional error_message', () => {
      const validData = {
        environment: 'staging',
        integrations: [
          { name: 'API to DB', source: 'API', target: 'Database', status: 'fail', error_message: 'Connection timeout' },
        ],
      };
      const result = stage21.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived() - Integration metrics', () => {
    it('should calculate total_integrations correctly', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'pass' },
          { name: 'I3', source: 'C', target: 'D', status: 'fail' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.total_integrations).toBe(3);
    });

    it('should calculate passing_integrations correctly', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'pass' },
          { name: 'I3', source: 'C', target: 'D', status: 'fail' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.passing_integrations).toBe(2);
    });

    it('should extract failing_integrations correctly', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'fail', error_message: 'Timeout' },
          { name: 'I3', source: 'C', target: 'D', status: 'fail', error_message: 'Auth error' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.failing_integrations).toHaveLength(2);
      expect(result.failing_integrations[0]).toEqual({
        name: 'I2',
        source: 'B',
        target: 'C',
        error_message: 'Timeout',
      });
      expect(result.failing_integrations[1]).toEqual({
        name: 'I3',
        source: 'C',
        target: 'D',
        error_message: 'Auth error',
      });
    });

    it('should handle missing error_message in failing_integrations', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'fail' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.failing_integrations).toHaveLength(1);
      expect(result.failing_integrations[0].error_message).toBeNull();
    });

    it('should calculate pass_rate correctly', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'pass' },
          { name: 'I3', source: 'C', target: 'D', status: 'fail' },
          { name: 'I4', source: 'D', target: 'E', status: 'skip' },
          { name: 'I5', source: 'E', target: 'F', status: 'pending' },
        ],
      };
      const result = stage21.computeDerived(data);
      // 2 passing out of 5 = 40%
      expect(result.pass_rate).toBe(40);
    });

    it('should return 0 pass_rate for zero integrations', () => {
      const data = {
        environment: 'staging',
        integrations: [],
      };
      const result = stage21.computeDerived(data);
      expect(result.pass_rate).toBe(0);
    });

    it('should calculate pass_rate to 2 decimal places', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'fail' },
          { name: 'I3', source: 'C', target: 'D', status: 'fail' },
        ],
      };
      const result = stage21.computeDerived(data);
      // 1 passing out of 3 = 33.33%
      expect(result.pass_rate).toBe(33.33);
    });
  });

  describe('computeDerived() - All passing flag', () => {
    it('should set all_passing to true when all integrations pass', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'pass' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.all_passing).toBe(true);
    });

    it('should set all_passing to false when any integration fails', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'fail' },
        ],
      };
      const result = stage21.computeDerived(data);
      expect(result.all_passing).toBe(false);
    });

    it('should set all_passing to false for zero integrations', () => {
      const data = {
        environment: 'staging',
        integrations: [],
      };
      const result = stage21.computeDerived(data);
      expect(result.all_passing).toBe(false);
    });

    it('should ignore skip and pending statuses for all_passing', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'pass' },
          { name: 'I2', source: 'B', target: 'C', status: 'skip' },
          { name: 'I3', source: 'C', target: 'D', status: 'pending' },
        ],
      };
      const result = stage21.computeDerived(data);
      // No failures, so all_passing should be true
      expect(result.all_passing).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty integrations array in computeDerived', () => {
      const data = {
        environment: 'staging',
        integrations: [],
      };
      const result = stage21.computeDerived(data);
      expect(result.total_integrations).toBe(0);
      expect(result.passing_integrations).toBe(0);
      expect(result.failing_integrations).toEqual([]);
      expect(result.pass_rate).toBe(0);
      expect(result.all_passing).toBe(false);
    });

    it('should handle null data in validate', () => {
      const result = stage21.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage21.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'API to DB', source: 'API', target: 'Database', status: 'pass' },
          { name: 'Frontend to API', source: 'Frontend', target: 'API', status: 'pass' },
          { name: 'Service A to B', source: 'ServiceA', target: 'ServiceB', status: 'fail', error_message: 'Timeout' },
        ],
      };
      const validation = stage21.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage21.computeDerived(data);
      expect(computed.total_integrations).toBe(3);
      expect(computed.passing_integrations).toBe(2);
      expect(computed.failing_integrations).toHaveLength(1);
      expect(computed.pass_rate).toBe(66.67);
      expect(computed.all_passing).toBe(false);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        environment: 'staging',
        integrations: [
          { name: 'I1', source: 'A', target: 'B', status: 'invalid_status' },
        ],
      };
      const computed = stage21.computeDerived(data);
      expect(computed.total_integrations).toBe(1);
      expect(computed.passing_integrations).toBe(0);
    });
  });
});
