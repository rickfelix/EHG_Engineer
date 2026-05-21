/**
 * Tests for Stage 18 Marketing Copy Studio worker auto-generation.
 * SD-LEO-FEAT-STAGE-MARKETING-COPY-001.
 *
 * Verifies the three fixes that let the autonomous EVA worker produce grounded,
 * distinctly-persisted marketing copy at Stage 18 (instead of throwing
 * "No artifact type configured for stage 18"):
 *   1. ARTIFACT_TYPE_BY_STAGE[18] registers the 9 marketing_<section> types + reverse lookup.
 *   2. CROSS_STAGE_DEPS[18] points at the brand/persona/pricing upstream the copy needs.
 *   3. The analysisStep wrapper projects the flat copy result into the typed-array form.
 */
import { describe, test, expect, vi } from 'vitest';

// Mock the LLM-backed flat generator so the wrapper projection is tested deterministically.
vi.mock('../stage-templates/analysis-steps/stage-18-marketing-copy.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    analyzeStage18MarketingCopy: vi.fn(async () => ({
      tagline: { text: 'Tag' },
      app_store_desc: { text: 'Desc' },
      landing_hero: { headline: 'Hero' },
      email_welcome: { subject: 'W', body: 'b' },
      email_onboarding: { subject: 'O', body: 'b' },
      email_reengagement: { subject: 'R', body: 'b' },
      social_posts: { twitter: 'x' },
      seo_meta: { title: 't', description: 'd' },
      blog_draft: { title: 'B' },
      usage: { inputTokens: 10, outputTokens: 20 },
      metadata: { persona_name: 'Indie Hacker' },
    })),
  };
});

import { analyzeStage18MarketingCopyStep } from '../stage-templates/stage-18.js';
import { COPY_SECTIONS } from '../stage-templates/analysis-steps/stage-18-marketing-copy.js';
import { ARTIFACT_TYPE_BY_STAGE, getStageForArtifactType } from '../artifact-types.js';
import { CROSS_STAGE_DEPS } from '../contracts/stage-contracts.js';

const EXPECTED_TYPES = COPY_SECTIONS.map((s) => `marketing_${s}`);

describe('Stage 18 registry (SD-LEO-FEAT-STAGE-MARKETING-COPY-001)', () => {
  test('ARTIFACT_TYPE_BY_STAGE[18] registers exactly the 9 marketing_<section> types', () => {
    expect(ARTIFACT_TYPE_BY_STAGE[18]).toEqual(EXPECTED_TYPES);
    expect(ARTIFACT_TYPE_BY_STAGE[18]).toHaveLength(9);
  });

  test('reverse lookup maps each marketing_<section> type back to stage 18', () => {
    for (const type of EXPECTED_TYPES) {
      expect(getStageForArtifactType(type)).toBe(18);
    }
  });
});

describe('Stage 18 cross-stage dependencies', () => {
  test('CROSS_STAGE_DEPS[18] includes the brand/persona/pricing/GTM upstreams the copy is grounded in', () => {
    // analyzeStage18MarketingCopy consumes stage{1,4,7,8,10,11,12,13,15,16}Data.
    for (const stage of [1, 4, 7, 8, 10, 11, 12, 13, 15, 16]) {
      expect(CROSS_STAGE_DEPS[18]).toContain(stage);
    }
  });
});

describe('analyzeStage18MarketingCopyStep — typed-array projection', () => {
  test('returns 9 distinct marketing_<section> artifacts matching COPY_SECTIONS', async () => {
    const result = await analyzeStage18MarketingCopyStep({ ventureName: 'NicheMetrics' });
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(result.artifacts.map((a) => a.artifactType)).toEqual(EXPECTED_TYPES);
  });

  test('each artifact payload is the corresponding flat copy section', async () => {
    const result = await analyzeStage18MarketingCopyStep({ ventureName: 'NicheMetrics' });
    const byType = Object.fromEntries(result.artifacts.map((a) => [a.artifactType, a.payload]));
    expect(byType.marketing_tagline).toEqual({ text: 'Tag' });
    expect(byType.marketing_landing_hero).toEqual({ headline: 'Hero' });
    expect(byType.marketing_blog_draft).toEqual({ title: 'B' });
  });

  test('usage is surfaced for token accounting', async () => {
    const result = await analyzeStage18MarketingCopyStep({ ventureName: 'NicheMetrics' });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  test('worker writer and interactive route writer agree on the artifact-type set', () => {
    // server/routes/stage18.js writes `marketing_${section}` for the same COPY_SECTIONS;
    // the registry must match so there is no writer-consumer drift.
    expect(ARTIFACT_TYPE_BY_STAGE[18]).toEqual(EXPECTED_TYPES);
  });
});
