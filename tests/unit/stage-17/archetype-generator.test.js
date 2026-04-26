import { describe, test, expect, beforeEach, vi } from 'vitest';

// ── Mock: token-manifest ────────────────────────────────────────────────────
vi.mock('../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn().mockResolvedValue({
    colors: ['#FF5733', '#3366CC', '#22AA44'],
    typeScale: { heading: 'Inter', body: 'Roboto' },
    spacing: { base: 4 },
  }),
}));

// ── Mock: artifact-persistence-service ──────────────────────────────────────
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('artifact-id-mock'),
}));

// ── Mock: page-type-classifier (real logic, no LLM dependency) ──────────────
vi.mock('../../../lib/eva/stage-17/page-type-classifier.js', () => ({
  classifyPageType: vi.fn().mockReturnValue({ pageType: 'landing', confidence: 0.8 }),
  getArchetypesForPageType: vi.fn().mockReturnValue([
    'hero-centric with full-width header',
    'card-grid layout',
    'sidebar navigation',
    'single-column minimal',
    'split-screen layout',
    'dashboard-style layout',
  ]),
  // QF-20260425-288: archetype-generator now always calls this (no confidence gate)
  getStrategyLayouts: vi.fn().mockReturnValue([
    { strategy: 'clarity-first', description: 'clarity-first layout' },
    { strategy: 'dense', description: 'dense layout' },
    { strategy: 'narrative', description: 'narrative layout' },
    { strategy: 'visual-impact', description: 'visual-impact layout' },
  ]),
}));

// ── Mock: scoring-engine (fire-and-forget in production) ────────────────────
vi.mock('../../../lib/eva/stage-17/scoring-engine.js', () => ({
  scoreVariants: vi.fn().mockResolvedValue({
    variants: [{ finalScore: 75, triggeredAntiPatterns: [] }],
  }),
}));

// ── Mock: LLM client-factory ────────────────────────────────────────────────
const mockComplete = vi.fn().mockResolvedValue({
  content: '<html><body style="color:#FF5733;font-family:Inter"><h1>Archetype</h1></body></html>',
});

vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: vi.fn().mockReturnValue({
    complete: mockComplete,
  }),
  // Legacy export kept for backward-compat imports elsewhere
  createLLMClient: vi.fn().mockResolvedValue({
    messages: { create: vi.fn() },
  }),
}));

// ── Mock: global fetch (for HTML download from stitch export URLs) ──────────
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  text: () => Promise.resolve('<html><body><h1>Original Screen</h1></body></html>'),
});
vi.stubGlobal('fetch', mockFetch);

import { writeArtifact } from '../../../lib/eva/artifact-persistence-service.js';
import { scoreVariants } from '../../../lib/eva/stage-17/scoring-engine.js';
import {
  generateArchetypes,
  generateRefinedVariants,
  ArchetypeGenerationError,
} from '../../../lib/eva/stage-17/archetype-generator.js';

// ── Supabase mock factory ───────────────────────────────────────────────────
// Production code makes 3 separate supabase.from() calls:
//   1. venture_artifacts (stitch_design_export) with .limit(1).maybeSingle()
//   2. venture_artifacts (stitch_curation) with .limit(1).maybeSingle()
//   3. venture_artifacts (s17_archetypes) for getCompletedScreens — .eq().eq().eq().eq()
//
// We differentiate by tracking the table + first .eq() artifact_type argument.

function createMockSupabase({
  exportArtifact = null,
  curationArtifact = null,
  completedScreens = [],
} = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table !== 'venture_artifacts') {
        // Fallback: return empty chain
        return createEmptyChain();
      }
      return createArtifactSelectChain({ exportArtifact, curationArtifact, completedScreens });
    }),
  };
}

function createArtifactSelectChain({ exportArtifact, curationArtifact, completedScreens }) {
  return {
    select: vi.fn().mockImplementation(() => {
      // Track which query branch we are on via the first .eq() call
      let eqCount = 0;
      let artifactType = null;

      const chain = {
        eq: vi.fn().mockImplementation((_col, val) => {
          eqCount++;
          // Second .eq() is artifact_type
          if (eqCount === 2) artifactType = val;
          return chain;
        }),
        order: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockImplementation(() => chain),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (artifactType === 'stitch_design_export') {
            return Promise.resolve({ data: exportArtifact, error: null });
          }
          if (artifactType === 'stitch_curation') {
            return Promise.resolve({ data: curationArtifact, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        // Terminal for getCompletedScreens query (no .limit/.maybeSingle)
        then: vi.fn().mockImplementation((resolve) => {
          // getCompletedScreens returns { data: [{metadata: {screenId}}] }
          const data = completedScreens.map(id => ({ metadata: { screenId: id } }));
          return resolve({ data, error: null });
        }),
      };
      return chain;
    }),
  };
}

function createEmptyChain() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return chain;
}

// ── Helper: build standard export artifact metadata ─────────────────────────
function makeExportArtifact(screenCount = 1) {
  const htmlFiles = [];
  for (let i = 0; i < screenCount; i++) {
    htmlFiles.push({
      screen_id: `screen-${i}`,
      html: `https://storage.example.com/screen-${i}.html`,
      size: 1024,
    });
  }
  return {
    id: 'export-art-1',
    metadata: {
      html_files: htmlFiles,
      png_files_base64: [],
    },
  };
}

function makeCurationArtifact(screenCount = 1) {
  const screenPrompts = [];
  const genResults = [];
  for (let i = 0; i < screenCount; i++) {
    screenPrompts.push({
      screen_name: `Screen ${i + 1}`,
      deviceType: 'DESKTOP',
      prompt: 'Create a landing page',
    });
    genResults.push({ screen_id: `screen-${i}` });
  }
  return {
    artifact_data: {
      screen_prompts: screenPrompts,
      generation_results: genResults,
    },
  };
}

describe('archetype-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue({
      content: '<html><body style="color:#FF5733;font-family:Inter"><h1>Archetype</h1></body></html>',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body><h1>Original Screen</h1></body></html>'),
    });
  });

  describe('generateArchetypes()', () => {
    test('returns 6 artifact IDs per screen', async () => {
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      const result = await generateArchetypes('venture-123', supabase);

      expect(result.screenCount).toBe(1);
      expect(result.artifactIds).toHaveLength(1); // 1 artifact per screen (contains 6 variants)
      expect(mockComplete).toHaveBeenCalledTimes(6);
    });

    test('applies brand tokens in prompt', async () => {
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      await generateArchetypes('v-1', supabase);

      // The prompt is the second arg to complete() (userContent array)
      const userContent = mockComplete.mock.calls[0][1];
      // userContent is an array: [{type:'text', text: promptText}] or with image first
      const textItem = Array.isArray(userContent)
        ? userContent.find(c => c.type === 'text')
        : { text: String(userContent) };
      expect(textItem.text).toContain('#FF5733');
      expect(textItem.text).toContain('Inter');
      expect(textItem.text).toContain('Roboto');
    });

    test('throws ArchetypeGenerationError when no stitch artifacts', async () => {
      // Export artifact with no html_files → should throw
      const supabase = createMockSupabase({
        exportArtifact: null,
      });

      await expect(generateArchetypes('v-empty', supabase)).rejects.toThrow(ArchetypeGenerationError);
    });

    test('propagates LLM client errors', async () => {
      mockComplete.mockRejectedValueOnce(new Error('Claude API unavailable'));
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      await expect(generateArchetypes('v-1', supabase)).rejects.toThrow('Claude API unavailable');
    });

    test('writes self-contained HTML (no external scripts/links)', async () => {
      const html = '<html><style>body{color:#FF5733}</style><body><h1>Test</h1></body></html>';
      mockComplete.mockResolvedValue({ content: html });
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      await generateArchetypes('v-1', supabase);

      // writeArtifact receives (supabase, { content: JSON.stringify({variants}) })
      const writtenContent = writeArtifact.mock.calls[0][1].content;
      expect(writtenContent).not.toContain('<script src=');
      expect(writtenContent).not.toContain('<link rel="stylesheet"');
    });

    test('processes multiple screens (1 artifact per screen)', async () => {
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(2),
        curationArtifact: makeCurationArtifact(2),
      });

      const result = await generateArchetypes('v-1', supabase);

      expect(result.screenCount).toBe(2);
      expect(result.artifactIds).toHaveLength(2); // 1 artifact per screen
      expect(mockComplete).toHaveBeenCalledTimes(12); // 6 variants × 2 screens
    });

    test('skips completed screens (stateless resume)', async () => {
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(3),
        curationArtifact: makeCurationArtifact(3),
        completedScreens: ['screen-0', 'screen-1'], // 2 of 3 already done
      });

      const result = await generateArchetypes('v-1', supabase);

      expect(result.screenCount).toBe(3); // Total screens
      expect(result.artifactIds).toHaveLength(1); // Only screen-2 generated
      expect(mockComplete).toHaveBeenCalledTimes(6); // 6 variants for 1 screen
    });

    test('fires scoring async (fire-and-forget)', async () => {
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      await generateArchetypes('v-1', supabase);

      // scoreVariants called but not awaited in the main flow
      // Give the async .then() a tick to resolve
      await new Promise(r => setTimeout(r, 10));
      expect(scoreVariants).toHaveBeenCalledTimes(1);
      expect(scoreVariants).toHaveBeenCalledWith(
        'v-1',
        'screen-0',
        expect.any(Array),
        expect.objectContaining({ pageType: 'landing', deviceType: 'DESKTOP' }),
        supabase
      );
    });

    test('scoring failure does not block generation', async () => {
      // Make scoring reject
      scoreVariants.mockRejectedValueOnce(new Error('Scoring DB error'));
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(1),
        curationArtifact: makeCurationArtifact(1),
      });

      // Should NOT throw — scoring is fire-and-forget
      const result = await generateArchetypes('v-1', supabase);
      expect(result.artifactIds).toHaveLength(1);

      // Give the async .catch() a tick to run
      await new Promise(r => setTimeout(r, 10));
    });

    test('respects abort signal between screens', async () => {
      const controller = new AbortController();
      const supabase = createMockSupabase({
        exportArtifact: makeExportArtifact(3),
        curationArtifact: makeCurationArtifact(3),
      });

      // Abort after first screen completes
      let callCount = 0;
      mockComplete.mockImplementation(async () => {
        callCount++;
        if (callCount === 6) controller.abort(); // After screen 0 finishes (6 variants)
        return { content: '<html><body>OK</body></html>' };
      });

      const result = await generateArchetypes('v-1', supabase, { signal: controller.signal });

      expect(result.cancelled).toBe(true);
      expect(result.screenCount).toBe(1); // Only completed 1 screen before cancel
      expect(result.artifactIds).toHaveLength(1);
    });
  });

  describe('generateRefinedVariants()', () => {
    test('generates 4 refined variants', async () => {
      const ids = await generateRefinedVariants(
        'v-1', 'Home',
        ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } },
        {}
      );
      expect(ids).toHaveLength(4);
      expect(mockComplete).toHaveBeenCalledTimes(4);
    });

    test('injects mobile context for desktop', async () => {
      await generateRefinedVariants(
        'v-1', 'Home',
        ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } },
        {},
        { mobileContextHtml: '<html>Mobile</html>' }
      );

      // The prompt is the second arg to complete()
      const prompt = mockComplete.mock.calls[0][1];
      const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      expect(promptText).toContain('MOBILE REFERENCE');
    });
  });
});
