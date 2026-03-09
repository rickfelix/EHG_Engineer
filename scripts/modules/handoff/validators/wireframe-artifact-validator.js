/**
 * Wireframe Artifact Validator (PLAN-TO-EXEC Gate)
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 *
 * Validates that UI-producing SDs include wireframe specifications
 * in their PRD before allowing EXEC phase to begin.
 * Non-UI SDs skip this gate via SD type applicability policy.
 */

import {
  getValidatorRequirement,
  RequirementLevel,
  createSkippedResult
} from '../validation/sd-type-applicability-policy.js';

/** Keywords that indicate UI work in PRD content */
const UI_KEYWORDS = [
  'component', 'page', 'dashboard', 'panel', 'modal', 'dialog',
  'form', 'button', 'layout', 'sidebar', 'navbar', 'header',
  'footer', 'card', 'table', 'chart', 'graph', 'visualization',
  'renderer', 'view', 'screen', 'ui', 'ux', 'interface',
  'responsive', 'mobile', 'desktop', 'tab', 'menu', 'dropdown'
];

/** Wireframe reference patterns in PRD content */
const WIREFRAME_PATTERNS = [
  /wireframe/i,
  /mockup/i,
  /mock-up/i,
  /layout\s+diagram/i,
  /ui\s+sketch/i,
  /screen\s+design/i,
  /visual\s+spec/i,
  /figma/i,
  /design\s+comp/i,
  /ascii\s+wireframe/i
];

/**
 * Check if PRD text contains wireframe references
 * @param {string} text - Text to search
 * @returns {boolean}
 */
function hasWireframeReferences(text) {
  if (!text || typeof text !== 'string') return false;
  return WIREFRAME_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if PRD content indicates UI work
 * @param {object} prd - PRD object
 * @param {object} sd - SD object
 * @returns {boolean}
 */
function involvesUIWork(prd, sd) {
  // Check PRD ui_ux_requirements section
  const uiReqs = prd?.ui_ux_requirements;
  if (uiReqs && typeof uiReqs === 'object' && Object.keys(uiReqs).length > 0) {
    return true;
  }

  // Check PRD content for UI keywords
  const searchableText = [
    prd?.executive_summary,
    prd?.goal_summary,
    prd?.title,
    sd?.title,
    sd?.description,
    JSON.stringify(prd?.functional_requirements),
    JSON.stringify(prd?.backlog_items)
  ].filter(Boolean).join(' ').toLowerCase();

  const matchCount = UI_KEYWORDS.filter(kw => searchableText.includes(kw)).length;
  return matchCount >= 2; // Need at least 2 UI keyword matches
}

/**
 * Validate wireframe artifacts exist in PRD for UI-producing SDs
 * @param {object} context - Validation context
 * @returns {Promise<object>} Validation result
 */
export async function validateWireframeArtifact(context) {
  const { prd, sd } = context;
  const sdType = sd?.sd_type || 'unknown';

  // Check SD type policy for WIREFRAME category
  const requirement = getValidatorRequirement(sdType, 'WIREFRAME');

  if (requirement === RequirementLevel.NON_APPLICABLE) {
    return createSkippedResult('wireframeArtifactValidation', sdType);
  }

  // Check if this SD actually involves UI work
  if (!involvesUIWork(prd, sd)) {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: ['No UI indicators detected in PRD — wireframe gate not applicable'],
      details: { reason: 'no_ui_indicators', sd_type: sdType }
    };
  }

  // Search for wireframe references across PRD
  const searchLocations = {
    ui_ux_requirements: JSON.stringify(prd?.ui_ux_requirements || {}),
    executive_summary: prd?.executive_summary || '',
    goal_summary: prd?.goal_summary || '',
    functional_requirements: JSON.stringify(prd?.functional_requirements || []),
    implementation_approach: prd?.implementation_approach || '',
    metadata: JSON.stringify(prd?.metadata || {}),
    content: JSON.stringify(prd?.content || {})
  };

  const foundIn = [];
  for (const [location, text] of Object.entries(searchLocations)) {
    if (hasWireframeReferences(text)) {
      foundIn.push(location);
    }
  }

  const hasWireframes = foundIn.length > 0;
  const isRequired = requirement === RequirementLevel.REQUIRED;

  if (!hasWireframes && isRequired) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: [
        'UI-producing SD has no wireframe specifications in PRD. ' +
        'Add wireframe references to ui_ux_requirements or PRD content.'
      ],
      warnings: [],
      details: {
        sd_type: sdType,
        requirement: 'REQUIRED',
        ui_detected: true,
        wireframes_found: false,
        searched_locations: Object.keys(searchLocations)
      }
    };
  }

  if (!hasWireframes && requirement === RequirementLevel.OPTIONAL) {
    return {
      passed: true,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: [
        'UI-producing SD has no wireframe specifications. ' +
        'Consider adding wireframes to improve implementation fidelity.'
      ],
      details: {
        sd_type: sdType,
        requirement: 'OPTIONAL',
        ui_detected: true,
        wireframes_found: false
      }
    };
  }

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {
      sd_type: sdType,
      requirement,
      ui_detected: true,
      wireframes_found: true,
      found_in: foundIn
    }
  };
}
