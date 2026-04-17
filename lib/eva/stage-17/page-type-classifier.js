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
  { type: 'dashboard', patterns: [/dashboard/i, /overview/i, /home\s*screen/i, /main\s*screen/i, /control\s*panel/i] },
  { type: 'insights',  patterns: [/insight/i, /analytics/i, /report/i, /metrics/i, /statistics/i, /data\s*view/i] },
  { type: 'settings',  patterns: [/setting/i, /preference/i, /config/i, /account/i, /profile/i, /admin/i] },
  { type: 'listing',   patterns: [/list/i, /search/i, /browse/i, /catalog/i, /directory/i, /results/i, /explore/i] },
  { type: 'detail',    patterns: [/detail/i, /view/i, /item/i, /article/i, /post/i, /content\s*page/i] },
  { type: 'landing',   patterns: [/landing/i, /home/i, /hero/i, /welcome/i, /marketing/i, /about/i, /pricing/i, /feature/i] },
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
    return { pageType: 'landing', confidence: 0.3, method: 'default' };
  }

  return { pageType: bestType, confidence: Math.round(confidence * 100) / 100, method: 'keyword' };
}

/**
 * Get the 6 archetype layout descriptions for a given page type.
 *
 * @param {PageType} pageType
 * @returns {string[]} Array of 6 layout descriptions
 */
export function getArchetypesForPageType(pageType) {
  return PAGE_TYPE_ARCHETYPES[pageType] ?? PAGE_TYPE_ARCHETYPES.landing;
}
