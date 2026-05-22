/**
 * Unit tests — Stage 16 Positioning Brief (Concern A).
 * SD-LEO-FEAT-VENTURE-GROUNDED-STAGE-001
 *
 * Covers the PURE, offline functions only — no live DB, no LLM network calls:
 *   - resolvePositioningInputs: all inputs present; missing optionals (graceful);
 *     flat type-keyed map AND the EVA __byType wrapper shapes.
 *   - buildPositioningContext: includes grounded sections; degrades gracefully
 *     on missing fields (emits "(not available)" markers, never throws).
 *   - Output contract shape: coercePositioningBrief / buildFallbackBrief produce
 *     the exact cross-repo contract { positioning_statement, tagline,
 *     hero_headline, brand_voice:{tone,attributes[]}, key_messages[] }.
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-16-positioning-brief.test
 */

import { describe, it, expect } from 'vitest';

// NOTE: Importing the module under test pulls in lib/llm + parse-json at module
// load, but we ONLY exercise the pure functions here — no client.complete() is
// ever invoked, so no network mock is required for these deterministic tests.
import {
  resolvePositioningInputs,
  buildPositioningContext,
  buildFallbackBrief,
  coercePositioningBrief,
  collectUpstreamByType,
  POSITIONING_UPSTREAM_ARTIFACT_TYPES,
  KEY_MESSAGE_MAX,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-16-positioning-brief.js';

// ── Fixtures ─────────────────────────────────────────────────────────

/** A flat artifact_type-keyed upstream map with ALL grounding inputs present. */
function fullFlatUpstream() {
  return {
    ventureName: 'NicheMetrics',
    truth_idea_brief: { description: 'Analytics for niche markets', problemStatement: 'Hard to size niches' },
    identity_persona_brand: {
      primary_persona: { name: 'Founder Fran', pain_points: ['no time', 'no data'] },
      personas: [{ name: 'Founder Fran' }, { name: 'Analyst Avi' }],
    },
    identity_brand_guidelines: { voice: 'confident, plain-spoken', pillars: ['clarity', 'speed'] },
    identity_naming_visual: { brand_name: 'NicheMetrics', tagline: 'See your niche clearly' },
    identity_brand_name: { name: 'NicheMetrics', rationale: 'descriptive + memorable' },
    engine_pricing_model: { tiers: [{ name: 'Pro', price: 49 }] },
    identity_gtm_sales_strategy: { channels: ['content', 'PLG'], positioning: 'self-serve analytics' },
    wireframe_screens: { screens: [{ name: 'Landing', surface: 'marketing' }] },
  };
}

// ── collectUpstreamByType ────────────────────────────────────────────

describe('collectUpstreamByType', () => {
  it('absorbs a flat type-keyed map', () => {
    const byType = collectUpstreamByType(fullFlatUpstream());
    expect(byType.identity_persona_brand).toBeTruthy();
    expect(byType.engine_pricing_model).toBeTruthy();
  });

  it('absorbs the EVA stageN __byType wrapper shape', () => {
    const upstream = {
      stage10Data: {
        __byType: {
          identity_persona_brand: { artifact_data: { name: 'Builder' } },
          identity_brand_guidelines: { artifact_data: { voice: 'casual' } },
        },
      },
      stage7Data: { __byType: { engine_pricing_model: { content: { tiers: [] } } } },
    };
    const byType = collectUpstreamByType(upstream);
    // unwrapArtifact pulls .artifact_data / .content out.
    expect(byType.identity_persona_brand).toEqual({ name: 'Builder' });
    expect(byType.identity_brand_guidelines).toEqual({ voice: 'casual' });
    expect(byType.engine_pricing_model).toEqual({ tiers: [] });
  });

  it('returns {} for null/invalid input', () => {
    expect(collectUpstreamByType(null)).toEqual({});
    expect(collectUpstreamByType(undefined)).toEqual({});
    expect(collectUpstreamByType('nope')).toEqual({});
  });
});

// ── resolvePositioningInputs ─────────────────────────────────────────

describe('resolvePositioningInputs — all inputs present', () => {
  it('pulls venture name, persona, brand, pricing, GTM, wireframes', () => {
    const inputs = resolvePositioningInputs(fullFlatUpstream());

    expect(inputs.ventureName).toBe('NicheMetrics');
    expect(inputs.personaName).toBe('Founder Fran');
    expect(inputs.personaNames).toEqual(['Founder Fran', 'Analyst Avi']);
    expect(inputs.brandGuidelines).toBeTruthy();
    expect(inputs.namingVisual).toBeTruthy();
    expect(inputs.brandName).toBeTruthy();
    expect(inputs.pricing).toBeTruthy();
    expect(inputs.gtm).toBeTruthy();
    expect(inputs.wireframes).toBeTruthy();
    expect(inputs.ideaBrief).toBeTruthy();
    // availableTypes should list every grounding type present.
    expect(inputs.availableTypes.length).toBe(POSITIONING_UPSTREAM_ARTIFACT_TYPES.length);
  });

  it('derives venture name from naming/brand artifacts when not passed explicitly', () => {
    const up = fullFlatUpstream();
    delete up.ventureName;
    const inputs = resolvePositioningInputs(up);
    // identity_brand_name.name wins, falls back to naming_visual.brand_name.
    expect(inputs.ventureName).toBe('NicheMetrics');
  });
});

describe('resolvePositioningInputs — missing optional inputs (graceful)', () => {
  it('returns nulls / empty arrays instead of throwing when upstream is empty', () => {
    const inputs = resolvePositioningInputs({});
    expect(inputs.ventureName).toBeNull();
    expect(inputs.persona).toBeNull();
    expect(inputs.personaName).toBeNull();
    expect(inputs.personaNames).toEqual([]);
    expect(inputs.pricing).toBeNull();
    expect(inputs.gtm).toBeNull();
    expect(inputs.wireframes).toBeNull();
    expect(inputs.availableTypes).toEqual([]);
  });

  it('handles null/undefined upstream without throwing', () => {
    expect(() => resolvePositioningInputs(null)).not.toThrow();
    expect(() => resolvePositioningInputs(undefined)).not.toThrow();
    const inputs = resolvePositioningInputs(null);
    expect(inputs.availableTypes).toEqual([]);
  });

  it('resolves a partial upstream (persona + name only)', () => {
    const inputs = resolvePositioningInputs({
      ventureName: 'Acme',
      identity_persona_brand: { name: 'Solo Sam' },
    });
    expect(inputs.ventureName).toBe('Acme');
    expect(inputs.personaName).toBe('Solo Sam');
    expect(inputs.availableTypes).toEqual(['identity_persona_brand']);
  });
});

// ── buildPositioningContext ──────────────────────────────────────────

describe('buildPositioningContext', () => {
  it('includes grounded sections when inputs are present', () => {
    const ctx = buildPositioningContext(resolvePositioningInputs(fullFlatUpstream()));
    expect(ctx).toContain('## Venture: NicheMetrics');
    expect(ctx).toContain('## Primary Persona: Founder Fran');
    expect(ctx).toContain('Brand Guidelines');
    expect(ctx).toContain('GTM Strategy');
    expect(ctx).toContain('Pricing Model');
    expect(ctx).toContain(`Available Upstream Data: ${POSITIONING_UPSTREAM_ARTIFACT_TYPES.length}/${POSITIONING_UPSTREAM_ARTIFACT_TYPES.length}`);
    expect(ctx).toContain('Generate the complete positioning brief JSON now.');
  });

  it('degrades gracefully on missing fields (emits "(not available)" markers, never throws)', () => {
    const ctx = buildPositioningContext(resolvePositioningInputs({}));
    expect(ctx).toContain('## Venture: Unknown Venture');
    expect(ctx).toContain('## Primary Persona: (not available)');
    expect(ctx).toContain('Pricing Model (S7): (not available)');
    expect(ctx).toContain('Available Upstream Data: 0/');
    // Limited-data warning fires below threshold.
    expect(ctx).toContain('⚠️ Limited upstream data');
  });

  it('does not throw on null/garbage inputs', () => {
    expect(() => buildPositioningContext(null)).not.toThrow();
    expect(() => buildPositioningContext('garbage')).not.toThrow();
    expect(buildPositioningContext(null)).toContain('Unknown Venture');
  });
});

// ── Output contract shape ────────────────────────────────────────────

/** Assert an object satisfies the cross-repo positioning-brief contract. */
function expectContractShape(brief) {
  expect(typeof brief.positioning_statement).toBe('string');
  expect(brief.positioning_statement.length).toBeGreaterThan(0);
  expect(typeof brief.tagline).toBe('string');
  expect(typeof brief.hero_headline).toBe('string');
  expect(brief.brand_voice).toBeTruthy();
  expect(typeof brief.brand_voice.tone).toBe('string');
  expect(Array.isArray(brief.brand_voice.attributes)).toBe(true);
  expect(Array.isArray(brief.key_messages)).toBe(true);
  expect(brief.key_messages.length).toBeGreaterThanOrEqual(1);
  // hero_subhead and per_persona_angles are optional.
  if ('hero_subhead' in brief) expect(typeof brief.hero_subhead).toBe('string');
  if ('per_persona_angles' in brief) {
    expect(Array.isArray(brief.per_persona_angles)).toBe(true);
    for (const a of brief.per_persona_angles) {
      expect(typeof a.persona).toBe('string');
      expect(typeof a.angle).toBe('string');
    }
  }
}

describe('buildFallbackBrief — contract shape', () => {
  it('produces a contract-shaped brief from full inputs', () => {
    const brief = buildFallbackBrief(resolvePositioningInputs(fullFlatUpstream()));
    expectContractShape(brief);
    expect(brief.tagline).toContain('NicheMetrics');
    expect(brief.per_persona_angles[0].persona).toBe('Founder Fran');
  });

  it('produces a contract-shaped brief from empty inputs (no persona angle)', () => {
    const brief = buildFallbackBrief(resolvePositioningInputs({}));
    expectContractShape(brief);
    // No persona → empty per_persona_angles array.
    expect(brief.per_persona_angles).toEqual([]);
  });

  it('does not throw on null inputs', () => {
    expect(() => buildFallbackBrief(null)).not.toThrow();
    expectContractShape(buildFallbackBrief(null));
  });
});

describe('coercePositioningBrief — contract shape + normalization', () => {
  const inputs = resolvePositioningInputs(fullFlatUpstream());

  it('passes through a well-formed LLM payload, dropping unknown fields', () => {
    const parsed = {
      positioning_statement: 'For founders who need niche data fast, NicheMetrics is the analytics layer that sizes any market in minutes.',
      tagline: 'See your niche clearly',
      hero_headline: 'Size any market in minutes',
      hero_subhead: 'Niche analytics without the spreadsheet grind',
      brand_voice: { tone: 'confident', attributes: ['clear', 'fast'] },
      key_messages: ['Sized in minutes', 'No spreadsheets', 'Built for founders'],
      per_persona_angles: [{ persona: 'Founder Fran', angle: 'Validate before you build' }],
      unexpected_field: 'should be dropped',
    };
    const brief = coercePositioningBrief(parsed, inputs);
    expectContractShape(brief);
    expect(brief.tagline).toBe('See your niche clearly');
    expect(brief.hero_subhead).toBe('Niche analytics without the spreadsheet grind');
    expect(brief).not.toHaveProperty('unexpected_field');
  });

  it('clamps key_messages to the contract maximum', () => {
    const parsed = {
      positioning_statement: 'x',
      tagline: 't',
      hero_headline: 'h',
      brand_voice: { tone: 'c', attributes: ['a'] },
      key_messages: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
    };
    const brief = coercePositioningBrief(parsed, inputs);
    expect(brief.key_messages.length).toBe(KEY_MESSAGE_MAX);
  });

  it('falls back to a contract-shaped brief on null/garbage payload', () => {
    expectContractShape(coercePositioningBrief(null, inputs));
    expectContractShape(coercePositioningBrief('garbage', inputs));
    expectContractShape(coercePositioningBrief(42, inputs));
  });

  it('repairs a payload with missing brand_voice / empty key_messages', () => {
    const brief = coercePositioningBrief(
      { positioning_statement: 'p', tagline: 't', hero_headline: 'h', key_messages: [] },
      inputs,
    );
    expectContractShape(brief);
    // Empty key_messages → fallback messages substituted.
    expect(brief.key_messages.length).toBeGreaterThanOrEqual(1);
    expect(brief.brand_voice.attributes.length).toBeGreaterThanOrEqual(1);
  });

  it('omits hero_subhead and per_persona_angles when not provided/meaningful', () => {
    const brief = coercePositioningBrief(
      { positioning_statement: 'p', tagline: 't', hero_headline: 'h', brand_voice: { tone: 'c', attributes: ['a'] }, key_messages: ['m'] },
      inputs,
    );
    expect(brief).not.toHaveProperty('hero_subhead');
    expect(brief).not.toHaveProperty('per_persona_angles');
  });
});
