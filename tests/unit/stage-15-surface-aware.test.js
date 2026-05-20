/**
 * Invariant tests for SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-B
 *
 * Tests:
 *   1. classifySurface() — pure helper, no LLM
 *   2. fallbackAsciiLayout() — pure helper, no LLM
 *   3. Flag-ON: every screen gets surface + page_type; at least one marketing screen per archetype
 *   4. Flag-OFF parity: screens must NOT carry surface/page_type
 *   5. Negative invariant: a screen that should be marketing IS classified marketing
 *
 * All tests are deterministic and offline (no LLM calls, no live DB).
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

// ── Mock sanitize-for-prompt ─────────────────────────────────────────
vi.mock('../../lib/eva/utils/sanitize-for-prompt.js', () => ({
  sanitizeForPrompt: vi.fn((text) => text || ''),
}));

// ── Mock design-reference-library (offline) ─────────────────────────
vi.mock('../../lib/eva/services/design-reference-library.js', () => ({
  getDesignReferencesByArchetype: vi.fn().mockResolvedValue([]),
}));

// ── Import module under test AFTER mocks ────────────────────────────
import {
  classifySurface,
  fallbackAsciiLayout,
  analyzeStage15WireframeGenerator,
  MIN_SCREENS,
} from '../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';

// ── Helpers ──────────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

/** Minimal valid stage10 data shared across archetype fixtures */
function makeStage10(overrides = {}) {
  return {
    customerPersonas: [
      { name: 'Founder', goals: ['Launch fast'], painPoints: ['Too much noise'], behaviors: ['Iterates quickly'] },
    ],
    brandGenome: {
      archetype: overrides.archetype ?? 'Creator',
      values: ['Quality'],
      tone: 'Direct',
      audience: overrides.audience ?? 'Startup founders',
      differentiators: ['Speed'],
    },
  };
}

/**
 * Build a minimal LLM response for a given archetype's screen list.
 * All ascii_layout entries are well-formed arrays.
 */
function buildLLMResponse(screens) {
  return {
    screens,
    navigation_flows: [
      { name: 'Main Flow', steps: screens.slice(0, 2).map(s => s.name), persona: 'Founder', description: 'Core path' },
    ],
    persona_coverage: {
      Founder: { primary_screens: [screens[0].name], secondary_screens: [], coverage_score: 80 },
    },
    design_rationale: {
      brand_alignment: 'Clean',
      tech_feasibility: 'Aligned',
      ux_patterns_used: [],
    },
  };
}

function makeScreen(name, extra = {}) {
  return {
    name,
    purpose: `Purpose of ${name}`,
    persona: 'Founder',
    ascii_layout: [
      '+--------------------------------+',
      `| ${name.substring(0, 30).padEnd(30)} |`,
      '+--------------------------------+',
      '| [ Primary Action ]             |',
      '+--------------------------------+',
    ],
    key_components: ['Header', 'Content area'],
    interaction_notes: 'Interact here',
    error_state: 'Error fallback',
    empty_state: 'Empty fallback',
    responsive_notes: 'Stack on mobile',
    ...extra,
  };
}

// ── Three archetype screen fixtures ──────────────────────────────────

/** SaaS archetype: marketing landing + auth + app screens */
const SAAS_SCREENS = [
  makeScreen('Landing Page'),
  makeScreen('Sign Up'),
  makeScreen('Dashboard'),
  makeScreen('Settings'),
  makeScreen('Pricing'),
];

/** Marketplace archetype: marketing home + auth + app screens */
const MARKETPLACE_SCREENS = [
  makeScreen('Home Page'),
  makeScreen('Register'),
  makeScreen('Browse Listings'),
  makeScreen('Seller Dashboard'),
  makeScreen('Account Profile'),
];

/** Content archetype: marketing features + auth + app screens */
const CONTENT_SCREENS = [
  makeScreen('Marketing Page'),
  makeScreen('Log In'),
  makeScreen('Article Feed'),
  makeScreen('User Profile'),
  makeScreen('Subscriptions'),
];

// ════════════════════════════════════════════════════════════════════
// 1. classifySurface — pure unit tests
// ════════════════════════════════════════════════════════════════════

describe('classifySurface — pure helper', () => {
  it('classifies "Landing Page" as marketing', () => {
    const result = classifySurface({ name: 'Landing Page' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('landing');
  });

  it('classifies "Home Page" as marketing', () => {
    const result = classifySurface({ name: 'Home Page' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('home');
  });

  it('classifies "Pricing" as marketing', () => {
    const result = classifySurface({ name: 'Pricing' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('pricing');
  });

  it('classifies "Features" as marketing', () => {
    const result = classifySurface({ name: 'Features' });
    expect(result.surface).toBe('marketing');
    expect(result.page_type).toBe('features');
  });

  it('classifies "Marketing Page" as marketing', () => {
    const result = classifySurface({ name: 'Marketing Page' });
    expect(result.surface).toBe('marketing');
  });

  it('classifies "Sign Up" as auth', () => {
    const result = classifySurface({ name: 'Sign Up' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('signup');
  });

  it('classifies "Sign In" as auth', () => {
    const result = classifySurface({ name: 'Sign In' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('login');
  });

  it('classifies "Log In" as auth', () => {
    const result = classifySurface({ name: 'Log In' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('login');
  });

  it('classifies "Register" as auth', () => {
    const result = classifySurface({ name: 'Register' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('signup');
  });

  it('classifies "Forgot Password" as auth', () => {
    const result = classifySurface({ name: 'Forgot Password' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('password-reset');
  });

  it('classifies "Reset Password" as auth', () => {
    const result = classifySurface({ name: 'Reset Password' });
    expect(result.surface).toBe('auth');
    expect(result.page_type).toBe('password-reset');
  });

  it('classifies "Dashboard" as app', () => {
    const result = classifySurface({ name: 'Dashboard' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('dashboard');
  });

  it('classifies "Settings" as app', () => {
    const result = classifySurface({ name: 'Settings' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('settings');
  });

  it('classifies "Profile" as app', () => {
    const result = classifySurface({ name: 'Profile' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('profile');
  });

  it('classifies "Seller Dashboard" as app', () => {
    const result = classifySurface({ name: 'Seller Dashboard' });
    expect(result.surface).toBe('app');
    expect(result.page_type).toBe('dashboard');
  });

  it('surface is one of the three canonical values for arbitrary screen names', () => {
    const names = ['Checkout', 'Order History', 'Support Chat', 'Analytics', 'Notifications'];
    for (const name of names) {
      const { surface } = classifySurface({ name });
      expect(['marketing', 'auth', 'app']).toContain(surface);
    }
  });

  it('returns non-empty page_type for any input', () => {
    const names = ['', undefined, 'Some Weird Screen Name!', 'A'];
    for (const name of names) {
      const { page_type } = classifySurface({ name });
      expect(typeof page_type).toBe('string');
      expect(page_type.length).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. fallbackAsciiLayout — pure unit tests
// ════════════════════════════════════════════════════════════════════

describe('fallbackAsciiLayout — pure helper', () => {
  it('returns an array of strings', () => {
    const result = fallbackAsciiLayout({ name: 'Dashboard', key_components: ['Chart', 'Button'] });
    expect(Array.isArray(result)).toBe(true);
    expect(result.every(line => typeof line === 'string')).toBe(true);
  });

  it('returns at least 5 lines', () => {
    const result = fallbackAsciiLayout({ name: 'Test', key_components: ['One'] });
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('uses screen name in the output', () => {
    const result = fallbackAsciiLayout({ name: 'My Screen', key_components: ['Widget'] });
    const joined = result.join('\n');
    expect(joined).toContain('My Screen');
  });

  it('includes key_components labels', () => {
    const result = fallbackAsciiLayout({ name: 'Screen', key_components: ['Nav Bar', 'Hero Image'] });
    const joined = result.join('\n');
    expect(joined).toContain('Nav Bar');
    expect(joined).toContain('Hero Image');
  });

  it('uses generic placeholder when no key_components', () => {
    const result = fallbackAsciiLayout({ name: 'Screen' });
    const joined = result.join('\n');
    expect(joined).toContain('Content area');
  });

  it('handles null/undefined gracefully', () => {
    const result = fallbackAsciiLayout(null);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('uses ASCII box-drawing characters (+, -, |, [ ])', () => {
    const result = fallbackAsciiLayout({ name: 'X', key_components: ['Y'] });
    const joined = result.join('');
    expect(joined).toMatch(/[+\-|]/);
    expect(joined).toContain('[');
    expect(joined).toContain(']');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. Flag-ON: surface + page_type on every screen, archetype invariants
// ════════════════════════════════════════════════════════════════════

describe('Flag-ON invariants (EVA_SURFACE_AWARE_ENABLED=true)', () => {
  beforeEach(() => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function runGenerator(screens, stage10Override = {}) {
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screens) });
    return analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(stage10Override),
      logger: silentLogger,
    });
  }

  describe('SaaS archetype', () => {
    it('every screen has surface in {marketing, auth, app}', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      for (const screen of result.screens) {
        expect(['marketing', 'auth', 'app']).toContain(screen.surface);
      }
    });

    it('every screen has a non-empty page_type', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      for (const screen of result.screens) {
        expect(typeof screen.page_type).toBe('string');
        expect(screen.page_type.length).toBeGreaterThan(0);
      }
    });

    it('has at least one marketing screen (Landing Page)', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      const marketingScreens = result.screens.filter(s => s.surface === 'marketing');
      expect(marketingScreens.length).toBeGreaterThanOrEqual(1);
    });

    it('Landing Page screen is classified as marketing', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      const landing = result.screens.find(s => /landing/i.test(s.name));
      expect(landing).toBeDefined();
      expect(landing.surface).toBe('marketing');
      expect(landing.page_type).toBe('landing');
    });

    it('no screen has an empty/malformed ascii_layout', async () => {
      const result = await runGenerator(SAAS_SCREENS);
      for (const screen of result.screens) {
        expect(Array.isArray(screen.ascii_layout)).toBe(true);
        const hasContent = screen.ascii_layout.some(line => line.trim().length > 0);
        expect(hasContent).toBe(true);
      }
    });
  });

  describe('Marketplace archetype', () => {
    it('every screen has surface in {marketing, auth, app}', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      for (const screen of result.screens) {
        expect(['marketing', 'auth', 'app']).toContain(screen.surface);
      }
    });

    it('has at least one marketing screen (Home Page)', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      const marketingScreens = result.screens.filter(s => s.surface === 'marketing');
      expect(marketingScreens.length).toBeGreaterThanOrEqual(1);
    });

    it('Home Page screen is classified as marketing', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      const home = result.screens.find(s => /home/i.test(s.name));
      expect(home).toBeDefined();
      expect(home.surface).toBe('marketing');
    });

    it('no screen has an empty/malformed ascii_layout', async () => {
      const result = await runGenerator(MARKETPLACE_SCREENS);
      for (const screen of result.screens) {
        expect(Array.isArray(screen.ascii_layout)).toBe(true);
        const hasContent = screen.ascii_layout.some(line => line.trim().length > 0);
        expect(hasContent).toBe(true);
      }
    });
  });

  describe('Content archetype', () => {
    it('every screen has surface in {marketing, auth, app}', async () => {
      const result = await runGenerator(CONTENT_SCREENS);
      for (const screen of result.screens) {
        expect(['marketing', 'auth', 'app']).toContain(screen.surface);
      }
    });

    it('has at least one marketing screen (Marketing Page)', async () => {
      const result = await runGenerator(CONTENT_SCREENS);
      const marketingScreens = result.screens.filter(s => s.surface === 'marketing');
      expect(marketingScreens.length).toBeGreaterThanOrEqual(1);
    });

    it('no screen has an empty/malformed ascii_layout', async () => {
      const result = await runGenerator(CONTENT_SCREENS);
      for (const screen of result.screens) {
        expect(Array.isArray(screen.ascii_layout)).toBe(true);
        const hasContent = screen.ascii_layout.some(line => line.trim().length > 0);
        expect(hasContent).toBe(true);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. Flag-OFF parity: screens must NOT carry surface/page_type
// ════════════════════════════════════════════════════════════════════

describe('Flag-OFF parity (EVA_SURFACE_AWARE_ENABLED unset or false)', () => {
  beforeEach(() => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('screens do NOT have a surface field when flag is off', async () => {
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(SAAS_SCREENS) });
    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });
    for (const screen of result.screens) {
      expect(screen).not.toHaveProperty('surface');
    }
  });

  it('screens do NOT have a page_type field when flag is off', async () => {
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(SAAS_SCREENS) });
    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });
    for (const screen of result.screens) {
      expect(screen).not.toHaveProperty('page_type');
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. ascii_layout fallback — correctness fix (flag-independent)
// ════════════════════════════════════════════════════════════════════

describe('ascii_layout fallback (correctness fix, flag-independent)', () => {
  beforeEach(() => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces missing ascii_layout with a well-formed fallback', async () => {
    const screensWithMissingLayout = [
      { ...makeScreen('Dashboard'), ascii_layout: undefined },
      ...SAAS_SCREENS.slice(1),
    ];
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screensWithMissingLayout) });

    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });

    for (const screen of result.screens) {
      expect(Array.isArray(screen.ascii_layout)).toBe(true);
      expect(screen.ascii_layout.length).toBeGreaterThanOrEqual(5);
      const hasContent = screen.ascii_layout.some(line => line.trim().length > 0);
      expect(hasContent).toBe(true);
    }
  });

  it('replaces empty-string ascii_layout with a well-formed fallback', async () => {
    const screensWithEmptyLayout = [
      { ...makeScreen('Dashboard'), ascii_layout: '' },
      ...SAAS_SCREENS.slice(1),
    ];
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screensWithEmptyLayout) });

    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });

    const dashboard = result.screens.find(s => s.name === 'Dashboard');
    expect(Array.isArray(dashboard.ascii_layout)).toBe(true);
    expect(dashboard.ascii_layout.length).toBeGreaterThanOrEqual(5);
  });

  it('replaces whitespace-only array ascii_layout with a well-formed fallback', async () => {
    const screensWithBlankLayout = [
      { ...makeScreen('Dashboard'), ascii_layout: ['   ', '  ', ' '] },
      ...SAAS_SCREENS.slice(1),
    ];
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screensWithBlankLayout) });

    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });

    const dashboard = result.screens.find(s => s.name === 'Dashboard');
    expect(Array.isArray(dashboard.ascii_layout)).toBe(true);
    const hasContent = dashboard.ascii_layout.some(line => line.trim().length > 0);
    expect(hasContent).toBe(true);
  });

  it('PRESERVES a real ascii_layout unchanged', async () => {
    const realLayout = [
      '+============================+',
      '|  Real Layout Line 1        |',
      '|  Real Layout Line 2        |',
      '|  [ Button ]                |',
      '+============================+',
    ];
    const screensWithRealLayout = [
      { ...makeScreen('Dashboard'), ascii_layout: realLayout },
      ...SAAS_SCREENS.slice(1),
    ];
    mockComplete.mockResolvedValue({ _parsed: buildLLMResponse(screensWithRealLayout) });

    const result = await analyzeStage15WireframeGenerator({
      ventureId: 'v-test',
      stage10Data: makeStage10(),
      logger: silentLogger,
    });

    const dashboard = result.screens.find(s => s.name === 'Dashboard');
    expect(dashboard.ascii_layout).toEqual(realLayout);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. Negative invariant: removing tagging WOULD fail the assertion
// ════════════════════════════════════════════════════════════════════

describe('Negative invariant: surface classification is deterministic', () => {
  it('classifySurface always returns marketing for Landing Page (cannot be app)', () => {
    const result = classifySurface({ name: 'Landing Page' });
    expect(result.surface).not.toBe('app');
    expect(result.surface).not.toBe('auth');
    expect(result.surface).toBe('marketing');
  });

  it('classifySurface always returns auth for Sign Up (cannot be marketing)', () => {
    const result = classifySurface({ name: 'Sign Up' });
    expect(result.surface).not.toBe('marketing');
    expect(result.surface).not.toBe('app');
    expect(result.surface).toBe('auth');
  });

  it('classifySurface always returns app for Dashboard (cannot be marketing)', () => {
    const result = classifySurface({ name: 'Dashboard' });
    expect(result.surface).not.toBe('marketing');
    expect(result.surface).not.toBe('auth');
    expect(result.surface).toBe('app');
  });
});
