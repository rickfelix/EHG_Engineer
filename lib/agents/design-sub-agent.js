#!/usr/bin/env node

/**
 * Design Sub-Agent - ACTIVE Design Validation Tool
 * Validates accessibility, responsive design, and UX compliance
 *
 * REFACTORED: SD-LEO-REFACTOR-DESIGN-AGENT-001
 * This file now re-exports from the modular structure in ./design-sub-agent/ for backward compatibility.
 * Original file was 1441 LOC, now split into 8 modules under 500 LOC each.
 *
 * Modules:
 * - design-sub-agent/constants.js - WCAG criteria, breakpoints, defaults
 * - design-sub-agent/file-helpers.js - File scanning utilities
 * - design-sub-agent/accessibility-checks.js - WCAG accessibility validation
 * - design-sub-agent/responsive-checks.js - Responsive design validation
 * - design-sub-agent/component-checks.js - Component consistency checks
 * - design-sub-agent/style-checks.js - Color, typography, animation checks
 * - design-sub-agent/design-system.js - Design system compliance
 * - design-sub-agent/visual-verification.js - Playwright MCP visual verification
 * - design-sub-agent/index.js - DesignSubAgent class + CLI
 */

// Re-export main class from modular structure
export {
  default,
  DesignSubAgent
} from './design-sub-agent/index.js';

// Re-export constants for direct access
export {
  WCAG_CRITERIA,
  BREAKPOINTS,
  DEFAULT_OPTIONS,
  SEVERITY,
  SCORE_DEDUCTIONS,
  FILE_PATTERNS,
  COMMON_HTML_PATHS
} from './design-sub-agent/constants.js';

// Re-export file helpers
export {
  loadGitDiffFiles,
  getComponentFiles,
  getCSSFiles,
  getHTMLFiles
} from './design-sub-agent/file-helpers.js';

// Re-export accessibility checks
export {
  checkAccessibility,
  checkTouchTargets
} from './design-sub-agent/accessibility-checks.js';

// Re-export responsive checks
export {
  checkResponsiveDesign
} from './design-sub-agent/responsive-checks.js';

// Re-export component checks
export {
  checkComponentConsistency,
  checkAtomicDesign
} from './design-sub-agent/component-checks.js';

// Re-export style checks
export {
  extractColors,
  isColorDark,
  calculateContrast,
  checkColorContrast,
  checkTypography,
  checkAnimations
} from './design-sub-agent/style-checks.js';

// Re-export design system checks
export {
  checkDesignSystem
} from './design-sub-agent/design-system.js';

// Re-export visual verification
export {
  visualVerification,
  generateMCPInstructions,
  generateVisualAuditMarkdown
} from './design-sub-agent/visual-verification.js';

// CLI entry point - delegate to index.js
import('./design-sub-agent/index.js').then(_module => {
  // Module loaded, CLI handled by index.js
}).catch(_err => {
  // Ignore import errors during static analysis
});
