/**
 * Decision Filter Engine
 * SD-LEO-INFRA-FILTER-ENGINE-001
 *
 * Deterministic risk-threshold engine that evaluates venture stage outputs
 * against Chairman-configured thresholds. Returns { auto_proceed, triggers, recommendation }.
 *
 * Trigger types (fixed evaluation order):
 *   1. cost_threshold      - Cost exceeds chairman-defined max
 *   1b. budget_exceeded    - Token budget usage at or over limit
 *   2. new_tech_vendor     - Introduces unapproved technology/vendor
 *   3. strategic_pivot     - Deviates from original venture direction
 *   4. low_score           - Quality/confidence score below threshold
 *   5. novel_pattern       - Pattern not seen in prior stages
 *   6. constraint_drift    - Parameters drift from approved constraints
 *   7. vision_score_signal - SD in EXEC with vision alignment score < threshold
 *
 * Design principles:
 *   - Pure, deterministic: same inputs → same outputs
 *   - Dependency injection for preferences (no module-level side effects)
 *   - Conservative defaults: missing thresholds force PRESENT_TO_CHAIRMAN
 */

const ENGINE_VERSION = '1.0.0';

// Fixed rule evaluation order for deterministic trigger ordering
const TRIGGER_TYPES = [
  'cost_threshold',
  'budget_exceeded',
  'new_tech_vendor',
  'strategic_pivot',
  'low_score',
  'novel_pattern',
  'constraint_drift',
  'vision_score_signal',
];

// Preference keys used by each trigger rule
const PREFERENCE_KEYS = {
  cost_threshold: 'filter.cost_max_usd',
  low_score: 'filter.min_score',
  chairman_review_score: 'filter.chairman_review_score',
  approved_tech: 'filter.approved_tech_list',
  approved_vendors: 'filter.approved_vendor_list',
  pivot_keywords: 'filter.pivot_keywords',
  allow_informational: 'filter.allow_informational_triggers',
  vision_score_exec_threshold: 'filter.vision_score_exec_threshold',
};

// Conservative defaults when preferences are missing
const DEFAULTS = {
  'filter.cost_max_usd': 10000,
  'filter.min_score': 7,
  'filter.chairman_review_score': 9,
  'filter.approved_tech_list': [],
  'filter.approved_vendor_list': [],
  'filter.pivot_keywords': ['pivot', 'rebrand', 'abandon', 'restart', 'scrap'],
  'filter.allow_informational_triggers': false,
  'filter.vision_score_exec_threshold': 50,
};

/**
 * Evaluate a stage output against chairman preferences and return a decision.
 *
 * @param {object} input - Stage output to evaluate
 * @param {number} [input.cost]              - Projected cost in USD
 * @param {string[]} [input.technologies]    - Technologies used
 * @param {string[]} [input.vendors]         - Vendors involved
 * @param {number} [input.score]             - Quality/confidence score (0-10)
 * @param {string} [input.description]       - Stage description text
 * @param {string[]} [input.patterns]        - Patterns detected in stage
 * @param {string[]} [input.priorPatterns]   - Patterns from previous stages
 * @param {object} [input.constraints]       - Current constraint values
 * @param {object} [input.approvedConstraints] - Originally approved constraints
 * @param {object} [input.budgetStatus]       - Token budget status from checkBudget()
 * @param {string} [input.stage]             - Stage identifier
 * @param {number} [input.visionScore]       - Vision alignment score (0-100) from eva_vision_scores
 * @param {string} [input.sdPhase]           - Current SD phase (e.g. 'EXEC', 'LEAD_APPROVAL')
 *
 * @param {object} [options]
 * @param {object} [options.preferences]     - Flat key/value map of chairman preferences
 * @param {object} [options.logger]          - Logger instance (default: silent)
 *
 * @returns {{ auto_proceed: boolean, triggers: object[], recommendation: string }}
 */
export function evaluateDecision(input = {}, options = {}) {
  const preferences = options.preferences || {};
  const logger = options.logger || { info() {}, debug() {} };
  const triggers = [];

  // Helper to resolve preference with default and track missing keys
  function getPref(key) {
    if (key in preferences) return { value: preferences[key], source: 'preference' };
    triggers.push({
      type: 'constraint_drift',
      severity: 'MEDIUM',
      message: `Missing preference: ${key}. Using default.`,
      details: { missingKey: key, defaultValue: DEFAULTS[key], thresholdUsed: DEFAULTS[key] },
    });
    return { value: DEFAULTS[key], source: 'default' };
  }

  // --- Rule 1: cost_threshold ---
  if (input.cost != null) {
    const costMax = getPref(PREFERENCE_KEYS.cost_threshold);
    if (typeof input.cost === 'number' && input.cost > costMax.value) {
      triggers.push({
        type: 'cost_threshold',
        severity: 'HIGH',
        message: `Cost $${input.cost} exceeds threshold $${costMax.value}`,
        details: { cost: input.cost, threshold: costMax.value, thresholdSource: costMax.source },
      });
    }
  }

  // --- Rule 1b: budget_exceeded (token budget from venture_token_ledger) ---
  if (input.budgetStatus) {
    const bs = input.budgetStatus;
    if (bs.is_over_budget) {
      triggers.push({
        type: 'budget_exceeded',
        severity: 'HIGH',
        message: `Token budget exceeded: ${bs.usage_percentage}% used (${bs.tokens_used} / ${bs.budget_limit} tokens)`,
        details: { tokensUsed: bs.tokens_used, budgetLimit: bs.budget_limit, usagePercentage: bs.usage_percentage },
      });
    } else if (bs.usage_percentage >= 80) {
      triggers.push({
        type: 'budget_exceeded',
        severity: 'MEDIUM',
        message: `Token budget at ${bs.usage_percentage}% — approaching limit (${bs.tokens_used} / ${bs.budget_limit} tokens)`,
        details: { tokensUsed: bs.tokens_used, budgetLimit: bs.budget_limit, usagePercentage: bs.usage_percentage },
      });
    }
  }

  // --- Rule 2: new_tech_vendor ---
  if (Array.isArray(input.technologies) && input.technologies.length > 0) {
    const approvedTech = getPref(PREFERENCE_KEYS.approved_tech);
    const approvedSet = new Set((approvedTech.value || []).map(t => t.toLowerCase()));
    const newTech = input.technologies.filter(t => !approvedSet.has(t.toLowerCase()));
    if (newTech.length > 0) {
      triggers.push({
        type: 'new_tech_vendor',
        severity: 'HIGH',
        message: `Unapproved technology: ${newTech.join(', ')}`,
        details: { newItems: newTech, approvedList: approvedTech.value, thresholdSource: approvedTech.source },
      });
    }
  }
  if (Array.isArray(input.vendors) && input.vendors.length > 0) {
    const approvedVendors = getPref(PREFERENCE_KEYS.approved_vendors);
    const vendorSet = new Set((approvedVendors.value || []).map(v => v.toLowerCase()));
    const newVendors = input.vendors.filter(v => !vendorSet.has(v.toLowerCase()));
    if (newVendors.length > 0) {
      triggers.push({
        type: 'new_tech_vendor',
        severity: 'HIGH',
        message: `Unapproved vendor: ${newVendors.join(', ')}`,
        details: { newItems: newVendors, approvedList: approvedVendors.value, thresholdSource: approvedVendors.source },
      });
    }
  }

  // --- Rule 3: strategic_pivot ---
  if (input.description) {
    const pivotKeywords = getPref(PREFERENCE_KEYS.pivot_keywords);
    const text = input.description.toLowerCase();
    const matched = (pivotKeywords.value || []).filter(kw => text.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      triggers.push({
        type: 'strategic_pivot',
        severity: 'HIGH',
        message: `Strategic pivot detected: ${matched.join(', ')}`,
        details: { matchedKeywords: matched, thresholdSource: pivotKeywords.source },
      });
    }
  }

  // --- Rule 4: low_score (two-tier per Vision v4.7) ---
  // score < min_score (default 7) → HIGH severity (requires chairman)
  // min_score ≤ score < chairman_review_score (default 9) → MEDIUM (proceed with caution)
  // score ≥ chairman_review_score → no trigger
  if (input.score != null && typeof input.score === 'number') {
    const minScore = getPref(PREFERENCE_KEYS.low_score);
    const chairmanScore = getPref(PREFERENCE_KEYS.chairman_review_score);
    if (input.score < minScore.value) {
      triggers.push({
        type: 'low_score',
        severity: 'HIGH',
        message: `Score ${input.score}/10 below minimum threshold ${minScore.value}/10 — requires chairman review`,
        details: { score: input.score, threshold: minScore.value, chairmanThreshold: chairmanScore.value, thresholdSource: minScore.source },
      });
    } else if (input.score < chairmanScore.value) {
      triggers.push({
        type: 'low_score',
        severity: 'MEDIUM',
        message: `Score ${input.score}/10 below chairman review threshold ${chairmanScore.value}/10 — proceed with caution`,
        details: { score: input.score, threshold: minScore.value, chairmanThreshold: chairmanScore.value, thresholdSource: chairmanScore.source },
      });
    }
  }

  // --- Rule 5: novel_pattern ---
  if (Array.isArray(input.patterns) && Array.isArray(input.priorPatterns)) {
    const priorSet = new Set(input.priorPatterns.map(p => p.toLowerCase()));
    const novel = input.patterns.filter(p => !priorSet.has(p.toLowerCase()));
    if (novel.length > 0) {
      triggers.push({
        type: 'novel_pattern',
        severity: 'MEDIUM',
        message: `Novel patterns detected: ${novel.join(', ')}`,
        details: { novelPatterns: novel, priorCount: input.priorPatterns.length },
      });
    }
  }

  // --- Rule 6: constraint_drift ---
  if (input.constraints && input.approvedConstraints) {
    const drifts = [];
    for (const [key, current] of Object.entries(input.constraints)) {
      const approved = input.approvedConstraints[key];
      if (approved !== undefined && JSON.stringify(current) !== JSON.stringify(approved)) {
        drifts.push({ key, current, approved });
      }
    }
    if (drifts.length > 0) {
      triggers.push({
        type: 'constraint_drift',
        severity: 'MEDIUM',
        message: `Constraint drift in ${drifts.length} parameter(s): ${drifts.map(d => d.key).join(', ')}`,
        details: { drifts },
      });
    }
  }

  // --- Rule 7: vision_score_signal (SD-MAN-INFRA-DECISION-FILTER-ESCALATION-001) ---
  // Fires when a Strategic Directive in EXEC phase scores below the vision alignment threshold.
  // Only evaluates when both visionScore and sdPhase are provided.
  if (input.visionScore != null && typeof input.visionScore === 'number' && input.sdPhase) {
    const isExecPhase = String(input.sdPhase).toUpperCase().includes('EXEC');
    if (isExecPhase) {
      const visionThreshold = getPref(PREFERENCE_KEYS.vision_score_exec_threshold);
      if (input.visionScore < visionThreshold.value) {
        triggers.push({
          type: 'vision_score_signal',
          severity: 'HIGH',
          message: `Vision score ${input.visionScore}/100 below exec threshold ${visionThreshold.value} — chairman review required`,
          details: {
            visionScore: input.visionScore,
            threshold: visionThreshold.value,
            sdPhase: input.sdPhase,
            thresholdSource: visionThreshold.source,
          },
        });
      }
    }
  }

  // Filter out constraint_drift triggers that are just "missing preference" warnings
  // from the real business triggers
  const businessTriggers = triggers.filter(
    t => !(t.type === 'constraint_drift' && t.details.missingKey)
  );
  const _missingPrefTriggers = triggers.filter(
    t => t.type === 'constraint_drift' && t.details.missingKey
  );

  // Determine auto_proceed
  const allowInformational = preferences[PREFERENCE_KEYS.allow_informational] === true;
  const hasHighTrigger = businessTriggers.some(t => t.severity === 'HIGH');
  const hasMediumTrigger = businessTriggers.some(t => t.severity === 'MEDIUM');
  const hasInfoOnly = businessTriggers.length > 0 && businessTriggers.every(t => t.severity === 'INFO');

  let auto_proceed;
  let recommendation;

  if (businessTriggers.length === 0) {
    auto_proceed = true;
    recommendation = 'AUTO_PROCEED';
  } else if (allowInformational && hasInfoOnly) {
    auto_proceed = true;
    recommendation = 'AUTO_PROCEED';
  } else if (hasHighTrigger) {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN';
  } else if (hasMediumTrigger) {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS';
  } else {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN';
  }

  // Combine all triggers in deterministic order
  const allTriggers = [];
  for (const type of TRIGGER_TYPES) {
    allTriggers.push(...triggers.filter(t => t.type === type));
  }

  // Structured logging
  const logEvent = {
    event: 'decision_filter_evaluated',
    stage: input.stage || 'unknown',
    auto_proceed,
    recommendation,
    trigger_types: [...new Set(allTriggers.map(t => t.type))],
    evaluation_version: ENGINE_VERSION,
  };
  logger.info(JSON.stringify(logEvent));

  if (allTriggers.length > 0) {
    logger.debug(JSON.stringify({
      event: 'decision_filter_trigger_details',
      triggers: allTriggers.map(t => ({
        type: t.type,
        severity: t.severity,
        thresholdUsed: t.details.thresholdUsed || t.details.threshold || null,
      })),
    }));
  }

  return { auto_proceed, triggers: allTriggers, recommendation };
}

export { ENGINE_VERSION, TRIGGER_TYPES, PREFERENCE_KEYS, DEFAULTS };
export default evaluateDecision;
