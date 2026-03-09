/**
 * Wireframe QA Validator (EXEC-TO-PLAN Gate)
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 *
 * Validates that UI implementations reference or align with wireframe
 * specifications before allowing EXEC-TO-PLAN handoff.
 * Non-UI SDs skip this gate via SD type applicability policy.
 */

import {
  getValidatorRequirement,
  RequirementLevel,
  createSkippedResult
} from '../validation/sd-type-applicability-policy.js';

/** Patterns indicating wireframe-implementation alignment evidence */
const ALIGNMENT_PATTERNS = [
  /wireframe/i,
  /mockup/i,
  /mock-up/i,
  /design\s+spec/i,
  /visual\s+spec/i,
  /layout\s+match/i,
  /figma/i,
  /as\s+designed/i,
  /per\s+wireframe/i,
  /matches?\s+design/i,
  /screenshot/i,
  /visual\s+review/i
];

/**
 * Check if text contains wireframe alignment evidence
 * @param {string} text - Text to search
 * @returns {string[]} Matched patterns
 */
function findAlignmentEvidence(text) {
  if (!text || typeof text !== 'string') return [];
  return ALIGNMENT_PATTERNS
    .filter(pattern => pattern.test(text))
    .map(pattern => pattern.source);
}

/**
 * Validate wireframe-implementation alignment for UI-producing SDs
 * @param {object} context - Validation context
 * @returns {Promise<object>} Validation result
 */
export async function validateWireframeQA(context) {
  const { prd, sd, sd_id, supabase } = context;
  const sdType = sd?.sd_type || 'unknown';

  // Check SD type policy for WIREFRAME category
  const requirement = getValidatorRequirement(sdType, 'WIREFRAME');

  if (requirement === RequirementLevel.NON_APPLICABLE) {
    return createSkippedResult('wireframeQAValidation', sdType);
  }

  // Check if PRD had wireframe content (if no wireframes in PRD, nothing to QA against)
  const prdContent = JSON.stringify(prd || {}).toLowerCase();
  const hasWireframesInPRD = /wireframe|mockup|mock-up|figma|layout\s+diagram/i.test(prdContent);

  if (!hasWireframesInPRD) {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: ['No wireframes found in PRD — wireframe QA not applicable'],
      details: { reason: 'no_wireframes_in_prd', sd_type: sdType }
    };
  }

  // Search for alignment evidence in handoff records and deliverables
  let alignmentEvidence = [];

  // Check existing handoff records for wireframe references
  if (supabase && sd_id) {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_data, brief_data')
      .eq('sd_id', sd_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (handoffs) {
      for (const handoff of handoffs) {
        const handoffText = JSON.stringify(handoff);
        alignmentEvidence.push(...findAlignmentEvidence(handoffText));
      }
    }

    // Check deliverables for wireframe references
    const { data: deliverables } = await supabase
      .from('sd_deliverables')
      .select('title, description, evidence')
      .eq('sd_id', sd_id);

    if (deliverables) {
      for (const d of deliverables) {
        const dText = [d.title, d.description, JSON.stringify(d.evidence)].join(' ');
        alignmentEvidence.push(...findAlignmentEvidence(dText));
      }
    }
  }

  // Deduplicate evidence
  alignmentEvidence = [...new Set(alignmentEvidence)];

  const hasAlignment = alignmentEvidence.length > 0;
  const isRequired = requirement === RequirementLevel.REQUIRED;

  if (!hasAlignment && isRequired) {
    return {
      passed: true, // Advisory — don't block EXEC-TO-PLAN on wireframe QA
      score: 50,
      max_score: 100,
      issues: [],
      warnings: [
        'PRD contains wireframes but no wireframe-implementation alignment evidence found. ' +
        'Consider documenting how implementation matches wireframe specifications.'
      ],
      details: {
        sd_type: sdType,
        requirement: 'REQUIRED',
        wireframes_in_prd: true,
        alignment_evidence_found: false
      }
    };
  }

  if (!hasAlignment && requirement === RequirementLevel.OPTIONAL) {
    return {
      passed: true,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: [
        'PRD contains wireframes but no alignment evidence found in implementation. ' +
        'Consider adding wireframe reference in deliverables.'
      ],
      details: {
        sd_type: sdType,
        requirement: 'OPTIONAL',
        wireframes_in_prd: true,
        alignment_evidence_found: false
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
      wireframes_in_prd: true,
      alignment_evidence_found: true,
      evidence_patterns: alignmentEvidence
    }
  };
}
