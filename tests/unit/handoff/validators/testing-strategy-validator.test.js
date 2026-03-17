import { describe, it, expect } from 'vitest';
import { validateTestingStrategy } from '../../../../scripts/modules/handoff/validators/testing-strategy-validator.js';

describe('validateTestingStrategy', () => {
  it('returns score 0 when prd is missing', async () => {
    const result = await validateTestingStrategy({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
    expect(result.issues).toContain('Testing strategy should define unit_tests');
    expect(result.issues).toContain('Testing strategy should define e2e_tests');
    expect(result.details.hasUnitTests).toBe(false);
    expect(result.details.hasE2ETests).toBe(false);
  });

  it('returns score 0 when testing_strategy is empty object', async () => {
    const result = await validateTestingStrategy({ prd: { testing_strategy: {} } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns score 50 with only unit_tests defined', async () => {
    const result = await validateTestingStrategy({
      prd: { testing_strategy: { unit_tests: ['test 1'] } }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toContain('Testing strategy should define e2e_tests');
    expect(result.details.hasUnitTests).toBe(true);
    expect(result.details.hasE2ETests).toBe(false);
  });

  it('returns score 50 with only e2e_tests defined', async () => {
    const result = await validateTestingStrategy({
      prd: { testing_strategy: { e2e_tests: ['e2e test 1'] } }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.issues).toContain('Testing strategy should define unit_tests');
    expect(result.details.hasUnitTests).toBe(false);
    expect(result.details.hasE2ETests).toBe(true);
  });

  it('returns score 100 with both unit_tests and e2e_tests', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test validators'],
          e2e_tests: ['test user flow']
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.hasUnitTests).toBe(true);
    expect(result.details.hasE2ETests).toBe(true);
  });

  it('accepts unitTests (camelCase) as alternative field name', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unitTests: ['test 1'],
          e2e_tests: ['e2e 1']
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.hasUnitTests).toBe(true);
  });

  it('accepts e2eTests (camelCase) as alternative field name', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test 1'],
          e2eTests: ['e2e 1']
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.details.hasE2ETests).toBe(true);
  });

  it('accepts integration_tests as alternative for e2e_tests', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test 1'],
          integration_tests: ['integration 1']
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.hasE2ETests).toBe(true);
  });

  it('falls back to prd.testing when testing_strategy is missing', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing: {
          unit_tests: ['test 1'],
          e2e_tests: ['e2e 1']
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('warns when test_data is not defined', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test 1'],
          e2e_tests: ['e2e 1']
        }
      }
    });
    expect(result.warnings).toContain('Consider adding test_data specifications');
    expect(result.details.hasTestData).toBe(false);
  });

  it('does not warn when test_data is defined', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test 1'],
          e2e_tests: ['e2e 1'],
          test_data: { fixtures: ['user.json'] }
        }
      }
    });
    expect(result.warnings).not.toContain('Consider adding test_data specifications');
    expect(result.details.hasTestData).toBe(true);
  });

  it('accepts testData (camelCase) for test_data', async () => {
    const result = await validateTestingStrategy({
      prd: {
        testing_strategy: {
          unit_tests: ['test 1'],
          e2e_tests: ['e2e 1'],
          testData: { fixtures: ['user.json'] }
        }
      }
    });
    expect(result.details.hasTestData).toBe(true);
  });
});
