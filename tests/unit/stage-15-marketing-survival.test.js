/**
 * Merge-gating invariant tests — SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-C
 *
 * Verifies that the canonical Stage 15 generator always produces at least one
 * marketing-surface screen per archetype fixture (SaaS, marketplace, content),
 * and that removing the mandatory landing page WOULD cause the invariant to fail.
 *
 * All tests are deterministic and offline — no LLM calls, no network, no DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock LLM (offline — all responses pre-built) ────────────────────────────
const mockComplete = vi.fn();
vi.mock('../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({ complete: mockComplete })),
}));

vi.mock('../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((response) => {
    if (typeof response === 'object' && response !== null && response._parsed) {
      return response._parsed;
    }
    return response;
  }),
  extractUsage: vi.fn(() => ({ input_tokens: 10, output_tokens: 20 })),
}));

vi.mock('../../lib/eva/utils/sanitize-for-prompt.js', () => ({
  sanitizeForPrompt: vi.fn((text) => text || ''),
}));

vi.mock('../../lib/eva/services/design-reference-library.js', () => ({
  getDesignReferencesByArchetype: vi.fn().mockResolvedValue([]),
}));

import {
  analyzeStage15WireframeGenerator,
} from '../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';
import { marketingPageTargetFor, assertMarketingSurvival } from '../../lib/eva/wireframe-surface-normalizer.js';

// ── Shared helpers ───────────────────────────────────────────────────────────

const silentLogger = { log: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

function makeStage10() {
  return {
    customerPersonas: [
      { name: 'Founder', goals: ['Launch fast'], painPoints: ['Noise'], behaviors: ['Iterates'] },
    ],
    brandGenome: {
      archetype: 'Creator',
      values: ['Quality'],
      tone: 'Direct',
      audience: 'Startups',
      differentiators: ['Speed'],
    },
  };
}

function makeScreen(name) {
  return {
    name,
    purpose: `Purpose of ${name}`,
    persona: 'Founder',
    ascii_layout: [
      '+----------------------------+',
      `| ${name.substring(0, 26).padEnd(26)} |`,
      '+----------------------------+',
      '| [ Action ]                 |',
      '+----------------------------+',
    ],
    key_components: ['Header', 'Content'],
    interaction_notes: 'Interact here',
    error_state: 'Error fallback',
    empty_state: 'Empty fallback',
    responsive_notes: 'Stack on mobile',
  };
}

function buildLLMResponse(screens) {
  return {
    screens,
    navigation_flows: [
      { name: 'Main Flow', steps: screens.slice(0, 2).map(s => s.name), persona: 'Founder', description: 'Core path' },
    ],
    persona_coverage: {
      Founder: { primary_screens: [screens[0].name], secondary_screens: [], coverage_score: 80 },
    },
    design_rationale: { brand_alignment: 'Clean', tech_feasibility: 'Aligned', ux_patterns_used: [] },
  };
}

async function runGenerator(screens) {
  mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screens) });
  return analyzeStage15WireframeGenerator({
    ventureId: 'v-test',
    stage10Data: makeStage10(),
    logger: silentLogger,
  });
}

// ── Three archetype fixtures ─────────────────────────────────────────────────

/** SaaS archetype: landing (marketing) + auth + app */
const SAAS_SCREENS = [
  makeScreen('Landing Page'),
  makeScreen('Sign Up'),
  makeScreen('Dashboard'),
  makeScreen('Analytics'),
  makeScreen('Settings'),
];

/** Marketplace archetype: home page (marketing) + auth + app */
const MARKETPLACE_SCREENS = [
  makeScreen('Home Page'),
  makeScreen('Register'),
  makeScreen('Browse Listings'),
  makeScreen('Seller Dashboard'),
  makeScreen('Account Profile'),
];

/** Content archetype: marketing page + auth + app */
const CONTENT_SCREENS = [
  makeScreen('Marketing Page'),
  makeScreen('Log In'),
  makeScreen('Article Feed'),
  makeScreen('User Profile'),
  makeScreen('Subscriptions'),
];

// ════════════════════════════════════════════════════════════════════════════
// 1. Merge-gating invariant — at least 1 marketing screen per archetype (flag ON)
// ════════════════════════════════════════════════════════════════════════════

describe('Marketing-survival invariant (EVA_SURFACE_AWARE_ENABLED=true)', () => {
  beforeEach(() => vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  describe('SaaS archetype', () => {
    it('has at least one marketing screen', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      const marketing = result.screens.filter(s => s.surface === 'marketing');
      expect(marketing.length).toBeGreaterThanOrEqual(1);
    });

    it('Landing Page is the marketing screen', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      const landing = result.screens.find(s => /landing/i.test(s.name));
      expect(landing).toBeDefined();
      expect(landing.surface).toBe('marketing');
    });
  });

  describe('Marketplace archetype', () => {
    it('has at least one marketing screen', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      const marketing = result.screens.filter(s => s.surface === 'marketing');
      expect(marketing.length).toBeGreaterThanOrEqual(1);
    });

    it('Home Page is the marketing screen', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      const home = result.screens.find(s => /home\s*page/i.test(s.name));
      expect(home).toBeDefined();
      expect(home.surface).toBe('marketing');
    });
  });

  describe('Content archetype', () => {
    it('has at least one marketing screen', async () => {
      const result = await runGenerator(CONTENT_SCREENS);
      const marketing = result.screens.filter(s => s.surface === 'marketing');
      expect(marketing.length).toBeGreaterThanOrEqual(1);
    });

    it('Marketing Page is the marketing screen', async () => {
      const result = await runGenerator(CONTENT_SCREENS);
      const mktPage = result.screens.find(s => /marketing/i.test(s.name));
      expect(mktPage).toBeDefined();
      expect(mktPage.surface).toBe('marketing');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Negative invariant — removing the mandatory landing page causes failure
//    (tests the behaviour of the classifySurface boundary, not a framework rule)
// ════════════════════════════════════════════════════════════════════════════

describe('Negative invariant (flag ON) — removing landing page', () => {
  beforeEach(() => vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('generator auto-injects a Landing Page when LLM omits all marketing screens', async () => {
    // Give the LLM only app + auth screens — no marketing surface at all.
    // The generator MUST inject a landing page, so the marketing count stays ≥1.
    const noMarketingScreens = [
      makeScreen('Dashboard'),
      makeScreen('Sign In'),
      makeScreen('Settings'),
      makeScreen('Analytics'),
      makeScreen('Profile'),
    ];

    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(noMarketingScreens) });
    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });

    const marketing = result.screens.filter(s => s.surface === 'marketing');
    // The generator enforces a mandatory Landing Page — so ≥1 marketing screen.
    expect(marketing.length).toBeGreaterThanOrEqual(1);
    // The injected screen should be the canonical Landing Page
    const landing = result.screens.find(s => /landing/i.test(s.name));
    expect(landing).toBeDefined();
    expect(landing.surface).toBe('marketing');
  });

  it('direct invariant assertion: zero marketing screens IS a failure', () => {
    // Validate assertMarketingSurvival detects the failure mode
    // (used by backfill script and CI invariant checks).
    const appOnlyScreens = [
      { surface: 'app', name: 'Dashboard' },
      { surface: 'auth', name: 'Sign In' },
    ];
    const result = assertMarketingSurvival(appOnlyScreens, 1);
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(0);
    expect(result.target).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. marketingPageTargetFor — pure function unit tests
// ════════════════════════════════════════════════════════════════════════════

describe('marketingPageTargetFor', () => {
  it('returns 3 for saas', () => {
    expect(marketingPageTargetFor('saas')).toBe(3);
  });

  it('returns 3 for marketplace', () => {
    expect(marketingPageTargetFor('marketplace')).toBe(3);
  });

  it('returns 2 for content', () => {
    expect(marketingPageTargetFor('content')).toBe(2);
  });

  it('returns 3 for e-commerce', () => {
    expect(marketingPageTargetFor('e-commerce')).toBe(3);
  });

  it('returns 2 for fintech', () => {
    expect(marketingPageTargetFor('fintech')).toBe(2);
  });

  it('returns 1 for developer-tools', () => {
    expect(marketingPageTargetFor('developer-tools')).toBe(1);
  });

  it('returns 2 for health', () => {
    expect(marketingPageTargetFor('health')).toBe(2);
  });

  it('returns 2 for productivity', () => {
    expect(marketingPageTargetFor('productivity')).toBe(2);
  });

  it('returns 2 for unknown class', () => {
    expect(marketingPageTargetFor('unknown-niche')).toBe(2);
  });

  it('returns default for null', () => {
    expect(marketingPageTargetFor(null)).toBe(2);
  });

  it('returns default for undefined', () => {
    expect(marketingPageTargetFor(undefined)).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(marketingPageTargetFor('SaaS')).toBe(3);
    expect(marketingPageTargetFor('MARKETPLACE')).toBe(3);
  });

  it('result is always ≥1 for any input', () => {
    const inputs = ['saas', 'marketplace', 'content', 'e-commerce', 'fintech', 'developer-tools', 'health', 'productivity', 'default', null, undefined, ''];
    for (const input of inputs) {
      expect(marketingPageTargetFor(input)).toBeGreaterThanOrEqual(1);
    }
  });
});
