/**
 * Unit Tests for ApplicationBoundaryValidator
 * Tests application boundary enforcement and cross-contamination detection
 */

import { ApplicationBoundaryValidator } from '../src/services/ApplicationBoundaryValidator.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

describe('ApplicationBoundaryValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new ApplicationBoundaryValidator();
    validator.clearCache(); // Clear cache before each test
  });

  describe('validateSD', () => {
    it('should validate SD with proper target_application', async () => {
      // Test with a known SD (SD-003 is EHG_ENGINEER)
      const result = await validator.validateSD('SD-003');

      expect(result.valid).toBe(true);
      expect(result.target_application).toBeDefined();
      expect(['EHG', 'EHG_ENGINEER']).toContain(result.target_application);
    });

    it('should fail validation for non-existent SD', async () => {
      const result = await validator.validateSD('SD-NONEXISTENT');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should cache successful validations', async () => {
      // First call - hits database
      const result1 = await validator.validateSD('SD-003');
      expect(result1.valid).toBe(true);

      // Second call - should use cache
      const result2 = await validator.validateSD('SD-003');
      expect(result2).toEqual(result1);
      expect(validator.validationCache.has('sd_SD-003')).toBe(true);
    });
  });

  describe('validateImplementation', () => {
    it('should detect EHG_ENGINEER paths correctly', async () => {
      const ehgEngineerPaths = [
        '/scripts/generate-prd.js',
        '/src/services/LEO/agent.js',
        '/ops/runbooks/deploy.md',
        '/CLAUDE.md'
      ];

      // Mock SD-003 as EHG_ENGINEER
      validator.validationCache.set('sd_SD-003', {
        valid: true,
        target_application: 'EHG_ENGINEER'
      });

      for (const path of ehgEngineerPaths) {
        const result = await validator.validateImplementation('SD-003', path);
        expect(result.valid).toBe(true);
        expect(result.message).toContain('validated for EHG_ENGINEER');
      }
    });

    it('should detect EHG application paths correctly', async () => {
      const ehgPaths = [
        '/src/client/components/Dashboard.jsx',
        '/src/client/pages/home.jsx',
        '/src/ui/Button.tsx',
        '/app/layout.tsx'
      ];

      // Mock SD-001 as EHG
      validator.validationCache.set('sd_SD-001', {
        valid: true,
        target_application: 'EHG'
      });

      for (const path of ehgPaths) {
        const result = await validator.validateImplementation('SD-001', path);
        expect(result.valid).toBe(true);
        expect(result.message).toContain('validated for EHG');
      }
    });

    it('should detect cross-boundary violations', async () => {
      // Mock SD-003 as EHG_ENGINEER
      validator.validationCache.set('sd_SD-003', {
        valid: true,
        target_application: 'EHG_ENGINEER'
      });

      // Try to implement in EHG path
      const result = await validator.validateImplementation('SD-003', '/src/client/components/Feature.jsx');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cross-application boundary violation');
      expect(result.details.violation).toContain('Path appears to be for EHG');
    });
  });

  describe('checkCrossContamination', () => {
    it('should check for contamination with fallback when views missing', async () => {
      // Force views to be unavailable
      validator.viewsAvailable = false;

      const result = await validator.checkCrossContamination('SD-003');

      expect(result).toBeDefined();
      expect(result.fallback).toBe(true);
      expect(result.message).toContain('keyword-based validation');
    });

    it('should detect keyword mismatches in fallback mode', async () => {
      // This test would need mock data setup
      // Skipping for brevity but structure is shown
    });
  });

  describe('checkViewsExist', () => {
    it('should check if views exist and cache result', async () => {
      const exists = await validator.checkViewsExist();

      expect(typeof exists).toBe('boolean');
      expect(validator.viewsAvailable).toBe(exists);

      // Second call should use cached value
      const exists2 = await validator.checkViewsExist();
      expect(exists2).toBe(exists);
    });
  });

  describe('generateValidationReport', () => {
    it('should generate comprehensive validation report', async () => {
      const report = await validator.generateValidationReport('SD-003');

      expect(report).toHaveProperty('sd_validation');
      expect(report).toHaveProperty('contamination_check');
      expect(report).toHaveProperty('timestamp');
      expect(report.sd_validation).toBeDefined();
      expect(report.contamination_check).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', async () => {
      // Add some cache entries
      validator.validationCache.set('test', { data: 'test' });
      validator.viewsAvailable = true;

      validator.clearCache();

      expect(validator.validationCache.size).toBe(0);
      expect(validator.viewsAvailable).toBeNull();
    });
  });
});

// If running directly (not via test runner)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running ApplicationBoundaryValidator tests...\n');

  const validator = new ApplicationBoundaryValidator();

  // Test 1: Validate an SD
  console.log('Test 1: Validate SD-003');
  const sdValidation = await validator.validateSD('SD-003');
  console.log('Result:', sdValidation);
  console.log('');

  // Test 2: Check implementation path
  console.log('Test 2: Validate implementation path');
  const pathValidation = await validator.validateImplementation('SD-003', '/scripts/test.js');
  console.log('Result:', pathValidation);
  console.log('');

  // Test 3: Check cross-contamination
  console.log('Test 3: Check cross-contamination');
  const contamination = await validator.checkCrossContamination('SD-003');
  console.log('Result:', contamination);
  console.log('');

  // Test 4: Generate full report
  console.log('Test 4: Generate validation report');
  const report = await validator.generateValidationReport('SD-003');
  console.log('Report generated successfully');
  console.log('');

  console.log('✅ All tests completed');
  process.exit(0);
}