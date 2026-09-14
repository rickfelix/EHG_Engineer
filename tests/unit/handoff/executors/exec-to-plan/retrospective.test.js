/**
 * Unit Tests: exec-to-plan/retrospective.js
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-153 FR-2
 *
 * Covers: successful insert path, the clobber-guard skip-overwrite path, and the
 * getGitContext error path (execSync throws, caught and suppressed internally).
 */

import { describe, it, expect, vi } from 'vitest';

// SD-LEO-INFRA-BACKEND-WRITE-SAFETY-001: stub the retro-clobber-guard helper so
// the mocked Supabase client doesn't need to satisfy its own SELECT chain.
// Default: helper says "safe to write" — callers proceed to the QF-967 inline guard.
vi.mock('../../../../../scripts/modules/handoff/lib/retro-clobber-guard.js', () => ({
  isSafeToWriteRetro: vi.fn().mockResolvedValue({ safe: true, reason: 'no_retro', existingRetro: null }),
}));

// getGitContext() shells out via execSync for `git diff` / `git log`. Mock it so tests don't
// depend on real repo state, and so we can force the internal try/catch error path on demand.
const execSyncMock = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

// getGitContext() also calls getMainRef() before shelling out — stub it to a fixed ref so the
// execSync mock above is the only thing driving file/commit content.
vi.mock('../../../../../scripts/modules/handoff/shared-git-context.js', () => ({
  getMainRef: vi.fn().mockReturnValue({ ref: 'origin/main' }),
}));

import { createExecToPlanRetrospective } from '../../../../../scripts/modules/handoff/executors/exec-to-plan/retrospective.js';

const SD = {
  id: 'SD-TEST-RETRO-001',
  sd_key: 'SD-TEST-RETRO-001',
  sd_type: 'infrastructure',
  title: 'Test SD for exec-to-plan retrospective coverage',
  description: 'Verifies exec-to-plan retrospective creation paths',
  strategic_objectives: ['Add missing test coverage for retrospective builders'],
};

const HANDOFF_RESULT = { success: true, qualityScore: 80 };

/**
 * Build a mock Supabase client that captures insert/update payloads for the
 * 'retrospectives' table and returns `existingRow` (or null) from the
 * existing-row clobber-guard lookup.
 */
function buildMockSupabase({ existingRow = null } = {}) {
  let inserted = null;
  let updated = null;

  const supabase = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'issue_patterns') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'retrospectives') {
        return {
          // Existing-row check: .select('id, quality_score, metadata, generated_by')
          //   .eq().eq().order().limit().maybeSingle()
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((data) => {
            inserted = data;
            return {
              select: vi.fn().mockResolvedValue({ data: [{ id: 'retro-001', ...data }], error: null }),
            };
          }),
          update: vi.fn().mockImplementation((data) => {
            updated = data;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: existingRow?.id || 'retro-001', ...data }], error: null }),
              }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }),
      };
    }),
  };

  return { supabase, getInserted: () => inserted, getUpdated: () => updated };
}

describe('exec-to-plan createExecToPlanRetrospective', () => {
  it('creates a retrospective via insert when none exists', async () => {
    execSyncMock.mockReturnValue('');
    const { supabase, getInserted } = buildMockSupabase({ existingRow: null });

    await createExecToPlanRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, {});

    const retro = getInserted();
    expect(retro).not.toBeNull();
    expect(retro.sd_id).toBe('SD-TEST-RETRO-001');
    expect(retro.retrospective_type).toBe('EXEC_TO_PLAN');
    expect(retro.generated_by).toBe('SUB_AGENT');
    expect(Array.isArray(retro.action_items)).toBe(true);
    expect(Array.isArray(retro.key_learnings)).toBe(true);
  });

  it('skips overwrite when an existing retrospective is manually curated', async () => {
    execSyncMock.mockReturnValue('');
    const existingRow = { id: 'retro-existing', quality_score: 90, metadata: {}, generated_by: 'MANUAL' };
    const { supabase, getInserted, getUpdated } = buildMockSupabase({ existingRow });

    await createExecToPlanRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, {});

    expect(getInserted()).toBeNull();
    expect(getUpdated()).toBeNull();
  });

  it('skips overwrite when the existing row has a higher quality_score', async () => {
    execSyncMock.mockReturnValue('');
    const existingRow = { id: 'retro-existing', quality_score: 95, metadata: {}, generated_by: 'SUB_AGENT' };
    const { supabase, getInserted, getUpdated } = buildMockSupabase({ existingRow });

    await createExecToPlanRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, {});

    expect(getInserted()).toBeNull();
    expect(getUpdated()).toBeNull();
  });

  it('updates (does not skip) when the existing row is auto-generated and lower quality', async () => {
    execSyncMock.mockReturnValue('');
    const existingRow = { id: 'retro-existing', quality_score: 10, metadata: {}, generated_by: 'SUB_AGENT' };
    const { supabase, getUpdated } = buildMockSupabase({ existingRow });

    await createExecToPlanRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, {});

    const retro = getUpdated();
    expect(retro).not.toBeNull();
    expect(retro.retrospective_type).toBe('EXEC_TO_PLAN');
  });

  it('continues gracefully when getGitContext hits an execSync error (git context unavailable)', async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('git: command failed');
    });
    const { supabase, getInserted } = buildMockSupabase({ existingRow: null });

    await createExecToPlanRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, {});

    // The git context failure is caught internally by getGitContext's own try/catch —
    // the retrospective must still be created successfully, with no git-derived learning.
    const retro = getInserted();
    expect(retro).not.toBeNull();
    expect(retro.retrospective_type).toBe('EXEC_TO_PLAN');
    const gitLearning = retro.key_learnings.find(l => l.learning.startsWith('Modified'));
    expect(gitLearning).toBeUndefined();
  });
});
