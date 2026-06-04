/**
 * SD-FDBK-INFRA-VENTURE-BUILD-ENRICHMENT-001 — Vision-grounded enrichment.
 *
 * Deterministic tests for the pure prompt assembler (buildEnrichmentPrompt) and the
 * grounding formatter (formatVisionGrounding) extracted from enrichSDDescription.
 * These prove the active chairman-approved L2 vision is emitted FIRST as authoritative
 * with a prefer-vision-on-conflict instruction, that arch grounding is null-safe, and
 * that the no-grounding path is byte-identical to the pre-change behavior.
 *
 * Maps to PRD test_scenarios TS-1..TS-6 and FR-1/FR-3/FR-5/FR-6/FR-8.
 */
import { describe, it, expect } from 'vitest';
import { buildEnrichmentPrompt, formatVisionGrounding } from '../../../lib/eva/artifact-enrichment-pipeline.js';

const baseArgs = {
  sdTitle: 'Connections API',
  sdDescription: 'Build the data-source connections API for the venture.',
  sdLayer: 'api',
  artifactContext: '[REQUIRED] technical_architecture (Stage 14):\n  The build uses Supabase as the database and auth.\n  Tags: stack, supabase',
  ventureContext: { name: 'DataDistill' },
};

const replitVision = {
  vision_key: 'VIS-DD-002',
  version: 2,
  content: 'DataDistill is a SaaS product hosted on Replit.',
  dimensions: [
    { name: 'Deployment Model', weight: 0.3, description: 'Hosted SaaS on Replit Deployments (Autoscale); NOT Supabase, NOT a CLI.' },
    { name: 'Value Proposition', weight: 0.4, description: 'Automated data distillation for analysts.' },
  ],
  plan: {
    plan_key: 'PLAN-DD-002',
    dimensions: [{ name: 'Auth', weight: 0.5, description: 'Clerk auth on Replit; Replit Postgres for storage.' }],
    content: 'Architecture: TanStack Start + React 19 on Replit.',
  },
};

describe('formatVisionGrounding (FR-1, FR-8)', () => {
  it('returns null for null/undefined grounding', () => {
    expect(formatVisionGrounding(null)).toBeNull();
    expect(formatVisionGrounding(undefined)).toBeNull();
  });

  it('prefers extracted_dimensions as the primary signal (FR-1)', () => {
    const text = formatVisionGrounding(replitVision);
    expect(text).toContain('L2 Vision dimensions (VIS-DD-002)');
    expect(text).toContain('- Deployment Model: Hosted SaaS on Replit');
    // dimensions present -> freeform content is NOT used for the vision section
    expect(text).not.toContain('DataDistill is a SaaS product hosted on Replit.');
  });

  it('falls back to content when extracted_dimensions are null/empty (TS-6, FR-8)', () => {
    const text = formatVisionGrounding({ vision_key: 'VIS-X', dimensions: null, content: 'Vision prose fallback.', plan: null });
    expect(text).toContain('L2 Vision (VIS-X)');
    expect(text).toContain('Vision prose fallback.');
    const text2 = formatVisionGrounding({ vision_key: 'VIS-Y', dimensions: [], content: 'Empty-dims fallback.', plan: null });
    expect(text2).toContain('Empty-dims fallback.');
  });

  it('emits no architecture block when the plan is absent (TS-4, FR-8)', () => {
    const text = formatVisionGrounding({ ...replitVision, plan: null });
    expect(text).toContain('L2 Vision dimensions');
    expect(text).not.toContain('Architecture Plan');
  });

  it('emits no architecture block when the plan has neither dimensions nor content (TS-4)', () => {
    const text = formatVisionGrounding({ ...replitVision, plan: { plan_key: 'PLAN-EMPTY', dimensions: [], content: null } });
    expect(text).not.toContain('Architecture Plan');
  });

  it('returns null when nothing usable is present (no empty block)', () => {
    expect(formatVisionGrounding({ vision_key: 'V', dimensions: [], content: null, plan: null })).toBeNull();
  });
});

describe('buildEnrichmentPrompt — vision-grounded (TS-1, TS-2, TS-3)', () => {
  it('emits the vision/arch grounding block BEFORE the S0-S18 artifact context (TS-1)', () => {
    const prompt = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: replitVision });
    const groundingIdx = prompt.indexOf('Authoritative Vision & Architecture');
    const artifactIdx = prompt.indexOf('Upstream Artifact Context:');
    expect(groundingIdx).toBeGreaterThan(-1);
    expect(artifactIdx).toBeGreaterThan(-1);
    expect(groundingIdx).toBeLessThan(artifactIdx);
  });

  it('includes the prefer-vision-over-stage-artifacts-on-conflict instruction (TS-2)', () => {
    const prompt = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: replitVision });
    expect(prompt).toContain('0. CRITICAL');
    expect(prompt).toMatch(/PREFER the Vision\/Architecture and DISCARD the stale artifact/);
  });

  it('frames the active vision stack (Replit) as authoritative over a stale artifact (Supabase) (TS-3 — the witnessed bug)', () => {
    const prompt = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: replitVision });
    // Replit appears inside the authoritative grounding block, ahead of the stale Supabase artifact line
    const replitIdx = prompt.indexOf('Replit');
    const supabaseIdx = prompt.indexOf('Supabase as the database');
    expect(replitIdx).toBeGreaterThan(-1);
    expect(supabaseIdx).toBeGreaterThan(-1);
    expect(replitIdx).toBeLessThan(supabaseIdx);
    expect(prompt).toContain('Architecture Plan dimensions (PLAN-DD-002)');
  });
});

describe('buildEnrichmentPrompt — backward compatibility (TS-5, FR-5)', () => {
  it('produces no grounding block or conflict rule when grounding is absent', () => {
    const prompt = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: null });
    expect(prompt).not.toContain('Authoritative Vision & Architecture');
    expect(prompt).not.toContain('0. CRITICAL');
    // artifact context follows the original description block directly
    expect(prompt).toContain(`Original Description:\n${baseArgs.sdDescription}\n\nUpstream Artifact Context:`);
    expect(prompt).toContain('Generate an enriched SD description that:\n1. Preserves the original intent and scope');
  });

  it('is byte-identical whether grounding is null or reduces to null (empty dims, no content)', () => {
    const withNull = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: null });
    const withEmpty = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: { dimensions: [], content: null, plan: null } });
    expect(withEmpty).toBe(withNull);
  });

  it('preserves the JSON response contract in both modes', () => {
    for (const vg of [null, replitVision]) {
      const prompt = buildEnrichmentPrompt({ ...baseArgs, visionGrounding: vg });
      expect(prompt).toContain('"enriched_description": "..."');
      expect(prompt).toContain('"artifact_references"');
      expect(prompt).toContain('"extracted_context"');
    }
  });
});
