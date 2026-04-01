/**
 * Taste Gate Scorer — Configurable Scoring Engine
 *
 * Single scoring function configured per gate type.
 * Evaluates venture artifacts against per-gate rubrics
 * and returns APPROVE / CONDITIONAL / ESCALATE verdicts.
 *
 * Rubrics (from Aesthetic Scoring specialist testimony):
 *   S10 Design:       5 dimensions, threshold 3.4/5
 *   S13 Scope:        3 dimensions, threshold 3.0/5
 *   S16 Architecture: 4 criteria,   threshold 3.5/5
 *
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-A
 * @module lib/eva/taste-gate-scorer
 */

// ── Rubric Definitions ─────────────────────────────────────────

const TASTE_RUBRICS = Object.freeze({
  10: {
    name: 'Design',
    threshold: 3.4,
    conditionalMargin: 0.15,
    dimensions: [
      { key: 'brand_consistency', label: 'Brand Consistency', description: 'Matches venture identity tokens (colors, type, logo usage)' },
      { key: 'visual_hierarchy', label: 'Visual Hierarchy', description: 'User eye drawn to the right element first' },
      { key: 'accessibility', label: 'Accessibility', description: 'WCAG AA minimums (contrast, touch targets, motion)' },
      { key: 'craft_quality', label: 'Craft Quality', description: 'Spacing consistency, alignment, pixel precision' },
      { key: 'competitive_differentiation', label: 'Competitive Differentiation', description: 'Has a point of view, not a template' },
    ],
  },
  13: {
    name: 'Scope',
    threshold: 3.0,
    conditionalMargin: 0.15,
    dimensions: [
      { key: 'stage_fit', label: 'Stage Fit', description: 'Scope proportional to venture maturity' },
      { key: 'roi_clarity', label: 'ROI Clarity', description: 'Can articulate why this scope, not smaller or larger' },
      { key: 'cognitive_load', label: 'Cognitive Load', description: 'Chairman can evaluate the result' },
    ],
  },
  16: {
    name: 'Architecture',
    threshold: 3.5,
    conditionalMargin: 0.15,
    dimensions: [
      { key: 'diagram_presence', label: 'Diagram Presence', description: 'Required architecture artifacts exist' },
      { key: 'boundary_clarity', label: 'Boundary Clarity', description: 'Clear system boundaries defined' },
      { key: 'failure_mode_coverage', label: 'Failure Mode Coverage', description: 'Error paths documented, not just happy paths' },
      { key: 'reversibility', label: 'Reversibility', description: 'How costly to undo this decision' },
    ],
  },
});

// ── Verdict Constants ──────────────────────────────────────────

export const TASTE_VERDICT = Object.freeze({
  APPROVE: 'APPROVE',
  CONDITIONAL: 'CONDITIONAL',
  ESCALATE: 'ESCALATE',
});

// ── Public API ─────────────────────────────────────────────────

/**
 * Get the rubric definition for a taste gate stage.
 * @param {number} stageNumber
 * @returns {object|null} Rubric definition or null if not a taste gate
 */
export function getTasteRubric(stageNumber) {
  return TASTE_RUBRICS[stageNumber] || null;
}

/**
 * Score venture artifacts against a taste gate rubric.
 *
 * @param {number} stageNumber - Stage being evaluated (10, 13, or 16)
 * @param {object} dimensionScores - Map of dimension key → score (1-5)
 * @param {object} [options] - Additional options
 * @param {object} [options.tasteProfile] - Chairman taste profile for this venture/gate
 * @returns {object} { verdict, meanScore, threshold, dimensionResults, rubricName }
 */
export function scoreTasteGate(stageNumber, dimensionScores, options = {}) {
  const rubric = TASTE_RUBRICS[stageNumber];
  if (!rubric) {
    throw new Error(`No taste rubric defined for stage ${stageNumber}`);
  }

  // Score each dimension
  const dimensionResults = rubric.dimensions.map(dim => {
    const score = dimensionScores[dim.key];
    const numericScore = typeof score === 'number' ? Math.max(1, Math.min(5, score)) : null;
    return {
      key: dim.key,
      label: dim.label,
      score: numericScore,
      missing: numericScore === null,
    };
  });

  // Check for missing scores
  const scoredDimensions = dimensionResults.filter(d => !d.missing);
  if (scoredDimensions.length === 0) {
    return {
      verdict: TASTE_VERDICT.ESCALATE,
      meanScore: 0,
      threshold: rubric.threshold,
      dimensionResults,
      rubricName: rubric.name,
      reason: 'No dimension scores provided',
    };
  }

  // Calculate mean score
  const meanScore = scoredDimensions.reduce((sum, d) => sum + d.score, 0) / scoredDimensions.length;
  const roundedMean = Math.round(meanScore * 100) / 100;

  // Check for any critically low dimension (below 2)
  const hasCriticalLow = scoredDimensions.some(d => d.score < 2);

  // Determine verdict
  let verdict;
  let reason;

  if (hasCriticalLow) {
    verdict = TASTE_VERDICT.ESCALATE;
    const criticalDims = scoredDimensions.filter(d => d.score < 2).map(d => d.label);
    reason = `Critical low score on: ${criticalDims.join(', ')}`;
  } else if (roundedMean >= rubric.threshold) {
    verdict = TASTE_VERDICT.APPROVE;
    reason = `Mean ${roundedMean} meets threshold ${rubric.threshold}`;
  } else if (roundedMean >= rubric.threshold - rubric.conditionalMargin) {
    verdict = TASTE_VERDICT.CONDITIONAL;
    reason = `Mean ${roundedMean} within ${rubric.conditionalMargin} of threshold ${rubric.threshold}`;
  } else {
    verdict = TASTE_VERDICT.ESCALATE;
    reason = `Mean ${roundedMean} below threshold ${rubric.threshold}`;
  }

  return {
    verdict,
    meanScore: roundedMean,
    threshold: rubric.threshold,
    dimensionResults,
    rubricName: rubric.name,
    reason,
  };
}

/**
 * Build a chairman-friendly summary for a taste gate evaluation.
 * @param {object} result - Result from scoreTasteGate
 * @param {number} stageNumber
 * @returns {string} Summary string <=240 characters
 */
export function buildTasteSummary(result, stageNumber) {
  const { verdict, meanScore, threshold, rubricName } = result;
  let summary;

  switch (verdict) {
    case TASTE_VERDICT.APPROVE:
      summary = `Taste gate (${rubricName}) at stage ${stageNumber}: APPROVED. Mean score ${meanScore}/${threshold} threshold. Venture may proceed.`;
      break;
    case TASTE_VERDICT.CONDITIONAL:
      summary = `Taste gate (${rubricName}) at stage ${stageNumber}: CONDITIONAL. Mean score ${meanScore} near threshold ${threshold}. Specific fixes recommended.`;
      break;
    case TASTE_VERDICT.ESCALATE:
      summary = `Taste gate (${rubricName}) at stage ${stageNumber}: ESCALATE. ${result.reason}. Chairman review required.`;
      break;
    default:
      summary = `Taste gate (${rubricName}) at stage ${stageNumber}: ${verdict}.`;
  }

  return summary.length > 240 ? summary.slice(0, 237) + '...' : summary;
}

// ── Exports for Testing ────────────────────────────────────────

export const _internal = {
  TASTE_RUBRICS,
};
