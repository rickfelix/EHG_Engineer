import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query state used by the in-test supabase mock.
// Tests set this object to control what the mocked .single() returns.
let __sdRow = null;
let __depsResult = { data: [], error: null };
let __lastInQuery = null;

vi.mock('../supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: __sdRow, error: __sdRow ? null : new Error('not found') }) }),
        in: (_col, vals) => { __lastInQuery = vals; return Promise.resolve(__depsResult); },
      }),
    }),
  }),
}));

const { validateDependencyChain } = await import('./dependency-chain-validator.js');

beforeEach(() => {
  __sdRow = null;
  __depsResult = { data: [], error: null };
  __lastInQuery = null;
});

describe('validateDependencyChain — SD-FDBK-ENH-CHILD-PREFLIGHT-RETURNS-001 sister fix', () => {
  // Suppress console.log output noise during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});

  it('reads sd.dependencies JSONB column (the bug being fixed)', async () => {
    __sdRow = {
      id: 'sd-uuid', sd_key: 'SD-EVA-SUPPORT-001-C',
      dependency_chain: null,
      dependencies: [{ sd_id: 'SD-EVA-SUPPORT-001-B' }],
      parent_sd_id: 'parent-uuid', status: 'draft', progress: 0,
    };
    __depsResult = {
      data: [{ sd_key: 'SD-EVA-SUPPORT-001-B', title: 'Phase 2', status: 'draft', progress: 0 }],
      error: null,
    };
    const r = await validateDependencyChain('SD-EVA-SUPPORT-001-C');
    expect(__lastInQuery).toEqual(['SD-EVA-SUPPORT-001-B']);
    expect(r.canProceed).toBe(false);
    expect(r.blockedBy).toEqual(['SD-EVA-SUPPORT-001-B']);
  });

  it('returns canProceed=true when dependencies populated and dep is complete', async () => {
    __sdRow = {
      id: 'u', sd_key: 'SD-X', dependency_chain: null,
      dependencies: [{ sd_id: 'SD-DONE' }],
      parent_sd_id: 'p', status: 'draft', progress: 0,
    };
    __depsResult = {
      data: [{ sd_key: 'SD-DONE', title: 'Done', status: 'completed', progress: 100 }],
      error: null,
    };
    const r = await validateDependencyChain('SD-X');
    expect(r.canProceed).toBe(true);
    expect(r.blockedBy).toEqual([]);
  });

  it('returns canProceed=true for placeholder shape (Witness A)', async () => {
    __sdRow = {
      id: 'u', sd_key: 'SD-WITNESS-A', dependency_chain: null,
      dependencies: [{ type: 'internal', status: 'available', dependency: 'none' }],
      parent_sd_id: 'p', status: 'draft', progress: 0,
    };
    const r = await validateDependencyChain('SD-WITNESS-A');
    expect(r.canProceed).toBe(true);
    expect(r.message).toContain('No dependencies');
  });

  it('falls back to legacy dependency_chain when dependencies is null', async () => {
    __sdRow = {
      id: 'u', sd_key: 'SD-LEGACY', dependencies: null,
      dependency_chain: ['SD-LEGACY-DEP'],
      parent_sd_id: 'p', status: 'draft', progress: 0,
    };
    __depsResult = {
      data: [{ sd_key: 'SD-LEGACY-DEP', title: 'L', status: 'completed', progress: 100 }],
      error: null,
    };
    const r = await validateDependencyChain('SD-LEGACY');
    expect(__lastInQuery).toEqual(['SD-LEGACY-DEP']);
    expect(r.canProceed).toBe(true);
  });

  it('combines dependencies + dependency_chain (deduped)', async () => {
    __sdRow = {
      id: 'u', sd_key: 'SD-BOTH',
      dependencies: [{ sd_id: 'SD-A' }, { sd_id: 'SD-B' }],
      dependency_chain: ['SD-B', 'SD-C'],
      parent_sd_id: 'p', status: 'draft', progress: 0,
    };
    __depsResult = {
      data: [
        { sd_key: 'SD-A', title: 'A', status: 'completed', progress: 100 },
        { sd_key: 'SD-B', title: 'B', status: 'completed', progress: 100 },
        { sd_key: 'SD-C', title: 'C', status: 'completed', progress: 100 },
      ],
      error: null,
    };
    const r = await validateDependencyChain('SD-BOTH');
    expect(new Set(__lastInQuery)).toEqual(new Set(['SD-A', 'SD-B', 'SD-C']));
    expect(r.canProceed).toBe(true);
  });

  it('returns canProceed=true when both dependency sources empty', async () => {
    __sdRow = {
      id: 'u', sd_key: 'SD-NONE',
      dependencies: null, dependency_chain: null,
      parent_sd_id: 'p', status: 'draft', progress: 0,
    };
    const r = await validateDependencyChain('SD-NONE');
    expect(r.canProceed).toBe(true);
    expect(r.message).toContain('No dependencies');
  });
});
