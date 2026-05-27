/**
 * SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child C
 *
 * Tests for assertVentureVisionReady refusal gate in lifecycle-sd-bridge.js.
 * Refusal must fire BEFORE any DB insert runs and must name the exact
 * /brainstorm unblock command for self-service recovery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertVentureVisionReady } from '../../../lib/eva/lifecycle-sd-bridge.js';

function makeVisionDocsClient({ canonical = null, draftSeed = null } = {}) {
  // Two sequential .from('eva_vision_documents') chains:
  //   1) canonical lookup: status='active', chairman_approved=true
  //   2) draft_seed lookup: status='draft_seed'
  // Each chain ends in .maybeSingle() returning {data, error}.
  let callCount = 0;
  const chain = (resolver) => {
    const c = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    };
    return c;
  };
  return {
    from: vi.fn((table) => {
      if (table !== 'eva_vision_documents') {
        throw new Error(`unexpected table: ${table}`);
      }
      callCount += 1;
      if (callCount === 1) return chain(() => ({ data: canonical, error: null }));
      return chain(() => ({ data: draftSeed, error: null }));
    }),
  };
}

describe('lifecycle-sd-bridge: assertVentureVisionReady refusal gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws VENTURE_ID_MISSING when ventureId is null', async () => {
    const supabase = makeVisionDocsClient();
    await expect(assertVentureVisionReady(supabase, null, 'CronGenius'))
      .rejects.toMatchObject({ code: 'VENTURE_ID_MISSING' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws VENTURE_L2_VISION_MISSING when no L2 doc exists (canonical and draft_seed both null)', async () => {
    const supabase = makeVisionDocsClient({ canonical: null, draftSeed: null });
    let thrown;
    try {
      await assertVentureVisionReady(supabase, 'v-uuid-1', 'CronGenius');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('VENTURE_L2_VISION_MISSING');
    expect(thrown.message).toContain('/brainstorm --venture CronGenius');
    expect(thrown.message).not.toContain('--seed-from');
  });

  it('throws VENTURE_L2_VISION_DRAFT_SEED when only archived stub exists', async () => {
    const supabase = makeVisionDocsClient({
      canonical: null,
      draftSeed: { vision_key: 'VISION-CRONGENIUS-API-L2-001-ARCHIVED-PRE-BRAINSTORM', status: 'draft_seed', updated_at: '2026-05-27' },
    });
    let thrown;
    try {
      await assertVentureVisionReady(supabase, 'v-uuid-2', 'CronGenius');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('VENTURE_L2_VISION_DRAFT_SEED');
    expect(thrown.message).toContain('/brainstorm --seed-from=draft_seed --venture CronGenius');
    expect(thrown.message).toContain('VISION-CRONGENIUS-API-L2-001-ARCHIVED-PRE-BRAINSTORM');
  });

  it('returns the canonical doc when active+chairman_approved L2 exists', async () => {
    const canonicalRow = {
      vision_key: 'VISION-CRONGENIUS-API-L2-001',
      version: 'v2',
      content: '...',
      updated_at: '2026-05-27',
    };
    const supabase = makeVisionDocsClient({ canonical: canonicalRow });
    const result = await assertVentureVisionReady(supabase, 'v-uuid-3', 'CronGenius');
    expect(result).toEqual(canonicalRow);
    // Should only do the canonical lookup (1 call), not fall through to draft_seed lookup
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('falls back to ventureId in the error message when ventureName is missing', async () => {
    const supabase = makeVisionDocsClient({ canonical: null, draftSeed: null });
    let thrown;
    try {
      await assertVentureVisionReady(supabase, 'v-uuid-4', null);
    } catch (e) {
      thrown = e;
    }
    expect(thrown.message).toContain('v-uuid-4');
    expect(thrown.message).toContain('/brainstorm --venture <name>');
  });
});
