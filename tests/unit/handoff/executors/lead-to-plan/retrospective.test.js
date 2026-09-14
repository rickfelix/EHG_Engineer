/**
 * Unit Tests: lead-to-plan/retrospective.js
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-153 FR-2
 *
 * Covers: successful insert path, the clobber-guard skip-overwrite path, and the
 * interactive-vs-non-interactive generated_by branch (this executor takes
 * supabase as its LAST param, unlike its plan-to-exec/exec-to-plan siblings).
 */

import { describe, it, expect, vi } from 'vitest';

// SD-LEO-INFRA-BACKEND-WRITE-SAFETY-001: stub the retro-clobber-guard helper so
// the mocked Supabase client doesn't need to satisfy its own SELECT chain.
// Default: helper says "safe to write" — callers proceed to the QF-967 inline guard.
vi.mock('../../../../../scripts/modules/handoff/lib/retro-clobber-guard.js', () => ({
  isSafeToWriteRetro: vi.fn().mockResolvedValue({ safe: true, reason: 'no_retro', existingRetro: null }),
}));

// The interactive branch calls readline.createInterface().question(...). Mock it to answer
// synchronously so the 10s promptWithTimeout race never actually waits.
vi.mock('readline', () => {
  const createInterface = vi.fn(() => ({
    question: vi.fn((_query, cb) => cb('4')),
    close: vi.fn(),
  }));
  return { createInterface, default: { createInterface } };
});

import { createHandoffRetrospective } from '../../../../../scripts/modules/handoff/executors/lead-to-plan/retrospective.js';

const SD = {
  id: 'SD-TEST-RETRO-001',
  sd_key: 'SD-TEST-RETRO-001',
  sd_type: 'infrastructure',
  title: 'Test SD for lead-to-plan retrospective coverage',
  description: 'Verifies lead-to-plan retrospective creation paths',
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

describe('lead-to-plan createHandoffRetrospective', () => {
  it('creates a retrospective via insert when none exists (non-interactive)', async () => {
    const { supabase, getInserted } = buildMockSupabase({ existingRow: null });

    await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);

    const retro = getInserted();
    expect(retro).not.toBeNull();
    expect(retro.sd_id).toBe('SD-TEST-RETRO-001');
    expect(retro.retrospective_type).toBe('LEAD_TO_PLAN');
    expect(retro.generated_by).toBe('SUB_AGENT');
    expect(Array.isArray(retro.action_items)).toBe(true);
    expect(Array.isArray(retro.key_learnings)).toBe(true);
  });

  it('skips overwrite when an existing retrospective is manually curated', async () => {
    const existingRow = { id: 'retro-existing', quality_score: 90, metadata: {}, generated_by: 'MANUAL' };
    const { supabase, getInserted, getUpdated } = buildMockSupabase({ existingRow });

    await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);

    expect(getInserted()).toBeNull();
    expect(getUpdated()).toBeNull();
  });

  it('skips overwrite when the existing row has a higher quality_score', async () => {
    const existingRow = { id: 'retro-existing', quality_score: 95, metadata: {}, generated_by: 'SUB_AGENT' };
    const { supabase, getInserted, getUpdated } = buildMockSupabase({ existingRow });

    await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);

    expect(getInserted()).toBeNull();
    expect(getUpdated()).toBeNull();
  });

  it('updates (does not skip) when the existing row is auto-generated and lower quality', async () => {
    const existingRow = { id: 'retro-existing', quality_score: 10, metadata: {}, generated_by: 'SUB_AGENT' };
    const { supabase, getUpdated } = buildMockSupabase({ existingRow });

    await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);

    const retro = getUpdated();
    expect(retro).not.toBeNull();
    expect(retro.retrospective_type).toBe('LEAD_TO_PLAN');
  });

  it('uses generated_by SUB_AGENT when not interactive (no TTY)', async () => {
    const { supabase, getInserted } = buildMockSupabase({ existingRow: null });

    // Ensure a clean non-interactive baseline regardless of the actual test runner TTY.
    const origStdinTTY = process.stdin.isTTY;
    const origStdoutTTY = process.stdout.isTTY;
    process.stdin.isTTY = false;
    process.stdout.isTTY = false;
    try {
      await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);
    } finally {
      process.stdin.isTTY = origStdinTTY;
      process.stdout.isTTY = origStdoutTTY;
    }

    const retro = getInserted();
    expect(retro.generated_by).toBe('SUB_AGENT');
  });

  it('uses generated_by MANUAL and prompts via readline when interactive (TTY)', async () => {
    const { supabase, getInserted } = buildMockSupabase({ existingRow: null });

    const origStdinTTY = process.stdin.isTTY;
    const origStdoutTTY = process.stdout.isTTY;
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    try {
      await createHandoffRetrospective('SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);
    } finally {
      process.stdin.isTTY = origStdinTTY;
      process.stdout.isTTY = origStdoutTTY;
    }

    const retro = getInserted();
    expect(retro).not.toBeNull();
    expect(retro.generated_by).toBe('MANUAL');
  });
});
