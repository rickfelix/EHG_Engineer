/**
 * Design Token Enrichment — Unit Tests
 * SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-B
 *
 * Tests the prompt template, validation utility, and enrichment logic.
 */

import { describe, it, expect } from 'vitest';
import { buildDesignTokenPrompt, DESIGN_DIMENSIONS } from '../../lib/eva/prompts/design-token-extraction.js';
import { validateDesignTokens } from '../../lib/eva/utils/validate-design-tokens.js';

// ---------------------------------------------------------------------------
// DESIGN_DIMENSIONS constant
// ---------------------------------------------------------------------------

describe('DESIGN_DIMENSIONS', () => {
  it('has exactly 7 dimensions', () => {
    expect(DESIGN_DIMENSIONS).toHaveLength(7);
  });

  it('includes all required dimensions', () => {
    const expected = [
      'color_strategy', 'typography_hierarchy', 'layout_pattern',
      'interaction_style', 'narrative_approach', 'spacing_system', 'visual_density',
    ];
    expect(DESIGN_DIMENSIONS).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// buildDesignTokenPrompt
// ---------------------------------------------------------------------------

describe('buildDesignTokenPrompt', () => {
  const sampleRef = {
    site_name: 'Stripe',
    description: 'Financial infrastructure for the internet',
    archetype_category: 'fintech',
    score_design: 8.5,
    score_usability: 9.0,
    score_creativity: 7.5,
    score_content: 8.0,
  };

  it('includes site name in prompt', () => {
    const prompt = buildDesignTokenPrompt(sampleRef);
    expect(prompt).toContain('Stripe');
  });

  it('includes archetype category', () => {
    const prompt = buildDesignTokenPrompt(sampleRef);
    expect(prompt).toContain('fintech');
  });

  it('includes all scores', () => {
    const prompt = buildDesignTokenPrompt(sampleRef);
    expect(prompt).toContain('design=8.5');
    expect(prompt).toContain('usability=9');
    expect(prompt).toContain('creativity=7.5');
    expect(prompt).toContain('content=8');
  });

  it('includes all 7 dimension names', () => {
    const prompt = buildDesignTokenPrompt(sampleRef);
    for (const dim of DESIGN_DIMENSIONS) {
      expect(prompt).toContain(dim);
    }
  });

  it('handles missing description gracefully', () => {
    const ref = { ...sampleRef, description: null };
    const prompt = buildDesignTokenPrompt(ref);
    expect(prompt).toContain('No description available');
  });

  it('requests JSON-only response', () => {
    const prompt = buildDesignTokenPrompt(sampleRef);
    expect(prompt).toContain('ONLY the JSON object');
  });
});

// ---------------------------------------------------------------------------
// validateDesignTokens
// ---------------------------------------------------------------------------

describe('validateDesignTokens', () => {
  const validTokens = {
    color_strategy: 'Dark mode with high contrast accents',
    typography_hierarchy: 'Inter font family, 4-level hierarchy',
    layout_pattern: 'Asymmetric grid with full-bleed sections',
    interaction_style: 'Subtle hover states, scroll-triggered animations',
    narrative_approach: 'Hero-first with progressive disclosure',
    spacing_system: 'Generous whitespace, 8px base unit',
    visual_density: 'Minimalist with focused content areas',
  };

  it('passes valid tokens', () => {
    const result = validateDesignTokens(validTokens);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.empty).toHaveLength(0);
  });

  it('fails on null input', () => {
    const result = validateDesignTokens(null);
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(7);
  });

  it('fails on undefined input', () => {
    const result = validateDesignTokens(undefined);
    expect(result.valid).toBe(false);
  });

  it('fails on non-object input', () => {
    const result = validateDesignTokens('not an object');
    expect(result.valid).toBe(false);
  });

  it('detects missing fields', () => {
    const partial = { ...validTokens };
    delete partial.color_strategy;
    delete partial.visual_density;
    const result = validateDesignTokens(partial);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['color_strategy', 'visual_density']);
  });

  it('detects empty string fields', () => {
    const withEmpty = { ...validTokens, spacing_system: '', visual_density: '   ' };
    const result = validateDesignTokens(withEmpty);
    expect(result.valid).toBe(false);
    expect(result.empty).toEqual(['spacing_system', 'visual_density']);
  });

  it('detects null field values', () => {
    const withNull = { ...validTokens, layout_pattern: null };
    const result = validateDesignTokens(withNull);
    expect(result.valid).toBe(false);
    expect(result.empty).toContain('layout_pattern');
  });

  it('passes with extra fields (non-strict)', () => {
    const extra = { ...validTokens, bonus_field: 'extra data' };
    const result = validateDesignTokens(extra);
    expect(result.valid).toBe(true);
  });
});
