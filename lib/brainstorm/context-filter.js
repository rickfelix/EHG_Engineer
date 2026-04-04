/**
 * Context Filter — Role-Based Information Asymmetry
 * SD: SD-LEO-INFRA-BOARD-DELIBERATION-STRUCTURAL-001B
 *
 * Assigns each board seat a subset of context categories (3-4 of 6)
 * based on role domain. Security data is ALWAYS included for ALL seats.
 */

const CONTEXT_CATEGORIES = [
  'financial',
  'risk',
  'technical',
  'customer',
  'security',    // Always included — CISO non-negotiable
  'operational'
];

/**
 * Role-to-category mapping. Each role receives 3-4 categories.
 * Security is always force-included regardless of mapping.
 */
const ROLE_CATEGORY_MAP = {
  cso:  ['financial', 'risk', 'customer'],
  cro:  ['risk', 'operational', 'financial'],
  cto:  ['technical', 'operational', 'risk'],
  ciso: ['security', 'technical', 'risk', 'operational'],
  coo:  ['operational', 'technical', 'customer'],
  cfo:  ['financial', 'risk', 'customer']
};

/**
 * Get the context categories assigned to a seat based on its role.
 * Security is always included.
 *
 * @param {string} seatCode - The seat's agent code (e.g., 'CSO', 'CTO')
 * @returns {string[]} Array of assigned category names
 */
export function getCategoriesForSeat(seatCode) {
  const key = (seatCode || '').toLowerCase();
  const mapped = ROLE_CATEGORY_MAP[key] || ['technical', 'operational', 'customer'];
  // Force-include security for all seats
  const categories = new Set(mapped);
  categories.add('security');
  return [...categories];
}

/**
 * Filter topic context to only include categories assigned to a seat.
 *
 * @param {object} fullContext - Full context object with category keys
 * @param {string} seatCode - The seat's agent code
 * @returns {{filteredContext: object, categoriesReceived: string[]}}
 */
export function filterContextForSeat(fullContext, seatCode) {
  const categories = getCategoriesForSeat(seatCode);
  const filteredContext = {};
  for (const cat of categories) {
    if (fullContext[cat] !== undefined) {
      filteredContext[cat] = fullContext[cat];
    }
  }
  return { filteredContext, categoriesReceived: categories };
}

/**
 * Sanitize cross-seat position text for Round 2 sharing.
 * Strips information from categories that were withheld from the receiving seat.
 *
 * @param {string} positionText - The sharing seat's position text
 * @param {string[]} receiverCategories - Categories the receiving seat has access to
 * @param {string[]} sharerCategories - Categories the sharing seat had access to
 * @returns {string} Sanitized position text
 */
export function sanitizeForRound2(positionText, receiverCategories, sharerCategories) {
  const withheld = sharerCategories.filter(c => !receiverCategories.includes(c));
  if (withheld.length === 0) return positionText;

  // Redact references to withheld categories
  let sanitized = positionText;
  for (const cat of withheld) {
    const pattern = new RegExp(`\\b${cat}\\b[^.]*\\.`, 'gi');
    sanitized = sanitized.replace(pattern, `[${cat} context redacted for information asymmetry].`);
  }
  return sanitized;
}

export { CONTEXT_CATEGORIES, ROLE_CATEGORY_MAP };
