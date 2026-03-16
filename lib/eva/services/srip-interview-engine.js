/**
 * SRIP Brand Interview Engine
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * Defines 12 structured brand interview questions and pre-populates
 * default answers from extracted Site DNA. Chairman reviews and overrides.
 */

/**
 * The 12 brand interview questions.
 * Each question has a key, label, help text, and a function to derive
 * a default answer from Site DNA JSON.
 */
const INTERVIEW_QUESTIONS = [
  {
    key: 'brand_personality',
    label: 'Brand Personality',
    helpText: 'How would you describe the brand personality in 3-5 adjectives?',
    deriveDefault: (dna) => {
      const tone = dna?.copy_patterns?.tone;
      if (tone) return tone;
      const headings = dna?.copy_patterns?.headings || [];
      if (headings.length === 0) return null;
      return 'Professional, modern';
    },
  },
  {
    key: 'primary_audience',
    label: 'Primary Audience',
    helpText: 'Who is the primary target audience for this brand?',
    deriveDefault: (dna) => {
      const ctas = dna?.copy_patterns?.ctas || [];
      const hasBusinessCtas = ctas.some(c =>
        /demo|trial|enterprise|pricing|contact sales/i.test(c)
      );
      return hasBusinessCtas ? 'Business professionals / B2B' : 'General consumers';
    },
  },
  {
    key: 'color_intent',
    label: 'Color Intent',
    helpText: 'What emotion or feeling should the primary colors evoke?',
    deriveDefault: (dna) => {
      const primary = dna?.design_tokens?.colors?.primary;
      if (!primary) return null;
      // Basic color-to-emotion mapping
      const hex = primary.toLowerCase();
      if (hex.startsWith('#0') || hex.startsWith('#1') || hex.includes('blue')) return 'Trust, stability, professionalism';
      if (hex.includes('green') || hex.startsWith('#2')) return 'Growth, health, nature';
      if (hex.includes('red') || hex.startsWith('#e') || hex.startsWith('#f')) return 'Energy, urgency, passion';
      return 'Balanced, neutral';
    },
  },
  {
    key: 'typography_style',
    label: 'Typography Style',
    helpText: 'What typographic style best represents the brand? (e.g., clean sans-serif, elegant serif)',
    deriveDefault: (dna) => {
      const fontFamily = dna?.design_tokens?.typography?.font_family;
      if (!fontFamily) return null;
      const lower = fontFamily.toLowerCase();
      if (/serif/i.test(lower) && !/sans/i.test(lower)) return `Elegant serif (${fontFamily})`;
      if (/mono/i.test(lower)) return `Technical monospace (${fontFamily})`;
      return `Clean sans-serif (${fontFamily})`;
    },
  },
  {
    key: 'layout_philosophy',
    label: 'Layout Philosophy',
    helpText: 'How should content be organized? (e.g., spacious/minimal, dense/information-rich)',
    deriveDefault: (dna) => {
      const arch = dna?.macro_architecture;
      if (!arch) return null;
      const flow = arch.page_flow;
      if (flow === 'multi-section') return 'Structured multi-section with clear hierarchy';
      return 'Single-column, focused content flow';
    },
  },
  {
    key: 'visual_density',
    label: 'Visual Density',
    helpText: 'How much visual content vs whitespace? (minimal, balanced, rich)',
    deriveDefault: (dna) => {
      const components = dna?.component_behaviors?.components || [];
      if (components.length >= 4) return 'Rich — multiple component types detected';
      if (components.length >= 2) return 'Balanced';
      return 'Minimal';
    },
  },
  {
    key: 'interaction_style',
    label: 'Interaction Style',
    helpText: 'How interactive should the experience be? (static, moderate, highly interactive)',
    deriveDefault: (dna) => {
      const components = dna?.component_behaviors?.components || [];
      const hasForms = components.some(c => c.type === 'form');
      const hasCards = components.some(c => c.type === 'card_grid');
      if (hasForms && hasCards) return 'Highly interactive — forms and dynamic content';
      if (hasForms || hasCards) return 'Moderate — some interactive elements';
      return 'Primarily static content';
    },
  },
  {
    key: 'content_tone',
    label: 'Content Tone',
    helpText: 'What tone should written content use? (formal, conversational, technical)',
    deriveDefault: (dna) => {
      const paragraphs = dna?.copy_patterns?.sample_paragraphs || [];
      const wordCount = dna?.copy_patterns?.word_count || 0;
      if (wordCount > 2000) return 'Content-heavy — likely informational or editorial';
      if (paragraphs.length === 0) return null;
      return 'Concise and direct';
    },
  },
  {
    key: 'mobile_priority',
    label: 'Mobile Priority',
    helpText: 'How important is the mobile experience? (mobile-first, desktop-first, equal)',
    deriveDefault: (dna) => {
      const approach = dna?.macro_architecture?.responsive_approach;
      if (approach === 'mobile-first') return 'Mobile-first (viewport meta detected)';
      return 'Desktop-first';
    },
  },
  {
    key: 'brand_differentiator',
    label: 'Brand Differentiator',
    helpText: 'What makes this brand unique compared to competitors?',
    deriveDefault: (dna) => {
      const headings = dna?.copy_patterns?.headings || [];
      if (headings.length > 0) return `Key message: "${headings[0]}"`;
      return null;
    },
  },
  {
    key: 'tech_alignment',
    label: 'Technology Alignment',
    helpText: 'What technology stack or approach should the design align with?',
    deriveDefault: (dna) => {
      const tech = dna?.tech_stack;
      if (!tech) return null;
      const parts = [];
      if (tech.framework !== 'unknown') parts.push(tech.framework);
      if (tech.css_approach !== 'unknown') parts.push(tech.css_approach);
      if (tech.rendering) parts.push(tech.rendering);
      return parts.length > 0 ? parts.join(' + ') : null;
    },
  },
  {
    key: 'design_constraints',
    label: 'Design Constraints',
    helpText: 'Are there any constraints? (accessibility requirements, brand guidelines, performance targets)',
    deriveDefault: () => null, // Always requires manual input
  },
];

/**
 * Generate interview answers pre-populated from Site DNA.
 *
 * @param {object} dnaJson - The dna_json field from srip_site_dna
 * @returns {{ answers: Record<string, { question: string, helpText: string, default: string|null, confirmed: boolean }>, prePopulatedCount: number }}
 */
export function generateInterviewDefaults(dnaJson) {
  const answers = {};
  let prePopulatedCount = 0;

  for (const q of INTERVIEW_QUESTIONS) {
    const defaultValue = q.deriveDefault(dnaJson);
    if (defaultValue) prePopulatedCount++;

    answers[q.key] = {
      question: q.label,
      helpText: q.helpText,
      default: defaultValue,
      value: defaultValue, // Chairman can override
      confirmed: false,
    };
  }

  return { answers, prePopulatedCount };
}

/**
 * Get the list of all 12 interview questions (without DNA defaults).
 * @returns {Array<{ key: string, label: string, helpText: string }>}
 */
export function getInterviewQuestions() {
  return INTERVIEW_QUESTIONS.map(({ key, label, helpText }) => ({ key, label, helpText }));
}

export { INTERVIEW_QUESTIONS };
