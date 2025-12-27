/**
 * Phase Calculators Module
 * Extracted from progress-calculator.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P1-003: Progress Calculator Refactoring
 *
 * Contains individual phase calculation logic for LEO Protocol v4.1
 * @module PhaseCalculators
 * @version 1.0.0
 */

// =============================================================================
// CONSTANTS: LEO Protocol v4.1 Phase Configuration
// =============================================================================

/**
 * Official phase weights from LEO Protocol v4.1
 */
export const PHASE_WEIGHTS = {
  LEAD_PLANNING: 20,       // SD creation and approval
  PLAN_DESIGN: 20,         // PRD creation and planning
  EXEC_IMPLEMENTATION: 30, // Implementation work
  PLAN_VERIFICATION: 15,   // Testing and verification
  LEAD_APPROVAL: 15        // Final approval and deployment
};

/**
 * Phase execution order
 */
export const PHASE_ORDER = [
  'LEAD_PLANNING',
  'PLAN_DESIGN',
  'EXEC_IMPLEMENTATION',
  'PLAN_VERIFICATION',
  'LEAD_APPROVAL'
];

/**
 * Human-readable phase display names
 */
export const PHASE_DISPLAY_NAMES = {
  LEAD_PLANNING: 'LEAD Planning',
  PLAN_DESIGN: 'PLAN Design',
  EXEC_IMPLEMENTATION: 'EXEC Implementation',
  PLAN_VERIFICATION: 'PLAN Verification',
  LEAD_APPROVAL: 'LEAD Approval',
  COMPLETE: 'Complete'
};

// =============================================================================
// HELPER: JSON Parsing
// =============================================================================

/**
 * Safely parse JSON field (handles string or array input)
 */
function parseJsonField(field, defaultValue = []) {
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

/**
 * Count checked items in a checklist
 */
function countCheckedItems(checklist) {
  if (!Array.isArray(checklist)) return 0;
  return checklist.filter(item =>
    typeof item === 'object' && item.checked
  ).length;
}

// =============================================================================
// PHASE 1: LEAD Planning (20%)
// =============================================================================

/**
 * Calculate LEAD Planning phase progress
 * @param {object} sd - Strategic Directive record
 * @returns {number} Progress percentage (0-100)
 */
export function calculateLeadPlanningProgress(sd) {
  if (!sd || !sd.id) return 0;

  // Check if SD is a placeholder/draft
  const isPlaceholder =
    sd.title === '[Enter Strategic Directive Title]' ||
    !sd.title ||
    sd.status === 'draft' ||
    sd.title.trim().length === 0;

  if (isPlaceholder) return 0;

  // SD exists with meaningful content
  return 100;
}

/**
 * Get LEAD Planning phase details
 */
export function getLeadPlanningDetails(sd) {
  return {
    hasTitle: sd?.title && sd.title !== '[Enter Strategic Directive Title]',
    hasDescription: sd?.description && sd.description.trim().length > 0,
    hasObjectives: sd?.strategic_objectives && sd.strategic_objectives.length > 0,
    isActive: sd?.status !== 'draft'
  };
}

// =============================================================================
// PHASE 2: PLAN Design (20%)
// =============================================================================

/**
 * Calculate PLAN Design phase progress
 * @param {object} prd - Product Requirements Document
 * @returns {number} Progress percentage (0-100)
 */
export function calculatePlanDesignProgress(prd) {
  if (!prd) return 0;

  const planChecklist = parseJsonField(prd.plan_checklist);
  if (!Array.isArray(planChecklist) || planChecklist.length === 0) return 100;

  const completedItems = countCheckedItems(planChecklist);
  return Math.round((completedItems / planChecklist.length) * 100);
}

/**
 * Get PLAN Design phase details
 */
export function getPlanDesignDetails(prd) {
  if (!prd) return { totalItems: 0, completedItems: 0, hasRequirements: false, hasTechnicalSpecs: false };

  const planChecklist = parseJsonField(prd.plan_checklist);
  const functionalReqs = parseJsonField(prd.functional_requirements);
  const technicalReqs = parseJsonField(prd.technical_requirements);

  return {
    totalItems: planChecklist.length,
    completedItems: countCheckedItems(planChecklist),
    hasRequirements: Array.isArray(functionalReqs) && functionalReqs.length > 0,
    hasTechnicalSpecs: Array.isArray(technicalReqs) && technicalReqs.length > 0
  };
}

// =============================================================================
// PHASE 3: EXEC Implementation (30%)
// =============================================================================

/**
 * Calculate EXEC Implementation phase progress
 * @param {object} prd - Product Requirements Document
 * @returns {number} Progress percentage (0-100)
 */
export function calculateExecImplementationProgress(prd) {
  if (!prd) return 0;

  const execChecklist = Array.isArray(prd.exec_checklist) ? prd.exec_checklist : [];
  if (execChecklist.length === 0) return 100; // No checklist = considered complete

  const completedItems = countCheckedItems(execChecklist);
  return Math.round((completedItems / execChecklist.length) * 100);
}

/**
 * Get EXEC Implementation phase details
 */
export function getExecImplementationDetails(prd) {
  const execChecklist = Array.isArray(prd?.exec_checklist) ? prd.exec_checklist : [];
  return {
    totalItems: execChecklist.length,
    completedItems: countCheckedItems(execChecklist),
    phase: prd?.phase || 'unknown'
  };
}

// =============================================================================
// PHASE 4: PLAN Verification (15%)
// =============================================================================

/**
 * Calculate PLAN Verification phase progress
 * @param {object} prd - Product Requirements Document
 * @returns {number} Progress percentage (0-100)
 */
export function calculatePlanVerificationProgress(prd) {
  if (!prd) return 0;

  // Check multiple sources for verification data
  const validationChecklist = parseJsonField(prd.validation_checklist);
  const metadataVerificationChecklist = parseJsonField(prd.metadata?.verification_checklist);

  let verificationItems = [];

  // 1. Check direct validation_checklist
  if (Array.isArray(validationChecklist) && validationChecklist.length > 0) {
    verificationItems = validationChecklist;
  }
  // 2. Check metadata for verification_checklist
  else if (Array.isArray(metadataVerificationChecklist) && metadataVerificationChecklist.length > 0) {
    verificationItems = metadataVerificationChecklist;
  }
  // 3. Check status-based completion
  else if (prd.status === 'verification_complete' || prd.status === 'approved') {
    return 100;
  }

  if (verificationItems.length === 0) return 0;

  const completedItems = countCheckedItems(verificationItems);
  return Math.round((completedItems / verificationItems.length) * 100);
}

/**
 * Get PLAN Verification phase details
 */
export function getPlanVerificationDetails(prd) {
  const validationChecklist = parseJsonField(prd?.validation_checklist);
  const metadataVerificationChecklist = parseJsonField(prd?.metadata?.verification_checklist);

  let verificationItems = validationChecklist.length > 0
    ? validationChecklist
    : metadataVerificationChecklist;

  if (!Array.isArray(verificationItems)) verificationItems = [];

  return {
    totalItems: verificationItems.length,
    completedItems: countCheckedItems(verificationItems),
    status: prd?.status,
    hasQualityAssurance: prd?.metadata?.quality_assurance === 'PASSED'
  };
}

// =============================================================================
// PHASE 5: LEAD Approval (15%)
// =============================================================================

/**
 * Calculate LEAD Approval phase progress
 * @param {object} prd - Product Requirements Document
 * @returns {number} Progress percentage (0-100)
 */
export function calculateLeadApprovalProgress(prd) {
  if (!prd) return 0;

  // Check explicit approval
  if (prd.approved_by === 'LEAD' && prd.approval_date) {
    return 100;
  }

  // Check status-based approval
  if (prd.status === 'approved' || prd.status === 'complete' || prd.status === 'completed') {
    return 100;
  }

  return 0;
}

/**
 * Get LEAD Approval phase details
 */
export function getLeadApprovalDetails(prd) {
  return {
    isApproved: prd?.approved_by === 'LEAD',
    approvalDate: prd?.approval_date,
    approver: prd?.approved_by,
    status: prd?.status
  };
}

// =============================================================================
// PHASE UTILITIES
// =============================================================================

/**
 * Determine current active phase based on progress
 * @param {object} phases - Phase progress object
 * @returns {string} Current phase name
 */
export function determineCurrentPhase(phases) {
  for (const phase of PHASE_ORDER) {
    if (phases[phase] < 100) {
      return phase;
    }
  }
  return 'COMPLETE';
}

/**
 * Get human-readable phase name
 * @param {string} phase - Phase identifier
 * @returns {string} Display name
 */
export function getPhaseDisplayName(phase) {
  return PHASE_DISPLAY_NAMES[phase] || phase;
}

/**
 * Calculate all phase progress values
 * @param {object} sd - Strategic Directive
 * @param {object} prd - Product Requirements Document
 * @returns {object} Phase progress values
 */
export function calculateAllPhases(sd, prd) {
  const phases = {
    LEAD_PLANNING: calculateLeadPlanningProgress(sd),
    PLAN_DESIGN: 0,
    EXEC_IMPLEMENTATION: 0,
    PLAN_VERIFICATION: 0,
    LEAD_APPROVAL: 0
  };

  if (prd) {
    phases.PLAN_DESIGN = calculatePlanDesignProgress(prd);
    phases.EXEC_IMPLEMENTATION = calculateExecImplementationProgress(prd);
    phases.PLAN_VERIFICATION = calculatePlanVerificationProgress(prd);
    phases.LEAD_APPROVAL = calculateLeadApprovalProgress(prd);
  }

  return phases;
}

/**
 * Get all phase details
 * @param {object} sd - Strategic Directive
 * @param {object} prd - Product Requirements Document
 * @returns {object} Phase details
 */
export function getAllPhaseDetails(sd, prd) {
  return {
    leadPlanning: getLeadPlanningDetails(sd),
    planDesign: prd ? getPlanDesignDetails(prd) : null,
    execImplementation: prd ? getExecImplementationDetails(prd) : null,
    planVerification: prd ? getPlanVerificationDetails(prd) : null,
    leadApproval: prd ? getLeadApprovalDetails(prd) : null
  };
}
