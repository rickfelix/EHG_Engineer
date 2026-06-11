/**
 * Tests for Integration Discovery Module
 * Part of SD-LEO-INFRA-INTEGRATION-AWARE-PRD-001 (FR-1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isCodeProducingSdType,
  scanBarrelExports,
  scanConsumers,
  buildIntegrationContract,
  validateIntegrationContract,
  clearCache
} from '../../scripts/prd/integration-discovery.js';

describe('Integration Discovery', () => {
  afterEach(() => {
    clearCache();
  });

  describe('isCodeProducingSdType', () => {
    it('returns true for code-producing types', () => {
      expect(isCodeProducingSdType('feature')).toBe(true);
      expect(isCodeProducingSdType('bugfix')).toBe(true);
      expect(isCodeProducingSdType('refactor')).toBe(true);
      expect(isCodeProducingSdType('implementation')).toBe(true);
      expect(isCodeProducingSdType('performance')).toBe(true);
      expect(isCodeProducingSdType('enhancement')).toBe(true);
      expect(isCodeProducingSdType('security')).toBe(true);
      expect(isCodeProducingSdType('database')).toBe(true);
    });

    it('returns false for non-code-producing types', () => {
      expect(isCodeProducingSdType('documentation')).toBe(false);
      expect(isCodeProducingSdType('infrastructure')).toBe(false);
      expect(isCodeProducingSdType('orchestrator')).toBe(false);
      expect(isCodeProducingSdType('uat')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(isCodeProducingSdType(null)).toBe(false);
      expect(isCodeProducingSdType(undefined)).toBe(false);
      expect(isCodeProducingSdType('')).toBe(false);
    });
  });

  describe('scanBarrelExports', () => {
    it('finds barrel exports in the actual codebase', () => {
      const results = scanBarrelExports(process.cwd(), ['lib/eva/stage-zero']);
      // The stage-zero index.js has many re-exports
      expect(Array.isArray(results)).toBe(true);
      // Should find at least the index.js file
      const indexFile = results.find(r => r.file.includes('stage-zero/index'));
      if (indexFile) {
        expect(indexFile.exports.length).toBeGreaterThan(0);
        expect(indexFile.type).toBe('barrel_export');
      }
    });

    it('returns empty array for non-existent paths', () => {
      const results = scanBarrelExports(process.cwd(), ['nonexistent-dir']);
      expect(results).toEqual([]);
    });
  });

  describe('buildIntegrationContract', () => {
    it('builds a valid contract from scan results', () => {
      const scanResults = {
        barrelExports: [
          { file: 'lib/index.js', exports: ['foo', 'bar'], type: 'barrel_export' }
        ],
        routerRegistrations: [
          { file: 'lib/server.js', routes: ['GET /api/test'], type: 'router_registration' }
        ],
        registryPatterns: [
          { file: 'lib/registry.js', registrations: ['MyService'], type: 'registry_pattern' }
        ],
        validationSchemas: [
          { file: 'lib/validators.js', schemas: ['validateInput'], type: 'validation_schema' }
        ],
        consumers: [
          { file: 'scripts/main.js', importedFrom: 'lib/index.js', type: 'consumer' }
        ]
      };

      const sdData = { sd_key: 'SD-TEST-001', id: 'test-uuid' };
      const contract = buildIntegrationContract(scanResults, sdData);

      expect(contract.version).toBe('1.0.0');
      expect(contract.sd_id).toBe('SD-TEST-001');
      expect(contract.consumed_by).toHaveLength(1);
      expect(contract.barrel_exports).toHaveLength(1);
      expect(contract.contract_registrations).toHaveLength(2); // router + registry
      expect(contract.sibling_data_flow).toHaveLength(1);
      expect(contract.summary.total_barrel_exports).toBe(2);
      expect(contract.summary.total_routes).toBe(1);
      expect(contract.summary.total_registrations).toBe(1);
      expect(contract.summary.total_validators).toBe(1);
      expect(contract.summary.total_consumers).toBe(1);
    });

    it('handles empty scan results', () => {
      const contract = buildIntegrationContract({}, { sd_key: 'SD-EMPTY' });
      expect(contract.consumed_by).toEqual([]);
      expect(contract.barrel_exports).toEqual([]);
      expect(contract.contract_registrations).toEqual([]);
      expect(contract.sibling_data_flow).toEqual([]);
      expect(contract.summary.total_barrel_exports).toBe(0);
    });
  });

  describe('validateIntegrationContract', () => {
    it('validates a well-formed contract', () => {
      const contract = {
        consumed_by: [{ file: 'test.js' }],
        barrel_exports: [{ file: 'index.js', symbols: ['foo'] }],
        contract_registrations: [],
        sibling_data_flow: []
      };
      const result = validateIntegrationContract(contract);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects null contract', () => {
      const result = validateIntegrationContract(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Contract must be a non-null object');
    });

    it('rejects contract with missing required fields', () => {
      const result = validateIntegrationContract({ consumed_by: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects barrel_exports entries without file', () => {
      const contract = {
        consumed_by: [],
        barrel_exports: [{ symbols: ['foo'] }], // missing file
        contract_registrations: [],
        sibling_data_flow: []
      };
      const result = validateIntegrationContract(contract);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('barrel_exports'))).toBe(true);
    });
  });
});
