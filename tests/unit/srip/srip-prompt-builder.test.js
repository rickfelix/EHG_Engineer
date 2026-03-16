import { describe, it, expect } from 'vitest';
import { buildSynthesisPrompt } from '../../../lib/eva/services/srip-prompt-builder.js';

const SAMPLE_DNA = {
  design_tokens: {
    colors: {
      primary: '#0066cc',
      secondary: '#333333',
      accent: '#ff6600',
      background: '#ffffff',
      text: '#333333',
      additional: ['#eeeeee'],
    },
    typography: {
      font_family: 'Inter',
      heading_font: 'Playfair Display',
      size_scale: ['14px', '16px', '18px', '24px', '32px', '48px'],
    },
    spacing: ['4px', '8px', '16px'],
    border_radius: ['8px'],
  },
  macro_architecture: {
    has_header: true,
    has_footer: true,
    has_main: true,
    grid_system: 'css-grid',
    responsive_approach: 'mobile-first',
    page_flow: 'multi-section',
    sections: [
      { tag: 'section', heading: 'Features', childCount: 4 },
    ],
  },
  copy_patterns: {
    headings: ['Build Better Products'],
    ctas: ['Start Free Trial'],
    word_count: 1500,
  },
  component_behaviors: {
    components: [
      { type: 'navigation', link_count: 6 },
      { type: 'hero', has_cta: true },
    ],
  },
  tech_stack: {
    framework: 'Next.js',
    css_approach: 'Tailwind',
    rendering: 'SSR',
  },
  source_url: 'https://example.com',
  extracted_at: '2026-03-15T00:00:00Z',
};

const SAMPLE_ANSWERS = {
  brand_personality: { question: 'Brand Personality', value: 'Modern, trustworthy', confirmed: true },
  primary_audience: { question: 'Primary Audience', value: 'B2B SaaS teams', confirmed: true },
  color_intent: { question: 'Color Intent', value: 'Trust and professionalism', confirmed: false },
  typography_style: { question: 'Typography Style', value: 'Clean sans-serif', confirmed: true },
  layout_philosophy: { question: 'Layout Philosophy', value: 'Structured sections', confirmed: false },
  visual_density: { question: 'Visual Density', value: 'Balanced', confirmed: true },
  interaction_style: { question: 'Interaction Style', value: 'Moderate', confirmed: true },
  content_tone: { question: 'Content Tone', value: 'Concise and direct', confirmed: true },
  mobile_priority: { question: 'Mobile Priority', value: 'Mobile-first', confirmed: true },
  brand_differentiator: { question: 'Brand Differentiator', value: 'Speed of delivery', confirmed: true },
  tech_alignment: { question: 'Technology Alignment', value: 'Next.js + Tailwind', confirmed: true },
  design_constraints: { question: 'Design Constraints', value: 'WCAG AA compliance', confirmed: true },
};

describe('SRIP Prompt Builder', () => {
  describe('buildSynthesisPrompt', () => {
    it('returns prompt text and token estimate', () => {
      const result = buildSynthesisPrompt({
        dnaJson: SAMPLE_DNA,
        answers: SAMPLE_ANSWERS,
      });
      expect(result).toHaveProperty('promptText');
      expect(result).toHaveProperty('tokenEstimate');
      expect(typeof result.promptText).toBe('string');
      expect(typeof result.tokenEstimate).toBe('number');
    });

    it('includes brand synthesis header', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('# Brand Synthesis Context');
    });

    it('includes venture name when provided', () => {
      const { promptText } = buildSynthesisPrompt({
        dnaJson: SAMPLE_DNA,
        answers: SAMPLE_ANSWERS,
        ventureName: 'Acme Corp',
      });
      expect(promptText).toContain('Acme Corp');
    });

    it('includes source URL from DNA', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('https://example.com');
    });

    it('includes design tokens — colors', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('#0066cc');
      expect(promptText).toContain('#333333');
    });

    it('includes design tokens — typography', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Inter');
      expect(promptText).toContain('Playfair Display');
    });

    it('includes page architecture', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Page Architecture');
      expect(promptText).toContain('css-grid');
      expect(promptText).toContain('mobile-first');
    });

    it('includes components detected', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('navigation');
      expect(promptText).toContain('hero');
    });

    it('includes copy patterns', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Build Better Products');
      expect(promptText).toContain('Start Free Trial');
    });

    it('includes tech stack', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Next.js');
      expect(promptText).toContain('Tailwind');
      expect(promptText).toContain('SSR');
    });

    it('includes all 12 interview responses', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Brand Interview Responses');
      expect(promptText).toContain('Modern, trustworthy');
      expect(promptText).toContain('B2B SaaS teams');
      expect(promptText).toContain('WCAG AA compliance');
    });

    it('marks confirmed vs auto-derived answers', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('(confirmed)');
      expect(promptText).toContain('(auto-derived)');
    });

    it('includes generation instructions', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Generation Instructions');
      expect(promptText).toContain('color palette');
    });

    it('estimates tokens as roughly promptText.length / 4', () => {
      const { promptText, tokenEstimate } = buildSynthesisPrompt({
        dnaJson: SAMPLE_DNA,
        answers: SAMPLE_ANSWERS,
      });
      expect(tokenEstimate).toBe(Math.ceil(promptText.length / 4));
    });

    it('handles empty DNA gracefully', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: {}, answers: SAMPLE_ANSWERS });
      expect(promptText).toContain('Brand Synthesis Context');
      expect(promptText).toContain('Brand Interview Responses');
    });

    it('handles empty answers gracefully', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: {} });
      expect(promptText).toContain('Brand Synthesis Context');
      expect(promptText).toContain('Design Tokens');
    });

    it('is parseable by downstream stages (contains all required sections)', () => {
      const { promptText } = buildSynthesisPrompt({ dnaJson: SAMPLE_DNA, answers: SAMPLE_ANSWERS });
      const requiredSections = [
        'Design Tokens',
        'Page Architecture',
        'Components Detected',
        'Copy Patterns',
        'Technology Stack',
        'Brand Interview Responses',
        'Generation Instructions',
      ];
      for (const section of requiredSections) {
        expect(promptText).toContain(section);
      }
    });
  });
});
