import { describe, it, expect, vi } from 'vitest';

// Mock the supabase client so importing child-sd-preflight does not hit a real DB.
// This is required because ChildSDPreflightValidator instantiates a client at module load.
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }) }),
}));

const { ChildSDPreflightValidator } = await import('../child-sd-preflight.js');

describe('extractDependencyIds — SD-FDBK-ENH-CHILD-PREFLIGHT-RETURNS-001', () => {
  const v = new ChildSDPreflightValidator();

  // === New: sd.dependencies JSONB column (the bug being fixed) ===

  it('reads sd.dependencies array of {sd_id} objects', () => {
    const sd = { dependencies: [{ sd_id: 'SD-EVA-SUPPORT-001-B' }] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-EVA-SUPPORT-001-B']);
  });

  it('reads sd.dependencies with multiple {sd_id} objects', () => {
    const sd = { dependencies: [{ sd_id: 'SD-X' }, { sd_id: 'SD-Y' }] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-X', 'SD-Y']);
  });

  it('reads sd.dependencies bare-string shape (38% of population per DATABASE evidence)', () => {
    const sd = { dependencies: ['SD-A', 'SD-B'] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-A', 'SD-B']);
  });

  it('returns [] for placeholder shape {type, status, dependency:none} — Witness A canonical case', () => {
    const sd = { dependencies: [{ type: 'internal', status: 'available', dependency: 'none' }] };
    expect(v.extractDependencyIds(sd)).toEqual([]);
  });

  it('returns [] for empty dependencies array', () => {
    expect(v.extractDependencyIds({ dependencies: [] })).toEqual([]);
  });

  // === Legacy: sd.dependency_chain (3 historical shapes — regression coverage) ===

  it('legacy Format 1: dependency_chain as array of SD-ID strings', () => {
    const sd = { dependency_chain: ['SD-LEGACY-1', 'SD-LEGACY-2'] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-LEGACY-1', 'SD-LEGACY-2']);
  });

  it('legacy Format 2: dependency_chain.children[].depends_on', () => {
    const sd = {
      id: 'SD-CHILD-X',
      dependency_chain: { children: [{ sd_id: 'SD-CHILD-X', depends_on: ['SD-PREREQ'] }] },
    };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-PREREQ']);
  });

  it('legacy Format 3: parent.dependency_chain.children[].depends_on (when sd has truthy non-matching chain)', () => {
    // Format 3 in the original code only triggers when sd.dependency_chain is truthy
    // but neither an array nor has its own children — a rare shape where the child
    // just inherits via the parent's chain. Test preserves original behavior.
    v.parent = { dependency_chain: { children: [{ sd_id: 'SD-CHILD-Y', depends_on: ['SD-PREREQ-2'] }] } };
    const sd = { id: 'SD-CHILD-Y', dependency_chain: { sentinel: true } };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-PREREQ-2']);
    v.parent = null;
  });

  // === Precedence: dependencies wins over dependency_chain when both populated ===

  it('precedence: sd.dependencies takes priority over dependency_chain', () => {
    const sd = {
      dependencies: [{ sd_id: 'SD-FROM-COLUMN' }],
      dependency_chain: ['SD-FROM-CHAIN'],
    };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-FROM-COLUMN']);
  });

  it('falls back to dependency_chain when sd.dependencies is null', () => {
    const sd = { dependencies: null, dependency_chain: ['SD-FALLBACK'] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-FALLBACK']);
  });

  it('falls back to dependency_chain when sd.dependencies parses to []', () => {
    const sd = { dependencies: [{ type: 'placeholder' }], dependency_chain: ['SD-FALLBACK-2'] };
    expect(v.extractDependencyIds(sd)).toEqual(['SD-FALLBACK-2']);
  });

  // === Edge cases ===

  it('returns [] when neither dependencies nor dependency_chain set', () => {
    expect(v.extractDependencyIds({})).toEqual([]);
  });
});
