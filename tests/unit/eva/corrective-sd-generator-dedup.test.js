/**
 * QF-20260503-858: dedup pre-insert check on corrective-sd-generator.
 *
 * Validates findDuplicateCorrective() catches drafts with the same source SD
 * and dimension set. Includes legacy-SD fallback (lookup via eva_vision_scores)
 * and new-format match (metadata.source_sd_id).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let findDuplicateCorrective;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  findDuplicateCorrective = mod.findDuplicateCorrective;
});

function mockSupabase({ drafts = [], scores = [] } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              filter: () => Promise.resolve({ data: drafts, error: null }),
            }),
          }),
        };
      }
      if (table === 'eva_vision_scores') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: scores, error: null }),
          }),
        };
      }
      return {};
    },
  };
}

describe('findDuplicateCorrective', () => {
  it('returns null when no drafts exist', async () => {
    const sb = mockSupabase({ drafts: [] });
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBeNull();
  });

  it('returns null when no draft matches dim set', async () => {
    const sb = mockSupabase({ drafts: [
      { sd_key: 'GAP-001', metadata: { source_sd_id: 'src-1', dimensions: ['V08'] } },
    ]});
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBeNull();
  });

  it('matches by metadata.source_sd_id (new-format SD)', async () => {
    const sb = mockSupabase({ drafts: [
      { sd_key: 'GAP-045', metadata: { source_sd_id: 'src-1', dimensions: ['A05'] } },
    ]});
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBe('GAP-045');
  });

  it('matches via eva_vision_scores fallback (legacy SD without source_sd_id)', async () => {
    const sb = mockSupabase({
      drafts: [
        { sd_key: 'GAP-049', metadata: { score_id: 'sc-1', dimensions: ['A05'] } },
      ],
      scores: [{ id: 'sc-1', sd_id: 'src-1' }],
    });
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBe('GAP-049');
  });

  it('matches dim sets order-insensitive (A04,A05 == A05,A04)', async () => {
    const sb = mockSupabase({ drafts: [
      { sd_key: 'GAP-050', metadata: { source_sd_id: 'src-1', dimensions: ['A04', 'A05'] } },
    ]});
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05', 'A04'])).toBe('GAP-050');
  });

  it('returns null when source SD differs even with matching dims', async () => {
    const sb = mockSupabase({ drafts: [
      { sd_key: 'GAP-100', metadata: { source_sd_id: 'src-2', dimensions: ['A05'] } },
    ]});
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBeNull();
  });

  it('returns null on null/empty inputs', async () => {
    const sb = mockSupabase();
    expect(await findDuplicateCorrective(sb, null, ['A05'])).toBeNull();
    expect(await findDuplicateCorrective(sb, 'src-1', [])).toBeNull();
    expect(await findDuplicateCorrective(sb, 'src-1', null)).toBeNull();
  });

  it('returns null on supabase error (fail-open — never silently lose legit emissions)', async () => {
    const sb = {
      from: () => { throw new Error('connection lost'); },
    };
    expect(await findDuplicateCorrective(sb, 'src-1', ['A05'])).toBeNull();
  });
});
