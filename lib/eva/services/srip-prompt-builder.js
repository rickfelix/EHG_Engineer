/**
 * SRIP Synthesis Prompt Builder
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * Combines Site DNA + Brand Interview answers into a single LLM prompt
 * for downstream brand generation stages (12-14).
 */

/**
 * Build a synthesis prompt from DNA and interview data.
 *
 * @param {object} params
 * @param {object} params.dnaJson - The dna_json from srip_site_dna
 * @param {Record<string, { value: string|null, confirmed: boolean }>} params.answers - Interview answers
 * @param {string} [params.ventureName] - Optional venture name for context
 * @returns {{ promptText: string, tokenEstimate: number }}
 */
export function buildSynthesisPrompt({ dnaJson, answers, ventureName }) {
  const sections = [];

  // Header
  sections.push('# Brand Synthesis Context');
  if (ventureName) sections.push(`## Venture: ${ventureName}`);
  sections.push(`## Source: ${dnaJson?.source_url || 'Manual entry'}`);
  sections.push(`## Extracted: ${dnaJson?.extracted_at || 'N/A'}`);
  sections.push('');

  // Design Tokens Section
  const tokens = dnaJson?.design_tokens;
  if (tokens) {
    sections.push('## Design Tokens');
    if (tokens.colors) {
      sections.push('### Colors');
      sections.push(`- Primary: ${tokens.colors.primary || 'not detected'}`);
      sections.push(`- Secondary: ${tokens.colors.secondary || 'not detected'}`);
      sections.push(`- Accent: ${tokens.colors.accent || 'not detected'}`);
      sections.push(`- Background: ${tokens.colors.background || '#ffffff'}`);
      sections.push(`- Text: ${tokens.colors.text || '#333333'}`);
      if (tokens.colors.additional?.length > 0) {
        sections.push(`- Additional: ${tokens.colors.additional.join(', ')}`);
      }
    }
    if (tokens.typography) {
      sections.push('### Typography');
      sections.push(`- Primary Font: ${tokens.typography.font_family || 'sans-serif'}`);
      if (tokens.typography.heading_font) {
        sections.push(`- Heading Font: ${tokens.typography.heading_font}`);
      }
      if (tokens.typography.size_scale) {
        sections.push(`- Size Scale: ${tokens.typography.size_scale.join(', ')}`);
      }
    }
    if (tokens.spacing) {
      const spacingStr = Array.isArray(tokens.spacing)
        ? tokens.spacing.join(', ')
        : typeof tokens.spacing === 'object'
          ? Object.entries(tokens.spacing).map(([k, v]) => `${k}: ${v}`).join(', ')
          : String(tokens.spacing);
      sections.push(`### Spacing: ${spacingStr}`);
    }
    if (tokens.border_radius) {
      const radiusStr = Array.isArray(tokens.border_radius)
        ? tokens.border_radius.join(', ')
        : String(tokens.border_radius);
      sections.push(`### Border Radius: ${radiusStr}`);
    }
    sections.push('');
  }

  // Macro Architecture Section
  const arch = dnaJson?.macro_architecture;
  if (arch) {
    sections.push('## Page Architecture');
    if (arch.has_header !== undefined) sections.push(`- Header: ${arch.has_header ? 'Yes' : 'No'}`);
    if (arch.has_footer !== undefined) sections.push(`- Footer: ${arch.has_footer ? 'Yes' : 'No'}`);
    if (arch.has_main !== undefined) sections.push(`- Main Content: ${arch.has_main ? 'Yes' : 'No'}`);
    if (arch.page_flow) sections.push(`- Page Flow: ${arch.page_flow}`);
    if (arch.responsive_approach) sections.push(`- Responsive: ${arch.responsive_approach}`);
    sections.push(`- Grid System: ${arch.grid_system || 'unknown'}`);
    sections.push(`- Responsive: ${arch.responsive_approach || 'unknown'}`);
    sections.push(`- Page Flow: ${arch.page_flow || 'unknown'}`);
    if (arch.sections?.length > 0) {
      sections.push('### Sections');
      for (const s of arch.sections) {
        sections.push(`- ${s.heading || s.tag} (${s.childCount} children)`);
      }
    }
    sections.push('');
  }

  // Component Behaviors Section
  const behaviors = dnaJson?.component_behaviors;
  if (behaviors?.components?.length > 0) {
    sections.push('## Components Detected');
    for (const comp of behaviors.components) {
      const details = Object.entries(comp)
        .filter(([k]) => k !== 'type')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      sections.push(`- ${comp.type}: ${details}`);
    }
    sections.push('');
  }

  // Copy Patterns Section
  const copy = dnaJson?.copy_patterns;
  if (copy) {
    sections.push('## Copy Patterns');
    if (copy.headings?.length > 0) {
      sections.push('### Key Headings');
      for (const h of copy.headings.slice(0, 5)) {
        sections.push(`- "${h}"`);
      }
    }
    if (copy.ctas?.length > 0) {
      sections.push('### CTAs');
      for (const c of copy.ctas.slice(0, 5)) {
        sections.push(`- "${c}"`);
      }
    }
    if (copy.word_count) {
      sections.push(`### Content Volume: ~${copy.word_count} words`);
    }
    sections.push('');
  }

  // Tech Stack Section
  const tech = dnaJson?.tech_stack;
  if (tech) {
    sections.push('## Technology Stack');
    sections.push(`- Framework: ${tech.framework || 'unknown'}`);
    sections.push(`- CSS: ${tech.css_approach || 'unknown'}`);
    sections.push(`- Rendering: ${tech.rendering || 'unknown'}`);
    sections.push('');
  }

  // Brand Interview Responses Section
  sections.push('## Brand Interview Responses');
  if (answers && typeof answers === 'object') {
    for (const [key, answer] of Object.entries(answers)) {
      const value = answer?.value || answer?.default || 'Not provided';
      const status = answer?.confirmed ? '(confirmed)' : '(auto-derived)';
      sections.push(`### ${answer?.question || key}`);
      sections.push(`${value} ${status}`);
      sections.push('');
    }
  }

  // Generation Instructions
  sections.push('## Generation Instructions');
  sections.push('Use the above brand context to generate design artifacts that:');
  sections.push('1. Match the detected color palette and typography exactly');
  sections.push('2. Follow the identified layout patterns and component structure');
  sections.push('3. Align with the brand personality and audience described in the interview');
  sections.push('4. Maintain the same content tone and interaction style');
  sections.push('5. Are compatible with the detected technology stack');

  const promptText = sections.join('\n');
  const tokenEstimate = Math.ceil(promptText.length / 4); // Rough estimate

  return { promptText, tokenEstimate };
}
