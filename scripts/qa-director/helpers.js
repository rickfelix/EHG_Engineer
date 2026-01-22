/**
 * QA Engineering Director - Helper Functions
 * Utility functions for SD classification
 */

import { UI_CATEGORIES, UI_KEYWORDS } from './config.js';

/**
 * Helper: Check if SD is UI-related
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if SD is UI-related
 */
export function isUISD(sd) {
  const categoryMatch = UI_CATEGORIES.some(cat =>
    sd.category?.toLowerCase().includes(cat.toLowerCase())
  );

  const scopeMatch = UI_KEYWORDS.some(kw =>
    sd.scope?.toLowerCase().includes(kw)
  );

  return categoryMatch || scopeMatch;
}
