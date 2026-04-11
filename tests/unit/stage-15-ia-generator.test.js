/**
 * Unit tests for Stage 15 Information Architecture Generator
 * SD: SD-FIX-S15-WIREFRAME-TESTS-001
 *
 * Tests generateInformationArchitecture (happy path + failure fallback),
 * buildIAContext helper, and normalizeIAResult normalizer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock LLM client ─────────────────────────────────────────────────
const mockComplete = vi.fn();
vi.mock('../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: mockComplete,
  })),
}));

// ── Mock parse-json utils ───────────────────────────────────────────
vi.mock('../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((response) => {
    if (typeof response === 'object' && response !== null && response._parsed) {
      return response._parsed;
    }
    return response;
  }),
  extractUsage: vi.fn(() => ({ input_tokens: 80, output_tokens: 150 })),
}));

// ── Mock sanitize-for-prompt ────────────────────────────────────────
vi.mock('../../lib/eva/utils/sanitize-for-prompt.js', () => ({
  sanitizeForPrompt: vi.fn((text) => text || ''),
}));

// ── Import module under test AFTER mocks ────────────────────────────
import {
  generateInformationArchitecture,
  buildIAContext,
  normalizeIAResult,
} from '../../lib/eva/stage-templates/analysis-steps/stage-15-ia-generator.js';

// ── Test Helpers ────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

function createValidIAResponse() {
  return {
    pages: [
      { name: 'Dashboard', path: '/dashboard', purpose: 'Main overview', parent: null, priority: 'primary', persona_relevance: ['Founder'] },
      { name: 'Settings', path: '/settings', purpose: 'App configuration', parent: null, priority: 'utility', persona_relevance: ['Founder', 'Admin'] },
      { name: 'Analytics', path: '/analytics', purpose: 'Data insights', parent: 'Dashboard', priority: 'primary', persona_relevance: ['Analyst'] },
      { name: 'Onboarding', path: '/onboarding', purpose: 'New user setup', parent: null, priority: 'primary', persona_relevance: ['Founder'] },
      { name: 'Help', path: '/help', purpose: 'Documentation', parent: null, priority: 'utility', persona_relevance: ['Founder', 'Analyst'] },
    ],
    navigation: {
      primary: ['Dashboard', 'Analytics'],
      secondary: ['Onboarding'],
      utility: ['Settings', 'Help'],
    },
    user_flows: [
      { name: 'Onboarding Flow', persona: 'Founder', steps: ['Onboarding', 'Dashboard', 'Settings'], description: 'New user setup journey' },
      { name: 'Analysis Flow', persona: 'Analyst', steps: ['Dashboard', 'Analytics'], description: 'Data exploration journey' },
    ],
    hierarchy_depth: 2,
    total_pages: 5,
  };
}

function createMinimalCtx(overrides = {}) {
  return {
    ventureName: 'TestVenture',
    stage1Data: { description: 'A test venture', problem: 'No analytics', solution: 'AI dashboard' },
    stage10Data: {
      customerPersonas: [
        { name: 'Founder', goals: ['Grow revenue', 'Save time'] },
        { name: 'Analyst', goals: ['Deep insights'] },
      ],
    },
    stage13Data: { roadmap: 'Phase 1: MVP, Phase 2: Growth' },
    logger: silentLogger,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Stage 15 IA Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateInformationArchitecture ─────────────────────────────

  describe('generateInformationArchitecture - happy path', () => {
    it('returns a normalized IA result with pages, navigation, and user_flows', async () => {
      const iaResponse = createValidIAResponse();
      mockComplete.mockResolvedValue({ _parsed: iaResponse });

      const result = await generateInformationArchitecture(createMinimalCtx());

      expect(result).not.toBeNull();
      expect(result.pages).toHaveLength(5);
      expect(result.navigation).toHaveProperty('primary');
      expect(result.navigation).toHaveProperty('secondary');
      expect(result.navigation).toHaveProperty('utility');
      expect(result.user_flows).toHaveLength(2);
      expect(result.total_pages).toBe(5);
      expect(result.usage).toEqual({ input_tokens: 80, output_tokens: 150 });
    });

    it('preserves hierarchy_depth from LLM response', async () => {
      const iaResponse = createValidIAResponse();
      iaResponse.hierarchy_depth = 3;
      mockComplete.mockResolvedValue({ _parsed: iaResponse });

      const result = await generateInformationArchitecture(createMinimalCtx());

      expect(result.hierarchy_depth).toBe(3);
    });
  });

  describe('generateInformationArchitecture - failure fallback', () => {
    it('returns null when LLM call throws', async () => {
      mockComplete.mockRejectedValue(new Error('LLM timeout'));

      const result = await generateInformationArchitecture(createMinimalCtx());

      expect(result).toBeNull();
      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('IA generation failed'),
        expect.objectContaining({ error: 'LLM timeout' }),
      );
    });

    it('returns null when insufficient context (only ventureName)', async () => {
      const result = await generateInformationArchitecture({
        ventureName: 'TestVenture',
        stage1Data: null,
        stage10Data: null,
        stage13Data: null,
        logger: silentLogger,
      });

      expect(result).toBeNull();
      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient venture context'),
      );
    });

    it('returns null when no context at all', async () => {
      const result = await generateInformationArchitecture({ logger: silentLogger });

      expect(result).toBeNull();
    });
  });

  // ─── buildIAContext ──────────────────────────────────────────────

  describe('buildIAContext', () => {
    it('includes venture name, description, problem, solution', () => {
      const ctx = createMinimalCtx();
      const result = buildIAContext(ctx);

      expect(result).toContain('TestVenture');
      expect(result).toContain('A test venture');
      expect(result).toContain('No analytics');
      expect(result).toContain('AI dashboard');
    });

    it('includes persona names and goals', () => {
      const ctx = createMinimalCtx();
      const result = buildIAContext(ctx);

      expect(result).toContain('Founder');
      expect(result).toContain('Grow revenue');
      expect(result).toContain('Analyst');
    });

    it('includes roadmap summary', () => {
      const ctx = createMinimalCtx();
      const result = buildIAContext(ctx);

      expect(result).toContain('Phase 1: MVP');
    });

    it('includes user story epics when available', () => {
      const ctx = createMinimalCtx({
        userStoryPack: {
          epics: [
            { name: 'Auth Epic', stories: [{ title: 'Login' }, { title: 'Signup' }] },
            { name: 'Dashboard Epic', stories: [{ title: 'Metrics view' }] },
          ],
        },
      });
      const result = buildIAContext(ctx);

      expect(result).toContain('Auth Epic');
      expect(result).toContain('2 stories');
      expect(result).toContain('Dashboard Epic');
    });

    it('returns null when only ventureName provided (fewer than 2 parts)', () => {
      const result = buildIAContext({ ventureName: 'Test' });

      expect(result).toBeNull();
    });

    it('handles roadmap as object (JSON stringified)', () => {
      const ctx = createMinimalCtx({
        stage13Data: { roadmap: { phases: ['MVP', 'Growth'] } },
      });
      const result = buildIAContext(ctx);

      expect(result).toContain('MVP');
    });
  });

  // ─── normalizeIAResult ───────────────────────────────────────────

  describe('normalizeIAResult', () => {
    it('normalizes pages with all required fields', () => {
      const raw = createValidIAResponse();
      const personas = [{ name: 'Founder' }, { name: 'Analyst' }];

      const result = normalizeIAResult(raw, personas);

      for (const page of result.pages) {
        expect(page).toHaveProperty('name');
        expect(page).toHaveProperty('path');
        expect(page).toHaveProperty('purpose');
        expect(page).toHaveProperty('parent');
        expect(page).toHaveProperty('priority');
        expect(page).toHaveProperty('persona_relevance');
        expect(typeof page.name).toBe('string');
        expect(typeof page.path).toBe('string');
        expect(['primary', 'secondary', 'utility']).toContain(page.priority);
      }
    });

    it('defaults priority to secondary for unknown values', () => {
      const raw = {
        pages: [{ name: 'Test', path: '/test', purpose: 'Test', priority: 'critical' }],
        navigation: {},
        user_flows: [],
      };

      const result = normalizeIAResult(raw, []);

      expect(result.pages[0].priority).toBe('secondary');
    });

    it('builds navigation from pages when not provided', () => {
      const raw = {
        pages: [
          { name: 'Home', path: '/', purpose: 'Landing', priority: 'primary' },
          { name: 'Settings', path: '/settings', purpose: 'Config', priority: 'utility' },
        ],
        user_flows: [],
      };

      const result = normalizeIAResult(raw, []);

      expect(result.navigation.primary).toContain('Home');
      expect(result.navigation.utility).toContain('Settings');
    });

    it('normalizes user flows with string clamping', () => {
      const raw = {
        pages: [],
        navigation: {},
        user_flows: [
          { name: 'Flow 1', persona: 'Founder', steps: ['A', 'B'], description: 'Test flow' },
        ],
      };

      const result = normalizeIAResult(raw, [{ name: 'Founder' }]);

      expect(result.user_flows).toHaveLength(1);
      expect(result.user_flows[0].name).toBe('Flow 1');
      expect(result.user_flows[0].steps).toEqual(['A', 'B']);
    });

    it('defaults hierarchy_depth to 2 when not a number', () => {
      const raw = { pages: [], navigation: {}, user_flows: [], hierarchy_depth: 'deep' };

      const result = normalizeIAResult(raw, []);

      expect(result.hierarchy_depth).toBe(2);
    });

    it('sets total_pages to actual page count', () => {
      const raw = {
        pages: [
          { name: 'A', path: '/a', purpose: 'A' },
          { name: 'B', path: '/b', purpose: 'B' },
        ],
        navigation: {},
        user_flows: [],
        total_pages: 99, // intentionally wrong
      };

      const result = normalizeIAResult(raw, []);

      expect(result.total_pages).toBe(2);
    });

    it('handles missing pages gracefully', () => {
      const raw = { navigation: {}, user_flows: [] };

      const result = normalizeIAResult(raw, []);

      expect(result.pages).toEqual([]);
      expect(result.total_pages).toBe(0);
    });

    it('defaults persona to first available when flow has no persona', () => {
      const raw = {
        pages: [],
        navigation: {},
        user_flows: [{ name: 'Flow', steps: ['A'] }],
      };

      const result = normalizeIAResult(raw, [{ name: 'DefaultUser' }]);

      expect(result.user_flows[0].persona).toBe('DefaultUser');
    });
  });
});
