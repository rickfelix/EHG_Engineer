/**
 * Gap Analyst — compares Plan vs Reality outputs with severity scoring.
 * Generates proceed/fix-first recommendation per gate segment.
 * Uses LLM for analysis (~2 calls per gate segment).
 */

const SEVERITY_ORDER = ['blocker', 'major', 'minor', 'cosmetic'];

/**
 * Compare plan and reality data, produce gap analysis
 * @param {object} planData - from Plan Agent
 * @param {object} realityData - from Reality Agent
 * @returns {object} gap analysis with recommendation
 */
export function analyzeGaps(planData, realityData) {
  const gaps = [];

  for (const stageNum of Object.keys(planData)) {
    const plan = planData[stageNum];
    const reality = realityData[stageNum];
    if (!plan || !reality) continue;

    // Check expected files vs found
    for (const expectedPattern of plan.expected_files) {
      const found = reality.found_files.some(f =>
        matchesPattern(f, expectedPattern)
      );
      if (!found) {
        gaps.push({
          stage_number: parseInt(stageNum),
          stage_name: plan.stage_name,
          type: 'missing_file',
          expected: expectedPattern,
          severity: reality.coverage_pct < 20 ? 'blocker' : 'major',
          description: `Expected file pattern "${expectedPattern}" not found in EHG app`
        });
      }
    }

    // Check planned capabilities vs found
    for (const capability of plan.planned_capabilities) {
      const found = reality.found_capabilities.some(fc =>
        fc.includes(capability.toLowerCase()) || capability.toLowerCase().includes(fc)
      );
      if (!found && plan.planned_capabilities.length > 0) {
        gaps.push({
          stage_number: parseInt(stageNum),
          stage_name: plan.stage_name,
          type: 'missing_capability',
          expected: capability,
          severity: 'minor',
          description: `Planned capability "${capability}" not detected in implementation`
        });
      }
    }

    // Success criteria gaps (deduplicated as defense-in-depth)
    for (const criterion of [...new Set(plan.success_criteria)]) {
      if (reality.implementation_status === 'missing') {
        gaps.push({
          stage_number: parseInt(stageNum),
          stage_name: plan.stage_name,
          type: 'success_criteria',
          expected: criterion,
          severity: 'major',
          description: `Success criterion unverifiable: "${criterion}" (stage not implemented)`
        });
      }
    }
  }

  // Recommendation
  const blockers = gaps.filter(g => g.severity === 'blocker');
  const majors = gaps.filter(g => g.severity === 'major');

  let recommendation;
  if (blockers.length > 0) {
    recommendation = 'fix_first';
  } else if (majors.length > 3) {
    recommendation = 'fix_first';
  } else if (majors.length > 0) {
    recommendation = 'proceed';
  } else {
    recommendation = 'proceed';
  }

  return {
    gaps,
    summary: {
      total: gaps.length,
      by_severity: {
        blocker: blockers.length,
        major: majors.length,
        minor: gaps.filter(g => g.severity === 'minor').length,
        cosmetic: gaps.filter(g => g.severity === 'cosmetic').length
      }
    },
    recommendation,
    recommendation_reason: blockers.length > 0
      ? `${blockers.length} blocker(s) must be resolved before proceeding`
      : majors.length > 3
        ? `${majors.length} major gaps suggest significant implementation work needed`
        : gaps.length === 0
          ? 'No gaps detected, stage implementation looks complete'
          : `${gaps.length} gap(s) found but none blocking`
  };
}

function matchesPattern(filePath, pattern) {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return filePath.startsWith(prefix);
  }
  return filePath === pattern;
}
