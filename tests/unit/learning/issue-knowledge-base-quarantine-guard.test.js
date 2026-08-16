/**
 * SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-4/FR-5): recordOccurrence's quarantine guard at BOTH
 * write sites (existing-solution update, new-solution push), and getSolution's success-rate
 * floor. Mocked Supabase, following the established stub-chain pattern (see
 * tests/unit/rca-learning-ingestion-auto-reopen.test.js) — never a source-pin regex assertion.
 *
 * loadQuarantineManifest() is NOT mocked here — it reads the real repo
 * tests/quarantine-manifest.json, so 'scripts/lib/branch-resolver.test.js' (a real, currently
 * quarantined entry, confirmed by direct read) is used as the positive-case path throughout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let patternRow;
let updatePayloads;

function createSupabaseStub() {
  return {
    from(table) {
      expect(table).toBe('issue_patterns');
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: patternRow, error: null }),
          }),
        }),
        update: (payload) => {
          updatePayloads.push(payload);
          patternRow = { ...patternRow, ...payload };
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: patternRow, error: null }),
              }),
            }),
          };
        },
      };
    },
  };
}

vi.mock('../../../lib/supabase-client.js', () => ({
  lazyServiceClient: () => createSupabaseStub(),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { IssueKnowledgeBase } = await import('../../../lib/learning/issue-knowledge-base.js');

const QUARANTINED_PATH = 'scripts/lib/branch-resolver.test.js'; // real, currently quarantined
const NOT_QUARANTINED_PATH = 'tests/unit/definitely-not-quarantined-xyz.test.js';

describe('recordOccurrence — quarantine guard (FR-4)', () => {
  let kb;
  beforeEach(() => {
    kb = new IssueKnowledgeBase();
    updatePayloads = [];
  });

  it('TS-5 (new-solution write site): a quarantined target_test_paths entry refuses success even though was_successful=true', async () => {
    patternRow = { pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [] };
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a brand new fix',
      resolution_time_minutes: 5,
      was_successful: true,
      target_test_paths: [QUARANTINED_PATH],
    });
    const pushed = updatePayloads[0].proven_solutions[0];
    expect(pushed.times_successful).toBe(0);
    expect(pushed.success_rate).toBe(0);
    expect(pushed.quarantine_refusal_reason).toContain(QUARANTINED_PATH);
  });

  it('TS-6 (new-solution write site): a non-quarantined target_test_paths entry proceeds normally', async () => {
    patternRow = { pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [] };
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a brand new fix',
      resolution_time_minutes: 5,
      was_successful: true,
      target_test_paths: [NOT_QUARANTINED_PATH],
    });
    const pushed = updatePayloads[0].proven_solutions[0];
    expect(pushed.times_successful).toBe(1);
    expect(pushed.success_rate).toBe(100);
    expect(pushed.quarantine_refusal_reason).toBeUndefined();
  });

  it('existing-solution write site: a quarantined match refuses success without incrementing times_successful', async () => {
    patternRow = {
      pattern_id: 'PAT-X',
      occurrence_count: 3,
      proven_solutions: [
        { solution: 'reuse this fix', times_applied: 2, times_successful: 2, success_rate: 100 },
      ],
    };
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'reuse this fix',
      resolution_time_minutes: 5,
      was_successful: true,
      target_test_paths: [QUARANTINED_PATH],
    });
    const updated = updatePayloads[0].proven_solutions[0];
    expect(updated.times_applied).toBe(3);
    expect(updated.times_successful).toBe(2); // unchanged -- NOT incremented
    expect(updated.success_rate).toBeCloseTo((2 / 3) * 100, 5);
    expect(updated.quarantine_refusal_reason).toContain(QUARANTINED_PATH);
  });

  it('AC-3 back-compat: omitting target_test_paths entirely behaves exactly as before this SD', async () => {
    patternRow = { pattern_id: 'PAT-X', occurrence_count: 1, proven_solutions: [] };
    await kb.recordOccurrence({
      pattern_id: 'PAT-X',
      sd_id: 'SD-TEST',
      solution_applied: 'a brand new fix',
      resolution_time_minutes: 5,
      was_successful: true,
    });
    const pushed = updatePayloads[0].proven_solutions[0];
    expect(pushed.times_successful).toBe(1);
    expect(pushed.success_rate).toBe(100);
    expect(pushed.quarantine_refusal_reason).toBeUndefined();
  });
});

describe('getSolution — success-rate floor (FR-5)', () => {
  let kb;
  beforeEach(() => {
    kb = new IssueKnowledgeBase();
  });

  it('TS-8a: a single 0%-success entry never becomes recommended_solution', async () => {
    patternRow = {
      pattern_id: 'PAT-ZERO',
      category: 'testing',
      issue_summary: 'x',
      proven_solutions: [{ solution: 'disproven fix', success_rate: 0 }],
    };
    const result = await kb.getSolution('PAT-ZERO');
    expect(result.recommended_solution).toBeNull();
  });

  it('TS-8b (non-regression pin): a real 100%-success entry alongside a 0% one is still correctly recommended', async () => {
    patternRow = {
      pattern_id: 'PAT-AUTO-114c1f4a',
      category: 'testing',
      issue_summary: 'x',
      proven_solutions: [
        { solution: 'fake-timers in describe body', success_rate: 0 },
        { solution: 'thread an injected now through the full call chain', success_rate: 100 },
      ],
    };
    const result = await kb.getSolution('PAT-AUTO-114c1f4a');
    expect(result.recommended_solution.success_rate).toBe(100);
    expect(result.recommended_solution.solution).toBe('thread an injected now through the full call chain');
  });
});
