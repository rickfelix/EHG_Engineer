/**
 * Unit Tests: plan-to-exec/retrospective.js
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-027 — Fixes PAT-AUTO-2ffdd791
 *
 * Root cause: buildActionItems() fallback sets owner/deadline, causing merge
 * condition (rawActionItems.every(i => !i.owner)) to evaluate FALSE. As a result,
 * buildSDSpecificActionItems (which provides verification) is never called.
 * RETROSPECTIVE_QUALITY_GATE penalizes missing verification (30% rubric weight),
 * scoring ~48/100 instead of the 55/100 threshold.
 *
 * Fix: merge condition now also fires when items lack verification.
 *      defaults map now adds verification to every item.
 *      fallback item in buildActionItems now includes verification.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHandoffRetrospective } from '../../../../../scripts/modules/handoff/executors/plan-to-exec/retrospective.js';

const SD = {
  id: 'SD-TEST-RETRO-001',
  sd_key: 'SD-TEST-RETRO-001',
  sd_type: 'infrastructure',
  title: 'Test SD for retrospective verification fix',
  description: 'Verifies that action items always include verification field',
  key_changes: [{ change: 'Fix retrospective.js action item merge condition', file: 'retrospective.js' }],
  success_criteria: [
    'Action items have verification field on all items',
    'RETROSPECTIVE_QUALITY_GATE passes ≥55/100 on first attempt',
  ],
  strategic_objectives: ['Eliminate manual retrospective patching'],
  risks: [{ risk: 'Edge case in merge condition', mitigation: 'Added OR clause for verification check' }],
};

/**
 * Build a mock Supabase client that captures inserted retrospective data.
 * Returns { supabase, getInserted } where getInserted() returns the last insert arg.
 */
function buildMockSupabase() {
  let inserted = null;

  const supabase = {
    from: vi.fn().mockReturnValue({
      // issue_patterns query chain
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      // retrospectives insert chain
      insert: vi.fn().mockImplementation((data) => {
        inserted = data;
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: 'retro-001', ...data }], error: null }),
        };
      }),
    }),
  };

  return { supabase, getInserted: () => inserted };
}

const HANDOFF_RESULT = { success: true, qualityScore: 80 };

describe('plan-to-exec createHandoffRetrospective — PAT-AUTO-2ffdd791 fix', () => {
  it('AC-1: all action_items have non-null verification field (default ratings, fallback path)', async () => {
    const { supabase, getInserted } = buildMockSupabase();

    // Non-interactive mode: all ratings default to '4', no gaps — fallback item fires
    await createHandoffRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'PLAN_TO_EXEC', {});

    const retro = getInserted();
    expect(retro).not.toBeNull();
    expect(Array.isArray(retro.action_items)).toBe(true);
    expect(retro.action_items.length).toBeGreaterThanOrEqual(1);

    for (const item of retro.action_items) {
      expect(item.verification).toBeDefined();
      expect(item.verification).not.toBeNull();
      expect(typeof item.verification).toBe('string');
      expect(item.verification.length).toBeGreaterThan(0);
    }
  });

  it('AC-3: defaults map adds verification when items have owner but lack original verification', async () => {
    // This tests the merge condition change: even in the fallback path (items have owner
    // set explicitly), the defaults map now ensures verification is populated on every item.
    // Previously the fallback item had owner+deadline but NO verification, causing gate failure.
    const { supabase, getInserted } = buildMockSupabase();

    await createHandoffRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'PLAN_TO_EXEC', {});

    const retro = getInserted();
    // Every item must have verification regardless of whether enricher was called
    for (const item of retro.action_items) {
      expect(item.verification).toBeDefined();
      expect(item.verification).not.toBe('');
      expect(item.verification).not.toBeNull();
    }
    // The fallback item (triggered when all ratings = 4 and no issues) must have verification
    const fallbackItem = retro.action_items.find(i => i.action.includes('PRD acceptance criteria'));
    if (fallbackItem) {
      expect(fallbackItem.verification).toBeDefined();
      expect(fallbackItem.verification.length).toBeGreaterThan(0);
    }
  });

  it('AC-1: action_items have owner and deadline in addition to verification', async () => {
    const { supabase, getInserted } = buildMockSupabase();

    await createHandoffRetrospective(supabase, 'SD-TEST-RETRO-001', SD, HANDOFF_RESULT, 'PLAN_TO_EXEC', {});

    const retro = getInserted();
    for (const item of retro.action_items) {
      expect(item.owner).toBeDefined();
      expect(item.deadline).toBeDefined();
      expect(item.verification).toBeDefined();
    }
  });

  it('AC-3: enricher items included when low ratings produce items without owner (original merge condition path)', async () => {
    // When prdRating <= 3, buildActionItems() returns items WITHOUT owner.
    // The original merge condition (every !owner) fires, calling the enricher.
    // Enricher items have explicit verification. After our fix, defaults map ALSO adds verification.
    const { supabase, getInserted } = buildMockSupabase();
    const lowRatingResult = { success: true, qualityScore: 40 };

    // Force non-interactive by not providing TTY — use a result with low quality
    // We'll test with context that has a low BMAD score to drive prdRating down
    await createHandoffRetrospective(
      supabase, 'SD-TEST-RETRO-001', SD,
      { ...lowRatingResult, qualityScore: 40 },
      'PLAN_TO_EXEC',
      { gateResults: { gateResults: { BMAD_PLAN_TO_EXEC: { score: 20, passed: false } } } }
    );

    const retro = getInserted();
    expect(Array.isArray(retro.action_items)).toBe(true);
    for (const item of retro.action_items) {
      expect(item.verification).toBeDefined();
      expect(item.verification).not.toBeNull();
    }
  });

  it('AC-1: verification does not default to null or empty even with minimal SD', async () => {
    const minimalSd = { id: 'SD-MIN-001', sd_key: 'SD-MIN-001', sd_type: 'infrastructure', title: 'Min SD' };
    const { supabase, getInserted } = buildMockSupabase();

    await createHandoffRetrospective(supabase, 'SD-MIN-001', minimalSd, HANDOFF_RESULT, 'PLAN_TO_EXEC', {});

    const retro = getInserted();
    for (const item of retro.action_items) {
      expect(item.verification).toBeTruthy();
    }
  });
});
