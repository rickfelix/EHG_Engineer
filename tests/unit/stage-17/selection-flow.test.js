import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  submitPass1Selection,
  submitPass2Selection,
  isDesignPassComplete,
  SelectionError,
} from '../../../lib/eva/stage-17/selection-flow.js';

const mockGenerateRefinedVariants = vi.fn().mockResolvedValue(['ref-1', 'ref-2', 'ref-3', 'ref-4']);

vi.mock('../../../lib/eva/stage-17/archetype-generator.js', () => ({
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

function createMockSupabase(opts = {}) {
  const { artifactContent = '<html>Test</html>', metadata = {}, count = 0 } = opts;
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockImplementation((sel, selectOpts) => {
        if (selectOpts?.count === 'exact') {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count, error: null }),
              }),
            }),
          };
        }
        return {
          eq: vi.fn().mockImplementation((col, val) => ({
            single: vi.fn().mockResolvedValue({
              data: { id: val, content: artifactContent, artifact_data: {}, metadata, title: 'Screen', artifact_type: 'stage_17_archetype' },
              error: null,
            }),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                contains: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [{ content: '<html>Mobile</html>' }], error: null }),
                }),
              }),
            }),
          })),
        };
      }),
    }),
  };
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
