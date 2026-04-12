/**
 * Unit tests for iterateUntilPass in lib/eva/qa/stitch-wireframe-qa.js
 * SD-WIREFRAME-FIDELITY-VERIFICATION-VISION-ORCH-001-B
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  iterateUntilPass,
  buildQAFeedbackPrompt,
  setAnthropicClientLoader,
  setSupabaseClientLoader,
} = await import('../../../../lib/eva/qa/stitch-wireframe-qa.js');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeVisionResponse(scores = {}) {
  const defaults = {
    component_presence: { score: 85, findings: ['All present'], missing_elements: [] },
    layout_fidelity: { score: 80, findings: ['Aligned'], layout_issues: [] },
    navigation_accuracy: { score: 90, findings: ['Nav OK'], missing_nav: [] },
    purpose_match: { score: 88, findings: ['Aligned'] },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify({ ...defaults, ...scores }) }],
    usage: { input_tokens: 2000, output_tokens: 600 },
  };
}

function makeFailResponse() {
  return makeVisionResponse({
    component_presence: { score: 40, findings: ['Missing sidebar'], missing_elements: ['sidebar', 'footer'] },
    layout_fidelity: { score: 50, findings: ['Displaced'], layout_issues: ['header not at top'] },
    navigation_accuracy: { score: 60, findings: ['Missing nav'], missing_nav: ['main nav'] },
    purpose_match: { score: 55, findings: ['Mismatch'] },
  });
}

function makeImprovedResponse() {
  return makeVisionResponse({
    component_presence: { score: 75, findings: ['Sidebar added'], missing_elements: [] },
    layout_fidelity: { score: 72, findings: ['Better'], layout_issues: [] },
    navigation_accuracy: { score: 78, findings: ['Nav improved'], missing_nav: [] },
    purpose_match: { score: 70, findings: ['Better aligned'] },
  });
}

function makeSupabaseMock({
  wireframes = [{ name: 'Home', content: 'Home wireframe' }],
  screens = [{ screen_id: 'home-001', title: 'Home', base64: 'base64png' }],
} = {}) {
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
          return Promise.resolve({ data: { metadata: { wireframes }, content: null }, error: null });
        }
        if (type === 'stitch_design_export') {
          return Promise.resolve({ data: { metadata: { screens } }, error: null });
        }
        if (type === 'stitch_qa_report') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      insert: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'art-id' }, error: null }),
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
// Tests: buildQAFeedbackPrompt
// -------------------------------------------------------------------------

describe('buildQAFeedbackPrompt', () => {
  it('includes missing elements in feedback', () => {
    const result = buildQAFeedbackPrompt({
      missing_elements: ['sidebar', 'footer'],
      layout_issues: [],
      missing_nav: [],
      dimensions: { purpose_match: { score: 80, findings: [] } },
    });
    expect(result).toContain('sidebar');
    expect(result).toContain('footer');
    expect(result).toContain('REQUIRED ADDITIONS');
  });

  it('includes layout issues in feedback', () => {
    const result = buildQAFeedbackPrompt({
      missing_elements: [],
      layout_issues: ['header not at top'],
      missing_nav: [],
      dimensions: { purpose_match: { score: 80, findings: [] } },
    });
    expect(result).toContain('header not at top');
    expect(result).toContain('LAYOUT FIXES');
  });

  it('includes navigation fixes in feedback', () => {
    const result = buildQAFeedbackPrompt({
      missing_elements: [],
      layout_issues: [],
      missing_nav: ['main nav'],
      dimensions: { purpose_match: { score: 80, findings: [] } },
    });
    expect(result).toContain('main nav');
    expect(result).toContain('NAVIGATION FIXES');
  });

  it('returns general improvement when no specific issues', () => {
    const result = buildQAFeedbackPrompt({
      missing_elements: [],
      layout_issues: [],
      missing_nav: [],
      dimensions: { purpose_match: { score: 80, findings: [] } },
    });
    expect(result).toContain('GENERAL IMPROVEMENT');
  });
});

// -------------------------------------------------------------------------
// Tests: iterateUntilPass
// -------------------------------------------------------------------------

describe('iterateUntilPass', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { setAnthropicClientLoader(null); setSupabaseClientLoader(null); });

  it('returns immediately when all screens pass on first scoring', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeVisionResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());
    const regen = vi.fn();

    const result = await iterateUntilPass('v-123', { regenerateScreen: regen });

    expect(result.status).toBe('completed');
    expect(regen).not.toHaveBeenCalled();
  });

  it('re-generates failing screens and re-scores', async () => {
    // First call: fail. Second call (after regen): pass.
    const anthropic = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce(makeFailResponse())    // initial scoring - fail
          .mockResolvedValueOnce(makeImprovedResponse()) // re-score - pass
          .mockResolvedValueOnce(makeImprovedResponse()) // final score
      },
    };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());
    const regen = vi.fn().mockResolvedValue(undefined);

    const result = await iterateUntilPass('v-123', { regenerateScreen: regen });

    expect(result.status).toBe('completed');
    expect(regen).toHaveBeenCalledTimes(1);
    expect(regen.mock.calls[0][0]).toBe('home-001');
    // Feedback should mention missing elements
    expect(regen.mock.calls[0][1]).toContain('sidebar');
  });

  it('stops at max iterations even if still failing', async () => {
    const anthropic = {
      messages: { create: vi.fn().mockResolvedValue(makeFailResponse()) },
    };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());
    const regen = vi.fn().mockResolvedValue(undefined);

    const result = await iterateUntilPass('v-123', {
      regenerateScreen: regen,
      maxIterations: 2,
    });

    expect(result.status).toBe('completed');
    // Should have called regen once (iteration 2, since initial is iteration 1)
    expect(regen).toHaveBeenCalledTimes(1);
  });

  it('handles regen errors without crashing', async () => {
    const anthropic = {
      messages: { create: vi.fn().mockResolvedValue(makeFailResponse()) },
    };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());
    const regen = vi.fn().mockRejectedValue(new Error('Stitch API down'));

    const result = await iterateUntilPass('v-123', { regenerateScreen: regen });

    expect(result.status).toBe('completed');
    // Should still return a result despite regen failure
    expect(result.screens).toHaveLength(1);
  });

  it('skips iteration when no regenerateScreen function provided', async () => {
    const anthropic = { messages: { create: vi.fn().mockResolvedValue(makeFailResponse()) } };
    setAnthropicClientLoader(() => anthropic);
    setSupabaseClientLoader(() => makeSupabaseMock());

    const result = await iterateUntilPass('v-123');

    expect(result.status).toBe('completed');
    // Without regen function, returns initial result directly
    expect(result.screens[0].status).toBe('fail');
  });
});
