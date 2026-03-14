import { describe, it, expect } from 'vitest';
import {
  scoreLayout,
  scoreVisualComposition,
  scoreDesignSystem,
  scoreInteractionPatterns,
  scoreTechnicalImplementation,
  scoreAccessibility,
  runQualityCheck,
  formatResult,
} from '../../scripts/eva/srip/quality-check.mjs';

describe('srip-quality-check', () => {
  describe('scoreLayout', () => {
    it('returns 100 for complete layout data', () => {
      const dna = { layout: { grid: '12-col', breakpoints: [768, 1024] } };
      const synthesis = { sections: [{ title: 'LAYOUT' }] };
      expect(scoreLayout(dna, synthesis).score).toBe(100);
    });

    it('penalizes missing grid', () => {
      const result = scoreLayout({}, {});
      expect(result.score).toBeLessThan(100);
      expect(result.gaps).toContain('No grid/column structure defined in Site DNA');
    });

    it('penalizes missing breakpoints', () => {
      const dna = { layout: { grid: '12-col' } };
      const result = scoreLayout(dna, {});
      expect(result.gaps).toContain('No responsive breakpoints defined');
    });

    it('handles null/undefined gracefully', () => {
      const result = scoreLayout(null, null);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('scoreVisualComposition', () => {
    it('penalizes missing hero pattern', () => {
      const result = scoreVisualComposition({}, {});
      expect(result.gaps).toContain('No hero pattern defined');
    });

    it('returns high score with complete visual data', () => {
      const dna = {
        visual_composition: { hero_pattern: 'full-width', imagery_style: 'photography', color_usage: 'brand-primary' }
      };
      expect(scoreVisualComposition(dna, {}).score).toBe(100);
    });
  });

  describe('scoreDesignSystem', () => {
    it('penalizes insufficient color tokens', () => {
      const dna = { design_tokens: { colors: { primary: '#000' } } };
      const result = scoreDesignSystem(dna, {});
      expect(result.gaps).toContain('Insufficient color tokens (need at least 2)');
    });

    it('returns 100 for complete design tokens', () => {
      const dna = {
        design_tokens: {
          colors: { primary: '#000', secondary: '#666', bg: '#fff' },
          typography: { font_family: 'Inter' },
          spacing: ['4px', '8px', '16px', '24px'],
        }
      };
      const synthesis = { sections: [{ title: 'DESIGN_SYSTEM' }] };
      expect(scoreDesignSystem(dna, synthesis).score).toBe(100);
    });
  });

  describe('scoreInteractionPatterns', () => {
    it('penalizes missing navigation', () => {
      const result = scoreInteractionPatterns({}, {});
      expect(result.gaps).toContain('No navigation pattern defined');
    });
  });

  describe('scoreTechnicalImplementation', () => {
    it('penalizes missing framework', () => {
      const result = scoreTechnicalImplementation({}, {});
      expect(result.gaps).toContain('No framework/stack specified');
    });

    it('returns 100 with complete tech data', () => {
      const dna = { technical: { framework: 'React', component_naming: 'PascalCase' } };
      const synthesis = { metadata: { target_framework: 'React' } };
      expect(scoreTechnicalImplementation(dna, synthesis).score).toBe(100);
    });
  });

  describe('scoreAccessibility', () => {
    it('penalizes missing ARIA patterns', () => {
      const result = scoreAccessibility({}, {});
      expect(result.gaps).toContain('No ARIA/landmark patterns defined');
    });

    it('penalizes missing contrast requirements', () => {
      const result = scoreAccessibility({}, {});
      expect(result.gaps).toContain('No color contrast requirements');
    });
  });

  describe('runQualityCheck', () => {
    it('returns all 6 domain scores', () => {
      const result = runQualityCheck({}, {});
      expect(Object.keys(result.domain_scores)).toHaveLength(6);
    });

    it('returns overall score as weighted average', () => {
      const result = runQualityCheck({}, {});
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(100);
    });

    it('returns eligible=false for empty data', () => {
      const result = runQualityCheck({}, {});
      expect(result.eligible).toBe(false);
    });

    it('returns eligible=true for complete data', () => {
      const dna = {
        layout: { grid: '12-col', breakpoints: [768] },
        visual_composition: { hero_pattern: 'full', imagery_style: 'photo', color_usage: 'brand' },
        design_tokens: {
          colors: { primary: '#000', secondary: '#666', bg: '#fff' },
          typography: { font_family: 'Inter' },
          spacing: ['4px', '8px', '16px', '24px'],
        },
        interaction_patterns: { navigation: 'top-bar', cta_style: 'rounded', forms: 'standard' },
        technical: { framework: 'React', component_naming: 'PascalCase' },
        accessibility: { aria_patterns: true, color_contrast: 'AA', semantic_html: true },
      };
      const synthesis = {
        sections: [{ title: 'LAYOUT' }, { title: 'DESIGN_SYSTEM' }],
        metadata: { target_framework: 'React' },
      };
      const result = runQualityCheck(dna, synthesis);
      expect(result.eligible).toBe(true);
      expect(result.overall_score).toBeGreaterThanOrEqual(70);
    });

    it('returns gaps for each domain', () => {
      const result = runQualityCheck({}, {});
      expect(Object.keys(result.gaps)).toHaveLength(6);
    });
  });

  describe('formatResult', () => {
    it('formats passing result', () => {
      const result = {
        overall_score: 85,
        eligible: true,
        domain_scores: {
          layout: 90, visual_composition: 80, design_system: 85,
          interaction_patterns: 80, technical_implementation: 90, accessibility: 85,
        },
        gaps: { layout: [], visual_composition: [], design_system: [], interaction_patterns: [], technical_implementation: [], accessibility: [] },
      };
      const output = formatResult(result);
      expect(output).toContain('85/100');
      expect(output).toContain('PASS');
    });

    it('formats failing result with gaps', () => {
      const result = {
        overall_score: 50,
        eligible: false,
        domain_scores: {
          layout: 40, visual_composition: 50, design_system: 60,
          interaction_patterns: 50, technical_implementation: 40, accessibility: 50,
        },
        gaps: { layout: ['Missing grid'], visual_composition: [], design_system: [], interaction_patterns: [], technical_implementation: [], accessibility: [] },
      };
      const output = formatResult(result);
      expect(output).toContain('BELOW THRESHOLD');
      expect(output).toContain('Missing grid');
    });
  });
});
