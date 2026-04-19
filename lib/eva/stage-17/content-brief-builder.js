/**
 * Content Brief Builder for S17 Archetype Generation
 *
 * Synthesizes screen content structure and page purpose
 * from wireframe_screens artifact HTML into a structured brief
 * that enriches archetype prompts with screen-specific context.
 *
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A (US-002)
 * @module lib/eva/stage-17/content-brief-builder
 */

const MAX_BRIEF_CHARS = 1000;

/**
 * Build a content brief from screen HTML and page type context.
 * Pure function — no database calls, only data transformation.
 *
 * @param {string} screenHtml - Screen HTML content (wireframe description)
 * @param {string} pageType - Classified page type (e.g., 'landing', 'dashboard')
 * @returns {{ sections: string[], ctas: string[], navigation: string, purpose: string }}
 */
export function buildContentBrief(screenHtml, pageType) {
  if (!screenHtml || typeof screenHtml !== 'string') {
    return { sections: [], ctas: [], navigation: '', purpose: getDefaultPurpose(pageType) };
  }

  const sections = extractSections(screenHtml);
  const ctas = extractCTAs(screenHtml);
  const navigation = extractNavigation(screenHtml);
  const purpose = getDefaultPurpose(pageType);

  return { sections, ctas, navigation, purpose };
}

/**
 * Format the content brief as a prompt section string.
 *
 * @param {{ sections: string[], ctas: string[], navigation: string, purpose: string }} brief
 * @returns {string} Formatted prompt section (empty string if no meaningful content)
 */
export function formatContentBrief(brief) {
  if (!brief || (brief.sections.length === 0 && brief.ctas.length === 0 && !brief.navigation)) {
    if (brief?.purpose) {
      return `\nSCREEN PURPOSE: ${brief.purpose}`;
    }
    return '';
  }

  const lines = ['\nCONTENT STRUCTURE (from wireframe analysis):'];

  if (brief.purpose) {
    lines.push(`- Purpose: ${brief.purpose}`);
  }
  if (brief.sections.length > 0) {
    lines.push(`- Sections: ${brief.sections.slice(0, 5).join(', ')}`);
  }
  if (brief.ctas.length > 0) {
    lines.push(`- Key CTAs: ${brief.ctas.slice(0, 3).join(', ')}`);
  }
  if (brief.navigation) {
    lines.push(`- Navigation: ${brief.navigation}`);
  }

  const result = lines.join('\n');
  return result.length > MAX_BRIEF_CHARS ? result.slice(0, MAX_BRIEF_CHARS - 3) + '...' : result;
}

function extractSections(html) {
  const sections = [];
  const headingPattern = /<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi;
  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    const text = match[1].trim();
    if (text && text.length > 2) sections.push(text);
  }
  if (sections.length === 0) {
    const divPattern = /<div[^>]*class="([^"]*section[^"]*)"[^>]*>/gi;
    while ((match = divPattern.exec(html)) !== null) {
      sections.push(match[1].replace(/[-_]/g, ' ').trim());
    }
  }
  return sections.slice(0, 6);
}

function extractCTAs(html) {
  const ctas = [];
  const buttonPattern = /<button[^>]*>([^<]+)<\/button>/gi;
  let match;
  while ((match = buttonPattern.exec(html)) !== null) {
    const text = match[1].trim();
    if (text && text.length > 1 && text.length < 40) ctas.push(text);
  }
  const linkCtaPattern = /<a[^>]*class="[^"]*(?:btn|cta|button)[^"]*"[^>]*>([^<]+)<\/a>/gi;
  while ((match = linkCtaPattern.exec(html)) !== null) {
    const text = match[1].trim();
    if (text && text.length > 1 && text.length < 40) ctas.push(text);
  }
  return [...new Set(ctas)].slice(0, 4);
}

function extractNavigation(html) {
  if (/<nav[^>]*>/i.test(html)) return 'Navigation bar present';
  if (/<ul[^>]*class="[^"]*nav[^"]*"/i.test(html)) return 'Navigation list present';
  if (/<aside[^>]*>/i.test(html)) return 'Sidebar navigation';
  return '';
}

const PAGE_PURPOSE_MAP = {
  landing: 'Convert visitors — communicate value proposition and drive primary CTA engagement',
  signup: 'Capture user registration — minimize friction, build trust through progressive disclosure',
  dashboard: 'Surface key metrics — enable quick status assessment and navigation to detail views',
  insights: 'Reveal data patterns — present analytics with context and actionable takeaways',
  settings: 'Enable configuration — organize preferences logically with clear save/cancel flows',
  listing: 'Facilitate discovery — help users browse, filter, and compare items efficiently',
  detail: 'Deliver depth — present comprehensive item information with clear action paths',
};

function getDefaultPurpose(pageType) {
  return PAGE_PURPOSE_MAP[pageType] ?? 'Serve the user\'s primary task on this screen';
}
