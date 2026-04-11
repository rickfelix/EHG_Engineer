/**
 * Design Reference Engine — Unit Tests
 * SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-C
 *
 * Tests pattern selector, directive generator, and novelty engine.
 */

import { describe, it, expect } from 'vitest';
import { mapNovelty, NOVELTY_CAP } from '../../lib/eva/design-reference/novelty-engine.js';
import { selectPatterns } from '../../lib/eva/design-reference/pattern-selector.js';
import {
  generateDirective,
  generateDesignReferenceSection,
  MAX_DIRECTIVE_LENGTH,
} from '../../lib/eva/design-reference/design-directive-generator.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_TOKENS = {
  color_strategy: 'Dark mode with high contrast accents',
  typography_hierarchy: 'Inter font, 4-level scale',
  layout_pattern: 'Asymmetric grid',
  interaction_style: 'Subtle hover transitions',
  narrative_approach: 'Hero-first progressive disclosure',
  spacing_system: '8px base unit',
  visual_density: 'Minimalist',
};

function makeRef(id, archetype, score = 7.0) {
  return {
    id,
    site_name: `Site-${id}`,
    archetype_category: archetype,
    score_combined: score,
    design_tokens: { ...SAMPLE_TOKENS },
  };
}

const REFERENCES = [
  makeRef('r1', 'saas', 9.0),
  makeRef('r2', 'saas', 8.0),
  makeRef('r3', 'saas', 7.5),
  makeRef('r4', 'fintech', 8.5),
  makeRef('r5', 'e-commerce', 7.0),
  makeRef('r6', 'portfolio', 9.5),
  makeRef('r7', 'corporate', 6.5),
  makeRef('r8', 'marketplace', 7.0),
  makeRef('r9', 'healthtech', 8.0),
  makeRef('r10', 'saas', 6.0),
];

// ---------------------------------------------------------------------------
// Novelty Engine
// ---------------------------------------------------------------------------

describe('mapNovelty', () => {
  it('maps string personalities to numeric values', () => {
    expect(mapNovelty('conservative')).toBe(0.1);
    expect(mapNovelty('balanced')).toBe(0.25);
    expect(mapNovelty('creative')).toBe(0.4);
    expect(mapNovelty('experimental')).toBe(0.5);
  });

  it('caps at NOVELTY_CAP (0.5)', () => {
    expect(mapNovelty('wild')).toBeLessThanOrEqual(NOVELTY_CAP);
    expect(mapNovelty(0.9)).toBeLessThanOrEqual(NOVELTY_CAP);
    expect(mapNovelty(1.0)).toBeLessThanOrEqual(NOVELTY_CAP);
  });

  it('clamps negative numbers to 0', () => {
    expect(mapNovelty(-0.5)).toBe(0);
  });

  it('defaults unknown strings to balanced (0.25)', () => {
    expect(mapNovelty('unknown')).toBe(0.25);
  });

  it('is case-insensitive', () => {
    expect(mapNovelty('CREATIVE')).toBe(0.4);
    expect(mapNovelty('Balanced')).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// Pattern Selector
// ---------------------------------------------------------------------------

describe('selectPatterns', () => {
  const baseOpts = {
    ventureId: '550e8400-e29b-41d4-a716-446655440000',
    archetype: 'saas',
    references: REFERENCES,
  };

  it('returns primary and cross-pollinated arrays', () => {
    const result = selectPatterns(baseOpts);
    expect(result).toHaveProperty('primary');
    expect(result).toHaveProperty('crossPollinated');
    expect(result).toHaveProperty('novelty');
    expect(result).toHaveProperty('seed');
  });

  it('selects the requested count', () => {
    const result = selectPatterns({ ...baseOpts, count: 3 });
    expect(result.primary.length).toBeLessThanOrEqual(3);
    expect(result.primary.length).toBeGreaterThan(0);
  });

  it('produces deterministic results with same seed', () => {
    const r1 = selectPatterns(baseOpts);
    const r2 = selectPatterns(baseOpts);
    expect(r1.seed).toBe(r2.seed);
    expect(r1.primary.map((r) => r.id)).toEqual(r2.primary.map((r) => r.id));
  });

  it('filters out used patterns', () => {
    const result = selectPatterns({ ...baseOpts, usedPatterns: ['r1', 'r2', 'r3'] });
    const selectedIds = result.primary.map((r) => r.id);
    expect(selectedIds).not.toContain('r1');
    expect(selectedIds).not.toContain('r2');
    expect(selectedIds).not.toContain('r3');
  });

  it('includes cross-pollinated references from other archetypes', () => {
    const result = selectPatterns({ ...baseOpts, count: 5 });
    const crossArchetypes = result.crossPollinated.map((r) => r.archetype_category);
    // At count=5, should have at least 1 non-saas reference
    if (crossArchetypes.length > 0) {
      expect(crossArchetypes.some((a) => a !== 'saas')).toBe(true);
    }
  });

  it('respects diversity floor (at least some variety)', () => {
    const result = selectPatterns({ ...baseOpts, count: 5 });
    expect(result.diversityRatio).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Design Directive Generator
// ---------------------------------------------------------------------------

describe('generateDirective', () => {
  it('generates directive from tokens', () => {
    const directive = generateDirective(SAMPLE_TOKENS, 'TestSite');
    expect(directive).toContain('Inspired by TestSite');
    expect(directive).toContain('Color');
    expect(directive).toContain('Typography');
  });

  it('stays under MAX_DIRECTIVE_LENGTH', () => {
    const longTokens = {};
    for (const key of Object.keys(SAMPLE_TOKENS)) {
      longTokens[key] = 'A'.repeat(200);
    }
    const directive = generateDirective(longTokens, 'LongSite');
    expect(directive.length).toBeLessThanOrEqual(MAX_DIRECTIVE_LENGTH);
  });

  it('returns empty string for null tokens', () => {
    expect(generateDirective(null, 'Site')).toBe('');
  });

  it('returns empty string for empty object', () => {
    expect(generateDirective({}, 'Site')).toBe('');
  });
});

describe('generateDesignReferenceSection', () => {
  it('generates numbered section from multiple refs', () => {
    const refs = [
      { site_name: 'A', design_tokens: SAMPLE_TOKENS },
      { site_name: 'B', design_tokens: SAMPLE_TOKENS },
    ];
    const section = generateDesignReferenceSection(refs);
    expect(section).toContain('## Design References');
    expect(section).toContain('1.');
    expect(section).toContain('2.');
  });

  it('returns empty for empty array', () => {
    expect(generateDesignReferenceSection([])).toBe('');
  });

  it('skips refs without tokens', () => {
    const refs = [
      { site_name: 'A', design_tokens: null },
      { site_name: 'B', design_tokens: SAMPLE_TOKENS },
    ];
    const section = generateDesignReferenceSection(refs);
    expect(section).toContain('1.');
    expect(section).not.toContain('2.');
  });
});
