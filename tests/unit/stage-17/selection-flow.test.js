import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  submitPass1Selection,
  submitPass2Selection,
  isDesignPassComplete,
  SelectionError,
} from '../../../lib/eva/stage-17/selection-flow.js';

const mockGenerateRefinedVariants = vi.fn().mockResolvedValue(['ref-1', 'ref-2', 'ref-3', 'ref-4']);

vi.mock('../../../lib/eva/stage-17/refinement.js', () => ({
  generateRefinedVariants: (...args) => mockGenerateRefinedVariants(...args),
}));

vi.mock('../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn().mockResolvedValue({
    colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' },
  }),
}));

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('approved-artifact-id'),
}));

import { writeArtifact } from '../../../lib/eva/artifact-persistence-service.js';

// Fully chainable + thenable Supabase mock. The query builder accumulates
// arbitrary .eq()/.in()/.contains()/.limit() calls (the old bespoke mock only
// nested a few levels deep → "...eq().eq().eq().eq is not a function" and
// "...eq().eq().eq().limit is not a function"). Distinct queries are served by
// their terminal call:
//   .single()      → the source/archetype artifact (fetchArtifactById)
//   .maybeSingle() → the wireframe_screens artifact (drives expectedScreens)
//   .contains()… (awaited) → approved-mobile lookup → [{ content }]
//   select(.., {count:'exact'}) (awaited) → { count } (approved-artifact count)
//   plain awaited select chain → { data: [] } (e.g. the retire-existing lookup)
function createMockSupabase(opts = {}) {
  const {
    artifactContent = '<html>Test</html>',
    metadata = {},
    count = 0,
    // expectedScreens drives isDesignPassComplete's completion threshold. The
    // original suite treated 14 as the magic "all screens approved" count, so
    // keep 14 as the default screen count (preserves the test intent against
    // the refactored wireframe-screens-based completion check).
    screenCount = 14,
  } = opts;

  const archetypeRow = {
    id: 'archetype-id',
    content: artifactContent,
    artifact_data: {},
    metadata,
    title: 'Screen',
    artifact_type: 'stage_17_archetype',
  };
  const wireframeRow = {
    artifact_data: { screens: Array.from({ length: screenCount }, (_, i) => ({ id: `s${i}` })) },
  };

  const from = vi.fn((table) => {
    const builder = {
      _isCount: false,
      _hasContains: false,
      select(sel, selectOpts) {
        if (selectOpts?.count === 'exact') this._isCount = true;
        return builder;
      },
      eq(col, val) { this._lastEqVal = val; return builder; },
      in() { return builder; },
      contains() { this._hasContains = true; return builder; },
      order() { return builder; },
      update() { return builder; },
      limit() { return builder; },
      // Terminal: source/archetype artifact (echo id so variant-suffix logic works)
      single: vi.fn(() =>
        Promise.resolve({ data: { ...archetypeRow, id: builder._lastEqVal ?? archetypeRow.id }, error: null })),
      // Terminal: wireframe_screens artifact (expectedScreens source)
      maybeSingle: vi.fn(() => Promise.resolve({ data: wireframeRow, error: null })),
      // Awaited chain:
      //   count query → { count }
      //   approved-mobile lookup (contains) → [{ content }]
      //   otherwise → empty list
      then(resolve, reject) {
        let result;
        if (this._isCount) result = { count, error: null };
        else if (this._hasContains) result = { data: [{ content: artifactContent }], error: null };
        else result = { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  });

  return { from };
}

describe('selection-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateRefinedVariants.mockResolvedValue(['ref-1', 'ref-2', 'ref-3', 'ref-4']);
  });

  describe('submitPass1Selection()', () => {
    test('accepts 2 selections and returns 4 refined IDs', async () => {
      const result = await submitPass1Selection('v-1', 'home', ['id-1', 'id-2'], createMockSupabase());
      expect(result.refinedArtifactIds).toHaveLength(4);
    });

    test('throws SelectionError for 3 selections (max-2)', async () => {
      await expect(
        submitPass1Selection('v-1', 'home', ['a', 'b', 'c'], createMockSupabase())
      ).rejects.toThrow(SelectionError);
    });

    test('throws SelectionError for 1 selection', async () => {
      await expect(
        submitPass1Selection('v-1', 'home', ['a'], createMockSupabase())
      ).rejects.toThrow(SelectionError);
    });

    test('throws SelectionError for invalid platform', async () => {
      await expect(
        submitPass1Selection('v-1', 'home', ['a', 'b'], createMockSupabase(), { platform: 'tablet' })
      ).rejects.toThrow(SelectionError);
    });

    test('is idempotent — consistent output shape', async () => {
      const r1 = await submitPass1Selection('v-1', 'home', ['a', 'b'], createMockSupabase());
      const r2 = await submitPass1Selection('v-1', 'home', ['a', 'b'], createMockSupabase());
      expect(r1.refinedArtifactIds.length).toBe(r2.refinedArtifactIds.length);
    });

    test('passes mobile context for desktop platform', async () => {
      await submitPass1Selection('v-1', 'home', ['a', 'b'], createMockSupabase(), { platform: 'desktop' });
      const callArgs = mockGenerateRefinedVariants.mock.calls[0];
      expect(callArgs[5].mobileContextHtml).toBeTruthy();
    });
  });

  describe('submitPass2Selection()', () => {
    test('creates approved mobile artifact', async () => {
      const result = await submitPass2Selection('v-1', 'home', 'mobile', 'ref-1', createMockSupabase());
      expect(result.approvedArtifactId).toBe('approved-artifact-id');
      expect(writeArtifact.mock.calls[0][1].artifactType).toBe('stage_17_approved_mobile');
    });

    test('creates approved desktop artifact', async () => {
      await submitPass2Selection('v-1', 'home', 'desktop', 'ref-1', createMockSupabase());
      expect(writeArtifact.mock.calls[0][1].artifactType).toBe('stage_17_approved_desktop');
    });

    test('rejects invalid platform', async () => {
      await expect(
        submitPass2Selection('v-1', 'home', 'tablet', 'ref-1', createMockSupabase())
      ).rejects.toThrow(SelectionError);
    });
  });

  describe('isDesignPassComplete()', () => {
    test('returns true at 14 approved artifacts', async () => {
      expect(await isDesignPassComplete('v-1', createMockSupabase({ count: 14 }))).toBe(true);
    });

    test('returns false below 14', async () => {
      expect(await isDesignPassComplete('v-1', createMockSupabase({ count: 10 }))).toBe(false);
    });

    test('returns true above 14', async () => {
      expect(await isDesignPassComplete('v-1', createMockSupabase({ count: 20 }))).toBe(true);
    });
  });
});
