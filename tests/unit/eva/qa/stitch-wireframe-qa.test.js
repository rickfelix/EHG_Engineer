/**
 * Unit tests for lib/eva/qa/stitch-wireframe-qa.js
 * SD-WIREFRAME-FIDELITY-VERIFICATION-VISION-ORCH-001-A
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  scoreWireframeFidelity,
  setAnthropicClientLoader,
  setSupabaseClientLoader,
  pairScreensWithWireframes,
} = await import('../../../../lib/eva/qa/stitch-wireframe-qa.js');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeVisionResponse(scores = {}) {
  const defaults = {
    component_presence: { score: 85, findings: ['All components present'], missing_elements: [] },
    layout_fidelity: { score: 80, findings: ['Grid aligned'], layout_issues: [] },
    navigation_accuracy: { score: 90, findings: ['Nav matches spec'], missing_nav: [] },
    purpose_match: { score: 88, findings: ['Purpose aligned'] },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify({ ...defaults, ...scores }) }],
    usage: { input_tokens: 2000, output_tokens: 600 },
  };
}

function makeFailingVisionResponse() {
  return makeVisionResponse({
    component_presence: { score: 40, findings: ['Missing sidebar'], missing_elements: ['sidebar', 'footer'] },
    layout_fidelity: { score: 50, findings: ['Header displaced'], layout_issues: ['header not at top'] },
    navigation_accuracy: { score: 60, findings: ['Missing nav bar'], missing_nav: ['main nav'] },
    purpose_match: { score: 55, findings: ['Purpose mismatch'] },
  });
}

function makeSupabaseMock({
  wireframes = [
    { name: 'Home', content: 'Home wireframe with header, nav, content' },
    { name: 'Dashboard', content: 'Dashboard with sidebar and charts' },
    { name: 'Settings', content: 'Settings page with form fields' },
  ],
  screens = [
    { screen_id: 'home-001', title: 'Home', base64: 'base64png1' },
    { screen_id: 'dash-001', title: 'Dashboard', base64: 'base64png2' },
    { screen_id: 'settings-001', title: 'Settings', base64: 'base64png3' },
  ],
  existingQaReport = null,
  noWireframes = false,
  noScreens = false,
} = {}) {
  // Track artifact_type from eq calls per chain
  let currentArtifactType = null;

  const createChain = () => {
    const chain = {
      select: vi.fn().mockImplementation(() => chain),
      eq: vi.fn().mockImplementation((col, val) => {
        if (col === 'artifact_type') currentArtifactType = val;
        return chain;
      }),
      limit: vi.fn().mockImplementation(() => chain),
      maybeSingle: vi.fn().mockImplementation(() => {
        const type = currentArtifactType;
        currentArtifactType = null;
        if (type === 'blueprint_wireframes') {
          if (noWireframes) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { metadata: { wireframes }, content: null }, error: null });
        }
        if (type === 'stitch_design_export') {
          if (noScreens) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { metadata: { screens } }, error: null });
        }
        if (type === 'stitch_qa_report') {
          if (!existingQaReport) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { id: 'existing-qa-id', metadata: existingQaReport, version: 1 }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      insert: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-artifact-id' }, error: null }),
        })),
      })),
      update: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    };
    return chain;
  };

  return { from: vi.fn().mockImplementation(() => createChain()) };
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('pairScreensWithWireframes', () => {
  it('pairs by exact name match', () => {
    const wf = [{ name: 'Home' }, { name: 'Dashboard' }];
    const sc = [{ screen_id: 's1', title: 'Home' }, { screen_id: 's2', title: 'Dashboard' }];
    const { paired, unpaired_screens, unpaired_wireframes } = pairScreensWithWireframes(wf, sc);
    expect(paired).toHaveLength(2);
    expect(unpaired_screens).toHaveLength(0);
    expect(unpaired_wireframes).toHaveLength(0);
  });

  it('flags unpaired screens', () => {
    const wf = [{ name: 'Home' }];
    const sc = [{ screen_id: 's1', title: 'Home' }, { screen_id: 's2', title: 'Extra' }];
    const { paired, unpaired_screens } = pairScreensWithWireframes(wf, sc);
    expect(paired).toHaveLength(1);
    expect(unpaired_screens).toHaveLength(1);
    expect(unpaired_screens[0].screen_id).toBe('s2');
  });

  it('handles case-insensitive matching', () => {
    const wf = [{ name: 'HOME PAGE' }];
    const sc = [{ screen_id: 's1', title: 'home page' }];
    const { paired } = pairScreensWithWireframes(wf, sc);
    expect(paired).toHaveLength(1);
  });
});

describe('scoreWireframeFidelity', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { setAnthropicClientLoader(null); setSupabaseClientLoader(null); });

  it('scores all paired screens with passing fidelity', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeVisionResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());

    const result = await scoreWireframeFidelity('venture-123');

    expect(result.status).toBe('completed');
    expect(result.screens).toHaveLength(3);
    expect(result.screens.every(s => s.status === 'pass')).toBe(true);
    expect(result.aggregate.pass_count).toBe(3);
    expect(result.aggregate.fail_count).toBe(0);
    expect(result.aggregate.average_fidelity).toBeGreaterThanOrEqual(70);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(3);
  });

  it('flags below-threshold screens with missing elements', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeFailingVisionResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock({
      wireframes: [{ name: 'Home', content: 'Home wireframe' }],
      screens: [{ screen_id: 'home-001', title: 'Home', base64: 'base64png' }],
    }));

    const result = await scoreWireframeFidelity('venture-123');

    expect(result.status).toBe('completed');
    expect(result.screens[0].status).toBe('fail');
    expect(result.screens[0].fidelity_score).toBeLessThan(70);
    expect(result.screens[0].missing_elements).toContain('sidebar');
    expect(result.screens[0].layout_issues).toContain('header not at top');
  });

  it('handles unpaired screens gracefully', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeVisionResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock({
      wireframes: [{ name: 'Home', content: 'Home wireframe' }],
      screens: [
        { screen_id: 'home-001', title: 'Home', base64: 'base64png1' },
        { screen_id: 'extra-001', title: 'Extra Page', base64: 'base64png2' },
      ],
    }));

    const result = await scoreWireframeFidelity('venture-123');

    expect(result.screens).toHaveLength(2);
    const unpaired = result.screens.find(s => s.screen_id === 'extra-001');
    expect(unpaired.status).toBe('unpaired');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns no_wireframes when blueprint artifact is missing', async () => {
    setAnthropicClientLoader(() => ({ messages: { create: vi.fn() } }));
    setSupabaseClientLoader(() => makeSupabaseMock({ noWireframes: true }));

    const result = await scoreWireframeFidelity('venture-123');
    expect(result.status).toBe('no_wireframes');
    expect(result.screens).toHaveLength(0);
  });

  it('returns no_screens when export has no screens', async () => {
    setAnthropicClientLoader(() => ({ messages: { create: vi.fn() } }));
    setSupabaseClientLoader(() => makeSupabaseMock({ noScreens: true }));

    const result = await scoreWireframeFidelity('venture-123');
    expect(result.status).toBe('no_screens');
  });

  it('returns vision_api_unavailable when no API key', async () => {
    setAnthropicClientLoader(() => null);
    setSupabaseClientLoader(() => makeSupabaseMock());

    const result = await scoreWireframeFidelity('venture-123');
    expect(result.status).toBe('vision_api_unavailable');
  });

  it('isolates per-screen errors without crashing other screens', async () => {
    const anthropic = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce(makeVisionResponse())
          .mockRejectedValueOnce(new Error('API timeout'))
          .mockResolvedValueOnce(makeVisionResponse()),
      },
    };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());

    const result = await scoreWireframeFidelity('venture-123');

    expect(result.status).toBe('completed');
    const home = result.screens.find(s => s.screen_id === 'home-001');
    const dash = result.screens.find(s => s.screen_id === 'dash-001');
    const settings = result.screens.find(s => s.screen_id === 'settings-001');

    expect(home.status).toBe('pass');
    expect(dash.status).toBe('error');
    expect(dash.error).toContain('API timeout');
    expect(settings.status).toBe('pass');
  });

  it('uses configurable threshold', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeVisionResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock({
      wireframes: [{ name: 'Home', content: 'Home wireframe' }],
      screens: [{ screen_id: 'home-001', title: 'Home', base64: 'png' }],
    }));

    const result = await scoreWireframeFidelity('venture-123', { threshold: 90 });
    // avg of 85,80,90,88 = 85.75 → rounds to 86, below 90
    expect(result.screens[0].status).toBe('fail');
    expect(result.screens[0].threshold).toBe(90);
  });
});
