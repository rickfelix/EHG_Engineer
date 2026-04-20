/**
 * Page-Type Classifier for S17 Archetype Generation
 *
 * Auto-classifies screens into page types and provides
 * purpose-specific archetype layout descriptions per type.
 *
 * SD-S17-DESIGN-INTELLIGENCE-ORCH-001-B
 * @module lib/eva/stage-17/page-type-classifier
 */

/**
 * @typedef {'landing'|'signup'|'dashboard'|'insights'|'settings'|'listing'|'detail'} PageType
 */

/**
 * Keyword patterns for each page type, ordered by specificity.
 * @type {Array<{type: PageType, patterns: RegExp[]}>}
 */
const PAGE_TYPE_RULES = [
  { type: 'signup',    patterns: [/sign\s*up/i, /register/i, /login/i, /log\s*in/i, /auth/i, /onboard/i, /create\s*account/i] },
  { type: 'dashboard', patterns: [/dashboard/i, /overview/i, /home\s*screen/i, /main\s*screen/i, /control\s*panel/i, /my\s+portfolio/i, /my\s+account/i] },
  { type: 'insights',  patterns: [/insight/i, /analytics/i, /report/i, /metrics/i, /statistics/i, /data\s*view/i] },
  { type: 'settings',  patterns: [/setting/i, /preference/i, /config/i, /account\s*settings/i, /profile\s*settings/i, /admin/i, /giving\s*profile/i] },
  { type: 'listing',   patterns: [/list/i, /search/i, /browse/i, /catalog/i, /directory/i, /results/i, /explore/i, /discover/i, /portfolio/i] },
  { type: 'detail',    patterns: [/detail/i, /view\s+\w+/i, /item/i, /article/i, /post/i, /content\s*page/i, /profile(?!\s*settings)/i, /cause\s*detail/i] },
  { type: 'landing',   patterns: [/landing/i, /home(?!\s*screen)/i, /hero/i, /welcome/i, /marketing/i, /about/i, /pricing/i, /for\s+\w+s\b/i] },
];

/**
 * Page-type-specific archetype layout descriptions.
 * 7 page types x 6 layouts = 42 total.
 *
 * @type {Record<PageType, string[]>}
 */
export const PAGE_TYPE_ARCHETYPES = {
  landing: [
    'hero section with full-width image/gradient, headline, subhead, and prominent CTA above the fold',
    'story-driven scroll with alternating content/media sections and a clear narrative arc',
    'social proof-led layout with testimonials, logos, and trust signals before the CTA',
    'feature showcase with icon grid or card tiles highlighting key benefits',
    'split-screen hero with media left and conversion-focused copy right',
    'bold typographic layout with oversized headlines, minimal imagery, and editorial spacing',
  ],
  signup: [
    'centered single-column form with progressive disclosure and clear step indicators',
    'split-screen with brand imagery left and compact form right',
    'card-based form floating over a subtle background with social login options',
    'wizard-style multi-step flow with progress bar and minimal distractions',
    'conversational form layout with one field at a time and friendly micro-copy',
    'compact inline form integrated below a value proposition summary',
  ],
  dashboard: [
    'KPI cards row at top with sparklines, followed by detailed charts below',
    'sidebar navigation with main content area divided into widget grid',
    'data-dense table view with filters, search, and inline actions',
    'card grid with equal-weight metric tiles and drill-down affordances',
    'split layout with summary panel left and detail/chart area right',
    'tabbed sections with each tab showing a different data domain',
  ],
  insights: [
    'full-width chart hero with key metric callouts and time range selector',
    'comparison layout with side-by-side metrics and trend indicators',
    'narrative analytics with charts embedded in explanatory text blocks',
    'grid of visualization cards with filter bar and export controls',
    'scrolling report format with section headers, charts, and key takeaways',
    'interactive dashboard with hover-reveal details and drill-down paths',
  ],
  settings: [
    'left sidebar category navigation with right-side form panels',
    'accordion sections grouping related settings with save per section',
    'single-column stacked sections with clear labels and toggle controls',
    'tabbed settings with each tab containing a focused form group',
    'search-first settings with prominent search bar and filtered results',
    'card-based sections with inline editing and auto-save indicators',
  ],
  listing: [
    'grid view with filter sidebar and sort controls above the list',
    'list view with thumbnail, title, and metadata in each row',
    'search-first layout with prominent search bar and faceted filters',
    'card grid with hover-reveal actions and pagination controls',
    'table view with sortable columns, bulk actions, and row expansion',
    'map + list split view with geographic context alongside listings',
  ],
  detail: [
    'article layout with constrained reading width, large header image, and structured content',
    'two-column with primary content left and metadata/actions sidebar right',
    'full-width media hero with content sections below in alternating layouts',
    'tabbed detail view with overview, specifications, and related items tabs',
    'card-based detail with summary card at top and expandable detail sections',
    'timeline/chronological layout with sequential content blocks and status markers',
  ],
};

/**
 * Classify a screen into a page type based on its name and prompt content.
 *
 * @param {string} screenName - Screen name (e.g., "Landing Page", "Dashboard")
 * @param {string} [screenPrompt=''] - Screen prompt/description for context
 * @param {object} [options]
 * @param {number} [options.confidenceThreshold=0.5] - Below this, return 'landing' as default
 * @returns {{ pageType: PageType, confidence: number, method: 'keyword'|'default' }}
 */
export function classifyPageType(screenName, screenPrompt = '', options = {}) {
  const { confidenceThreshold = 0.5 } = options;
  const haystack = `${screenName} ${screenPrompt}`.toLowerCase();

  // Score each page type by pattern matches
  let bestType = 'landing';
  let bestScore = 0;
  let totalMatches = 0;

  for (const rule of PAGE_TYPE_RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(haystack)) matchCount++;
    }
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestType = rule.type;
    }
    totalMatches += matchCount;
  }

  // Confidence: ratio of best type matches to its total patterns,
  // boosted if no other type matched
  const bestRule = PAGE_TYPE_RULES.find(r => r.type === bestType);
  const patternCoverage = bestRule ? bestScore / bestRule.patterns.length : 0;
  const exclusivity = totalMatches > 0 ? bestScore / totalMatches : 0;
  const confidence = Math.min(1, (patternCoverage * 0.6 + exclusivity * 0.4) * (bestScore > 0 ? 1.5 : 0));

  if (confidence < confidenceThreshold || bestScore === 0) {
    // Context-aware fallback instead of always defaulting to 'landing'
    const name = screenName.toLowerCase();
    if (/my\s|portfolio|dashboard|overview/i.test(name)) return { pageType: 'dashboard', confidence: 0.4, method: 'name_heuristic' };
    if (/profile|giving|donation|impact/i.test(name)) return { pageType: 'detail', confidence: 0.4, method: 'name_heuristic' };
    if (/discover|browse|explore|cause/i.test(name)) return { pageType: 'listing', confidence: 0.4, method: 'name_heuristic' };
    if (/how\s+(it|to)|getting\s+started|process|steps/i.test(name)) return { pageType: 'detail', confidence: 0.4, method: 'name_heuristic' };
    if (/for\s+\w+/i.test(name)) return { pageType: 'landing', confidence: 0.4, method: 'name_heuristic' };
    return { pageType: 'landing', confidence: 0.3, method: 'default' };
  }

  return { pageType: bestType, confidence: Math.round(confidence * 100) / 100, method: 'keyword' };
}

/**
 * Get archetype layout descriptions for a given page type.
 * Returns first 4 layouts (SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001).
 *
 * @param {PageType} pageType
 * @returns {string[]} Array of 4 layout descriptions
 */
export function getArchetypesForPageType(pageType) {
  const layouts = PAGE_TYPE_ARCHETYPES[pageType] ?? PAGE_TYPE_ARCHETYPES.landing;
  return layouts.slice(0, 4);
}

/**
 * Design strategy names mapped to variant indices (1-based).
 * @type {string[]}
 */
export const STRATEGY_NAMES = ['clarity-first', 'dense', 'narrative', 'visual-impact'];

/**
 * Strategy-driven layout descriptions per page type.
 * Each page type has 4 strategy variants that implement a distinct design approach.
 *
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A (US-004)
 * @type {Record<PageType, Array<{strategy: string, description: string}>>}
 */
export const STRATEGY_LAYOUTS = {
  landing: [
    { strategy: 'clarity-first', description: 'Clean hero with generous whitespace, single focal headline, one primary CTA, and sparse supporting copy. Maximum breathing room, minimum cognitive load.' },
    { strategy: 'dense', description: 'Feature grid above the fold with pricing comparison table, testimonial row, and multi-CTA sections. Information-rich without scrolling.' },
    { strategy: 'narrative', description: 'Story-driven vertical scroll with sequential sections: problem, solution, proof, action. Editorial spacing, one idea per viewport.' },
    { strategy: 'visual-impact', description: 'Full-bleed hero image or gradient, oversized typography, asymmetric layout, bold color blocking. Dramatic first impression.' },
  ],
  signup: [
    { strategy: 'clarity-first', description: 'Single-column centered form with progressive disclosure, minimal labels, generous field spacing. One action per step, zero distractions.' },
    { strategy: 'dense', description: 'Compact form with all fields visible, social login shortcuts, inline validation, and benefit list beside the form. Efficient completion.' },
    { strategy: 'narrative', description: 'Wizard-style multi-step flow with contextual benefit callouts per step, progress indicator, and why-we-ask micro-copy.' },
    { strategy: 'visual-impact', description: 'Split-screen with bold brand imagery left and floating form card right. High contrast, dramatic typography on value proposition.' },
  ],
  dashboard: [
    { strategy: 'clarity-first', description: 'Spacious KPI cards with single metric each, muted secondary info, clean grid, prominent primary action. Scannable in 3 seconds.' },
    { strategy: 'dense', description: 'Multi-panel layout with sparklines, data tables, filter controls, and inline actions. Maximum information per viewport.' },
    { strategy: 'narrative', description: 'Guided dashboard with section headers telling a story: "Your Week" then "Key Trends" then "Action Items". Contextual tooltips.' },
    { strategy: 'visual-impact', description: 'Large hero metric with bold type, chart-forward layout with vivid data visualization colors, achievement callouts.' },
  ],
  insights: [
    { strategy: 'clarity-first', description: 'One chart per section with key takeaway text, generous margins, clear axis labels. Focused reading experience.' },
    { strategy: 'dense', description: 'Multi-chart grid with comparison panels, filter bar, data source citations, and export controls. Research-grade density.' },
    { strategy: 'narrative', description: 'Scrolling analytics report with explanatory text between charts, "why this matters" sections, and sequential insight discovery.' },
    { strategy: 'visual-impact', description: 'Full-width hero chart, bold metric callouts with oversized numbers, high-contrast data visualization palette.' },
  ],
  settings: [
    { strategy: 'clarity-first', description: 'Single-column stacked sections with clear labels, generous spacing between groups, one save button per section.' },
    { strategy: 'dense', description: 'Left sidebar categories with right-side form panels, toggle controls, inline editing, grouped related settings.' },
    { strategy: 'narrative', description: 'Step-through settings with "what happens when" previews, contextual help text, and recommended-first ordering.' },
    { strategy: 'visual-impact', description: 'Card-based sections with visual previews of each setting effect, bold category headers, live-preview panel.' },
  ],
  listing: [
    { strategy: 'clarity-first', description: 'Clean card grid with ample spacing, one line of metadata per item, prominent search bar. Easy visual scanning.' },
    { strategy: 'dense', description: 'Table view with sortable columns, inline actions, filter sidebar, bulk operations. Maximum items per viewport.' },
    { strategy: 'narrative', description: 'Category-guided layout with editorial headers per section, curated collections, and contextual discovery prompts.' },
    { strategy: 'visual-impact', description: 'Large image cards with overlay text, hover-reveal details, masonry or asymmetric grid, bold category markers.' },
  ],
  detail: [
    { strategy: 'clarity-first', description: 'Constrained reading width, large header, structured content with clear heading hierarchy. Focused single-column flow.' },
    { strategy: 'dense', description: 'Two-column with primary content left and metadata/specs/actions sidebar right. Tabbed subsections for depth.' },
    { strategy: 'narrative', description: 'Full-width media hero, alternating content/media sections, timeline or chronological layout with sequential flow.' },
    { strategy: 'visual-impact', description: 'Immersive full-bleed media, oversized typography, bold pull quotes, dramatic section transitions, gallery-first layout.' },
  ],
};

/**
 * Get strategy-driven layout descriptions for a given page type.
 * Returns 4 objects, each with a strategy name and layout description.
 *
 * @param {PageType} pageType
 * @returns {Array<{strategy: string, description: string}>} Array of 4 strategy-tagged layouts
 */
export function getStrategyLayouts(pageType) {
  return STRATEGY_LAYOUTS[pageType] ?? STRATEGY_LAYOUTS.landing;
}
