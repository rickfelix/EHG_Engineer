/**
 * Function Validator Unit Tests
 * SD-DATABASE-VALIDATION-001: Phase 3 - Function Consistency
 *
 * Tests the FunctionValidator class for detecting inconsistencies
 * between related database functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionValidator, FUNCTION_GROUPS, getFunctionGroups } from '../../scripts/db-validate/function-validator.js';

// Mock function definitions for testing
const MOCK_FUNCTIONS = {
  consistent: {
    func1: {
      name: 'calculate_progress',
      definition: `
        CREATE OR REPLACE FUNCTION calculate_progress(sd_id_param varchar)
        RETURNS integer AS $$
        BEGIN
          SELECT * FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val;
          progress := progress + 20;
          progress := progress + 20;
          progress := progress + 30;
          progress := progress + 15;
          progress := progress + 15;
          RETURN progress;
        END;
        $$ LANGUAGE plpgsql;
      `
    },
    func2: {
      name: 'get_progress_breakdown',
      definition: `
        CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param varchar)
        RETURNS jsonb AS $$
        BEGIN
          SELECT * FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val;
          -- Returns same weights as calculate_progress
          RETURN jsonb_build_object('weights', ARRAY[20, 20, 30, 15, 15]);
        END;
        $$ LANGUAGE plpgsql;
      `
    }
  },
  inconsistent: {
    func1: {
      name: 'calculate_progress',
      definition: `
        CREATE OR REPLACE FUNCTION calculate_progress(sd_id_param varchar)
        RETURNS integer AS $$
        BEGIN
          -- Uses sd_uuid
          SELECT * FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val;
          RETURN 100;
        END;
        $$ LANGUAGE plpgsql;
      `
    },
    func2: {
      name: 'get_progress_v2',
      definition: `
        CREATE OR REPLACE FUNCTION get_progress_v2(sd_id_param varchar)
        RETURNS jsonb AS $$
        BEGIN
          -- Uses directive_id (INCONSISTENT!)
          SELECT * FROM product_requirements_v2 WHERE directive_id = sd_id_param;
          RETURN '{}';
        END;
        $$ LANGUAGE plpgsql;
      `
    }
  }
};

describe('FunctionValidator', () => {
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const validator = new FunctionValidator();
      expect(validator.project).toBe('engineer');
      expect(validator.verbose).toBe(false);
    });

    it('should accept custom options', () => {
      const validator = new FunctionValidator('ehg', { verbose: true });
      expect(validator.project).toBe('ehg');
      expect(validator.verbose).toBe(true);
    });
  });

  describe('extractTableReferences', () => {
    let validator;

    beforeEach(() => {
      validator = new FunctionValidator();
    });

    it('should extract table from FROM clause', () => {
      const definition = 'SELECT * FROM users WHERE id = 1;';
      const tables = validator.extractTableReferences(definition);
      expect(tables).toContain('users');
    });

    it('should extract table from JOIN clause', () => {
      const definition = 'SELECT * FROM users JOIN orders ON users.id = orders.user_id;';
      const tables = validator.extractTableReferences(definition);
      expect(tables).toContain('users');
      expect(tables).toContain('orders');
    });

    it('should extract table from INSERT INTO', () => {
      const definition = 'INSERT INTO audit_log (event) VALUES (\'test\');';
      const tables = validator.extractTableReferences(definition);
      expect(tables).toContain('audit_log');
    });

    it('should extract table from UPDATE', () => {
      const definition = 'UPDATE strategic_directives_v2 SET status = \'active\';';
      const tables = validator.extractTableReferences(definition);
      expect(tables).toContain('strategic_directives_v2');
    });

    it('should extract table from DELETE FROM', () => {
      const definition = 'DELETE FROM temp_data WHERE created_at < NOW();';
      const tables = validator.extractTableReferences(definition);
      expect(tables).toContain('temp_data');
    });

    it('should return empty array for empty definition', () => {
      const tables = validator.extractTableReferences('');
      expect(tables).toHaveLength(0);
    });

    it('should return empty array for null definition', () => {
      const tables = validator.extractTableReferences(null);
      expect(tables).toHaveLength(0);
    });

    it('should deduplicate table names', () => {
      const definition = 'SELECT * FROM users; SELECT * FROM users;';
      const tables = validator.extractTableReferences(definition);
      expect(tables.filter(t => t === 'users')).toHaveLength(1);
    });

    it('should sort table names alphabetically', () => {
      const definition = 'SELECT * FROM zebra JOIN alpha ON 1=1;';
      const tables = validator.extractTableReferences(definition);
      expect(tables[0]).toBe('alpha');
      expect(tables[1]).toBe('zebra');
    });
  });

  describe('extractPhaseWeights', () => {
    let validator;

    beforeEach(() => {
      validator = new FunctionValidator();
    });

    it('should extract weights from progress += patterns', () => {
      const definition = `
        progress := progress + 20;
        progress := progress + 30;
        progress := progress + 15;
      `;
      const weights = validator.extractPhaseWeights(definition);
      expect(Object.values(weights)).toContain(20);
      expect(Object.values(weights)).toContain(30);
      expect(Object.values(weights)).toContain(15);
    });

    it('should return empty object for empty definition', () => {
      const weights = validator.extractPhaseWeights('');
      expect(Object.keys(weights)).toHaveLength(0);
    });

    it('should return empty object for null definition', () => {
      const weights = validator.extractPhaseWeights(null);
      expect(Object.keys(weights)).toHaveLength(0);
    });
  });

  describe('checkTableReferenceConsistency', () => {
    let validator;

    beforeEach(() => {
      validator = new FunctionValidator();
    });

    it('should pass for consistent PRD column references', () => {
      const functions = [
        MOCK_FUNCTIONS.consistent.func1,
        MOCK_FUNCTIONS.consistent.func2
      ];

      const result = validator.checkTableReferenceConsistency(functions);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect inconsistent PRD column references', () => {
      const functions = [
        MOCK_FUNCTIONS.inconsistent.func1,
        MOCK_FUNCTIONS.inconsistent.func2
      ];

      const result = validator.checkTableReferenceConsistency(functions);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('directive_id'))).toBe(true);
    });
  });

  describe('checkPhaseWeightConsistency', () => {
    let validator;

    beforeEach(() => {
      validator = new FunctionValidator();
    });

    it('should pass for functions with weights summing to 100', () => {
      const functions = [{
        name: 'test_func',
        definition: `
          progress := progress + 20;
          progress := progress + 20;
          progress := progress + 30;
          progress := progress + 15;
          progress := progress + 15;
        `
      }];

      const result = validator.checkPhaseWeightConsistency(functions);
      // Should not have errors about sum (sum is 100)
      expect(result.warnings.every(w => !w.includes('expected 100'))).toBe(true);
    });
  });

  describe('FUNCTION_GROUPS', () => {
    it('should define progress function group', () => {
      expect(FUNCTION_GROUPS.progress).toBeDefined();
      expect(FUNCTION_GROUPS.progress.functions).toContain('calculate_sd_progress');
      expect(FUNCTION_GROUPS.progress.functions).toContain('get_progress_breakdown');
    });

    it('should define handoff function group', () => {
      expect(FUNCTION_GROUPS.handoff).toBeDefined();
      expect(FUNCTION_GROUPS.handoff.functions).toContain('accept_phase_handoff');
    });

    it('should define validation function group', () => {
      expect(FUNCTION_GROUPS.validation).toBeDefined();
      expect(FUNCTION_GROUPS.validation.functions).toContain('check_gates_before_exec');
    });

    it('should have consistency rules for each group', () => {
      for (const [name, group] of Object.entries(FUNCTION_GROUPS)) {
        expect(group.consistencyRules).toBeDefined();
        expect(group.consistencyRules.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getFunctionGroups', () => {
    it('should return FUNCTION_GROUPS object', () => {
      const groups = getFunctionGroups();
      expect(groups).toBe(FUNCTION_GROUPS);
    });

    it('should have all expected groups', () => {
      const groups = getFunctionGroups();
      expect(Object.keys(groups)).toContain('progress');
      expect(Object.keys(groups)).toContain('handoff');
      expect(Object.keys(groups)).toContain('validation');
    });
  });
});

describe('FunctionValidator Integration', () => {
  // These tests require database connection
  // Run only in CI or with database available

  describe('validateFunctionGroup (integration)', () => {
    it('should validate progress group against live database', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateFunctionGroup('progress');

        // Result should have expected structure
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(result).toHaveProperty('metadata');

        // Should find the functions
        expect(result.metadata.functionCount).toBeGreaterThan(0);
      } finally {
        await validator.disconnect();
      }
    });

    it('should validate handoff group against live database', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateFunctionGroup('handoff');

        expect(result).toHaveProperty('valid');
        expect(result.metadata.functionCount).toBeGreaterThan(0);
      } finally {
        await validator.disconnect();
      }
    });

    it('should return error for unknown group', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateFunctionGroup('nonexistent');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unknown function group: nonexistent');
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('validateAllGroups (integration)', () => {
    it('should validate all defined function groups', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const { valid, results } = await validator.validateAllGroups();

        // Should have results for all groups
        expect(Object.keys(results)).toContain('progress');
        expect(Object.keys(results)).toContain('handoff');
        expect(Object.keys(results)).toContain('validation');

        // Each result should have expected structure
        for (const result of Object.values(results)) {
          expect(result).toHaveProperty('valid');
          expect(result).toHaveProperty('errors');
          expect(result).toHaveProperty('warnings');
        }
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('analyzeFunction (integration)', () => {
    it('should analyze existing function', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const analysis = await validator.analyzeFunction('calculate_sd_progress');

        expect(analysis.name).toBe('calculate_sd_progress');
        expect(analysis).toHaveProperty('arguments');
        expect(analysis).toHaveProperty('returnType');
        expect(analysis).toHaveProperty('tables');
        expect(Array.isArray(analysis.tables)).toBe(true);
      } finally {
        await validator.disconnect();
      }
    });

    it('should return error for nonexistent function', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const analysis = await validator.analyzeFunction('this_function_does_not_exist');

        expect(analysis).toHaveProperty('error');
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('getFunction (integration)', () => {
    it('should retrieve function by name', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const func = await validator.getFunction('calculate_sd_progress');

        expect(func).not.toBeNull();
        expect(func.name).toBe('calculate_sd_progress');
        expect(func.definition).toBeDefined();
        expect(func.definition.length).toBeGreaterThan(0);
      } finally {
        await validator.disconnect();
      }
    });

    it('should return null for nonexistent function', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();
        const func = await validator.getFunction('nonexistent_func_xyz');

        expect(func).toBeNull();
      } finally {
        await validator.disconnect();
      }
    });

    it('should cache retrieved functions', async () => {
      const validator = new FunctionValidator('engineer');

      try {
        await validator.connect();

        // First call
        const func1 = await validator.getFunction('calculate_sd_progress');

        // Second call should use cache
        const func2 = await validator.getFunction('calculate_sd_progress');

        expect(func1).toBe(func2); // Same object reference from cache
      } finally {
        await validator.disconnect();
      }
    });
  });
});
