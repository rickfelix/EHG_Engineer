import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing source
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('../../../../../../lib/utils/sd-type-validation.js', () => ({
  getValidationRequirements: vi.fn(),
}));

vi.mock('../../../validation/sd-type-applicability-policy.js', () => ({
  getValidatorRequirement: vi.fn(() => 'REQUIRED'),
}));

import { execSync } from 'child_process';
import { getValidationRequirements } from '../../../../../../lib/utils/sd-type-validation.js';
import { getValidatorRequirement } from '../../../validation/sd-type-applicability-policy.js';
import { createMandatoryTestingValidationGate } from './mandatory-testing-validation.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

describe('MANDATORY_TESTING_VALIDATION gate', () => {
  let gate;
  let mockFrom;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Default: feature type that requires testing
    getValidationRequirements.mockReturnValue({
      sd_type: 'feature',
      requiresTesting: true,
      skipCodeValidation: false,
    });

    // Build a per-test Supabase mock so we can control query results
    const chainable = (resolveValue) => {
      const c = {
        select: () => c, eq: () => c, neq: () => c,
        order: () => c, limit: () => c, single: () => Promise.resolve(resolveValue),
        then: (fn) => Promise.resolve(resolveValue).then(fn),
      };
      return c;
    };

    mockFrom = vi.fn(() => ({
      select: () => chainable({ data: [], error: null }),
      insert: () => ({ select: () => Promise.resolve({ data: null, error: null }) }),
    }));

    gate = createMandatoryTestingValidationGate({ from: mockFrom, rpc: vi.fn() });
  });

  it('has correct gate metadata', () => {
    expect(gate.name).toBe('MANDATORY_TESTING_VALIDATION');
    expect(gate.required).toBe(true);
  });

  it('skips validation for documentation SD with no code changes', async () => {
    getValidationRequirements.mockReturnValue({
      sd_type: 'documentation',
      requiresTesting: false,
      skipCodeValidation: true,
    });
    // No code files in git diff
    execSync.mockReturnValue('');

    const ctx = { sd: createMockSD({ sd_type: 'documentation' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.tier).toBe('SKIP');
  });

  it('fails when TESTING not executed for feature SD', async () => {
    // No code files needed — feature type requires testing regardless
    execSync.mockReturnValue('');

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'uuid-123' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toMatch(/ERR_TESTING_REQUIRED/);
  });

  it('passes in advisory mode for infrastructure SD with code changes but no tests', async () => {
    getValidationRequirements.mockReturnValue({
      sd_type: 'infrastructure',
      requiresTesting: false,
      skipCodeValidation: false,
    });
    // Code files detected
    execSync.mockReturnValue('scripts/foo.js\nscripts/bar.ts\n');

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'uuid-456' }) };
    const result = await gate.validator(ctx);

    // Advisory mode — passes but with warnings
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.details.tier).toBe('ADVISORY');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('passes when TESTING executed with PASS verdict', async () => {
    const freshDate = new Date(Date.now() - 3600000).toISOString(); // 1h ago
    const testingRow = { id: 1, verdict: 'PASS', confidence: 95, created_at: freshDate };

    const chainable = (val) => {
      const c = {
        select: () => c, eq: () => c, order: () => c, limit: () => c,
        single: () => Promise.resolve(val),
        then: (fn) => Promise.resolve(val).then(fn),
      };
      return c;
    };
    mockFrom.mockReturnValue({
      select: () => chainable({ data: [testingRow], error: null }),
      insert: () => ({ select: () => Promise.resolve({ data: null, error: null }) }),
    });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'uuid-789' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.verdict).toBe('PASS');
  });

  it('fails when TESTING verdict is FAIL', async () => {
    const freshDate = new Date(Date.now() - 3600000).toISOString();
    const testingRow = { id: 1, verdict: 'FAIL', confidence: 80, created_at: freshDate };

    const chainable = (val) => {
      const c = {
        select: () => c, eq: () => c, order: () => c, limit: () => c,
        single: () => Promise.resolve(val),
        then: (fn) => Promise.resolve(val).then(fn),
      };
      return c;
    };
    mockFrom.mockReturnValue({
      select: () => chainable({ data: [testingRow], error: null }),
    });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'uuid-fail' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/TESTING verdict FAIL/);
  });
});
