import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserStoryCoverageGate } from './user-story-coverage.js';

function makeSupabase(stories, { error = null } = {}) {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    then: (fn) => Promise.resolve({ data: stories, error }).then(fn),
  };
  return { from: vi.fn(() => chainable) };
}

function makeStory(overrides = {}) {
  return {
    id: 'US-id',
    story_key: 'US-001',
    title: 'Story title',
    status: 'completed',
    validation_status: 'validated',
    acceptance_criteria: ['AC-1'],
    created_by: 'plan',
    metadata: {},
    ...overrides,
  };
}

describe('USER_STORY_COVERAGE gate (SD-LEARN-FIX-ADDRESS-PAT-EXECTOPLAN-001)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('has correct gate metadata', () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    expect(gate.name).toBe('USER_STORY_COVERAGE');
    expect(gate.required).toBe(true);
    expect(gate.weight).toBe(1.0);
  });

  it('AC-4: documentation SD is SKIPPED via applicability matrix', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'documentation' } });
    expect(result.details?.skipped || result.skipped).toBeTruthy();
  });

  it('AC-4: refactor SD is SKIPPED via applicability matrix', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'refactor' } });
    expect(result.details?.skipped || result.skipped).toBeTruthy();
  });

  it('AC-4: orchestrator SD is SKIPPED via applicability matrix', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'orchestrator' } });
    expect(result.details?.skipped || result.skipped).toBeTruthy();
  });

  it('AC-4: infrastructure SD with zero stories passes at OPT level', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'infrastructure' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('REQ type (bugfix) with zero stories fails — score 0 but confidence-degraded to warning', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase([]));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'bugfix' } });
    expect(result.score).toBe(0);
    // buildSemanticResult degrades blocking to warning when confidence < 0.7;
    // zero-story confidence is 0.7 so passed==false surfaces (0.7 strict lt)
    expect(result.passed === false || (result.warnings && result.warnings.length > 0)).toBe(true);
  });

  it('happy path — bugfix SD with 3 covered stories passes', async () => {
    const stories = [
      makeStory({ story_key: 'US-001', status: 'completed', acceptance_criteria: ['AC-1', 'AC-2'] }),
      makeStory({ story_key: 'US-002', validation_status: 'in_progress', acceptance_criteria: ['AC-1'] }),
      makeStory({ story_key: 'US-003', status: 'testing', acceptance_criteria: ['AC-1'] }),
    ];
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'bugfix' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.covered).toBe(3);
    expect(result.details.total).toBe(3);
  });

  it('FR-4: remediation enumerates ALL uncovered story_keys (not truncated)', async () => {
    // 7 stories, 5 uncovered — old behavior truncated to 3 in remediation
    const stories = [
      makeStory({ story_key: 'US-001', status: 'completed', acceptance_criteria: ['AC-1'] }),
      makeStory({ story_key: 'US-002', status: 'completed', acceptance_criteria: ['AC-1'] }),
      makeStory({ story_key: 'US-003', status: 'draft', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-004', status: 'draft', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-005', status: 'draft', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-006', status: 'draft', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-007', status: 'draft', acceptance_criteria: [] }),
    ];
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'bugfix' } });
    expect(result.passed).toBe(false);
    // All 5 uncovered keys must appear in remediation
    ['US-003', 'US-004', 'US-005', 'US-006', 'US-007'].forEach(key => {
      expect(result.remediation).toContain(key);
    });
  });

  it('FR-4: details.uncovered is full list (not capped at 10)', async () => {
    const stories = Array.from({ length: 15 }, (_, i) =>
      makeStory({ story_key: `US-${String(i + 1).padStart(3, '0')}`, status: 'draft', acceptance_criteria: [] })
    );
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.details.uncovered).toHaveLength(15);
  });

  it('FR-4: details.uncoveredByReason breaks down missing AC vs status', async () => {
    const stories = [
      makeStory({ story_key: 'US-AC-MISSING', status: 'completed', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-STATUS-BAD', status: 'draft', acceptance_criteria: ['AC-1'] }),
      makeStory({ story_key: 'US-BOTH', status: 'draft', acceptance_criteria: [] }),
    ];
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.details.uncoveredByReason.no_acceptance_criteria).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.details.uncoveredByReason).some(k => k.startsWith('status_blocks_coverage'))).toBe(true);
  });

  it('issues[] enumerates story_keys (not just count)', async () => {
    const stories = [
      makeStory({ story_key: 'US-FAIL-A', status: 'draft', acceptance_criteria: [] }),
      makeStory({ story_key: 'US-FAIL-B', status: 'draft', acceptance_criteria: [] }),
    ];
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.issues[0]).toContain('US-FAIL-A');
    expect(result.issues[0]).toContain('US-FAIL-B');
  });

  it('auto-generated stories are excluded from denominator', async () => {
    const stories = [
      makeStory({ story_key: 'US-REAL', status: 'completed', acceptance_criteria: ['AC-1'] }),
      makeStory({ story_key: 'US-AUTO', status: 'draft', acceptance_criteria: [], metadata: { auto_generated: true } }),
    ];
    const gate = createUserStoryCoverageGate(makeSupabase(stories));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.details.autoGenerated).toBe(1);
    expect(result.details.covered).toBe(1);
    expect(result.details.total).toBe(2);
  });

  it('handles supabase error gracefully (returns warning, not crash)', async () => {
    const gate = createUserStoryCoverageGate(makeSupabase(null, { error: { message: 'timeout' } }));
    const result = await gate.validator({ sd: { id: 'sd-id', sd_type: 'feature' } });
    expect(result.passed).toBe(true);
    expect(result.warnings?.length || 0).toBeGreaterThan(0);
  });

  it('passes when ctx lacks supabase or sd (resilient fallback)', async () => {
    const gate = createUserStoryCoverageGate(null);
    const result = await gate.validator({ sd: { sd_type: 'feature' } });
    expect(result.passed).toBe(true);
  });
});
