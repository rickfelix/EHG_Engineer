/**
 * Tests for PAT-E2E-STATUS-001 fix: Display helpers E2E requirements
 *
 * Validates that displayExecPhaseRequirements skips E2E test requirements
 * for infrastructure SD types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { displayExecPhaseRequirements } from '../../scripts/modules/handoff/executors/plan-to-exec/display-helpers.js';

// Capture console.log output
let logOutput = [];
const originalLog = console.log;

function createMockSupabase(stories = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: stories,
            error: null
          })
        })
      })
    })
  };
}

describe('PAT-E2E-STATUS-001: Display Helpers E2E for Infra SDs', () => {
  beforeEach(() => {
    logOutput = [];
    console.log = (...args) => {
      logOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  const storiesWithoutE2E = [
    { id: '1', title: 'Story 1', status: 'in_progress', e2e_test_path: null, e2e_test_status: null },
    { id: '2', title: 'Story 2', status: 'in_progress', e2e_test_path: null, e2e_test_status: null }
  ];

  it('should show E2E requirements for feature SDs', async () => {
    const supabase = createMockSupabase(storiesWithoutE2E);

    await displayExecPhaseRequirements(supabase, 'test-sd', null, { sdType: 'feature' });

    const output = logOutput.join('\n');
    expect(output).toContain('Create E2E tests');
    expect(output).toContain('e2e_test_status');
    expect(output).not.toContain('NOT REQUIRED');
  });

  it('should skip E2E requirements for infrastructure SDs', async () => {
    const supabase = createMockSupabase(storiesWithoutE2E);

    await displayExecPhaseRequirements(supabase, 'test-sd', null, { sdType: 'infrastructure' });

    const output = logOutput.join('\n');
    expect(output).toContain('NOT REQUIRED');
    expect(output).not.toContain('Create E2E tests');
  });

  it('should skip E2E requirements for documentation SDs', async () => {
    const supabase = createMockSupabase(storiesWithoutE2E);

    await displayExecPhaseRequirements(supabase, 'test-sd', null, { sdType: 'documentation' });

    const output = logOutput.join('\n');
    expect(output).toContain('NOT REQUIRED');
  });

  it('should skip E2E requirements for uat SDs', async () => {
    const supabase = createMockSupabase(storiesWithoutE2E);

    await displayExecPhaseRequirements(supabase, 'test-sd', null, { sdType: 'uat' });

    const output = logOutput.join('\n');
    expect(output).toContain('NOT REQUIRED');
  });

  it('should show E2E requirements when no sdType provided (default behavior)', async () => {
    const supabase = createMockSupabase(storiesWithoutE2E);

    await displayExecPhaseRequirements(supabase, 'test-sd', null);

    const output = logOutput.join('\n');
    expect(output).toContain('Create E2E tests');
  });
});
