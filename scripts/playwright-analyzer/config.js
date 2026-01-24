/**
 * Configuration Domain
 * Defines breakpoints, WCAG criteria, and constants for design analysis
 *
 * @module playwright-analyzer/config
 */

/**
 * Responsive breakpoint definitions
 */
export const BREAKPOINTS = {
  mobile: { width: 375, height: 812 },  // iPhone X
  tablet: { width: 768, height: 1024 }, // iPad
  desktop: { width: 1440, height: 900 }, // Desktop
  wide: { width: 1920, height: 1080 }   // Full HD
};

/**
 * WCAG accessibility criteria thresholds
 */
export const WCAG_CRITERIA = {
  minContrast: 4.5,
  enhancedContrast: 7,
  minTouchTarget: 44,
  minFocusIndicator: 2,
  maxLoadTime: 3000,
  maxInteractionDelay: 100
};

/**
 * Design consistency thresholds
 */
export const CONSISTENCY_THRESHOLDS = {
  maxColors: 15,
  maxFonts: 10,
  maxButtonVariants: 3,
  maxInputVariants: 2
};

/**
 * Output file names
 */
export const OUTPUT_FILES = {
  htmlReport: 'directive-lab-ui-analysis.html',
  jsonReport: 'directive-lab-ui-analysis.json',
  markdownSummary: 'directive-lab-ui-recommendations.md',
  screenshotDir: 'screenshots'
};

export default {
  BREAKPOINTS,
  WCAG_CRITERIA,
  CONSISTENCY_THRESHOLDS,
  OUTPUT_FILES
};
