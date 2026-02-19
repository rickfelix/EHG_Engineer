/**
 * Mitigation Generator
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-002)
 *
 * Produces actionable mitigation suggestions for each DFE trigger type.
 * Uses static rule-based templates — deterministic, no LLM dependency.
 *
 * Design principles:
 *   - Pure function, deterministic output
 *   - No database or LLM access
 *   - Follows DFE philosophy: same inputs → same outputs
 *   - Graceful fallback for unknown trigger types
 */

const MITIGATION_TEMPLATES = {
  cost_threshold: [
    {
      action: 'Renegotiate budget allocation with stakeholders',
      effort: 'medium',
      impact: 'Can reduce projected cost by 15-30% through scope negotiation',
      rationale: 'Budget overruns often stem from scope creep; renegotiation addresses root cause',
    },
    {
      action: 'Phase spending over multiple quarters',
      effort: 'low',
      impact: 'Spreads financial risk without reducing total investment',
      rationale: 'Phased spending reduces single-quarter exposure and allows course correction',
    },
    {
      action: 'Reduce scope to fit within approved budget',
      effort: 'high',
      impact: 'Eliminates cost overrun but may delay non-essential features',
      rationale: 'Scope reduction is the most direct way to control costs when budget is fixed',
    },
  ],

  new_tech_vendor: [
    {
      action: 'Conduct rapid technology assessment (1-2 days)',
      effort: 'medium',
      impact: 'Validates technology choice with evidence before committing',
      rationale: 'New technology introduces unknown risks; assessment quantifies them',
    },
    {
      action: 'Identify approved alternative that meets requirements',
      effort: 'medium',
      impact: 'Eliminates vendor risk while maintaining functionality',
      rationale: 'Approved technologies have known risk profiles and support paths',
    },
    {
      action: 'Add technology to approved list with risk acknowledgment',
      effort: 'low',
      impact: 'Unblocks progress while documenting risk acceptance',
      rationale: 'Some new technologies are strategically valuable and worth the risk',
    },
  ],

  strategic_pivot: [
    {
      action: 'Convene strategic review session with leadership',
      effort: 'medium',
      impact: 'Ensures pivot aligns with overall business strategy',
      rationale: 'Strategic pivots affect multiple stakeholders and require alignment',
    },
    {
      action: 'Document pivot rationale and expected outcomes',
      effort: 'low',
      impact: 'Creates accountability and enables future evaluation of pivot decision',
      rationale: 'Documented pivots can be evaluated retroactively for learning',
    },
    {
      action: 'Define rollback criteria if pivot proves unsuccessful',
      effort: 'low',
      impact: 'Provides safety net and clear decision framework for reversal',
      rationale: 'Pre-defined rollback criteria prevent escalation of commitment bias',
    },
  ],

  low_score: [
    {
      action: 'Investigate root causes of quality deficit',
      effort: 'medium',
      impact: 'Addresses underlying issues rather than symptoms',
      rationale: 'Low scores are symptoms; fixing root causes prevents recurrence',
    },
    {
      action: 'Add targeted quality gates before next stage',
      effort: 'low',
      impact: 'Catches quality issues earlier in the pipeline',
      rationale: 'Earlier detection reduces cost of quality corrections',
    },
  ],

  novel_pattern: [
    {
      action: 'Research pattern precedents in similar ventures',
      effort: 'medium',
      impact: 'Determines if novel pattern is innovation or risk signal',
      rationale: 'Novel patterns may indicate either breakthrough or oversight',
    },
    {
      action: 'Flag for monitoring in subsequent stages',
      effort: 'low',
      impact: 'Tracks pattern evolution without blocking progress',
      rationale: 'Some novel patterns resolve naturally; monitoring avoids premature intervention',
    },
  ],

  constraint_drift: [
    {
      action: 'Review and update approved constraints to match reality',
      effort: 'low',
      impact: 'Aligns formal constraints with actual operating conditions',
      rationale: 'Constraints may legitimately need updating as venture evolves',
    },
    {
      action: 'Investigate cause of drift and correct if unintentional',
      effort: 'medium',
      impact: 'Restores parameter alignment if drift was accidental',
      rationale: 'Unintentional drift signals process or communication issues',
    },
  ],

  vision_score_signal: [
    {
      action: 'Review SD scope against low-scoring vision dimensions and narrow scope to align',
      effort: 'medium',
      impact: 'Directly addresses root cause; targeted scope reduction improves vision alignment score',
      rationale: 'Vision misalignment during EXEC often stems from scope creep beyond approved vision boundaries',
    },
    {
      action: 'Schedule corrective SD to address identified vision dimension gaps after current EXEC completes',
      effort: 'low',
      impact: 'Documents the gap formally and creates an actionable follow-up without blocking current work',
      rationale: 'If blocking EXEC is not viable, capturing the gap as a corrective SD ensures governance continuity',
    },
  ],
};

const FALLBACK_MITIGATIONS = [
  {
    action: 'Review escalation details and gather additional context',
    effort: 'low',
    impact: 'Ensures informed decision-making with complete information',
    rationale: 'Unknown trigger types require careful human evaluation',
  },
  {
    action: 'Consult domain expert for specialized assessment',
    effort: 'medium',
    impact: 'Brings relevant expertise to bear on unfamiliar risk type',
    rationale: 'Unfamiliar risks benefit from specialist knowledge',
  },
];

/**
 * Generate mitigations for a single trigger.
 *
 * @param {object} trigger - A DFE trigger object with type, severity, details
 * @returns {object[]} Array of mitigation objects
 */
export function generateForTrigger(trigger) {
  if (!trigger || !trigger.type) return FALLBACK_MITIGATIONS;
  return MITIGATION_TEMPLATES[trigger.type] || FALLBACK_MITIGATIONS;
}

/**
 * Generate mitigations for a full DFE escalation result.
 * Groups mitigations by trigger type and provides a combined priority ranking.
 *
 * @param {object} dfeResult - Output from evaluateDecision()
 * @returns {object} { byTrigger: { [type]: mitigation[] }, combinedPriority: top3[] }
 */
export function generateForEscalation(dfeResult) {
  if (!dfeResult || !Array.isArray(dfeResult.triggers)) {
    return { byTrigger: {}, combinedPriority: [] };
  }

  const byTrigger = {};
  const allMitigations = [];

  // Deduplicate trigger types (DFE can produce multiple triggers of same type)
  const seenTypes = new Set();

  for (const trigger of dfeResult.triggers) {
    if (seenTypes.has(trigger.type)) continue;
    seenTypes.add(trigger.type);

    const mitigations = generateForTrigger(trigger);
    byTrigger[trigger.type] = mitigations;

    for (const m of mitigations) {
      allMitigations.push({
        ...m,
        triggerType: trigger.type,
        triggerSeverity: trigger.severity,
      });
    }
  }

  // Rank by impact: HIGH severity triggers first, then by effort (low effort preferred)
  const effortOrder = { low: 0, medium: 1, high: 2 };
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };

  const seen = new Set();
  const combinedPriority = allMitigations
    .filter(m => {
      if (seen.has(m.action)) return false;
      seen.add(m.action);
      return true;
    })
    .sort((a, b) => {
      const sevDiff = (severityOrder[a.triggerSeverity] ?? 3) - (severityOrder[b.triggerSeverity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return (effortOrder[a.effort] ?? 1) - (effortOrder[b.effort] ?? 1);
    })
    .slice(0, 3);

  return { byTrigger, combinedPriority };
}

export { MITIGATION_TEMPLATES, FALLBACK_MITIGATIONS };
