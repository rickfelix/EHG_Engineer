/**
 * Unit tests for Stage 15 Wireframe Generator
 * SD: SD-MAN-INFRA-WIREFRAME-GENERATOR-STAGE-001
 *
 * Tests persona-driven ASCII wireframe generation, service fallbacks,
 * persona mapping logic, and output normalization.
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
    // The mock LLM returns a raw object — parseJSON should pass it through
    if (typeof response === 'object' && response !== null && response._parsed) {
      return response._parsed;
    }
    return response;
  }),
  extractUsage: vi.fn(() => ({ input_tokens: 100, output_tokens: 200 })),
}));

// ── Mock sanitize-for-prompt ────────────────────────────────────────
vi.mock('../../lib/eva/utils/sanitize-for-prompt.js', () => ({
  sanitizeForPrompt: vi.fn((text) => text || ''),
}));

// ── Mock design-reference-library (Awwwards) ────────────────────────
const mockGetDesignRefs = vi.fn();
vi.mock('../../lib/eva/services/design-reference-library.js', () => ({
  getDesignReferencesByArchetype: mockGetDesignRefs,
}));

// ── Mock product-hunt-client ────────────────────────────────────────
const mockSearchPH = vi.fn();
vi.mock('../../lib/eva/services/product-hunt-client.js', () => ({
  searchProductHuntByCategory: mockSearchPH,
}));

// ── Import the module under test AFTER mocks ────────────────────────
import {
  analyzeStage15WireframeGenerator,
  MIN_SCREENS,
  MAX_SCREENS,
  deriveCategory,
  buildPersonaContext,
  buildBrandContext,
  buildTechContext,
  buildExternalContext,
} from '../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';

// ── Test Helpers ────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

function createMockStage10Data(personaCount = 3) {
  const personas = [];
  for (let i = 0; i < personaCount; i++) {
    personas.push({
      name: `Persona ${i + 1}`,
      demographics: { role: `Role ${i + 1}`, industry: 'Technology' },
      goals: [`Goal A for persona ${i + 1}`, `Goal B for persona ${i + 1}`],
      painPoints: [`Pain point for persona ${i + 1}`],
      behaviors: [`Behavior for persona ${i + 1}`],
      motivations: [`Motivation for persona ${i + 1}`],
    });
  }

  return {
    customerPersonas: personas,
    brandGenome: {
      archetype: 'Creator',
      values: ['Innovation', 'Simplicity', 'Trust'],
      tone: 'Professional yet approachable',
      audience: 'Tech-savvy startup founders',
      differentiators: ['AI-powered insights', 'Clean UX'],
    },
  };
}

function createMockStage14Data() {
  return {
    layers: {
      presentation: { technology: 'React', components: ['Dashboard', 'Settings'], rationale: 'Modern SPA' },
      api: { technology: 'REST', components: ['Users API', 'Data API'], rationale: 'Simple and well-understood' },
      business_logic: { technology: 'Node.js', components: ['Auth Service', 'Analytics Engine'], rationale: 'JS ecosystem' },
      data: { technology: 'PostgreSQL', components: ['users', 'analytics'], rationale: 'Relational data' },
      infrastructure: { technology: 'Vercel + Supabase', components: ['Edge Functions', 'CDN'], rationale: 'Serverless' },
    },
    dataEntities: [
      { name: 'User', description: 'Application user', relationships: ['Project'], estimatedVolume: '~10k' },
      { name: 'Project', description: 'User project', relationships: ['User', 'Analytics'], estimatedVolume: '~50k' },
    ],
    security: { authStrategy: 'JWT', dataClassification: 'confidential' },
    integration_points: [
      { name: 'User Auth', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' },
    ],
  };
}

function createFullLLMResponse(personaNames) {
  const screens = personaNames.map((name, i) => ({
    name: `${name} Dashboard`,
    purpose: `Primary workspace for ${name}`,
    persona: name,
    ascii_layout: [
      '+-------------------------------------------+',
      `|  Logo   [ Nav ]  [ ${name} Profile ]       |`,
      '+-------------------------------------------+',
      '|  Welcome back!                             |',
      '|  +----------------+  +----------------+    |',
      '|  |  Metric A      |  |  Metric B      |   |',
      '|  +----------------+  +----------------+    |',
      '|  [ Action Button ]                         |',
      '+-------------------------------------------+',
    ].join('\n'),
    key_components: ['Navigation', 'Metrics display', 'Action button'],
    interaction_notes: `${name} lands here after login and accesses key metrics.`,
  }));

  // Add extra screens to reach MIN_SCREENS
  while (screens.length < MIN_SCREENS) {
    screens.push({
      name: `Shared Screen ${screens.length + 1}`,
      purpose: 'Shared utility screen',
      persona: personaNames[0],
      ascii_layout: '+---+\n| X |\n+---+\n|   |\n+---+',
      key_components: ['Content area'],
      interaction_notes: 'General purpose screen.',
    });
  }

  const coverage = {};
  for (const name of personaNames) {
    coverage[name] = {
      primary_screens: [`${name} Dashboard`],
      secondary_screens: screens.filter(s => s.persona !== name).slice(0, 1).map(s => s.name),
      coverage_score: 85,
    };
  }

  return {
    screens,
    navigation_flows: [
      {
        name: 'Onboarding Flow',
        steps: screens.slice(0, 3).map(s => s.name),
        persona: personaNames[0],
        description: 'New user onboarding journey',
      },
    ],
    persona_coverage: coverage,
    design_rationale: {
      brand_alignment: 'Clean, professional design reflecting Creator archetype',
      tech_feasibility: 'All screens use React components backed by REST API',
      ux_patterns_used: ['Dashboard pattern from Notion', 'Card layout from Linear'],
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Stage 15 Wireframe Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDesignRefs.mockResolvedValue([]);
    mockSearchPH.mockResolvedValue([]);
  });

  // ─── Core output structure ──────────────────────────────────────

  describe('analyzeStage15WireframeGenerator - output structure', () => {
    it('returns an object with screens, navigation_flows, and persona_coverage', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      const llmResponse = createFullLLMResponse(personaNames);

      mockComplete.mockResolvedValue({ _parsed: llmResponse });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        stage14Data: createMockStage14Data(),
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(result).toHaveProperty('screens');
      expect(result).toHaveProperty('navigation_flows');
      expect(result).toHaveProperty('persona_coverage');
      expect(Array.isArray(result.screens)).toBe(true);
      expect(Array.isArray(result.navigation_flows)).toBe(true);
      expect(typeof result.persona_coverage).toBe('object');
    });

    it('includes enrichment metadata in the result', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        logger: silentLogger,
      });

      expect(result).toHaveProperty('enrichment');
      expect(result.enrichment).toHaveProperty('product_hunt_count');
      expect(result.enrichment).toHaveProperty('awwwards_count');
      expect(result.enrichment).toHaveProperty('category');
      expect(result).toHaveProperty('totalScreens');
      expect(result).toHaveProperty('totalFlows');
      expect(result).toHaveProperty('avgPersonaCoverageScore');
      expect(result).toHaveProperty('usage');
    });

    it('each screen has required fields', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        logger: silentLogger,
      });

      for (const screen of result.screens) {
        expect(screen).toHaveProperty('name');
        expect(screen).toHaveProperty('purpose');
        expect(screen).toHaveProperty('persona');
        expect(screen).toHaveProperty('ascii_layout');
        expect(screen).toHaveProperty('key_components');
        expect(screen).toHaveProperty('interaction_notes');
        expect(typeof screen.name).toBe('string');
        expect(typeof screen.ascii_layout).toBe('string');
        expect(Array.isArray(screen.key_components)).toBe(true);
      }
    });
  });

  // ─── Input validation ───────────────────────────────────────────

  describe('input validation', () => {
    it('throws when stage10Data has no customerPersonas', async () => {
      await expect(
        analyzeStage15WireframeGenerator({
          ventureId: 'v-1',
          stage10Data: { brandGenome: { archetype: 'Creator' } },
          logger: silentLogger,
        }),
      ).rejects.toThrow('Stage 15 wireframe generator requires Stage 10 data with customerPersonas');
    });

    it('throws when stage10Data has empty customerPersonas', async () => {
      await expect(
        analyzeStage15WireframeGenerator({
          ventureId: 'v-1',
          stage10Data: { customerPersonas: [], brandGenome: { archetype: 'Creator' } },
          logger: silentLogger,
        }),
      ).rejects.toThrow('Stage 15 wireframe generator requires Stage 10 data with customerPersonas');
    });

    it('throws when stage10Data has no brandGenome', async () => {
      await expect(
        analyzeStage15WireframeGenerator({
          ventureId: 'v-1',
          stage10Data: { customerPersonas: [{ name: 'P1', goals: [], painPoints: [] }] },
          logger: silentLogger,
        }),
      ).rejects.toThrow('Stage 15 wireframe generator requires Stage 10 data with brandGenome');
    });
  });

  // ─── Fallback when services are unavailable ─────────────────────

  describe('service fallback behavior', () => {
    it('succeeds when Product Hunt service throws', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });
      mockSearchPH.mockRejectedValue(new Error('PH service down'));

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.screens.length).toBeGreaterThanOrEqual(MIN_SCREENS);
      expect(result.enrichment.product_hunt_count).toBe(0);
    });

    it('succeeds when Awwwards service throws', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });
      mockGetDesignRefs.mockRejectedValue(new Error('Awwwards service down'));

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.screens.length).toBeGreaterThanOrEqual(MIN_SCREENS);
      expect(result.enrichment.awwwards_count).toBe(0);
    });

    it('includes enrichment counts when services return data', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });

      mockSearchPH.mockResolvedValue([
        { name: 'Notion', tagline: 'All-in-one workspace', url: 'https://notion.so', votesCount: 5120, website: 'https://notion.so', description: 'Workspace' },
        { name: 'Linear', tagline: 'Issue tracking', url: 'https://linear.app', votesCount: 4300, website: 'https://linear.app', description: 'Tracking' },
      ]);
      mockGetDesignRefs.mockResolvedValue([
        { site_name: 'Stripe', archetype_category: 'saas', score_design: 9.2, score_usability: 8.8, description: 'Payments platform' },
      ]);

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'venture-123',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.enrichment.product_hunt_count).toBe(2);
      expect(result.enrichment.awwwards_count).toBe(1);
    });
  });

  // ─── LLM fallback normalization ─────────────────────────────────

  describe('LLM output normalization', () => {
    it('pads screens to MIN_SCREENS when LLM returns too few', async () => {
      const stage10Data = createMockStage10Data();
      mockComplete.mockResolvedValue({
        _parsed: {
          screens: [
            {
              name: 'Dashboard',
              purpose: 'Main view',
              persona: 'Persona 1',
              ascii_layout: '+---+\n|   |\n+---+\n|   |\n+---+',
              key_components: ['Chart'],
              interaction_notes: 'View data',
            },
          ],
          navigation_flows: [],
          persona_coverage: {},
        },
      });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.screens.length).toBeGreaterThanOrEqual(MIN_SCREENS);
      expect(result.llmFallbackCount).toBeGreaterThan(0);
    });

    it('truncates screens to MAX_SCREENS when LLM returns too many', async () => {
      const stage10Data = createMockStage10Data(1);
      const manyScreens = [];
      for (let i = 0; i < 20; i++) {
        manyScreens.push({
          name: `Screen ${i}`,
          purpose: 'Test',
          persona: 'Persona 1',
          ascii_layout: '+---+\n|   |\n+---+\n|   |\n+---+',
          key_components: ['Item'],
          interaction_notes: 'Notes',
        });
      }
      mockComplete.mockResolvedValue({
        _parsed: {
          screens: manyScreens,
          navigation_flows: [{ name: 'Flow', steps: ['Screen 0'], persona: 'Persona 1', description: 'Test' }],
          persona_coverage: { 'Persona 1': { primary_screens: ['Screen 0'], secondary_screens: [], coverage_score: 90 } },
        },
      });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.screens.length).toBeLessThanOrEqual(MAX_SCREENS);
      expect(result.totalScreens).toBeLessThanOrEqual(MAX_SCREENS);
    });

    it('generates default navigation flow when LLM returns none', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      const llmData = createFullLLMResponse(personaNames);
      llmData.navigation_flows = [];

      mockComplete.mockResolvedValue({ _parsed: llmData });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.navigation_flows.length).toBeGreaterThanOrEqual(1);
      expect(result.navigation_flows[0]).toHaveProperty('name');
      expect(result.navigation_flows[0]).toHaveProperty('steps');
    });

    it('fills missing persona coverage entries', async () => {
      const stage10Data = createMockStage10Data(3);
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      const llmData = createFullLLMResponse(personaNames);
      // Remove coverage for Persona 3
      delete llmData.persona_coverage['Persona 3'];

      mockComplete.mockResolvedValue({ _parsed: llmData });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.persona_coverage).toHaveProperty('Persona 1');
      expect(result.persona_coverage).toHaveProperty('Persona 2');
      expect(result.persona_coverage).toHaveProperty('Persona 3');
    });
  });

  // ─── Persona mapping logic ─────────────────────────────────────

  describe('persona mapping', () => {
    it('ensures every persona has at least one screen', async () => {
      const stage10Data = createMockStage10Data(4);
      const personaNames = stage10Data.customerPersonas.map(p => p.name);

      // LLM only returns screens for first 2 personas
      const partialScreens = personaNames.slice(0, 2).map(name => ({
        name: `${name} View`,
        purpose: `Screen for ${name}`,
        persona: name,
        ascii_layout: '+---+\n|   |\n+---+\n|   |\n+---+',
        key_components: ['Widget'],
        interaction_notes: 'Interact here',
      }));

      mockComplete.mockResolvedValue({
        _parsed: {
          screens: partialScreens,
          navigation_flows: [],
          persona_coverage: {},
        },
      });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      // All 4 personas should be covered
      const coveredPersonas = new Set(result.screens.map(s => s.persona));
      for (const pName of personaNames) {
        expect(coveredPersonas.has(pName)).toBe(true);
      }
    });

    it('coverage_score is clamped between 0 and 100', async () => {
      const stage10Data = createMockStage10Data(1);
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      const llmData = createFullLLMResponse(personaNames);
      llmData.persona_coverage['Persona 1'].coverage_score = 150;

      mockComplete.mockResolvedValue({ _parsed: llmData });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        logger: silentLogger,
      });

      expect(result.persona_coverage['Persona 1'].coverage_score).toBeLessThanOrEqual(100);
      expect(result.persona_coverage['Persona 1'].coverage_score).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Pure helper functions ─────────────────────────────────────

  describe('deriveCategory', () => {
    it('returns fintech for finance-related archetypes', () => {
      expect(deriveCategory({ archetype: 'Innovator', audience: 'fintech professionals' })).toBe('fintech');
    });

    it('returns health for health-related archetypes', () => {
      expect(deriveCategory({ archetype: 'Caregiver', audience: 'healthcare providers' })).toBe('health');
    });

    it('returns developer-tools for developer-related archetypes', () => {
      expect(deriveCategory({ archetype: 'Creator', audience: 'software developers' })).toBe('developer-tools');
    });

    it('returns artificial-intelligence for AI-related archetypes', () => {
      expect(deriveCategory({ archetype: 'Explorer', audience: 'AI researchers and machine learning engineers' })).toBe('artificial-intelligence');
    });

    it('returns productivity for productivity-related archetypes', () => {
      expect(deriveCategory({ archetype: 'Ruler', audience: 'productivity enthusiasts' })).toBe('productivity');
    });

    it('returns default saas when no match', () => {
      expect(deriveCategory({ archetype: 'Hero', audience: 'general consumers' })).toBe('saas');
    });

    it('returns default saas for null input', () => {
      expect(deriveCategory(null)).toBe('saas');
    });
  });

  describe('buildPersonaContext', () => {
    it('formats personas into a readable string', () => {
      const personas = [
        { name: 'Alice', goals: ['Save time'], painPoints: ['Too busy'], behaviors: ['Multitasks'] },
      ];
      const result = buildPersonaContext(personas);
      expect(result).toContain('Alice');
      expect(result).toContain('Save time');
      expect(result).toContain('Too busy');
    });

    it('returns fallback for empty array', () => {
      expect(buildPersonaContext([])).toBe('No personas available.');
    });

    it('returns fallback for null input', () => {
      expect(buildPersonaContext(null)).toBe('No personas available.');
    });
  });

  describe('buildBrandContext', () => {
    it('formats brand genome into a readable string', () => {
      const genome = {
        archetype: 'Creator',
        values: ['Innovation'],
        tone: 'Friendly',
        audience: 'Startups',
        differentiators: ['AI-powered'],
      };
      const result = buildBrandContext(genome);
      expect(result).toContain('Creator');
      expect(result).toContain('Innovation');
      expect(result).toContain('Friendly');
    });

    it('returns fallback for null input', () => {
      expect(buildBrandContext(null)).toBe('No brand genome available.');
    });
  });

  describe('buildTechContext', () => {
    it('formats tech architecture into a readable string', () => {
      const stage14 = createMockStage14Data();
      const result = buildTechContext(stage14);
      expect(result).toContain('React');
      expect(result).toContain('PostgreSQL');
      expect(result).toContain('User');
      expect(result).toContain('JWT');
    });

    it('returns fallback for null input', () => {
      expect(buildTechContext(null)).toBe('No technical architecture available.');
    });

    it('handles minimal stage14 data', () => {
      const result = buildTechContext({});
      expect(result).toBe('Technical architecture data is minimal.');
    });
  });

  describe('buildExternalContext', () => {
    it('formats PH and Awwwards data into context strings', () => {
      const phProducts = [
        { name: 'Notion', tagline: 'All-in-one workspace', description: 'A unified workspace' },
      ];
      const awwwardsRefs = [
        { site_name: 'Stripe', archetype_category: 'fintech', score_design: 9.0, score_usability: 8.5, description: 'Payments' },
      ];
      const { phContext, awwwardsContext } = buildExternalContext(phProducts, awwwardsRefs);

      expect(phContext).toContain('Notion');
      expect(phContext).toContain('All-in-one workspace');
      expect(awwwardsContext).toContain('Stripe');
      expect(awwwardsContext).toContain('9');
    });

    it('returns empty strings for empty arrays', () => {
      const { phContext, awwwardsContext } = buildExternalContext([], []);
      expect(phContext).toBe('');
      expect(awwwardsContext).toBe('');
    });
  });

  // ─── Stage 14 integration (optional) ───────────────────────────

  describe('Stage 14 integration', () => {
    it('works without Stage 14 data', async () => {
      const stage10Data = createMockStage10Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });

      const result = await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        stage14Data: undefined,
        logger: silentLogger,
      });

      expect(result.screens.length).toBeGreaterThanOrEqual(MIN_SCREENS);
    });

    it('includes Stage 14 tech context in LLM call when provided', async () => {
      const stage10Data = createMockStage10Data();
      const stage14Data = createMockStage14Data();
      const personaNames = stage10Data.customerPersonas.map(p => p.name);
      mockComplete.mockResolvedValue({ _parsed: createFullLLMResponse(personaNames) });

      await analyzeStage15WireframeGenerator({
        ventureId: 'v-1',
        stage10Data,
        stage14Data,
        logger: silentLogger,
      });

      // Verify the LLM was called and the user prompt includes tech context
      expect(mockComplete).toHaveBeenCalledTimes(1);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('React');
      expect(userPrompt).toContain('PostgreSQL');
    });
  });
});
