import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// SD-FDBK-FIX-STOP-STAMPING-GLOBAL-001: handoff retros must build pattern lines
// ONLY from SD-linked issue_patterns. The old getRecentActiveIssues() fallback
// stamped the global top-5 (ORDER BY updated_at LIMIT 5) into nearly every clean
// retro fleet-wide (~150+ of 256 improvement items across 60 retros in 7d).

// Keep the cross-type clobber guard out of the behavioral test (it queries the DB).
vi.mock('../../scripts/modules/handoff/lib/retro-clobber-guard.js', () => ({
  isSafeToWriteRetro: vi.fn(async () => ({ safe: true })),
}));

const EXECUTOR_FILES = [
  'scripts/modules/handoff/executors/exec-to-plan/retrospective.js',
  'scripts/modules/handoff/executors/lead-to-plan/retrospective.js',
  'scripts/modules/handoff/executors/plan-to-exec/retrospective.js',
];

describe('static guard: no global issue_patterns fallback in any handoff retro executor (TS-1)', () => {
  for (const file of EXECUTOR_FILES) {
    it(`${file} has no getRecentActiveIssues and no unscoped top-5 query`, () => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src).not.toMatch(/getRecentActiveIssues/);
      // The defect's signature: an issue_patterns query ordered by updated_at with
      // no SD scoping. getIssuesForSD (the legitimate query) filters by
      // first_seen_sd_id/last_seen_sd_id and never orders by updated_at.
      expect(src).not.toMatch(/issue_patterns'[\s\S]{0,300}order\('updated_at'/);
    });
  }
});

/**
 * Mock supabase that routes by table:
 * - issue_patterns: resolves the provided linked issues (and records the call
 *   shape so an unscoped re-introduction would surface as an extra query)
 * - retrospectives: no existing row; insert captures the retro payload
 */
function mockSupabase({ linkedIssues = [] } = {}) {
  const captured = { inserted: null, patternQueries: 0 };
  const makeBuilder = (table) => {
    const builder = {
      _table: table,
      select: vi.fn(() => builder),
      or: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn((row) => { captured.inserted = row; return builder; }),
      update: vi.fn(() => builder),
      upsert: vi.fn((row) => { captured.inserted = row; return builder; }),
      then: (resolveFn) => {
        if (table === 'issue_patterns') {
          captured.patternQueries += 1;
          return resolveFn({ data: linkedIssues, error: null });
        }
        return resolveFn({ data: captured.inserted ? [captured.inserted] : [], error: null });
      },
    };
    return builder;
  };
  return { client: { from: vi.fn((table) => makeBuilder(table)) }, captured };
}

const SD = {
  id: '00000000-0000-0000-0000-000000000001',
  sd_key: 'SD-TEST-RETRO-001',
  title: 'Test SD for retro stamping guard',
  sd_type: 'bugfix',
};

describe('behavioral: exec-to-plan retro content (TS-2, TS-3)', () => {
  it('clean SD (no linked issues) produces no [PAT- lines anywhere in the retro row', async () => {
    const { createExecToPlanRetrospective } = await import(
      '../../scripts/modules/handoff/executors/exec-to-plan/retrospective.js'
    );
    const { client, captured } = mockSupabase({ linkedIssues: [] });
    await createExecToPlanRetrospective(client, SD.sd_key, SD, { qualityScore: 90 }, {});
    expect(captured.inserted).toBeTruthy();
    const flat = JSON.stringify(captured.inserted);
    expect(flat).not.toMatch(/\[PAT-/);
    // exactly one issue_patterns query (the SD-scoped one) — the old fallback made two
    expect(captured.patternQueries).toBe(1);
  });

  it('SD with a linked issue still surfaces its own pattern line', async () => {
    const { createExecToPlanRetrospective } = await import(
      '../../scripts/modules/handoff/executors/exec-to-plan/retrospective.js'
    );
    const linked = [{
      pattern_id: 'PAT-TEST-LINKED-1',
      issue_summary: 'real linked issue for this SD',
      category: 'testing',
      severity: 'medium',
      proven_solutions: [],
      prevention_checklist: [],
    }];
    const { client, captured } = mockSupabase({ linkedIssues: linked });
    await createExecToPlanRetrospective(client, SD.sd_key, SD, { qualityScore: 90 }, {});
    expect(captured.inserted).toBeTruthy();
    const flat = JSON.stringify(captured.inserted);
    expect(flat).toMatch(/PAT-TEST-LINKED-1/);
  });
});
