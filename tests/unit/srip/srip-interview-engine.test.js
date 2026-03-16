import { describe, it, expect } from 'vitest';
import {
  generateInterviewDefaults,
  getInterviewQuestions,
  INTERVIEW_QUESTIONS,
} from '../../../lib/eva/services/srip-interview-engine.js';

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
      weights: [400, 600, 700],
    },
    spacing: ['4px', '8px', '16px', '24px', '32px', '48px'],
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
      { tag: 'section', heading: 'Pricing', childCount: 3 },
    ],
  },
  copy_patterns: {
    headings: ['Build Better Products', 'Trusted by Teams'],
    ctas: ['Start Free Trial', 'Contact Sales', 'View Demo'],
    sample_paragraphs: ['Our platform helps teams ship faster.'],
    word_count: 1500,
  },
  component_behaviors: {
    components: [
      { type: 'navigation', link_count: 6, has_dropdown: true },
      { type: 'form', field_count: 3, has_submit: true },
      { type: 'card_grid', count: 4, has_images: true },
      { type: 'hero', has_background_image: true, has_cta: true },
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

describe('SRIP Interview Engine', () => {
  describe('INTERVIEW_QUESTIONS', () => {
    it('defines exactly 12 questions', () => {
      expect(INTERVIEW_QUESTIONS).toHaveLength(12);
    });

    it('each question has required fields', () => {
      for (const q of INTERVIEW_QUESTIONS) {
        expect(q).toHaveProperty('key');
        expect(q).toHaveProperty('label');
        expect(q).toHaveProperty('helpText');
        expect(q).toHaveProperty('deriveDefault');
        expect(typeof q.deriveDefault).toBe('function');
      }
    });

    it('has unique keys', () => {
      const keys = INTERVIEW_QUESTIONS.map(q => q.key);
      expect(new Set(keys).size).toBe(12);
    });
  });

  describe('getInterviewQuestions', () => {
    it('returns 12 questions without deriveDefault', () => {
      const questions = getInterviewQuestions();
      expect(questions).toHaveLength(12);
      for (const q of questions) {
        expect(q).toHaveProperty('key');
        expect(q).toHaveProperty('label');
        expect(q).toHaveProperty('helpText');
        expect(q).not.toHaveProperty('deriveDefault');
      }
    });
  });

  describe('generateInterviewDefaults', () => {
    it('returns answers for all 12 questions', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(Object.keys(answers)).toHaveLength(12);
    });

    it('pre-populates defaults from rich DNA', () => {
      const { answers, prePopulatedCount } = generateInterviewDefaults(SAMPLE_DNA);
      // With rich DNA, most questions should have defaults
      expect(prePopulatedCount).toBeGreaterThanOrEqual(8);
      // design_constraints always returns null
      expect(answers.design_constraints.default).toBeNull();
    });

    it('each answer has expected structure', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      for (const [, answer] of Object.entries(answers)) {
        expect(answer).toHaveProperty('question');
        expect(answer).toHaveProperty('helpText');
        expect(answer).toHaveProperty('default');
        expect(answer).toHaveProperty('value');
        expect(answer).toHaveProperty('confirmed');
        expect(answer.confirmed).toBe(false);
      }
    });

    it('derives color intent from blue primary', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(answers.color_intent.default).toContain('Trust');
    });

    it('derives typography style from font family', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(answers.typography_style.default).toContain('Inter');
    });

    it('detects B2B audience from CTA patterns', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(answers.primary_audience.default).toContain('B2B');
    });

    it('detects mobile-first from viewport meta', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(answers.mobile_priority.default).toContain('Mobile-first');
    });

    it('detects tech stack alignment', () => {
      const { answers } = generateInterviewDefaults(SAMPLE_DNA);
      expect(answers.tech_alignment.default).toContain('Next.js');
      expect(answers.tech_alignment.default).toContain('Tailwind');
    });

    it('handles empty DNA gracefully', () => {
      const { answers, prePopulatedCount } = generateInterviewDefaults({});
      expect(Object.keys(answers)).toHaveLength(12);
      // Some questions have fallback defaults even with empty DNA
      expect(prePopulatedCount).toBeLessThan(12);
    });

    it('handles null DNA gracefully', () => {
      const { answers } = generateInterviewDefaults(null);
      expect(Object.keys(answers)).toHaveLength(12);
    });
  });
});
