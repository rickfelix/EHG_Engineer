/**
 * LEO Protocol Compliance Scorer
 *
 * Calculates compliance scores across 5 dimensions:
 * 1. Handoff Completeness (25%) - Required handoffs per SD type present
 * 2. Handoff Quality (25%) - All 7 mandatory elements filled
 * 3. Gate Compliance (25%) - Met 85% threshold, 70% PRD quality
 * 4. Sequence Compliance (15%) - Correct phase order maintained
 * 5. Duration Efficiency (10%) - Reasonable time per phase
 */

// Dimension weights (must sum to 1.0)
const WEIGHTS = {
  handoffCompleteness: 0.25,
  handoffQuality: 0.25,
  gateCompliance: 0.25,
  sequenceCompliance: 0.15,
  durationEfficiency: 0.10
};

// The 7 mandatory handoff elements
const MANDATORY_ELEMENTS = [
  'executive_summary',
  'deliverables_manifest',
  'key_decisions',
  'known_issues',
  'resource_utilization',
  'action_items',
  'completeness_report'
];

// Expected handoff sequence
const HANDOFF_SEQUENCE = [
  'LEAD-TO-PLAN',
  'PLAN-TO-EXEC',
  'EXEC-TO-PLAN',
  'PLAN-TO-LEAD'
];

// Default expected durations by SD type (hours)
const EXPECTED_DURATIONS = {
  feature: 8,
  bugfix: 4,
  infrastructure: 12,
  docs: 2,
  refactor: 6,
  orchestrator: 24,
  default: 8
};

/**
 * Calculate Handoff Completeness score
 * Checks if all required handoffs per SD type are present
 * @param {Object} data - Aggregated SD data
 * @returns {Object} Score and details
 */
function calcHandoffCompleteness(data) {
  const { handoffs, validationProfile, isOrchestrator, children } = data;

  // Get required handoff types from profile
  const requiredTypes = validationProfile?.required_handoff_types || HANDOFF_SEQUENCE;
  const acceptedHandoffs = handoffs.filter(h => h.status === 'accepted');

  if (isOrchestrator) {
    // For orchestrators: check each child has required handoffs
    let totalRequired = 0;
    let totalCompleted = 0;

    // Parent SD handoffs
    const parentHandoffTypes = new Set(
      (data.parentHandoffs || [])
        .filter(h => h.status === 'accepted')
        .map(h => h.handoff_type)
    );
    totalRequired += requiredTypes.length;
    totalCompleted += requiredTypes.filter(t => parentHandoffTypes.has(t)).length;

    // Each child's handoffs
    for (const child of children) {
      const childHandoffTypes = new Set(
        child.handoffs.filter(h => h.status === 'accepted').map(h => h.handoff_type)
      );
      const childRequired = child.validationProfile?.required_handoff_types || requiredTypes;
      totalRequired += childRequired.length;
      totalCompleted += childRequired.filter(t => childHandoffTypes.has(t)).length;
    }

    const score = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
    return {
      score,
      details: {
        totalRequired,
        totalCompleted,
        missing: totalRequired - totalCompleted
      }
    };
  }

  // For standalone SDs
  const handoffTypes = new Set(acceptedHandoffs.map(h => h.handoff_type));
  const completedRequired = requiredTypes.filter(t => handoffTypes.has(t));
  const score = requiredTypes.length > 0
    ? Math.round((completedRequired.length / requiredTypes.length) * 100)
    : 0;

  return {
    score,
    details: {
      required: requiredTypes,
      completed: completedRequired,
      missing: requiredTypes.filter(t => !handoffTypes.has(t))
    }
  };
}

/**
 * Calculate Handoff Quality score
 * Checks if all 7 mandatory elements are filled for each handoff
 * @param {Object} data - Aggregated SD data
 * @returns {Object} Score and details
 */
function calcHandoffQuality(data) {
  const { handoffs } = data;
  const acceptedHandoffs = handoffs.filter(h => h.status === 'accepted');

  if (acceptedHandoffs.length === 0) {
    return { score: 0, details: { totalHandoffs: 0, avgElementsFilled: 0 } };
  }

  let totalElements = 0;
  let filledElements = 0;
  const handoffDetails = [];

  for (const handoff of acceptedHandoffs) {
    let filled = 0;
    for (const element of MANDATORY_ELEMENTS) {
      totalElements++;
      const value = handoff[element];
      // Check if element is filled (not null, not empty string, not empty array/object)
      if (value !== null && value !== undefined) {
        if (typeof value === 'string' && value.trim() !== '') {
          filled++;
          filledElements++;
        } else if (Array.isArray(value) && value.length > 0) {
          filled++;
          filledElements++;
        } else if (typeof value === 'object' && Object.keys(value).length > 0) {
          filled++;
          filledElements++;
        }
      }
    }
    handoffDetails.push({
      type: handoff.handoff_type,
      filled,
      total: MANDATORY_ELEMENTS.length
    });
  }

  const score = totalElements > 0 ? Math.round((filledElements / totalElements) * 100) : 0;

  return {
    score,
    details: {
      totalHandoffs: acceptedHandoffs.length,
      totalElements,
      filledElements,
      avgElementsFilled: Math.round((filledElements / acceptedHandoffs.length)),
      handoffDetails
    }
  };
}

/**
 * Calculate Gate Compliance score
 * Checks validation scores meet thresholds
 * @param {Object} data - Aggregated SD data
 * @returns {Object} Score and details
 */
function calcGateCompliance(data) {
  const { handoffs, prd, retrospective } = data;
  const acceptedHandoffs = handoffs.filter(h => h.status === 'accepted');

  let checks = [];
  let passed = 0;

  // Check 1: Handoff validation scores >= 85%
  const handoffsWithScores = acceptedHandoffs.filter(h => h.validation_score !== null);
  if (handoffsWithScores.length > 0) {
    const avgScore = handoffsWithScores.reduce((sum, h) => sum + h.validation_score, 0) / handoffsWithScores.length;
    const handoffPass = avgScore >= 85;
    checks.push({ name: 'Handoff Validation (>=85%)', passed: handoffPass, value: Math.round(avgScore) });
    if (handoffPass) passed++;
  }

  // Check 2: PRD approved/completed
  if (prd) {
    const prdPass = ['approved', 'completed'].includes(prd.status);
    checks.push({ name: 'PRD Status', passed: prdPass, value: prd.status });
    if (prdPass) passed++;
  }

  // Check 3: Retrospective quality >= 70%
  if (retrospective && retrospective.quality_score !== null) {
    const retroPass = retrospective.quality_score >= 70;
    checks.push({ name: 'Retrospective Quality (>=70%)', passed: retroPass, value: retrospective.quality_score });
    if (retroPass) passed++;
  }

  // Check 4: All handoffs passed validation
  const validationPassedCheck = acceptedHandoffs.every(h => h.validation_passed === true);
  checks.push({ name: 'All Handoffs Validated', passed: validationPassedCheck, value: validationPassedCheck });
  if (validationPassedCheck) passed++;

  const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;

  return {
    score,
    details: { checks, passed, total: checks.length }
  };
}

/**
 * Calculate Sequence Compliance score
 * Checks if handoffs followed correct order
 * @param {Object} data - Aggregated SD data
 * @returns {Object} Score and details
 */
function calcSequenceCompliance(data) {
  const { handoffs, isOrchestrator, children } = data;

  // For orchestrators, check each SD's sequence individually
  if (isOrchestrator) {
    const sdSequences = [
      { sd: data.sd.id, handoffs: data.parentHandoffs || [] },
      ...children.map(c => ({ sd: c.sd.id, handoffs: c.handoffs }))
    ];

    let totalCorrect = 0;
    let totalChecked = 0;

    for (const { handoffs: sdHandoffs } of sdSequences) {
      const result = checkSequence(sdHandoffs);
      totalCorrect += result.correct;
      totalChecked += result.total;
    }

    const score = totalChecked > 0 ? Math.round((totalCorrect / totalChecked) * 100) : 100;
    return { score, details: { totalCorrect, totalChecked } };
  }

  // For standalone SDs
  const result = checkSequence(handoffs);
  const score = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 100;

  return {
    score,
    details: result
  };
}

/**
 * Check handoff sequence for a single SD
 */
function checkSequence(handoffs) {
  const acceptedHandoffs = handoffs
    .filter(h => h.status === 'accepted')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (acceptedHandoffs.length <= 1) {
    return { correct: 1, total: 1, violations: [] };
  }

  let correct = 0;
  let total = 0;
  const violations = [];

  for (let i = 0; i < acceptedHandoffs.length - 1; i++) {
    total++;
    const current = acceptedHandoffs[i];
    const next = acceptedHandoffs[i + 1];

    const currentIdx = HANDOFF_SEQUENCE.indexOf(current.handoff_type);
    const nextIdx = HANDOFF_SEQUENCE.indexOf(next.handoff_type);

    // Check if sequence is correct (next should come after current in sequence)
    if (currentIdx !== -1 && nextIdx !== -1 && nextIdx > currentIdx) {
      correct++;
    } else if (currentIdx === -1 || nextIdx === -1) {
      // Unknown handoff types - consider correct
      correct++;
    } else {
      violations.push({ from: current.handoff_type, to: next.handoff_type });
    }
  }

  // Add 1 for having handoffs at all
  if (total === 0) {
    total = 1;
    correct = 1;
  }

  return { correct, total, violations };
}

/**
 * Calculate Duration Efficiency score
 * Compares actual duration vs expected for SD type
 * @param {Object} data - Aggregated SD data
 * @returns {Object} Score and details
 */
function calcDurationEfficiency(data) {
  const { sd, timeline } = data;

  // Calculate actual duration
  const startDate = sd.created_at ? new Date(sd.created_at) : null;
  const endDate = sd.completion_date ? new Date(sd.completion_date) : null;

  if (!startDate || !endDate) {
    return { score: 100, details: { note: 'No timing data available' } };
  }

  const actualHours = (endDate - startDate) / (1000 * 60 * 60);
  const sdType = sd.sd_type || 'default';
  const expectedHours = EXPECTED_DURATIONS[sdType] || EXPECTED_DURATIONS.default;

  // Score based on how close actual is to expected
  // Perfect: actual <= expected (100%)
  // Linear decrease: 2x expected = 50%, 3x+ expected = 0%
  let score;
  if (actualHours <= expectedHours) {
    score = 100;
  } else {
    const ratio = actualHours / expectedHours;
    score = Math.max(0, Math.round(100 - ((ratio - 1) * 50)));
  }

  return {
    score,
    details: {
      actualHours: Math.round(actualHours * 10) / 10,
      expectedHours,
      sdType,
      ratio: Math.round((actualHours / expectedHours) * 100) / 100
    }
  };
}

/**
 * Calculate overall compliance scores
 * @param {Object} data - Aggregated SD data
 * @returns {Object} All scores with overall weighted average
 */
export function calculateComplianceScores(data) {
  const handoffCompleteness = calcHandoffCompleteness(data);
  const handoffQuality = calcHandoffQuality(data);
  const gateCompliance = calcGateCompliance(data);
  const sequenceCompliance = calcSequenceCompliance(data);
  const durationEfficiency = calcDurationEfficiency(data);

  // Calculate weighted overall score
  const overall = Math.round(
    handoffCompleteness.score * WEIGHTS.handoffCompleteness +
    handoffQuality.score * WEIGHTS.handoffQuality +
    gateCompliance.score * WEIGHTS.gateCompliance +
    sequenceCompliance.score * WEIGHTS.sequenceCompliance +
    durationEfficiency.score * WEIGHTS.durationEfficiency
  );

  // Determine grade
  let grade;
  if (overall >= 90) grade = 'A';
  else if (overall >= 80) grade = 'B';
  else if (overall >= 70) grade = 'C';
  else if (overall >= 60) grade = 'D';
  else grade = 'F';

  return {
    overall,
    grade,
    dimensions: {
      handoffCompleteness,
      handoffQuality,
      gateCompliance,
      sequenceCompliance,
      durationEfficiency
    },
    weights: WEIGHTS
  };
}

/**
 * Get status label based on score
 */
export function getScoreStatus(score) {
  if (score >= 85) return 'PASS';
  if (score >= 70) return 'WARN';
  return 'FAIL';
}
