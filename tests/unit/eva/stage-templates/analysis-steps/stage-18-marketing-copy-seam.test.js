/**
 * Unit tests for Stage 18 Marketing Copy — Seam B (postGenerationHook).
 * SD-EHG-AI-GEN-GUARDRAILS-001 / Sub-PR #4c
 *
 * Verifies the integration seam through which the EHG repo's
 * lib/ai-guardrails/ orchestrator is invoked. The seam itself does NOT
 * import EHG code — that's the EVA stage runner's job to inject.
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-18-marketing-copy-seam.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const validCopy = {
  tagline: { text: 'Original tagline', persona_target: 'Builder' },
  app_store_desc: { text: 'desc', persona_target: 'Builder' },
  landing_hero: { headline: 'Original headline', subheadline: 'sub', cta_text: 'Go', persona_target: 'Builder' },
  email_welcome: { subject: 's', body: 'b', persona_target: 'Builder' },
  email_onboarding: { subject: 's', body: 'b', persona_target: 'Builder' },
  email_reengagement: { subject: 's', body: 'b', persona_target: 'Builder' },
  social_posts: { twitter: 't', linkedin: 'l', instagram: 'i', facebook: 'f', product_hunt: 'p', persona_target: 'Builder' },
  seo_meta: { title: 't', description: 'd', keywords: ['k'], persona_target: 'Builder' },
  blog_draft: { title: 't', intro: 'i', sections: ['a'], conclusion: 'c', persona_target: 'Builder' },
};

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(async () => JSON.stringify(validCopy)),
  })),
}));

vi.mock('../../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((x) => (typeof x === 'string' ? JSON.parse(x) : x)),
  extractUsage: vi.fn(() => ({ tokens: 100 })),
}));

import {
  analyzeStage18MarketingCopy,
  noopPostGenerationHook,
  defaultPostGenerationHook,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js';

const baseParams = () => ({
  ventureName: 'Acme',
  ventureId: 'ven-001',
  stage10Data: { primary_persona: { name: 'Builder' } },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
});

describe('stage-18 Seam B / noopPostGenerationHook', () => {
  it('passes content through unchanged with zero violations', async () => {
    const r = await noopPostGenerationHook({ content: validCopy });
    expect(r.content).toBe(validCopy);
    expect(r.violations).toEqual([]);
  });

  it('is exported as defaultPostGenerationHook alias', () => {
    expect(defaultPostGenerationHook).toBe(noopPostGenerationHook);
  });
});

describe('stage-18 Seam B / analyzeStage18MarketingCopy hook integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default behavior (no hook) emits zero guardrail violations', async () => {
    const result = await analyzeStage18MarketingCopy(baseParams());
    expect(result.metadata.guardrail_violations).toEqual([]);
    expect(result.metadata.guardrail_blocked_by).toBeUndefined();
    expect(result.guardrailViolationCount).toBe(0);
  });

  it('invokes injected postGenerationHook with content + ventureName + ventureId', async () => {
    const hook = vi.fn(async (input) => ({ content: input.content, violations: [] }));
    await analyzeStage18MarketingCopy({ ...baseParams(), postGenerationHook: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    const callArg = hook.mock.calls[0][0];
    expect(callArg.ventureName).toBe('Acme');
    expect(callArg.ventureId).toBe('ven-001');
    expect(callArg.content).toBeDefined();
    expect(callArg.content.tagline).toBeDefined();
  });

  it('propagates violations from hook into result.metadata', async () => {
    const hook = async (input) => ({
      content: input.content,
      violations: [
        { layer: 'pii', severity: 'warning', metadata: { token_type: 'email' } },
        { layer: 'claim', severity: 'error', metadata: { category: 'medical' } },
      ],
    });
    const result = await analyzeStage18MarketingCopy({ ...baseParams(), postGenerationHook: hook });
    expect(result.metadata.guardrail_violations).toHaveLength(2);
    expect(result.guardrailViolationCount).toBe(2);
  });

  it('propagates blockedBy when hook flags a layer', async () => {
    const hook = async (input) => ({
      content: input.content,
      violations: [{ layer: 'claim', severity: 'error', metadata: {} }],
      blockedBy: 'claim',
    });
    const result = await analyzeStage18MarketingCopy({ ...baseParams(), postGenerationHook: hook });
    expect(result.metadata.guardrail_blocked_by).toBe('claim');
  });

  it('replaces copyOutput when hook returns transformed content (PII redaction case)', async () => {
    const redacted = { ...validCopy, tagline: { text: '[REDACTED:EMAIL] tagline', persona_target: 'Builder' } };
    const hook = async () => ({ content: redacted, violations: [] });
    const result = await analyzeStage18MarketingCopy({ ...baseParams(), postGenerationHook: hook });
    expect(result.tagline.text).toContain('[REDACTED:EMAIL]');
  });

  it('partial-audit semantics: hook exception does NOT abort generation', async () => {
    const params = baseParams();
    const hook = async () => {
      throw new Error('orchestrator unreachable');
    };
    const result = await analyzeStage18MarketingCopy({ ...params, postGenerationHook: hook });
    expect(result).toBeDefined();
    expect(result.tagline).toBeDefined();
    expect(result.metadata.guardrail_violations).toEqual([]);
    expect(params.logger.warn).toHaveBeenCalled();
  });

  it('hook returning null does not corrupt result', async () => {
    const hook = async () => null;
    const result = await analyzeStage18MarketingCopy({ ...baseParams(), postGenerationHook: hook });
    expect(result.tagline).toBeDefined();
    expect(result.metadata.guardrail_violations).toEqual([]);
  });
});
