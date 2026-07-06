import { describe, test, expect, beforeEach, vi } from 'vitest';

// vi.hoisted: archetype-generator.js statically imports classifySurface from
// stage-15-wireframe-generator.js, which statically imports lib/llm/index.js —
// that eager transitive chain resolves before this file's own top-level
// consts would otherwise run, so a plain `const mockComplete = vi.fn()`
// referenced inside vi.mock's factory hits a TDZ error. vi.hoisted() runs
// before the mocked import graph resolves, avoiding it.
const { mockWriteArtifact, mockEnsureTokenManifestLocked, mockComplete } = vi.hoisted(() => ({
  mockWriteArtifact: vi.fn().mockResolvedValue('archetype-id'),
  mockEnsureTokenManifestLocked: vi.fn().mockResolvedValue({
    colors: ['#2563EB', '#06B6D4'],
    typeScale: { heading: 'Montserrat', body: 'Lato' },
  }),
  mockComplete: vi.fn().mockResolvedValue({
    content: '<!-- distinctive move: test --><html><body>Archetype</body></html>',
  }),
}));

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: (...args) => mockWriteArtifact(...args),
}));

vi.mock('../../../lib/eva/stage-17/token-manifest.js', () => ({
  ensureTokenManifestLocked: (...args) => mockEnsureTokenManifestLocked(...args),
}));

vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: vi.fn().mockReturnValue({ complete: mockComplete }),
}));

import {
  generateArchetypeVariants,
  generateArchetypesForAllScreens,
} from '../../../lib/eva/stage-17/archetype-generator.js';

function createMockSupabaseWithScreens(screens) {
  const from = vi.fn(() => {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: { artifact_data: { screens } }, error: null })),
    };
    return builder;
  });
  return { from };
}

describe('archetype-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTokenManifestLocked.mockResolvedValue({
      colors: ['#2563EB', '#06B6D4'],
      typeScale: { heading: 'Montserrat', body: 'Lato' },
    });
    mockComplete.mockResolvedValue({
      content: '<!-- distinctive move: test --><html><body>Archetype</body></html>',
    });
  });

  describe('generateArchetypeVariants()', () => {
    test('generates exactly 4 archetype variants written as stage_17_archetype', async () => {
      const ids = await generateArchetypeVariants('v-1', 'Landing Page', 'landing', {});
      expect(ids).toHaveLength(4);
      expect(mockComplete).toHaveBeenCalledTimes(4);
      for (const call of mockWriteArtifact.mock.calls) {
        expect(call[1].artifactType).toBe('stage_17_archetype');
        expect(call[1].metadata.screenId).toBe('landing');
      }
    });

    test('locks tokens before generating (FR-1 call site)', async () => {
      await generateArchetypeVariants('v-1', 'Dashboard', 'dashboard', {});
      expect(mockEnsureTokenManifestLocked).toHaveBeenCalledWith('v-1', {});
      expect(mockEnsureTokenManifestLocked.mock.invocationCallOrder[0])
        .toBeLessThan(mockComplete.mock.invocationCallOrder[0]);
    });

    test('applies app-UI prompt guidance for app-surface screens', async () => {
      await generateArchetypeVariants('v-1', 'Dashboard', 'dashboard', {}, { screen: { name: 'Dashboard' } });
      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('APP-UI DIRECTIVES');
      expect(prompt).not.toContain('MARKETING/LANDING DIRECTIVES');
    });

    test('applies marketing prompt guidance for landing-surface screens', async () => {
      await generateArchetypeVariants('v-1', 'Landing Page', 'landing', {}, { screen: { name: 'Landing Page' } });
      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('MARKETING/LANDING DIRECTIVES');
    });
  });

  describe('generateArchetypesForAllScreens()', () => {
    test('generates archetypes for every screen, landing and app alike', async () => {
      const supabase = createMockSupabaseWithScreens([
        { name: 'Landing Page' },
        { name: 'Dashboard' },
      ]);
      const results = await generateArchetypesForAllScreens('v-1', supabase);
      expect(results).toHaveLength(2);
      expect(results[0].surface).toBe('marketing');
      expect(results[1].surface).toBe('app');
      // 2 screens * 4 variants each
      expect(mockWriteArtifact).toHaveBeenCalledTimes(8);
    });

    test('every screen shares the SAME locked token manifest', async () => {
      const supabase = createMockSupabaseWithScreens([{ name: 'Landing Page' }, { name: 'Dashboard' }]);
      await generateArchetypesForAllScreens('v-1', supabase);
      const colorsUsed = mockComplete.mock.calls.map(call => call[1]).filter(p => p.includes('#2563EB'));
      expect(colorsUsed.length).toBe(mockComplete.mock.calls.length);
    });

    test('no screens produces zero archetypes without error', async () => {
      const supabase = createMockSupabaseWithScreens([]);
      const results = await generateArchetypesForAllScreens('v-1', supabase);
      expect(results).toHaveLength(0);
    });
  });
});
