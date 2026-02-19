/**
 * DFE Context Adapter
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-001)
 *
 * Transforms raw DFE engine output into a presentation-ready format
 * suitable for the Chairman Dashboard Escalation Panel.
 *
 * Design principles:
 *   - Pure function, no side effects, no DB access
 *   - Dependency-injected input (same pattern as decision-filter-engine.js)
 *   - Maps categorical severity to numeric scores
 *   - Extracts type-specific details for human-readable display
 */

const TRIGGER_DISPLAY_MAP = {
  cost_threshold: {
    displayLabel: 'Cost Threshold Exceeded',
    category: 'financial',
  },
  new_tech_vendor: {
    displayLabel: 'Unapproved Technology or Vendor',
    category: 'technology',
  },
  strategic_pivot: {
    displayLabel: 'Strategic Pivot Detected',
    category: 'strategy',
  },
  low_score: {
    displayLabel: 'Quality Score Below Threshold',
    category: 'quality',
  },
  novel_pattern: {
    displayLabel: 'Novel Pattern Detected',
    category: 'pattern',
  },
  constraint_drift: {
    displayLabel: 'Constraint Parameter Drift',
    category: 'compliance',
  },
  vision_score_signal: {
    displayLabel: 'Vision Score Below Exec Threshold',
    category: 'quality',
  },
};

const SEVERITY_SCORE_RANGES = {
  HIGH: { min: 80, max: 100 },
  MEDIUM: { min: 40, max: 79 },
  LOW: { min: 10, max: 39 },
  INFO: { min: 0, max: 9 },
};

/**
 * Convert categorical severity to a numeric score.
 * Uses the midpoint of the range for consistency.
 */
function severityToNumericScore(severity) {
  const range = SEVERITY_SCORE_RANGES[severity];
  if (!range) return 50; // fallback for unknown severity
  return Math.round((range.min + range.max) / 2);
}

/**
 * Extract human-readable source details from trigger details object.
 * Each trigger type has different detail fields.
 */
function extractSourceDetails(trigger) {
  const { type, details } = trigger;
  if (!details) return {};

  switch (type) {
    case 'cost_threshold':
      return {
        threshold: details.threshold,
        actual: details.cost,
        thresholdSource: details.thresholdSource,
        overagePercent: details.threshold > 0
          ? Math.round(((details.cost - details.threshold) / details.threshold) * 100)
          : null,
      };

    case 'new_tech_vendor':
      return {
        newItems: details.newItems || [],
        approvedList: details.approvedList || [],
        thresholdSource: details.thresholdSource,
      };

    case 'strategic_pivot':
      return {
        matchedKeywords: details.matchedKeywords || [],
        thresholdSource: details.thresholdSource,
      };

    case 'low_score':
      return {
        score: details.score,
        threshold: details.threshold,
        thresholdSource: details.thresholdSource,
        deficit: details.threshold != null && details.score != null
          ? details.threshold - details.score
          : null,
      };

    case 'novel_pattern':
      return {
        novelPatterns: details.novelPatterns || [],
        priorPatternCount: details.priorCount || 0,
      };

    case 'constraint_drift':
      if (details.missingKey) {
        return {
          missingPreference: details.missingKey,
          defaultUsed: details.defaultValue,
        };
      }
      return {
        drifts: (details.drifts || []).map(d => ({
          parameter: d.key,
          current: d.current,
          approved: d.approved,
        })),
      };

    default:
      return { ...details };
  }
}

/**
 * Transform a single DFE trigger into presentation format.
 */
function transformTrigger(trigger) {
  const mapping = TRIGGER_DISPLAY_MAP[trigger.type] || {
    displayLabel: trigger.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    category: 'unknown',
  };

  return {
    triggerType: trigger.type,
    displayLabel: mapping.displayLabel,
    category: mapping.category,
    severityBand: trigger.severity,
    numericScore: severityToNumericScore(trigger.severity),
    message: trigger.message,
    sourceDetails: extractSourceDetails(trigger),
  };
}

/**
 * Transform a full DFE evaluation result into presentation-ready format.
 *
 * @param {object} dfeResult - Output from evaluateDecision()
 * @param {boolean} dfeResult.auto_proceed
 * @param {object[]} dfeResult.triggers
 * @param {string} dfeResult.recommendation
 * @param {object} [ventureContext] - Optional venture info
 * @param {string} [ventureContext.ventureId]
 * @param {string} [ventureContext.ventureName]
 * @param {number} [ventureContext.stageNumber]
 * @returns {object} Presentation-ready escalation context
 */
export function transformForPresentation(dfeResult, ventureContext = {}) {
  if (!dfeResult) {
    return {
      triggers: [],
      recommendation: 'AUTO_PROCEED',
      ventureContext: {},
      triggerCount: 0,
      maxSeverityScore: 0,
    };
  }

  const triggers = (dfeResult.triggers || []).map(transformTrigger);
  const maxSeverityScore = triggers.length > 0
    ? Math.max(...triggers.map(t => t.numericScore))
    : 0;

  return {
    triggers,
    recommendation: dfeResult.recommendation || 'AUTO_PROCEED',
    ventureContext: {
      ventureId: ventureContext.ventureId || null,
      ventureName: ventureContext.ventureName || null,
      stageNumber: ventureContext.stageNumber || null,
    },
    triggerCount: triggers.length,
    maxSeverityScore,
  };
}

export {
  TRIGGER_DISPLAY_MAP,
  SEVERITY_SCORE_RANGES,
  severityToNumericScore,
  extractSourceDetails,
  transformTrigger,
};
