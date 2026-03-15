/**
 * prove-helpers.cjs — Helper functions for /prove skill
 * Gate detection, venture ranking, gap formatting, brainstorm context building
 */

const GATE_STAGES = [3, 5, 10, 22, 25];

/**
 * Detect the next gate segment to assess based on journal entries
 * @param {object[]} journalEntries - existing journal entries for this venture
 * @returns {{ from: number, toGate: number, isComplete: boolean }}
 */
function detectNextGate(journalEntries) {
  if (!journalEntries || journalEntries.length === 0) {
    return { from: 0, toGate: GATE_STAGES[0], isComplete: false };
  }

  const maxStage = Math.max(...journalEntries.map(e => e.stage_number));

  // Find which gate we just completed
  const completedGateIdx = GATE_STAGES.findIndex(g => g === maxStage);

  if (completedGateIdx >= 0 && completedGateIdx < GATE_STAGES.length - 1) {
    // Completed a gate, move to next segment
    const nextFrom = maxStage + 1;
    const nextGate = GATE_STAGES[completedGateIdx + 1];
    return { from: nextFrom, toGate: nextGate, isComplete: false };
  }

  if (maxStage >= 25) {
    return { from: 25, toGate: 25, isComplete: true };
  }

  // Mid-segment — find which gate segment we're in
  const currentGate = GATE_STAGES.find(g => g > maxStage) || 25;
  return { from: maxStage + 1, toGate: currentGate, isComplete: false };
}

/**
 * Rank ventures by proving run readiness
 * @param {object[]} ventures - from ventures table
 * @param {object[]} journalGroups - journal entry counts per venture
 * @returns {object[]} ranked ventures with rationale
 */
function rankVentures(ventures, journalGroups) {
  const journalMap = {};
  for (const g of (journalGroups || [])) {
    journalMap[g.venture_id] = g.count;
  }

  return ventures
    .map(v => {
      const journalCount = journalMap[v.id] || 0;
      const stage = v.current_lifecycle_stage || 0;
      let state, rationale;

      if (journalCount >= 26) {
        state = 'complete';
        rationale = 'Proving run complete — view report or re-run';
      } else if (journalCount > 0) {
        state = 'in_progress';
        rationale = `${journalCount}/26 stages assessed — resume to continue`;
      } else {
        state = 'not_started';
        rationale = stage >= 10
          ? 'Most mature venture — best candidate for first run'
          : stage >= 5
            ? 'Mid-stage venture — good proving candidate'
            : 'Early-stage — limited implementation to assess';
      }

      return {
        id: v.id,
        name: v.name || `Venture ${v.id.slice(0, 8)}`,
        lifecycle_stage: stage,
        journal_count: journalCount,
        state,
        rationale,
        score: (stage * 10) + (journalCount > 0 ? 500 : 0) // strongly prioritize in-progress
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Format gap analysis for display
 * @param {object} gapAnalysis - from Gap Analyst
 * @returns {string} formatted text
 */
function formatGapSummary(gapAnalysis) {
  if (!gapAnalysis || !gapAnalysis.summary) return 'No gap data available.';

  const s = gapAnalysis.summary;
  const lines = [];

  lines.push(`Gaps: ${s.total} total`);
  if (s.by_severity.blocker > 0) lines.push(`  Blocker: ${s.by_severity.blocker}`);
  if (s.by_severity.major > 0) lines.push(`  Major: ${s.by_severity.major}`);
  if (s.by_severity.minor > 0) lines.push(`  Minor: ${s.by_severity.minor}`);
  if (s.by_severity.cosmetic > 0) lines.push(`  Cosmetic: ${s.by_severity.cosmetic}`);

  lines.push(`\nRecommendation: ${gapAnalysis.recommendation.toUpperCase()}`);
  lines.push(gapAnalysis.recommendation_reason);

  // Top blocker if any
  const blocker = (gapAnalysis.gaps || []).find(g => g.severity === 'blocker');
  if (blocker) {
    lines.push(`\nTop blocker: ${blocker.description}`);
  }

  return lines.join('\n');
}

/**
 * Build brainstorm context from gap analysis for /brainstorm invocation
 * @param {string} ventureName
 * @param {number} gateStage
 * @param {object} gapAnalysis
 * @returns {string} brainstorm topic
 */
function buildBrainstormContext(ventureName, gateStage, gapAnalysis) {
  const blockers = (gapAnalysis.gaps || []).filter(g => g.severity === 'blocker');
  const majors = (gapAnalysis.gaps || []).filter(g => g.severity === 'major');
  const criticalGaps = [...blockers, ...majors];

  const lines = [
    `Remediate proving run gaps for "${ventureName}" at Gate ${gateStage}`,
    '',
    `${criticalGaps.length} critical gaps found during venture proving run:`,
  ];

  for (const gap of criticalGaps.slice(0, 5)) {
    lines.push(`- [${gap.severity}] Stage ${gap.stage_number}: ${gap.description}`);
  }

  lines.push('');
  lines.push(`Recommendation: ${gapAnalysis.recommendation_reason}`);

  return lines.join('\n');
}

/**
 * Determine if gaps are complex (need brainstorm) or simple (QF)
 * @param {object} gapAnalysis
 * @returns {{ isComplex: boolean, reason: string }}
 */
function assessGapComplexity(gapAnalysis) {
  const blockers = (gapAnalysis.gaps || []).filter(g => g.severity === 'blocker').length;
  const majors = (gapAnalysis.gaps || []).filter(g => g.severity === 'major').length;
  const total = (gapAnalysis.gaps || []).length;

  if (blockers > 0 || majors >= 3 || total >= 5) {
    return {
      isComplex: true,
      reason: blockers > 0
        ? `${blockers} blocker gap(s) require architectural thinking`
        : `${majors} major gaps across multiple areas suggest systemic issue`
    };
  }

  return {
    isComplex: false,
    reason: `${total} minor/cosmetic gap(s) — quick fix appropriate`
  };
}

module.exports = {
  GATE_STAGES,
  detectNextGate,
  rankVentures,
  formatGapSummary,
  buildBrainstormContext,
  assessGapComplexity
};
