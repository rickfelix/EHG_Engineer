/**
 * Design Sub-Agent Constants
 * WCAG criteria, breakpoints, and default options
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

/**
 * WCAG accessibility criteria thresholds
 */
export const WCAG_CRITERIA = {
  contrast: { min: 4.5, enhanced: 7 },
  touchTarget: { min: 44, recommended: 48 },
  focusIndicator: { required: true },
  altText: { required: true },
  headingStructure: { required: true },
  ariaLabels: { required: true }
};

/**
 * Responsive design breakpoints
 */
export const BREAKPOINTS = {
  mobile: 320,
  tablet: 768,
  desktop: 1024,
  wide: 1440
};

/**
 * Default options for design validation
 */
export const DEFAULT_OPTIONS = {
  path: './src',
  gitDiffOnly: false,
  visualVerify: false,
  previewUrl: null
};

/**
 * Severity levels for issues
 */
export const SEVERITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

/**
 * Score deductions per severity
 */
export const SCORE_DEDUCTIONS = {
  accessibility: {
    HIGH: 10,
    MEDIUM: 5,
    LOW: 2
  },
  responsive: {
    HIGH: 10,
    MEDIUM: 3,
    LOW: 1
  },
  consistency: 3,
  touchTarget: 5,
  contrast: 5
};

/**
 * File patterns for scanning
 */
export const FILE_PATTERNS = {
  component: /\.(jsx?|tsx?)$/,
  css: /\.(css|scss|sass|less)$/,
  html: /\.html$/
};

/**
 * Common HTML locations to check
 */
export const COMMON_HTML_PATHS = [
  'index.html',
  'public/index.html',
  'src/index.html'
];
