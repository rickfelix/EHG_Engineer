/**
 * SD-Type Section Enforcement Policy for Gate 2 (EXEC→PLAN)
 *
 * Centralized policy mapping (sdType, sectionName) → enforcement mode.
 * Follows the getEnforcementMode pattern from performance-critical-gate.js.
 *
 * Precedence:
 * 1. Database-driven exemptions (gate2_exempt_sections) — checked in each section
 * 2. This centralized policy — fallback when no DB exemption exists
 * 3. Existing hardcoded inline checks — preserved as secondary fallback
 */

/**
 * Section enforcement modes:
 * - REQUIRED: Current behavior — score penalties for failures
 * - ADVISORY: Run checks, log warnings, but award full credit (no score penalty)
 * - SKIP:     Full credit, no checks run
 */

const SECTION_POLICY = {
  feature:        { A: 'REQUIRED', B: 'REQUIRED', C: 'REQUIRED', D: 'REQUIRED' },
  frontend:       { A: 'REQUIRED', B: 'REQUIRED', C: 'REQUIRED', D: 'REQUIRED' },
  database:       { A: 'SKIP',     B: 'REQUIRED', C: 'ADVISORY', D: 'REQUIRED' },
  infrastructure: { A: 'SKIP',     B: 'REQUIRED', C: 'SKIP',     D: 'ADVISORY' },
  documentation:  { A: 'SKIP',     B: 'SKIP',     C: 'SKIP',     D: 'SKIP'     },
  fix:            { A: 'ADVISORY', B: 'ADVISORY', C: 'ADVISORY', D: 'REQUIRED' },
  bugfix:         { A: 'ADVISORY', B: 'ADVISORY', C: 'ADVISORY', D: 'REQUIRED' },
  refactor:       { A: 'ADVISORY', B: 'ADVISORY', C: 'ADVISORY', D: 'REQUIRED' },
  enhancement:    { A: 'ADVISORY', B: 'ADVISORY', C: 'ADVISORY', D: 'REQUIRED' },
  performance:    { A: 'SKIP',     B: 'ADVISORY', C: 'ADVISORY', D: 'REQUIRED' },
};

/**
 * Get enforcement mode for a section given an SD type.
 *
 * @param {string} sdType - The SD type (lowercase)
 * @param {'A'|'B'|'C'|'D'} section - Section identifier
 * @returns {'REQUIRED'|'ADVISORY'|'SKIP'} Enforcement mode
 */
export function getSectionEnforcement(sdType, section) {
  const normalizedType = (sdType || '').toLowerCase().trim();
  const policy = SECTION_POLICY[normalizedType];
  if (!policy) {
    return 'REQUIRED'; // Unknown types get full enforcement
  }
  return policy[section] || 'REQUIRED';
}

/**
 * Get all section enforcement modes for an SD type.
 *
 * @param {string} sdType - The SD type (lowercase)
 * @returns {Object} Map of section → enforcement mode
 */
export function getAllSectionEnforcements(sdType) {
  const sections = ['A', 'B', 'C', 'D'];
  const result = {};
  for (const section of sections) {
    result[section] = getSectionEnforcement(sdType, section);
  }
  return result;
}

/**
 * Check if a given SD type is known to the policy.
 *
 * @param {string} sdType - The SD type
 * @returns {boolean}
 */
export function isKnownSDType(sdType) {
  return (sdType || '').toLowerCase().trim() in SECTION_POLICY;
}
