import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing source
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { createLOCThresholdValidationGate } from './loc-threshold-validation.js';
import { createMockSD, createMockSupabase } from '../../../../../../tests/factories/validator-context-factory.js';

describe('LOC_THRESHOLD_VALIDATION gate', () => {
  let gate;
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    supabase = createMockSupabase();
    gate = createLOCThresholdValidationGate(supabase);
  });

  it('has correct gate metadata', () => {
    expect(gate.name).toBe('LOC_THRESHOLD_VALIDATION');
    expect(gate.required).toBe(false);
  });

  it('skips validation for feature type SDs', async () => {
    const ctx = { sd: createMockSD({ sd_type: 'feature' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped).toBe(true);
  });

  it('skips validation for bugfix type SDs', async () => {
    const ctx = { sd: createMockSD({ sd_type: 'bugfix' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.skipped).toBe(true);
  });

  it('passes when LOC is within threshold for infrastructure SD', async () => {
    execSync.mockReturnValueOnce('feature-branch\n');
    execSync.mockReturnValueOnce(' 5 files changed, 120 insertions(+), 30 deletions(-)\n');

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.loc_count).toBe(150);
    expect(result.details.exceeded).toBe(false);
  });

  it('passes with warning when LOC exceeds threshold for refactor SD', async () => {
    execSync.mockReturnValueOnce('feature-branch\n');
    execSync.mockReturnValueOnce(' 20 files changed, 400 insertions(+), 200 deletions(-)\n');

    const ctx = { sd: createMockSD({ sd_type: 'refactor' }) };
    const result = await gate.validator(ctx);

    // Advisory gate — still passes but with reduced score and warning
    expect(result.passed).toBe(true);
    expect(result.score).toBe(60);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/exceeds threshold/);
    expect(result.details.exceeded).toBe(true);
    expect(result.details.loc_count).toBe(600);
  });

  it('uses gitContext when available instead of execSync', async () => {
    const ctx = {
      sd: createMockSD({ sd_type: 'infrastructure' }),
      gitContext: {
        branch: 'my-branch',
        diffStat: ' 3 files changed, 50 insertions(+), 10 deletions(-)\n',
      },
    };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.loc_count).toBe(60);
    // Should NOT have called execSync for branch or diff
    expect(execSync).not.toHaveBeenCalled();
  });

  it('passes with warning when git fails', async () => {
    execSync.mockImplementation(() => { throw new Error('git not found'); });

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings[0]).toMatch(/Could not calculate LOC/);
  });
});
