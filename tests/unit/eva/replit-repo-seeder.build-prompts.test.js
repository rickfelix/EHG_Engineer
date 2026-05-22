/**
 * Unit tests for SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001 (Concern C) —
 * lib/eva/bridge/replit-repo-seeder.js Stage-19 build-prompt fixes.
 *
 * Covers:
 *   (a) wireframe_screens fallback yields one prompt per screen when
 *       blueprint_wireframes is absent (new-pipeline ventures).
 *   (b) no prompt references a docs/designs/<file>.html that is NOT in the
 *       written-design set (no dangling design references).
 *   (c) the blueprint_wireframes path is preserved when present (legacy export).
 *   (d) an existing replit.md is preserved (not overwritten) by seedRepo.
 *
 * The first three exercise the pure exported helpers (resolveBuildScreens /
 * buildFeaturePrompt / designFileStem) with injected inputs — no DB, git, or fs.
 * The fourth mocks fs/child_process/@supabase like the sibling persist-url test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveBuildScreens,
  buildFeaturePrompt,
  designFileStem,
} from '../../../lib/eva/bridge/replit-repo-seeder.js';

describe('designFileStem()', () => {
  it('matches the docs/designs writer filename rule', () => {
    expect(designFileStem('Dashboard Home')).toBe('dashboard-home');
    expect(designFileStem('Sign-Up / Onboarding!')).toBe('sign-up-onboarding');
    expect(designFileStem('  Trailing  ')).toBe('trailing');
  });
});

describe('resolveBuildScreens() — (a) wireframe_screens fallback', () => {
  it('uses the S15 wireframe_screens artifact when blueprint_wireframes is absent', () => {
    const wireframeScreensArtifact = {
      screens: [
        { screen_name: 'Home', description: 'Landing page' },
        { screen_name: 'Settings', description: 'User settings' },
      ],
    };

    const { screens, source } = resolveBuildScreens({
      blueprintWireframes: null,
      wireframeScreensArtifact,
    });

    expect(source).toBe('wireframe_screens');
    expect(screens).toHaveLength(2);
    expect(screens[0].name).toBe('Home');
    expect(screens[1].name).toBe('Settings');
    // raw object is carried through for the prompt builder
    expect(screens[0].raw.description).toBe('Landing page');
  });

  it('maps name from screen_name ?? name (screen_name wins, name fallback)', () => {
    const wireframeScreensArtifact = {
      screens: [
        { screen_name: 'Canonical Name', name: 'Other' },
        { name: 'Only Name' },
        {}, // neither — positional fallback
      ],
    };

    const { screens } = resolveBuildScreens({ wireframeScreensArtifact });

    expect(screens.map(s => s.name)).toEqual(['Canonical Name', 'Only Name', 'Screen 3']);
  });

  it('produces exactly one build prompt per screen via buildFeaturePrompt', () => {
    const wireframeScreensArtifact = {
      screens: [{ screen_name: 'A' }, { screen_name: 'B' }, { screen_name: 'C' }],
    };
    const { screens } = resolveBuildScreens({ wireframeScreensArtifact });

    const features = screens.map((screen, i) =>
      buildFeaturePrompt({
        screen,
        index: i,
        total: screens.length,
        prevScreen: i > 0 ? screens[i - 1] : null,
        writtenDesignStems: new Set(),
      })
    );

    expect(features).toHaveLength(3);
    expect(features.map(f => f.title)).toEqual(['A', 'B', 'C']);
    features.forEach(f => expect(f.prompt.length).toBeGreaterThan(0));
    expect(features[0].prompt).toContain('Build the "A" screen.');
    expect(features[1].prompt).toContain('Build after: A');
  });

  it('returns source "none" with zero screens when neither source has screens', () => {
    expect(resolveBuildScreens({}).source).toBe('none');
    expect(resolveBuildScreens({}).screens).toHaveLength(0);
    expect(resolveBuildScreens({
      blueprintWireframes: { wireframes: { screens: [] } },
      wireframeScreensArtifact: { screens: [] },
    }).screens).toHaveLength(0);
  });
});

describe('buildFeaturePrompt() — (b) no dangling docs/designs references', () => {
  it('does NOT reference docs/designs/<file>.html when the design was not written', () => {
    const { screens } = resolveBuildScreens({
      wireframeScreensArtifact: { screens: [{ screen_name: 'Home', description: 'The landing page' }] },
    });

    const { prompt } = buildFeaturePrompt({
      screen: screens[0],
      index: 0,
      total: 1,
      writtenDesignStems: new Set(), // nothing written
    });

    expect(prompt).not.toContain('docs/designs/');
    // falls back to wireframes.md instead
    expect(prompt).toContain('docs/wireframes.md');
    expect(prompt).toContain('The landing page'); // description surfaced in fallback
  });

  it('DOES reference docs/designs/<stem>.html only when that stem is in the written set', () => {
    const { screens } = resolveBuildScreens({
      wireframeScreensArtifact: {
        screens: [
          { screen_name: 'Dashboard Home' },
          { screen_name: 'Settings' },
        ],
      },
    });

    // Only "dashboard-home" design was actually written.
    const writtenDesignStems = new Set([designFileStem('Dashboard Home')]);

    const withDesign = buildFeaturePrompt({ screen: screens[0], index: 0, total: 2, writtenDesignStems });
    const withoutDesign = buildFeaturePrompt({ screen: screens[1], index: 1, total: 2, prevScreen: screens[0], writtenDesignStems });

    expect(withDesign.prompt).toContain('docs/designs/dashboard-home.html');
    // The screen WITHOUT a written design must not reference any docs/designs file.
    expect(withoutDesign.prompt).not.toContain('docs/designs/settings.html');
    expect(withoutDesign.prompt).not.toMatch(/docs\/designs\/[^\s)]+\.html/);
  });

  it('never emits a docs/designs/*.html reference for a stem absent from the written set', () => {
    const { screens } = resolveBuildScreens({
      wireframeScreensArtifact: {
        screens: [{ screen_name: 'Reports' }, { screen_name: 'Profile' }, { screen_name: 'Billing' }],
      },
    });
    const writtenDesignStems = new Set(); // none written

    for (let i = 0; i < screens.length; i++) {
      const { prompt } = buildFeaturePrompt({ screen: screens[i], index: i, total: screens.length, writtenDesignStems });
      const designRefs = prompt.match(/docs\/designs\/([^\s)]+)\.html/g) || [];
      // Any design ref that DOES appear must have its stem in the written set.
      for (const ref of designRefs) {
        const stem = ref.replace('docs/designs/', '').replace('.html', '');
        expect(writtenDesignStems.has(stem)).toBe(true);
      }
      expect(designRefs).toHaveLength(0);
    }
  });
});

describe('resolveBuildScreens() / buildFeaturePrompt() — (c) blueprint_wireframes path preserved', () => {
  it('prefers blueprint_wireframes.wireframes.screens and keeps name = screen.name', () => {
    const blueprintWireframes = {
      wireframes: {
        screens: [
          { name: 'Legacy Home', purpose: 'home purpose', persona: 'Admin' },
          { name: 'Legacy Detail', purpose: 'detail purpose' },
        ],
      },
    };
    // Even if a wireframe_screens artifact is also present, blueprint wins.
    const wireframeScreensArtifact = { screens: [{ screen_name: 'SHOULD NOT BE USED' }] };

    const { screens, source } = resolveBuildScreens({ blueprintWireframes, wireframeScreensArtifact });

    expect(source).toBe('blueprint_wireframes');
    expect(screens.map(s => s.name)).toEqual(['Legacy Home', 'Legacy Detail']);
  });

  it('produces a build prompt with legacy purpose/persona and design ref when written', () => {
    const blueprintWireframes = {
      wireframes: { screens: [{ name: 'Legacy Home', purpose: 'the home purpose', persona: 'Admin' }] },
    };
    const { screens } = resolveBuildScreens({ blueprintWireframes });
    const writtenDesignStems = new Set([designFileStem('Legacy Home')]);

    const { title, prompt } = buildFeaturePrompt({ screen: screens[0], index: 0, total: 1, writtenDesignStems });

    expect(title).toBe('Legacy Home');
    expect(prompt).toContain('Build the "Legacy Home" screen.');
    expect(prompt).toContain('Purpose: the home purpose');
    expect(prompt).toContain('Primary user: Admin');
    expect(prompt).toContain('docs/designs/legacy-home.html');
    expect(prompt).toContain('Match the approved HTML design in docs/designs/');
  });

  it('also supports the bare .screens shape (no .wireframes wrapper)', () => {
    const { screens, source } = resolveBuildScreens({
      blueprintWireframes: { screens: [{ name: 'Bare A' }, { name: 'Bare B' }] },
    });
    expect(source).toBe('blueprint_wireframes');
    expect(screens.map(s => s.name)).toEqual(['Bare A', 'Bare B']);
  });
});

// ── (d) replit.md preservation in seedRepo() ──────────────────────────
// Mock fs/child_process/@supabase like the sibling persist-url test so we can
// drive existsSync and capture writeFileSync without touching disk/git/network.

const writeCalls = [];
let replitMdAlreadyExists = false;

vi.mock('../../../lib/venture-resources.js', () => ({
  registerVentureResource: vi.fn(() => Promise.resolve({ id: 'res-1', status: 'active' })),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((p, content) => { writeCalls.push({ path: String(p), content }); }),
  existsSync: vi.fn((p) => {
    const s = String(p);
    // replit.md presence is controlled per-test; the repo dir "exists" so we
    // skip the clone branch.
    if (s.endsWith('replit.md')) return replitMdAlreadyExists;
    return true;
  }),
}));

function buildSupabaseMock() {
  let lastFromTable = null;
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    single() {
      if (lastFromTable === 'ventures') {
        return Promise.resolve({
          data: { name: 'TestVenture', target_platform: 'web', metadata: { doc_format: 'agent-optimized' } },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    update() { return chain; },
    upsert() { return chain; },
  };
  return {
    from: vi.fn((table) => { lastFromTable = table; return chain; }),
    rpc: vi.fn(() => Promise.resolve({
      data: { groups: [{ group_key: 'what_to_build', artifacts: [] }] },
      error: null,
    })),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => buildSupabaseMock()),
}));

beforeEach(() => {
  writeCalls.length = 0;
  replitMdAlreadyExists = false;
});

describe('seedRepo() — (d) preserves an existing replit.md', () => {
  it('does NOT overwrite replit.md when the cloned repo already has one', async () => {
    replitMdAlreadyExists = true;
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    const result = await seedRepo('v-preserve', 'https://github.com/foo/bar.git');

    const replitWrites = writeCalls.filter(w => w.path.endsWith('replit.md'));
    expect(replitWrites).toHaveLength(0); // never written
    expect(result.docsCommitted).toContain('replit.md (preserved — repo shipped its own)');
  });

  it('DOES write a fresh replit.md when none exists', async () => {
    replitMdAlreadyExists = false;
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    const result = await seedRepo('v-fresh', 'https://github.com/foo/bar.git');

    const replitWrites = writeCalls.filter(w => w.path.endsWith('replit.md'));
    expect(replitWrites).toHaveLength(1); // written once
    expect(result.docsCommitted).toContain('replit.md (agent-optimized)');
  });

  it('the fresh agent-optimized replit.md does not reference docs/designs when no designs were written', async () => {
    replitMdAlreadyExists = false;
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    await seedRepo('v-nodesigns', 'https://github.com/foo/bar.git');

    const replitWrite = writeCalls.find(w => w.path.endsWith('replit.md'));
    expect(replitWrite).toBeDefined();
    // No stage_17_approved_desktop artifacts in the mock → docs/designs/ empty →
    // template must fall back to docs/wireframes.md.
    expect(replitWrite.content).not.toContain('docs/designs/');
    expect(replitWrite.content).toContain('docs/wireframes.md');
  });
});
