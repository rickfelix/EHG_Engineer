/**
 * SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-E
 * Invariant tests for Stage 18 marketing-wireframe grounding + conversion-copy tuning.
 *
 * All tests are deterministic and offline — no LLM calls, no network, no DB.
 *
 * Coverage:
 *   1. resolveMarketingWireframe — returns marketing screen; null when absent;
 *      uses classifySurface for untagged screens.
 *   2. buildMarketingWireframeContext — includes key_components + ascii_layout;
 *      degrades gracefully on empty components / null input.
 *   3. conversionCopyDirectives — returns a non-empty string with expected
 *      marketing directives.
 *   4. Stage 18 integration (pure/offline):
 *      a. Flag ON + marketing wireframe → prompt includes wireframe context + directives.
 *      b. Flag OFF → NO wireframe context (baseline parity).
 *      c. Flag ON + NO marketing wireframe → graceful fallback (no throw).
 *      d. Conversion directives NOT injected for non-marketing surfaces.
 *   5. Three archetype fixtures (SaaS, marketplace, content).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock LLM client (no network calls) ──────────────────────────────
const mockComplete = vi.fn();
vi.mock('../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({ complete: mockComplete })),
}));

// ── Mock parse-json utils ────────────────────────────────────────────
vi.mock('../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((response) => {
    if (typeof response === 'object' && response !== null && response._parsed) {
      return response._parsed;
    }
    return response;
  }),
  extractUsage: vi.fn(() => ({ input_tokens: 10, output_tokens: 20 })),
}));

// ── Import modules under test AFTER mocks ────────────────────────────
import {
  resolveMarketingWireframe,
  buildMarketingWireframeContext,
  conversionCopyDirectives,
  analyzeStage18MarketingCopy,
} from '../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js';

// ── Helpers ──────────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

/** Build a minimal Stage 15 screen fixture */
function makeWireframeScreen(name, extra = {}) {
  return {
    name,
    purpose: `Purpose of ${name}`,
    persona: 'Founder',
    ascii_layout: [
      '+-------------------------------+',
      `| ${name.substring(0, 29).padEnd(29)} |`,
      '+-------------------------------+',
      '| [ Primary CTA ]               |',
      '+-------------------------------+',
    ],
    key_components: ['Hero section', 'CTA button', 'Feature highlights'],
    interaction_notes: 'Primary conversion surface',
    ...extra,
  };
}

// ── Three archetype fixtures (SaaS, marketplace, content) ────────────

/** SaaS: Landing Page (marketing) + Sign Up (auth) + Dashboard (app) */
const SAAS_SCREENS = [
  makeWireframeScreen('Landing Page'),
  makeWireframeScreen('Sign Up'),
  makeWireframeScreen('Dashboard'),
  makeWireframeScreen('Settings'),
  makeWireframeScreen('Pricing'),
];

/** Marketplace: Home Page (marketing) + Register (auth) + Browse (app) */
const MARKETPLACE_SCREENS = [
  makeWireframeScreen('Home Page', { key_components: ['Buyer hero', 'Seller CTA', 'Category grid'] }),
  makeWireframeScreen('Register'),
  makeWireframeScreen('Browse Listings'),
  makeWireframeScreen('Seller Dashboard'),
  makeWireframeScreen('Account Profile'),
];

/** Content: Marketing Page (marketing) + Log In (auth) + Article Feed (app) */
const CONTENT_SCREENS = [
  makeWireframeScreen('Marketing Page', { key_components: ['Content value prop', 'Subscribe CTA', 'Sample articles'] }),
  makeWireframeScreen('Log In'),
  makeWireframeScreen('Article Feed'),
  makeWireframeScreen('User Profile'),
  makeWireframeScreen('Subscriptions'),
];

/** Minimal S18 params (no LLM-needed data — we mock the complete call) */
function buildS18Params(overrides = {}) {
  return {
    ventureName: 'TestVenture',
    logger: silentLogger,
    ...overrides,
  };
}

/** Minimal valid LLM copy response */
function makeCopyResponse() {
  return {
    _parsed: {
      tagline: { text: 'Build faster', persona_target: 'Founder' },
      app_store_desc: { text: 'App store description.', persona_target: 'Founder' },
      landing_hero: { headline: 'Launch your product', subheadline: 'Fast and easy', cta_text: 'Get Started', persona_target: 'Founder' },
      email_welcome: { subject: 'Welcome!', body: 'Welcome email body.', persona_target: 'Founder' },
      email_onboarding: { subject: 'Day 3!', body: 'Onboarding email.', persona_target: 'Founder' },
      email_reengagement: { subject: 'Miss you!', body: 'Re-engagement.', persona_target: 'Founder' },
      social_posts: { twitter: 'Tweet', linkedin: 'LinkedIn', instagram: 'Insta', facebook: 'FB', product_hunt: 'PH', persona_target: 'Founder' },
      seo_meta: { title: 'TestVenture', description: 'SEO desc', keywords: ['test'], persona_target: 'Founder' },
      blog_draft: { title: 'Blog title', intro: 'Intro.', sections: ['S1', 'S2'], conclusion: 'Conclusion.', persona_target: 'Founder' },
    },
  };
}

// ════════════════════════════════════════════════════════════════════
// 1. resolveMarketingWireframe — pure unit tests
// ════════════════════════════════════════════════════════════════════

describe('resolveMarketingWireframe — pure helper', () => {
  it('returns the marketing screen when it has an explicit surface=marketing tag', () => {
    const screens = [
      makeWireframeScreen('Dashboard', { surface: 'app' }),
      makeWireframeScreen('Landing Page', { surface: 'marketing' }),
      makeWireframeScreen('Sign Up', { surface: 'auth' }),
    ];
    const result = resolveMarketingWireframe(screens);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Landing Page');
    expect(result.surface).toBe('marketing');
  });

  it('uses classifySurface for untagged screens (no explicit surface field)', () => {
    // Screens have NO surface field — classifySurface must infer from name
    const screens = [
      makeWireframeScreen('Dashboard'),
      makeWireframeScreen('Landing Page'),
      makeWireframeScreen('Sign Up'),
    ];
    const result = resolveMarketingWireframe(screens);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Landing Page');
  });

  it('returns null when no marketing screen exists (all app/auth)', () => {
    const screens = [
      makeWireframeScreen('Dashboard'),
      makeWireframeScreen('Settings'),
      makeWireframeScreen('Sign Up'),
    ];
    const result = resolveMarketingWireframe(screens);
    expect(result).toBeNull();
  });

  it('accepts full result object with .screens property', () => {
    const wireframeResult = {
      screens: [
        makeWireframeScreen('Dashboard'),
        makeWireframeScreen('Home Page'),
        makeWireframeScreen('Register'),
      ],
      navigation_flows: [],
      totalScreens: 3,
    };
    const result = resolveMarketingWireframe(wireframeResult);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Home Page');
  });

  it('returns null for null input', () => {
    expect(resolveMarketingWireframe(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(resolveMarketingWireframe(undefined)).toBeNull();
  });

  it('returns null for non-array non-object input', () => {
    expect(resolveMarketingWireframe('bad input')).toBeNull();
    expect(resolveMarketingWireframe(42)).toBeNull();
  });

  it('returns null for empty screen array', () => {
    expect(resolveMarketingWireframe([])).toBeNull();
  });

  it('skips null/non-object entries in the array gracefully', () => {
    const screens = [null, undefined, 42, makeWireframeScreen('Landing Page')];
    const result = resolveMarketingWireframe(screens);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Landing Page');
  });

  describe('SaaS archetype fixture', () => {
    it('resolves Landing Page as the marketing screen', () => {
      const result = resolveMarketingWireframe(SAAS_SCREENS);
      expect(result).not.toBeNull();
      expect(result.name).toBe('Landing Page');
    });
  });

  describe('Marketplace archetype fixture', () => {
    it('resolves Home Page as the marketing screen', () => {
      const result = resolveMarketingWireframe(MARKETPLACE_SCREENS);
      expect(result).not.toBeNull();
      expect(result.name).toBe('Home Page');
    });
  });

  describe('Content archetype fixture', () => {
    it('resolves Marketing Page as the marketing screen', () => {
      const result = resolveMarketingWireframe(CONTENT_SCREENS);
      expect(result).not.toBeNull();
      expect(result.name).toBe('Marketing Page');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. buildMarketingWireframeContext — pure unit tests
// ════════════════════════════════════════════════════════════════════

describe('buildMarketingWireframeContext — pure helper', () => {
  it('includes key_components in the output', () => {
    const wireframe = makeWireframeScreen('Landing Page');
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('Hero section');
    expect(ctx).toContain('CTA button');
    expect(ctx).toContain('Feature highlights');
  });

  it('includes ascii_layout in the output', () => {
    const wireframe = makeWireframeScreen('Landing Page');
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('ASCII Layout');
    // At least one line of the fixture layout should appear
    expect(ctx).toContain('+-------------------------------+');
  });

  it('includes screen name in the output', () => {
    const wireframe = makeWireframeScreen('Landing Page');
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('Landing Page');
  });

  it('degrades gracefully on empty key_components (shows "(none specified)")', () => {
    const wireframe = makeWireframeScreen('Landing Page', { key_components: [] });
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('(none specified)');
    // Should not throw and should still be non-empty
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  it('degrades gracefully on missing ascii_layout (no layout section in output)', () => {
    const wireframe = makeWireframeScreen('Landing Page', { ascii_layout: undefined });
    const ctx = buildMarketingWireframeContext(wireframe);
    // Should not throw
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  it('degrades gracefully on empty ascii_layout array', () => {
    const wireframe = makeWireframeScreen('Landing Page', { ascii_layout: [] });
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(typeof ctx).toBe('string');
    // No "ASCII Layout" header — nothing to render
    expect(ctx).not.toContain('```');
  });

  it('returns empty string for null wireframe', () => {
    expect(buildMarketingWireframeContext(null)).toBe('');
  });

  it('returns empty string for undefined wireframe', () => {
    expect(buildMarketingWireframeContext(undefined)).toBe('');
  });

  it('contains a grounding instruction for landing_hero', () => {
    const wireframe = makeWireframeScreen('Landing Page');
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('landing_hero');
  });

  it('includes a section header identifying S15 marketing wireframe', () => {
    const wireframe = makeWireframeScreen('Landing Page');
    const ctx = buildMarketingWireframeContext(wireframe);
    expect(ctx).toContain('Stage 15 Marketing Wireframe');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. conversionCopyDirectives — pure unit tests
// ════════════════════════════════════════════════════════════════════

describe('conversionCopyDirectives — pure helper', () => {
  it('returns a non-empty string', () => {
    const directives = conversionCopyDirectives();
    expect(typeof directives).toBe('string');
    expect(directives.length).toBeGreaterThan(0);
  });

  it('contains VALUE PROPOSITION directive', () => {
    expect(conversionCopyDirectives()).toContain('VALUE PROPOSITION');
  });

  it('contains BENEFIT FRAMING directive', () => {
    expect(conversionCopyDirectives()).toContain('BENEFIT FRAMING');
  });

  it('contains CTA EMPHASIS directive', () => {
    expect(conversionCopyDirectives()).toContain('CTA EMPHASIS');
  });

  it('contains a section header for surface=marketing', () => {
    expect(conversionCopyDirectives()).toContain('surface=marketing');
  });

  it('is deterministic — calling twice returns identical output', () => {
    expect(conversionCopyDirectives()).toBe(conversionCopyDirectives());
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. Stage 18 integration (pure/offline)
// ════════════════════════════════════════════════════════════════════

describe('Stage 18 integration — surface-aware prompt injection', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue(makeCopyResponse());
  });

  describe('4a. Flag ON + marketing wireframe → prompt contains wireframe context + directives', () => {
    beforeEach(() => {
      vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does not throw with a SaaS wireframe fixture', async () => {
      await expect(
        analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS })),
      ).resolves.toBeDefined();
    });

    it('captures the LLM prompt including wireframe context (SaaS)', async () => {
      await analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS }));
      expect(mockComplete).toHaveBeenCalledOnce();
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Stage 15 Marketing Wireframe');
      expect(userPrompt).toContain('Hero section');
      expect(userPrompt).toContain('CTA button');
    });

    it('captures the LLM prompt including conversion directives (SaaS)', async () => {
      await analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS }));
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Conversion-Copy Directives');
      expect(userPrompt).toContain('VALUE PROPOSITION');
    });

    it('captures the LLM prompt including ascii_layout content (SaaS)', async () => {
      await analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS }));
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('+-------------------------------+');
    });

    it('sets marketing_wireframe_injected=true in metadata (SaaS)', async () => {
      const result = await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: SAAS_SCREENS }),
      );
      expect(result.metadata.marketing_wireframe_injected).toBe(true);
      expect(result.metadata.marketing_wireframe_screen_name).toBe('Landing Page');
    });

    it('does not throw with a Marketplace wireframe fixture', async () => {
      await expect(
        analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: MARKETPLACE_SCREENS })),
      ).resolves.toBeDefined();
    });

    it('captures wireframe context for Marketplace archetype (Home Page)', async () => {
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: MARKETPLACE_SCREENS }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Stage 15 Marketing Wireframe');
      expect(userPrompt).toContain('Buyer hero');
    });

    it('does not throw with a Content wireframe fixture', async () => {
      await expect(
        analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: CONTENT_SCREENS })),
      ).resolves.toBeDefined();
    });

    it('captures wireframe context for Content archetype (Marketing Page)', async () => {
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: CONTENT_SCREENS }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Stage 15 Marketing Wireframe');
      expect(userPrompt).toContain('Subscribe CTA');
    });
  });

  describe('4b. Flag OFF → no wireframe context (baseline parity)', () => {
    beforeEach(() => {
      vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does NOT include wireframe context in prompt when flag is off (SaaS)', async () => {
      await analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS }));
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).not.toContain('Stage 15 Marketing Wireframe');
    });

    it('does NOT include conversion directives in prompt when flag is off', async () => {
      await analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: SAAS_SCREENS }));
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).not.toContain('Conversion-Copy Directives');
    });

    it('sets marketing_wireframe_injected=false in metadata when flag is off', async () => {
      const result = await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: SAAS_SCREENS }),
      );
      expect(result.metadata.marketing_wireframe_injected).toBe(false);
      expect(result.metadata.marketing_wireframe_screen_name).toBeNull();
    });

    it('completes successfully without stage15WireframeData (baseline behavior)', async () => {
      const result = await analyzeStage18MarketingCopy(buildS18Params());
      expect(result).toBeDefined();
      expect(result.tagline).toBeDefined();
    });
  });

  describe('4c. Flag ON + NO marketing wireframe → graceful fallback (no throw)', () => {
    beforeEach(() => {
      vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does not throw when stage15WireframeData is null', async () => {
      await expect(
        analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: null })),
      ).resolves.toBeDefined();
    });

    it('does not throw when stage15WireframeData is omitted', async () => {
      await expect(analyzeStage18MarketingCopy(buildS18Params())).resolves.toBeDefined();
    });

    it('does not throw when screens have no marketing surface', async () => {
      const appOnlyScreens = [
        makeWireframeScreen('Dashboard'),
        makeWireframeScreen('Settings'),
        makeWireframeScreen('Sign In'),
      ];
      await expect(
        analyzeStage18MarketingCopy(buildS18Params({ stage15WireframeData: appOnlyScreens })),
      ).resolves.toBeDefined();
    });

    it('does not inject wireframe context when no marketing screen exists', async () => {
      const appOnlyScreens = [
        makeWireframeScreen('Dashboard'),
        makeWireframeScreen('Settings'),
      ];
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: appOnlyScreens }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).not.toContain('Stage 15 Marketing Wireframe');
    });

    it('sets marketing_wireframe_injected=false in metadata when no marketing screen', async () => {
      const appOnlyScreens = [makeWireframeScreen('Dashboard'), makeWireframeScreen('Settings')];
      const result = await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: appOnlyScreens }),
      );
      expect(result.metadata.marketing_wireframe_injected).toBe(false);
    });
  });

  describe('4d. Conversion directives only for marketing surface', () => {
    beforeEach(() => {
      vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does NOT inject conversion directives when all screens are app/auth surface', async () => {
      const nonMarketingScreens = [
        makeWireframeScreen('Dashboard', { surface: 'app' }),
        makeWireframeScreen('Settings', { surface: 'app' }),
        makeWireframeScreen('Sign Up', { surface: 'auth' }),
      ];
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: nonMarketingScreens }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).not.toContain('Conversion-Copy Directives');
    });

    it('DOES inject conversion directives when a marketing screen is present', async () => {
      const withMarketingScreen = [
        makeWireframeScreen('Dashboard', { surface: 'app' }),
        makeWireframeScreen('Landing Page', { surface: 'marketing' }),
      ];
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: withMarketingScreen }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Conversion-Copy Directives');
    });

    it('does NOT inject directives when flag is off even with marketing screen', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
      const withMarketingScreen = [makeWireframeScreen('Landing Page', { surface: 'marketing' })];
      await analyzeStage18MarketingCopy(
        buildS18Params({ stage15WireframeData: withMarketingScreen }),
      );
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).not.toContain('Conversion-Copy Directives');
    });
  });
});
