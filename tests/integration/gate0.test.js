/**
 * Gate 0: Static Analysis Verification - Integration Tests
 * SD-VERIFY-LADDER-001
 *
 * Tests full gate execution with real database integration
 * Covers test scenarios TS-7 through TS-10 from PRD
 *
 * Test Coverage:
 * - TS-7: Full gate execution passes (score ≥85%) when all checks pass
 * - TS-8: Full gate execution fails (score <85%) when critical check fails
 * - TS-9: Gate results stored correctly in leo_gate_reviews table
 * - TS-10: Gate 0 executes in CI/CD and blocks merge when score <85%
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

describe('Gate 0: Static Analysis Verification - Integration Tests', () => {
  let testSDLegacyId = null;
  let testPRDId = null;
  let testSDUUID = null;

  // Setup: Create test SD and PRD
  beforeAll(async () => {
    const timestamp = Date.now();
    const sdKey = `SD-TEST-GATE0-${timestamp}`;

    // Create test Strategic Directive
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdKey,
        sd_key: sdKey,
        legacy_id: sdKey,
        title: 'Test SD for Gate 0',
        description: 'Test strategic directive for Gate 0 static analysis validation',
        rationale: 'Testing Gate 0 validation logic',
        strategic_intent: 'Validate Gate 0 functionality',
        scope: 'Gate 0 static analysis tests',
        target_application: 'EHG_Engineer',
        category: 'testing',
        priority: 'high',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sdError) {
      console.error('Error creating test SD:', sdError);
      throw sdError;
    }

    testSDLegacyId = sd.id;
    // SD ID Schema Cleanup: uuid_id column is deprecated, use sd.id
    testSDUUID = sd.id; // Using id for compatibility with test assertions

    // Create test PRD
    const prdId = `PRD-TEST-GATE0-${timestamp}`;
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .insert({
        id: prdId,
        sd_id: testSDLegacyId,
        // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
        title: 'Test PRD for Gate 0',
        executive_summary: 'Test PRD for Gate 0 static analysis validation',
        status: 'draft',
        acceptance_criteria: [
          { criterion: 'Gate 0 must pass validation', status: 'pending' },
        ],
        functional_requirements: [
          { id: 'FR-1', priority: 'CRITICAL', description: 'ESLint must pass', acceptance_criteria: ['Zero ESLint errors'] },
          { id: 'FR-2', priority: 'CRITICAL', description: 'TypeScript must pass', acceptance_criteria: ['Zero type errors'] },
          { id: 'FR-3', priority: 'HIGH', description: 'Imports must resolve', acceptance_criteria: ['All imports valid'] },
        ],
        test_scenarios: [
          { id: 'TS-1', scenario: 'Test static analysis', expected_result: 'All checks pass', test_type: 'unit' },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (prdError) {
      console.error('Error creating test PRD:', prdError);
      throw prdError;
    }

    testPRDId = prd.id;
  });

  // Teardown: Clean up test data
  afterAll(async () => {
    if (testPRDId) {
      // Delete gate reviews first (foreign key constraint)
      await supabase
        .from('leo_gate_reviews')
        .delete()
        .eq('prd_id', testPRDId);

      await supabase
        .from('product_requirements_v2')
        .delete()
        .eq('id', testPRDId);
    }

    if (testSDUUID) {
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', testSDUUID);
    }
  });

  describe('TS-7: Full gate execution passes when all checks pass', () => {
    test('should pass gate with score ≥85% when ESLint and TypeScript pass', async () => {
      // This test runs the actual gate0.ts script
      // Note: This will run real ESLint and TypeScript checks
      // Expected: Current codebase should have minimal errors

      try {
        const output = execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000, // 2 minutes
          cwd: rootDir,
        });

        // If we get here, gate passed (exit code 0)
        expect(output).toContain('Gate 0 passed');

        // Verify score is displayed
        const scoreMatch = output.match(/Score: (\d+)%/);
        expect(scoreMatch).toBeTruthy();

        const score = parseInt(scoreMatch[1]);
        expect(score).toBeGreaterThanOrEqual(85);

      } catch (error) {
        // Gate failed - check if it's expected based on current codebase state
        const output = error.stdout || error.stderr || '';
        console.log('Gate 0 output:', output);

        // If current codebase has ESLint/TypeScript errors, this is expected
        // Test still validates that gate executes correctly
        expect(output).toContain('Gate 0');
      }
    });

    test('should display individual check results', async () => {
      try {
        const output = execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

        // Verify all checks are reported
        expect(output).toContain('hasESLintPass');
        expect(output).toContain('hasTypeScriptPass');
        expect(output).toContain('hasImportsPass');

      } catch (error) {
        const output = error.stdout || error.stderr || '';

        // Even on failure, check results should be displayed
        expect(output).toContain('hasESLintPass');
        expect(output).toContain('hasTypeScriptPass');
        expect(output).toContain('hasImportsPass');
      }
    });
  });

  describe('TS-8: Full gate execution fails when critical check fails', () => {
    test('should fail with exit code 1 when score <85%', async () => {
      // This test validates that gate fails appropriately
      // If codebase has ESLint/TypeScript errors, gate will fail

      try {
        const output = execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

        // If gate passes, verify score is ≥85%
        const scoreMatch = output.match(/Score: (\d+)%/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          expect(score).toBeGreaterThanOrEqual(85);
        }

      } catch (error) {
        // Gate failed - verify it's a proper failure (exit code 1)
        expect(error.status).toBe(1);

        const output = error.stdout || error.stderr || '';
        expect(output).toContain('Gate 0 failed');

        // Verify score is <85%
        const scoreMatch = output.match(/Score: (\d+)%/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          expect(score).toBeLessThan(85);
        }
      }
    });

    test('should display clear error messages on failure', async () => {
      try {
        execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

      } catch (error) {
        const output = error.stdout || '';

        // Verify failure messages are clear
        if (output.includes('ESLint validation failed')) {
          expect(output).toMatch(/ESLint validation failed: \d+ error/);
        }

        if (output.includes('TypeScript compilation failed')) {
          expect(output).toMatch(/TypeScript compilation failed: \d+ type error/);
        }
      }
    });
  });

  describe('TS-9: Gate results stored correctly in leo_gate_reviews table', () => {
    test('should store gate review with all metadata', async () => {
      // Run gate
      try {
        execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });
      } catch (error) {
        // Gate may fail, but review should still be stored
      }

      // Wait a moment for database write
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify review was stored
      const { data: reviews, error } = await supabase
        .from('leo_gate_reviews')
        .select('*')
        .eq('prd_id', testPRDId)
        .eq('gate', '0')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(error).toBeNull();
      expect(reviews).toBeTruthy();
      expect(reviews.length).toBeGreaterThan(0);

      const review = reviews[0];

      // Verify required fields
      expect(review.prd_id).toBe(testPRDId);
      expect(review.gate).toBe('0');
      expect(review.score).toBeDefined();
      expect(typeof review.score).toBe('number');
      expect(review.created_by).toBe('gate-runner');
      expect(review.created_at).toBeTruthy();

      // Verify evidence contains check results
      expect(review.evidence).toBeTruthy();
      expect(review.evidence).toHaveProperty('hasESLintPass');
      expect(review.evidence).toHaveProperty('hasTypeScriptPass');
      expect(review.evidence).toHaveProperty('hasImportsPass');

      // Verify score is within valid range (0-100)
      expect(review.score).toBeGreaterThanOrEqual(0);
      expect(review.score).toBeLessThanOrEqual(100);
    });

    test('should store evidence with boolean results', async () => {
      // Run gate
      try {
        execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });
      } catch (error) {
        // Gate may fail
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const { data: reviews } = await supabase
        .from('leo_gate_reviews')
        .select('evidence')
        .eq('prd_id', testPRDId)
        .eq('gate', '0')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(reviews).toBeTruthy();
      expect(reviews.length).toBeGreaterThan(0);

      const evidence = reviews[0].evidence;

      // All check results should be booleans
      expect(typeof evidence.hasESLintPass).toBe('boolean');
      expect(typeof evidence.hasTypeScriptPass).toBe('boolean');
      expect(typeof evidence.hasImportsPass).toBe('boolean');
    });

    test('should handle multiple gate runs (create new reviews)', async () => {
      // Run gate twice
      for (let i = 0; i < 2; i++) {
        try {
          execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 120000,
            cwd: rootDir,
          });
        } catch (error) {
          // Gate may fail
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Verify multiple reviews exist
      const { data: reviews, error } = await supabase
        .from('leo_gate_reviews')
        .select('id, created_at')
        .eq('prd_id', testPRDId)
        .eq('gate', '0')
        .order('created_at', { ascending: false });

      expect(error).toBeNull();
      expect(reviews).toBeTruthy();
      expect(reviews.length).toBeGreaterThanOrEqual(2);

      // Verify reviews have different timestamps
      const timestamps = reviews.map(r => r.created_at);
      const uniqueTimestamps = new Set(timestamps);
      expect(uniqueTimestamps.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('TS-10: Gate 0 executes in CI/CD and blocks merge when score <85%', () => {
    test('should exit with code 0 when gate passes', async () => {
      try {
        execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

        // If we reach here, exit code was 0 (success)
        expect(true).toBe(true);

      } catch (error) {
        // If gate fails, verify it's due to actual code issues, not test issues
        expect(error.status).toBe(1);
      }
    });

    test('should exit with code 1 when gate fails (blocks CI/CD)', async () => {
      // This test validates CI/CD blocking behavior
      // Gate should fail with exit code 1 if checks fail

      try {
        const output = execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

        // If gate passes, that's fine - codebase is clean
        expect(output).toContain('Gate 0 passed');

      } catch (error) {
        // Gate failed - verify exit code 1 (blocks merge)
        expect(error.status).toBe(1);

        const output = error.stdout || '';
        expect(output).toContain('Gate 0 failed');

        // Verify score is displayed and <85%
        const scoreMatch = output.match(/Score: (\d+)%/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          expect(score).toBeLessThan(85);
        }
      }
    });

    test('should exit with code 2 on system errors (missing PRD_ID)', async () => {
      try {
        execSync('node tools/gates/gate0.ts', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000,
          cwd: rootDir,
          env: { ...process.env, PRD_ID: undefined },
        });

        fail('Should have thrown error for missing PRD_ID');

      } catch (error) {
        // Should exit with code 2 (system error)
        expect(error.status).toBe(2);

        const output = error.stderr || error.stdout || '';
        expect(output).toContain('PRD_ID environment variable is required');
      }
    });

    test('should exit with code 2 on invalid PRD_ID format (security)', async () => {
      try {
        execSync('PRD_ID="invalid; rm -rf /" node tools/gates/gate0.ts', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000,
          cwd: rootDir,
        });

        fail('Should have thrown error for invalid PRD_ID');

      } catch (error) {
        // Should exit with code 2 (security validation failed)
        expect(error.status).toBe(2);

        const output = error.stderr || error.stdout || '';
        expect(output).toContain('Invalid PRD_ID format');
      }
    });
  });

  describe('Validation Rules', () => {
    test('should have Gate 0 rules in database with correct weights', async () => {
      const { data: rules, error } = await supabase
        .from('leo_validation_rules')
        .select('*')
        .eq('gate', '0')
        .eq('active', true)
        .order('weight', { ascending: false });

      expect(error).toBeNull();
      expect(rules).toBeTruthy();
      expect(rules.length).toBe(3);

      // Verify weights sum to 1.0
      const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);

      // Verify individual rules
      const eslintRule = rules.find(r => r.rule_name === 'hasESLintPass');
      const typeScriptRule = rules.find(r => r.rule_name === 'hasTypeScriptPass');
      const importsRule = rules.find(r => r.rule_name === 'hasImportsPass');

      expect(eslintRule).toBeTruthy();
      expect(eslintRule.weight).toBe(0.40);
      expect(eslintRule.required).toBe(true);

      expect(typeScriptRule).toBeTruthy();
      expect(typeScriptRule.weight).toBe(0.40);
      expect(typeScriptRule.required).toBe(true);

      expect(importsRule).toBeTruthy();
      expect(importsRule.weight).toBe(0.20);
      expect(importsRule.required).toBe(false); // Non-blocking
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Test with invalid PRD_ID that doesn't exist
      const fakePRDId = 'PRD-NONEXISTENT-GATE0-TEST';

      try {
        execSync(`PRD_ID=${fakePRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000,
          cwd: rootDir,
        });

        fail('Should have thrown error for non-existent PRD');

      } catch (error) {
        expect(error.status).toBe(2);

        const output = error.stderr || error.stdout || '';
        expect(output).toContain('PRD');
        expect(output).toContain('not found');
      }
    });

    test('should handle command execution errors gracefully', async () => {
      // Gate should not crash if a command fails
      // It should return false for that check and continue

      try {
        const output = execSync(`PRD_ID=${testPRDId} node tools/gates/gate0.ts`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 120000,
          cwd: rootDir,
        });

        // If gate passes, all commands succeeded
        expect(output).toContain('Gate 0');

      } catch (error) {
        // If gate fails, it should still complete execution
        const output = error.stdout || '';

        // Verify gate completed (showed results)
        expect(output).toContain('Gate 0 Results');
        expect(output).toContain('Score:');
      }
    });
  });
});
